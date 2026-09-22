use crate::{
    AppState,
    auth::password,
    error::api_error::{ApiError, ApiResult},
    repositories::password_reset as repository,
    services::password_reset::{INVALID_LINK, REQUEST_MESSAGE, generate_token, token_hash},
};
use axum::{Json, extract::State, http::StatusCode};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Deserialize)]
pub struct ForgotPassword {
    pub identifier: String,
}
#[derive(Deserialize)]
pub struct ResetPassword {
    pub token: String,
    pub password: String,
    pub password_confirmation: String,
}
#[derive(Serialize)]
pub struct Message {
    pub message: &'static str,
}

pub async fn forgot(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ForgotPassword>,
) -> ApiResult<(StatusCode, Json<Message>)> {
    if !state.password_reset.configured() {
        return Err(ApiError::ServiceUnavailable(
            "La recuperación no está disponible. Contactá al administrador.".into(),
        ));
    }
    let identifier = request.identifier.trim().to_owned();
    if identifier.is_empty() || identifier.len() > 254 {
        return Err(ApiError::BadRequest(
            "Ingresá tu usuario o correo electrónico.".into(),
        ));
    }
    if !state.password_reset.allow_request() {
        return Err(ApiError::TooManyRequests);
    }
    let permit = state.password_reset.email_slot().ok_or_else(|| {
        ApiError::ServiceUnavailable(
            "Hay varias solicitudes en curso. Volvé a intentar en un minuto.".into(),
        )
    })?;
    // Mismo estado y mensaje sin esperar búsquedas ni SMTP: no revela cuentas.
    tokio::spawn(async move {
        let _permit = permit;
        if let Err(stage) = send_recovery(&state, &identifier).await {
            // Solo etapas fijas, nunca correo, token, contraseña o respuestas SMTP.
            eprintln!(
                "Password recovery failed [{stage}]; check database migration and SMTP configuration"
            );
        }
    });
    Ok((
        StatusCode::ACCEPTED,
        Json(Message {
            message: REQUEST_MESSAGE,
        }),
    ))
}

async fn send_recovery(state: &AppState, identifier: &str) -> Result<(), String> {
    let Some(id) = repository::find_account(&state.db, identifier)
        .await
        .map_err(|_| "account lookup")?
    else {
        return Ok(());
    };
    let token = generate_token()?;
    let hash = token_hash(&token).ok_or("token generation")?;
    let Some(account) = repository::issue(&state.db, id, &hash)
        .await
        .map_err(|_| "token storage")?
    else {
        return Ok(());
    };
    let link = state.password_reset.link(&token).ok_or("reset URL")?;
    if state
        .email
        .send_password_reset(&account.email, &link)
        .await
        .is_err()
    {
        let _ = repository::invalidate(&state.db, &hash).await;
        return Err("email delivery".into());
    }
    Ok(())
}

pub async fn reset(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ResetPassword>,
) -> ApiResult<Json<Message>> {
    if !state.password_reset.allow_request() {
        return Err(ApiError::TooManyRequests);
    }
    let hash =
        token_hash(&request.token).ok_or_else(|| ApiError::BadRequest(INVALID_LINK.into()))?;
    password::validate_password(&request.password)?;
    if request.password != request.password_confirmation {
        return Err(ApiError::BadRequest("Las contraseñas no coinciden.".into()));
    }
    if !repository::is_valid(&state.db, &hash).await? {
        return Err(ApiError::BadRequest(INVALID_LINK.into()));
    }
    let permit = state.password_reset.hash_slot().ok_or_else(|| {
        ApiError::ServiceUnavailable(
            "Hay varias solicitudes en curso. Volvé a intentar en un minuto.".into(),
        )
    })?;
    let password_hash = tokio::task::spawn_blocking(move || {
        let _permit = permit;
        password::hash_password(&request.password)
    })
    .await
    .map_err(|_| ApiError::InternalServerError)??;
    let account = repository::complete(&state.db, &hash, &password_hash)
        .await?
        .ok_or_else(|| ApiError::BadRequest(INVALID_LINK.into()))?;
    // Una falla de la notificación no revierte el cambio ya confirmado.
    tokio::spawn(async move {
        if state
            .email
            .send_password_changed(&account.email)
            .await
            .is_err()
        {
            eprintln!("Password changed notification could not be delivered");
        }
    });
    Ok(Json(Message {
        message: "Tu contraseña fue actualizada. Iniciá sesión con la nueva contraseña.",
    }))
}
