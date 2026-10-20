use crate::{AppState, handlers::profile};
use axum::http::{HeaderValue, header::CACHE_CONTROL};
use axum::{
    Router,
    extract::DefaultBodyLimit,
    routing::{get, patch},
};
use std::sync::Arc;
use tower_http::set_header::SetResponseHeaderLayer;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/profile", get(profile::get).patch(profile::update))
        .route("/profile/permissions", get(profile::permissions))
        .route("/profile/password", patch(profile::change_password))
        .layer(DefaultBodyLimit::max(8 * 1024))
        .layer(SetResponseHeaderLayer::overriding(
            CACHE_CONTROL,
            HeaderValue::from_static("no-store"),
        ))
}
