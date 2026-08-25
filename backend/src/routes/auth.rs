use crate::{AppState, Arc, Router, handlers::auth, models::auth::instagram_callback};
use axum::routing::{get, post};

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/login", post(auth::login))
        .route("/auth/instagram/callback", get(instagram_callback))
}
