use crate::{AppState, Arc, Router, handlers::service};
use axum::routing::get;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new().route("/services", get(service::get_all_services))
}
