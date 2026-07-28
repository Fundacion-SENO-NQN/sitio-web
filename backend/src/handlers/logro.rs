use crate::{
    AppState,
    auth::{auth_user::AuthUser, services::ADMIN_LOGROS},
    error::api_error::{ApiError, ApiResult},
    models::logro::{ChangeOrderLogro, Logro, UpdateLogro},
    repositories,
    utils::{self, logro::path_logro_img},
};
use axum::{
    Json,
    extract::{Multipart, Path, State},
    http::StatusCode,
};
use std::sync::Arc;

pub async fn get_all_logros(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<Logro>>, StatusCode> {
    let logros = repositories::logro::get_all(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(logros))
}

pub async fn get_logro_by_id(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Result<Json<Logro>, StatusCode> {
    match repositories::logro::get_by_id(&state.db, id)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    {
        Some(logro) => Ok(Json(logro)),
        None => Err(StatusCode::NOT_FOUND),
    }
}

pub async fn create_logro(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> ApiResult<(StatusCode, Json<Logro>)> {
    user.require(ADMIN_LOGROS)?;

    let mut titulo = String::new();
    let mut contenido = String::new();

    let mut image: Option<Vec<u8>> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| ApiError::BadRequest("Cuerpo multiparte no válido.".into()))?
    {
        match field.name() {
            Some("titulo") => {
                titulo = field
                    .text()
                    .await
                    .map_err(|_| ApiError::BadRequest("Título inválido.".into()))?;
            }

            Some("contenido") => {
                contenido = field
                    .text()
                    .await
                    .map_err(|_| ApiError::BadRequest("Contenido inválido.".into()))?;
            }

            Some("image") => {
                image = Some(
                    field
                        .bytes()
                        .await
                        .map_err(|_| ApiError::BadRequest("Imagen inválido.".into()))?
                        .to_vec(),
                );
            }

            _ => {}
        }
    }
    let image = image.ok_or(ApiError::BadRequest("La imagen es requerida.".into()))?;

    let logro = repositories::logro::create(&state.db, titulo.as_str(), contenido.as_str()).await?;

    utils::image::save_image(
        path_logro_img(logro.id).map_err(|_| ApiError::InternalServerError)?,
        &image,
    )
    .map_err(|_| ApiError::InternalServerError)?;
    Ok((StatusCode::CREATED, Json(logro)))
}

pub async fn patch_logro(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    mut multipart: Multipart,
) -> ApiResult<Json<Logro>> {
    user.require(ADMIN_LOGROS)?;

    let mut titulo = None;
    let mut contenido = None;
    let mut orden = None;
    let mut image: Option<Vec<u8>> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| ApiError::BadRequest("Cuerpo multiparte no válido.".into()))?
    {
        match field.name() {
            Some("titulo") => {
                titulo = Some(
                    field
                        .text()
                        .await
                        .map_err(|_| ApiError::BadRequest("Título inválido.".into()))?,
                );
            }

            Some("contenido") => {
                contenido = Some(
                    field
                        .text()
                        .await
                        .map_err(|_| ApiError::BadRequest("Contenido inválido.".into()))?,
                );
            }

            Some("orden") => {
                orden = Some(
                    field
                        .text()
                        .await
                        .map_err(|_| ApiError::BadRequest("Orden inválido.".into()))?
                        .parse()
                        .map_err(|_| ApiError::BadRequest("El orden debe de ser un número.".into()))?,
                );
            }

            Some("image") => {
                image = Some(
                    field
                        .bytes()
                        .await
                        .map_err(|_| ApiError::BadRequest("Imagen inválida.".into()))?
                        .to_vec(),
                );
            }

            _ => {}
        }
    }

    let update = UpdateLogro {
        titulo,
        contenido,
        orden,
    };

    let logro = repositories::logro::update(&state.db, id, update).await?;

    if let Some(image) = image {
        utils::image::save_image(
            path_logro_img(logro.id).map_err(|_| ApiError::InternalServerError)?,
            &image,
        )
        .map_err(|_| ApiError::InternalServerError)?;
    }

    Ok(Json(logro))
}

pub async fn change_order_logros(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    Json(request): Json<Vec<ChangeOrderLogro>>,
) -> ApiResult<StatusCode> {
    user.require(ADMIN_LOGROS)?;

    let mut ids = std::collections::HashSet::new();
    let mut orders = std::collections::HashSet::new();
    for item in &request {
        if !ids.insert(item.id) {
            return Err(ApiError::BadRequest("Id de logro duplicado.".into()));
        }

        if !orders.insert(item.orden) {
            return Err(ApiError::BadRequest("Orden duplicado.".into()));
        }
    }
    repositories::logro::change_order(&state.db, request).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn delete_logro(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> ApiResult<Json<Logro>> {
    user.require(ADMIN_LOGROS)?;

    let logro = repositories::logro::delete(&state.db, id).await?;

    utils::image::delete_image(
        path_logro_img(logro.id).map_err(|_| ApiError::InternalServerError)?,
    )
    .map_err(|_| ApiError::InternalServerError)?;

    Ok(Json(logro))
}
