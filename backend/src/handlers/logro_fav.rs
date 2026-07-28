use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
};

use crate::{
    AppState,
    auth::{auth_user::AuthUser, services::ADMIN_LOGROS},
    error::api_error::{ApiError, ApiResult},
    models::logro::{CreateLogroFav, Logro, LogroFav},
    repositories,
};

pub async fn get_all_logros_fav(State(state): State<Arc<AppState>>) -> ApiResult<Json<Vec<Logro>>> {
    let favs = repositories::logro_fav::get_all(&state.db).await?;

    Ok(Json(favs))
}

pub async fn get_by_id_logros_fav(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> ApiResult<Json<Logro>> {
    Ok(Json(
        repositories::logro_fav::get_by_id(&state.db, id).await?,
    ))
}

pub async fn create_logro_fav(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    Json(request): Json<CreateLogroFav>,
) -> ApiResult<(StatusCode, Json<LogroFav>)> {
    user.require(ADMIN_LOGROS)?;

    let fav = repositories::logro_fav::create(&state.db, request.logro_id, request.orden).await?;

    Ok((StatusCode::CREATED, Json(fav)))
}

pub async fn delete_logro_fav(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> ApiResult<Json<LogroFav>> {
    user.require(ADMIN_LOGROS)?;

    let fav = repositories::logro_fav::delete(&state.db, id).await?;

    Ok(Json(fav))
}

pub async fn replace_logros_fav(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    Json(request): Json<Vec<CreateLogroFav>>,
) -> ApiResult<StatusCode> {
    user.require(ADMIN_LOGROS)?;

    if request.len() > 3 {
        return Err(ApiError::BadRequest(
            "Solo 3 logros destacados son permitidos.".into(),
        ));
    }

    let mut logro_ids = std::collections::HashSet::new();
    let mut orders = std::collections::HashSet::new();

    for item in &request {
        if !logro_ids.insert(item.logro_id) {
            return Err(ApiError::BadRequest("Logro duplicado.".into()));
        }

        if !orders.insert(item.orden) {
            return Err(ApiError::BadRequest("Orden duplicado.".into()));
        }

        if item.orden < 0 || item.orden > 2 {
            return Err(ApiError::BadRequest(
                "El orden debe de ser entre 0 y 2.".into(),
            ));
        }
    }

    repositories::logro_fav::replace_all(&state.db, request).await?;

    Ok(StatusCode::NO_CONTENT)
}
