use crate::{AppState, Arc, Router, handlers::evento};
use axum::routing::{get, put};

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/eventos/order", put(evento::change_order_eventos))
        .route(
            "/eventos",
            get(evento::get_all_eventos).post(evento::create_evento),
        )
        .route(
            "/eventos/{id}",
            get(evento::get_evento_by_id)
                .patch(evento::patch_evento)
                .delete(evento::delete_evento),
        )
}
