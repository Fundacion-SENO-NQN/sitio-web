use crate::{AppState, Arc, Router, handlers::img_donation};
use axum::routing::put;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new().route("/img_donacion", put(img_donation::upload_donation_image))
}
