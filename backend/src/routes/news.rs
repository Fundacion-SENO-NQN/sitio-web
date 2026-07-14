use axum::{Router, routing::get};

use crate::handlers;

pub fn routes() -> Router {
    Router::new().route("/news", get(handlers::news::get_news))
}
