use crate::{AppState, handlers::instagram};
use axum::{Router, routing::{get, post, delete}};
use std::sync::Arc;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/instagram/status", get(instagram::status))
        .route("/instagram/connect", post(instagram::connect))
        .route("/auth/instagram/callback", get(instagram::callback))
        .route("/instagram/disconnect", delete(instagram::disconnect))
}
