use crate::{AppState, Arc, Router, handlers::logro_fav};
use axum::routing::get;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/logros_fav",
            get(logro_fav::get_all_logros_fav)
                .post(logro_fav::create_logro_fav)
                .put(logro_fav::replace_logros_fav),
        )
        .route(
            "/logros_fav/{id}",
            get(logro_fav::get_by_id_logros_fav).delete(logro_fav::delete_logro_fav),
        )
}
