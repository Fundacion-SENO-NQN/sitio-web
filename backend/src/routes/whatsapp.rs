use crate::{AppState, handlers::whatsapp};
use axum::{
    Router,
    routing::{get, post},
};
use std::sync::Arc;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/whatsapp/webhook", get(whatsapp::verify_webhook))
        .route("/whatsapp/webhook", post(whatsapp::receive_webhook))
}
