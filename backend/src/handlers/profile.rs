use crate::{
    AppState,
    auth::{
        auth_user::{AuthUser, AuthUserData},
        password,
    },
    error::api_error::{ApiError, ApiResult},
    models::{
        profile::{ProfileUpdated, UpdatePassword, UpdateProfile, validate_current_password},
        service::Service,
        user::{User, UserResponse},
    },
    repositories,
};
use axum::{Json, extract::State, http::StatusCode};
use std::sync::Arc;

pub async fn get(
    AuthUser(session): AuthUser,
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<UserResponse>> {
    Ok(Json(current_user(&state, &session).await?.into()))
}

pub async fn permissions(AuthUser(session): AuthUser) -> Json<Vec<Service>> {
    Json(session.permissions)
}

pub async fn update(
    AuthUser(session): AuthUser,
    State(state): State<Arc<AppState>>,
    Json(request): Json<UpdateProfile>,
) -> ApiResult<Json<ProfileUpdated>> {
    let request = request.normalize_and_validate()?;
    let current = current_user(&state, &session).await?;
    verify_current(&state, &current, request.current_password.clone(), None).await?;
    let updated = repositories::profile::update(&state.db, &current, &request).await?;
    Ok(Json(ProfileUpdated {
        reauthenticate: updated.auth_version != current.auth_version,
        user: updated.into(),
    }))
}

pub async fn change_password(
    AuthUser(session): AuthUser,
    State(state): State<Arc<AppState>>,
    Json(request): Json<UpdatePassword>,
) -> ApiResult<StatusCode> {
    validate_current_password(&request.current_password)?;
    password::validate_password(&request.password)?;
    if request.password != request.password_confirmation {
        return Err(ApiError::BadRequest("Las contraseñas no coinciden.".into()));
    }
    let current = current_user(&state, &session).await?;
    let new_hash = verify_current(
        &state,
        &current,
        request.current_password,
        Some(request.password),
    )
    .await?
    .ok_or(ApiError::InternalServerError)?;
    repositories::profile::change_password(&state.db, &current, &new_hash).await?;
    // Delivery is best effort and never changes the result of a confirmed update.
    if let Some(permit) = state.password_reset.email_slot() {
        tokio::spawn(async move {
            let _permit = permit;
            if state
                .email
                .send_password_changed(&current.email)
                .await
                .is_err()
            {
                eprintln!("Profile password change notification could not be delivered");
            }
        });
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn current_user(state: &AppState, session: &AuthUserData) -> ApiResult<User> {
    let user = repositories::user::get_by_id(&state.db, session.id)
        .await?
        .ok_or(ApiError::Unauthorized)?;
    if !user.active || user.auth_version != session.auth_version {
        return Err(ApiError::Unauthorized);
    }
    Ok(user)
}

async fn verify_current(
    state: &AppState,
    user: &User,
    current: String,
    new: Option<String>,
) -> ApiResult<Option<String>> {
    if !state.profile.allow_change(user.id) {
        return Err(ApiError::TooManyRequests);
    }
    let permit = state.password_reset.hash_slot().ok_or_else(|| {
        ApiError::ServiceUnavailable(
            "Hay varias solicitudes en curso. Volvé a intentar en un momento.".into(),
        )
    })?;
    let hash = user.password_hash.clone();
    tokio::task::spawn_blocking(move || {
        let _permit = permit;
        if !password::verify_password(&current, &hash) {
            return Err(ApiError::BadRequest(
                "La contraseña actual no es correcta.".into(),
            ));
        }
        match new {
            Some(value) if value == current => Err(ApiError::BadRequest(
                "La nueva contraseña debe ser diferente a la actual.".into(),
            )),
            Some(value) => Ok(Some(password::hash_password(&value)?)),
            None => Ok(None),
        }
    })
    .await
    .map_err(|_| ApiError::InternalServerError)?
}
