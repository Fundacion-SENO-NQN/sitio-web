use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;
use std::fmt;

#[derive(Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

#[derive(Debug)]
pub enum ApiError {
    Unauthorized,
    Forbidden,
    NotFound,
    BadRequest(String),
    Conflict(String),
    InternalServerError,
    ServiceUnavailable(String),
}

impl fmt::Display for ApiError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ApiError::BadRequest(message) => {
                write!(formatter, "Bad request: {message}")
            }

            ApiError::NotFound => {
                write!(formatter, "Resource not found")
            }

            ApiError::InternalServerError => {
                write!(formatter, "Internal server error")
            }

            // Add your remaining variants here.
            other => {
                write!(formatter, "{other:?}")
            }
        }
    }
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

            ApiError::ServiceUnavailable(message) => (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(ErrorResponse { error: message }),
            ),
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
