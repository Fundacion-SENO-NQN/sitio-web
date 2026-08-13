use crate::{AppState, Arc, Router, handlers::voluntariado::create_solicitud};
use axum::routing::post;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new().route("/voluntariado/solicitud", post(create_solicitud))
}
