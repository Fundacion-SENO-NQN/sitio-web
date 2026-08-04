use crate::{AppState, Arc, Router, handlers::user};
use axum::routing::{get, patch, post};

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/users", post(user::create_user).get(user::get_all_users))
        .route(
            "/users/{id}",
            get(user::get_user_by_id)
                .patch(user::patch_user)
                .delete(user::delete_user),
        )
        .route(
            "/users/username/{username}",
            get(user::get_user_by_username),
        )
        .route("/user/state/{id}", patch(user::patch_user_active))
        .route("/user/permissions/{id}", get(user::get_user_permissions))
        .route(
            "/user/permissions/username/{username}",
            get(user::get_user_permissions_by_username),
        )
        .route("/users/password/{id}", patch(user::patch_user_password))
}
