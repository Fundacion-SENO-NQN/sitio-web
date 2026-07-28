use crate::{AppState, models::service::Service};
use axum::{Json, extract::State, http::StatusCode};
use std::sync::Arc;

pub async fn get_all_services(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<Service>>, StatusCode> {
    Ok(Json(
        crate::repositories::service::get_all(&state.db)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
    ))
}
