use axum::Router;

pub mod news;

pub fn create_router() -> Router {
    Router::new().nest("/api", news::routes())
}
