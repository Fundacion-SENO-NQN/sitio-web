use axum::{Router, extract::DefaultBodyLimit, routing::put};

use std::sync::Arc;

use crate::{
    AppState,
    handlers::img_donation::{batch_status, upload_donation_batch, upload_donation_image},
};

const MAX_DONATION_UPLOAD_BODY: usize = 13 * 1024 * 1024;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/donaciones/img", put(upload_donation_image))
        .layer(DefaultBodyLimit::max(MAX_DONATION_UPLOAD_BODY))
        .route(
            "/donaciones/img/lote",
            axum::routing::post(upload_donation_batch)
                .layer(DefaultBodyLimit::max(125 * 1024 * 1024)),
        )
        .route(
            "/donaciones/img/lote/{request_id}",
            axum::routing::get(batch_status),
        )
}
