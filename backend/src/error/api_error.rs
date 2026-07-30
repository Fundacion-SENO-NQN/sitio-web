use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;

#[derive(Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

pub enum ApiError {
    Unauthorized,
    Forbidden,
    NotFound,
    BadRequest(String),
    Conflict(String),
    InternalServerError,
    ServiceUnavailable(String),
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        match self {
            ApiError::Unauthorized => (
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse {
                    error: "No autorizad@".into(),
                }),
            ),

            ApiError::Forbidden => (
                StatusCode::FORBIDDEN,
                Json(ErrorResponse {
                    error: "Prohibid@".into(),
                }),
            ),

            ApiError::NotFound => (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: "No encontrad@".into(),
                }),
            ),

            ApiError::BadRequest(message) => (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse { error: message }),
            ),

            ApiError::Conflict(message) => {
                (StatusCode::CONFLICT, Json(ErrorResponse { error: message }))
            }

            ApiError::InternalServerError => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Error interno del servidor".into(),
                }),
            ),

            ApiError::ServiceUnavailable(message) => {(
                StatusCode::SERVICE_UNAVAILABLE,
                Json(ErrorResponse {
                    error: message
                }),
            )},
        }
        .into_response()
    }
}

impl From<sqlx::Error> for ApiError {
    fn from(_: sqlx::Error) -> Self {
        ApiError::InternalServerError
    }
}

impl From<argon2::password_hash::Error> for ApiError {
    fn from(_: argon2::password_hash::Error) -> Self {
        ApiError::InternalServerError
    }
}

impl From<jsonwebtoken::errors::Error> for ApiError {
    fn from(_: jsonwebtoken::errors::Error) -> Self {
        ApiError::Unauthorized
    }
}

pub type ApiResult<T> = Result<T, ApiError>;
