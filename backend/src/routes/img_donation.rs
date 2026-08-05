use axum::{Router, extract::DefaultBodyLimit, routing::put};

use std::sync::Arc;

use crate::{AppState, handlers::img_donation::upload_donation_image};

const MAX_DONATION_UPLOAD_BODY: usize = 13 * 1024 * 1024;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/donaciones/img", put(upload_donation_image))
        .layer(DefaultBodyLimit::max(MAX_DONATION_UPLOAD_BODY))
}
