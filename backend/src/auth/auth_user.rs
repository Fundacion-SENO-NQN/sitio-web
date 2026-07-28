use crate::{AppState, auth, error::api_error::ApiError, models::service::Service, repositories};
use axum::{
    extract::{FromRef, FromRequestParts},
    http::{header::AUTHORIZATION, request::Parts},
};
use std::sync::Arc;

#[derive(Debug, Clone)]
pub struct AuthUserData {
    pub id: i64,
    pub username: String,
    pub role_id: i64,
    pub permissions: Vec<Service>,
}

pub struct AuthUser(pub AuthUserData);

impl<S> FromRequestParts<S> for AuthUser
where
    Arc<AppState>: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let auth_header = parts
            .headers
            .get(AUTHORIZATION)
            .ok_or(ApiError::Unauthorized)?;

        let auth_header = auth_header.to_str().map_err(|_| ApiError::Unauthorized)?;

        let token = auth_header
            .strip_prefix("Bearer ")
            .ok_or(ApiError::Unauthorized)?;

        let secret = std::env::var("JWT_SECRET").expect("JWT_SECRET no está definido");

        let claims = auth::jwt::validate_token(token, &secret)?;

        let state = Arc::<AppState>::from_ref(state);

        let user = repositories::user::get_by_id(&state.db, claims.sub)
            .await?
            .ok_or(ApiError::Unauthorized)?;

        if !user.active {
            return Err(ApiError::Forbidden);
        }

        let permissions = repositories::user::get_permissions(&state.db, user.role_id)
            .await?
            .into_iter()
            .collect::<Vec<Service>>();

        Ok(AuthUser(AuthUserData {
            id: user.id,
            username: user.username,
            role_id: user.role_id,
            permissions,
        }))
    }
}
