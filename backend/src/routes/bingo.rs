use crate::{AppState, Arc, Router, handlers::bingo};
use axum::routing::get;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/bingo",
            get(bingo::get_all_bingo).post(bingo::create_bingo),
        )
        .route(
            "/bingo/{id}",
            get(bingo::get_bingo_by_id)
                .patch(bingo::patch_bingo)
                .delete(bingo::delete_bingo),
        )
}
