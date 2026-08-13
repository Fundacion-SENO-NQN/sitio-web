use crate::{AppState, Arc, Router};
use axum::routing::get;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new().route("/health", get(|| async { "OK" }))
}
