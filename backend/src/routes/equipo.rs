use crate::{AppState, Arc, Router, handlers::equipo};
use axum::routing::{get, put};

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/equipo",
            get(equipo::get_all_equipo).post(equipo::create_equipo),
        )
        .route(
            "/equipo/{id}",
            get(equipo::get_equipo_by_id)
                .delete(equipo::delete_equipo)
                .patch(equipo::patch_equipo),
        )
        .route("/equipo/order", put(equipo::change_order_equipo))
}
