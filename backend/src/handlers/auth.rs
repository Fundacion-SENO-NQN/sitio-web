use crate::{
    AppState, auth,
    error::api_error::ApiError,
    models::user::{LoginRequest, LoginResponse},
};
use axum::{Json, extract::State};
use std::sync::Arc;

pub async fn login(
    State(state): State<Arc<AppState>>,
    Json(request): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, ApiError> {
    let user = crate::repositories::user::get_by_username(&state.db, &request.username).await?;
    let user = match user {
        Some(user) => user,
        None => return Err(ApiError::Unauthorized),
    };
    if !user.active {
        return Err(ApiError::Forbidden);
    }
    if !auth::password::verify_password(&request.password, &user.password_hash) {
        return Err(ApiError::Unauthorized);
    }
    let secret = std::env::var("JWT_SECRET").expect("JWT_SECRET no encontrado");
    let token =
        auth::jwt::generate_token(user.id, &secret).map_err(|_| ApiError::InternalServerError)?;

    Ok(Json(LoginResponse {
        token,
        username: user.username,
        name: user.name,
        last_name: user.last_name,
        role_name: user.role_name,
    }))
}
