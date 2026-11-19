use crate::{
    error::api_error::{ApiError, ApiResult},
    models::{profile::UpdateProfile, user::User},
};
use sqlx::PgPool;

pub async fn update(db: &PgPool, current: &User, request: &UpdateProfile) -> ApiResult<User> {
    // Recheck the authenticated snapshot atomically: an intervening reset,
    // deactivation or email change must not be overwritten by a stale request.
    sqlx::query_as::<_, User>(
        "WITH updated AS (
            UPDATE users SET username = $1, email = $2, name = $3, last_name = $4,
                auth_version = auth_version + CASE
                    WHEN username IS DISTINCT FROM $1 OR email IS DISTINCT FROM $2 THEN 1 ELSE 0 END
            WHERE id = $5 AND active AND auth_version = $6 AND password_hash = $7
            RETURNING *
        ) SELECT u.*, r.name AS role_name FROM updated u JOIN roles r ON r.id = u.role_id",
    )
    .bind(&request.username)
    .bind(&request.email)
    .bind(&request.name)
    .bind(&request.last_name)
    .bind(current.id)
    .bind(current.auth_version)
    .bind(&current.password_hash)
    .fetch_optional(db)
    .await
    .map_err(profile_error)?
    .ok_or(ApiError::Unauthorized)
}

pub async fn change_password(db: &PgPool, current: &User, new_hash: &str) -> ApiResult<()> {
    let changed = sqlx::query(
        "UPDATE users SET password_hash = $1, auth_version = auth_version + 1
         WHERE id = $2 AND active AND auth_version = $3 AND password_hash = $4",
    )
    .bind(new_hash)
    .bind(current.id)
    .bind(current.auth_version)
    .bind(&current.password_hash)
    .execute(db)
    .await?;
    if changed.rows_affected() != 1 {
        return Err(ApiError::Unauthorized);
    }
    // Existing reset links also stop working: they carry the previous auth_version.
    Ok(())
}

pub async fn get_settings(db: &PgPool, current: &User) -> ApiResult<serde_json::Value> {
    let raw = sqlx::query_scalar::<_, String>(
        "SELECT COALESCE(settings::text, '{}')
         FROM users
         WHERE id = $1 AND active AND auth_version = $2",
    )
    .bind(current.id)
    .bind(current.auth_version)
    .fetch_optional(db)
    .await?
    .ok_or(ApiError::Unauthorized)?;

    Ok(serde_json::from_str(&raw).unwrap_or_else(|_| serde_json::json!({})))
}

pub async fn update_settings(
    db: &PgPool,
    current: &User,
    patch: &serde_json::Value,
) -> ApiResult<serde_json::Value> {
    let patch_str = serde_json::to_string(patch).map_err(|_| ApiError::InternalServerError)?;
    let raw = sqlx::query_scalar::<_, String>(
        "UPDATE users
         SET settings = COALESCE(settings, '{}'::jsonb) || ($1::jsonb)
         WHERE id = $2 AND active AND auth_version = $3
         RETURNING COALESCE(settings::text, '{}')",
    )
    .bind(&patch_str)
    .bind(current.id)
    .bind(current.auth_version)
    .fetch_optional(db)
    .await?
    .ok_or(ApiError::Unauthorized)?;

    Ok(serde_json::from_str(&raw).unwrap_or_else(|_| serde_json::json!({})))
}

fn profile_error(error: sqlx::Error) -> ApiError {
    if let sqlx::Error::Database(ref db) = error {
        if db.is_unique_violation() {
            return ApiError::Conflict(
                "El usuario o el correo ya están en uso. Elegí otros datos.".into(),
            );
        }
    }
    ApiError::InternalServerError
}

#[cfg(test)]
#[path = "profile_tests.rs"]
mod tests;
