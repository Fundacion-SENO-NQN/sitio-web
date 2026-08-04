use crate::{AppState, Arc, Router, handlers::logro};
use axum::routing::{get, put};

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/logros",
            get(logro::get_all_logros).post(logro::create_logro),
        )
        .route(
            "/logros/{id}",
            get(logro::get_logro_by_id)
                .delete(logro::delete_logro)
                .patch(logro::patch_logro),
        )
        .route("/logros/order", put(logro::change_order_logros))
}
