use crate::{
    AppState,
    auth::{auth_user::AuthUser, services::UPLOAD_IMG_DONATION},
    error::api_error::{ApiError, ApiResult},
};
use axum::{
    Json,
    extract::{Query, State},
    http::StatusCode,
    response::Redirect,
};
use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::Row;
use std::sync::Arc;
use uuid::Uuid;

#[derive(Serialize)]
pub struct Status {
    connected: bool,
    username: Option<String>,
    expires_at: Option<DateTime<Utc>>,
    error: Option<String>,
}

pub async fn status(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Status>> {
    user.require(UPLOAD_IMG_DONATION)?;
    match state.instagram.connection(&state.db).await {
        Ok(Some(connection)) => Ok(Json(Status {
            connected: true,
            username: Some(connection.username),
            expires_at: Some(connection.expires_at),
            error: None,
        })),
        Ok(None) => Ok(Json(Status {
            connected: false,
            username: None,
            expires_at: None,
            error: None,
        })),
        Err(error) => Ok(Json(Status {
            connected: false,
            username: None,
            expires_at: None,
            error: Some(error),
        })),
    }
}

#[derive(Serialize)]
pub struct ConnectUrl {
    url: String,
}
pub async fn connect(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<ConnectUrl>> {
    user.require(UPLOAD_IMG_DONATION)?;
    let state_id = Uuid::new_v4();
    sqlx::query("INSERT INTO social_oauth_states (state, platform, initiated_by, expires_at) VALUES ($1, 'instagram', $2, now() + interval '10 minutes')")
        .bind(state_id).bind(user.id).execute(&state.db).await?;
    let url = state
        .instagram
        .authorization_url(&state_id.to_string())
        .map_err(|_| ApiError::InternalServerError)?;
    Ok(Json(ConnectUrl { url }))
}

#[derive(serde::Deserialize)]
pub struct Callback {
    code: Option<String>,
    state: Option<Uuid>,
    error: Option<String>,
}
pub async fn callback(
    State(state): State<Arc<AppState>>,
    Query(params): Query<Callback>,
) -> Redirect {
    eprintln!("Instagram OAuth callback reached");

    let failure = || Redirect::to(&state.instagram.return_uri("error"));

    let Some(oauth_state) = params.state else {
        eprintln!("Instagram OAuth failed [state_missing]");
        return failure();
    };

    let row = match sqlx::query(
        "DELETE FROM social_oauth_states
         WHERE state = $1
           AND platform = 'instagram'
           AND expires_at > now()
         RETURNING initiated_by",
    )
    .bind(oauth_state)
    .fetch_optional(&state.db)
    .await
    {
        Ok(Some(row)) => row,

        Ok(None) => {
            eprintln!(
                "Instagram OAuth failed [state_invalid]: \
                 el state no existe, venció o ya fue utilizado"
            );
            return failure();
        }

        Err(error) => {
            eprintln!(
                "Instagram OAuth failed [state_database]: {error}"
            );
            return failure();
        }
    };

    if let Some(error) = params.error.as_deref() {
        eprintln!(
            "Instagram OAuth cancelled [instagram_error]: {error}"
        );

        return Redirect::to(
            &state.instagram.return_uri("cancelled"),
        );
    }

    let Some(code) = params.code else {
        eprintln!("Instagram OAuth failed [code_missing]");
        return failure();
    };

    let user_id: i64 = row.get("initiated_by");

    let valid: bool = match sqlx::query_scalar(
        "SELECT EXISTS (
            SELECT 1
            FROM users
            WHERE id = $1
              AND active = true
        )",
    )
    .bind(user_id)
    .fetch_one(&state.db)
    .await
    {
        Ok(valid) => valid,

        Err(error) => {
            eprintln!(
                "Instagram OAuth failed [user_database]: {error}"
            );
            return failure();
        }
    };

    if !valid {
        eprintln!(
            "Instagram OAuth failed [user_invalid]: \
             el usuario no existe o está inactivo"
        );
        return failure();
    }

    let (id, username, token, expires) =
        match state.instagram.exchange(&code).await {
            Ok(value) => value,

            Err(error) => {
                eprintln!(
                    "Instagram OAuth failed [meta_exchange]: {error}"
                );
                return failure();
            }
        };

    let encrypted = match state.instagram.encrypt(&token) {
        Ok(value) => value,

        Err(error) => {
            eprintln!(
                "Instagram OAuth failed [encryption]: {error}"
            );
            return failure();
        }
    };

    let saved = sqlx::query(
        "INSERT INTO social_connections (
            platform,
            external_user_id,
            username,
            access_token_enc,
            expires_at
        )
        VALUES ('instagram', $1, $2, $3, $4)
        ON CONFLICT (platform)
        DO UPDATE SET
            external_user_id = EXCLUDED.external_user_id,
            username = EXCLUDED.username,
            access_token_enc = EXCLUDED.access_token_enc,
            expires_at = EXCLUDED.expires_at,
            updated_at = now()",
    )
    .bind(id)
    .bind(username)
    .bind(encrypted)
    .bind(expires)
    .execute(&state.db)
    .await;

    if let Err(error) = saved {
        eprintln!(
            "Instagram OAuth failed [connection_database]: {error}"
        );
        return failure();
    }

    eprintln!("Instagram OAuth callback completed successfully");

    Redirect::to(
        &state.instagram.return_uri("connected"),
    )
}

pub async fn disconnect(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
) -> ApiResult<StatusCode> {
    user.require(UPLOAD_IMG_DONATION)?;
    sqlx::query("DELETE FROM social_connections WHERE platform='instagram'")
        .execute(&state.db)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
