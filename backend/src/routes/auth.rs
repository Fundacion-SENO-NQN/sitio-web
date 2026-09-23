use crate::{
    AppState, Arc, Router,
    handlers::{auth, password_reset},
};
use axum::{extract::DefaultBodyLimit, routing::post};

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/login", post(auth::login))
        .route(
            "/auth/forgot-password",
            post(password_reset::forgot).layer(DefaultBodyLimit::max(4096)),
        )
        .route(
            "/auth/reset-password",
            post(password_reset::reset).layer(DefaultBodyLimit::max(4096)),
        )
}
