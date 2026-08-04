use crate::{AppState, Arc, Router, handlers::user};
use axum::routing::get;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/roles", get(user::get_all_roles))
        .route(
            "/roles/{id}",
            get(user::get_role_with_service_by_id)
                .patch(user::patch_role)
                .delete(user::delete_role),
        )
        .route(
            "/roles-services",
            get(user::get_all_roles_with_services).post(user::post_role),
        )
        .route(
            "/roles-service/{id}",
            get(user::get_role_with_service_by_id),
        )
}
