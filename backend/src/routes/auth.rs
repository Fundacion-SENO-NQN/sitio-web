use crate::{AppState, Arc, Router, handlers::auth, models::auth::tiktok_callback};
use axum::routing::{get, post};

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/login", post(auth::login))
        .route("/auth/tiktok/callback", get(tiktok_callback))
}
