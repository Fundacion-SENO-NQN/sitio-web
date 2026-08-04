use crate::{AppState, Arc, Router, handlers::metodo_donacion};

use axum::{extract::DefaultBodyLimit, routing::get};

const MAX_REQUEST_SIZE: usize = 1024 * 1024;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/metodos_donacion",
            get(metodo_donacion::get_all_metodos_donacion)
                .post(metodo_donacion::create_metodo_donacion),
        )
        .route(
            "/metodos_donacion/{id}",
            get(metodo_donacion::get_metodo_donacion)
                .patch(metodo_donacion::patch_metodo_donacion)
                .delete(metodo_donacion::delete_metodo_donacion),
        )
        .layer(DefaultBodyLimit::max(MAX_REQUEST_SIZE))
}
