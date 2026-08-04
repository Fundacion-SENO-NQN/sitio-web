use crate::{AppState, Arc, Router, handlers::auth};
use axum::routing::post;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/login", post(auth::login))
}