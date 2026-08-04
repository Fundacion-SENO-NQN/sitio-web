use crate::{AppState, Arc, Router, handlers::noticia};
use axum::routing::{get, patch};

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/noticias", get(noticia::get_all).post(noticia::create))
        .route("/noticias/order", patch(noticia::change_order))
        .route(
            "/noticias/:id",
            get(noticia::get_by_id)
                .patch(noticia::update)
                .delete(noticia::delete_by_id),
        )
}
