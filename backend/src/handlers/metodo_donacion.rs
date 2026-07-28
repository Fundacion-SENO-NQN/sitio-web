use crate::{
    AppState,
    auth::{auth_user::AuthUser, services::ADMIN_METODO_PAGO_DONACION},
    error::api_error::{ApiError, ApiResult},
    models::metodo_donacion::{
        CreateMetodoDonacionRequest, MetodoDonacionResponse, PatchMetodoDonacionRequest,
    },
    repositories,
};
use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
};
use std::sync::Arc;

pub async fn get_all_metodos_donacion(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<MetodoDonacionResponse>>> {
    Ok(Json(
        repositories::metodo_donacion::get_all(&state.db).await?,
    ))
}

pub async fn get_metodo_donacion(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> ApiResult<Json<MetodoDonacionResponse>> {
    let metodo = repositories::metodo_donacion::get_by_id(&state.db, id)
        .await?
        .ok_or(ApiError::NotFound)?;

    Ok(Json(metodo))
}

pub async fn create_metodo_donacion(
    AuthUser(admin): AuthUser,
    State(state): State<Arc<AppState>>,
    Json(request): Json<CreateMetodoDonacionRequest>,
) -> ApiResult<(StatusCode, Json<MetodoDonacionResponse>)> {
    admin.require(ADMIN_METODO_PAGO_DONACION)?;

    let metodo = repositories::metodo_donacion::create(&state.db, request).await?;

    Ok((StatusCode::CREATED, Json(metodo)))
}

pub async fn patch_metodo_donacion(
    AuthUser(admin): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(request): Json<PatchMetodoDonacionRequest>,
) -> ApiResult<Json<MetodoDonacionResponse>> {
    admin.require(ADMIN_METODO_PAGO_DONACION)?;

    let metodo = repositories::metodo_donacion::update(&state.db, id, request).await?;

    Ok(Json(metodo))
}

pub async fn delete_metodo_donacion(
    AuthUser(admin): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> ApiResult<Json<MetodoDonacionResponse>> {
    admin.require(ADMIN_METODO_PAGO_DONACION)?;

    let metodo = repositories::metodo_donacion::delete(&state.db, id).await?;

    Ok(Json(metodo))
}
