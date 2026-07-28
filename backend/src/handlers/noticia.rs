use crate::{
    AppState,
    auth::{auth_user::AuthUser, services::ADMIN_NOTICIAS},
    error::api_error::{ApiError, ApiResult},
    models::noticia::{ChangeOrderNoticia, Noticia, UpdateNoticia},
    repositories::{self, noticia::get_by_id},
    utils,
};
use axum::{
    Json,
    extract::{Multipart, Path, State},
    http::StatusCode,
};
use std::sync::Arc;

pub async fn get_all_news(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<Noticia>>, StatusCode> {
    Ok(Json(
        crate::repositories::noticia::get_all(&state.db)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
    ))
}

pub async fn get_new_by_id(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Result<Json<Option<Noticia>>, StatusCode> {
    Ok(Json(
        get_by_id(&state.db, id)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
    ))
}

pub async fn create_news(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> ApiResult<(StatusCode, Json<Noticia>)> {
    user.require(ADMIN_NOTICIAS)?;

    let mut titulo = String::new();
    let mut contenido = String::new();
    let mut orden = 0_i64;

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

            Some("orden") => {
                orden = field
                    .text()
                    .await
                    .map_err(|_| ApiError::BadRequest("Orden inválido.".into()))?
                    .parse()
                    .map_err(|_| ApiError::BadRequest("El orden debe de ser un número.".into()))?;
            }

            Some("imagen") => {
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

    let image = image.ok_or(ApiError::BadRequest("La imágen es requerida.".into()))?;

    let noticia = repositories::noticia::create(
        &state.db,
        orden,
        titulo,
        utils::date_spanish::current_date_spanish(),
        contenido,
    )
    .await?;

    utils::image::save_image(
        utils::noticia::path_news_img(noticia.id).map_err(|_| ApiError::InternalServerError)?,
        &image,
    )
    .map_err(|_| ApiError::InternalServerError)?;

    Ok((StatusCode::CREATED, Json(noticia)))
}

pub async fn change_order_news(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    Json(request): Json<Vec<ChangeOrderNoticia>>,
) -> ApiResult<StatusCode> {
    user.require(ADMIN_NOTICIAS)?;

    let mut ids = std::collections::HashSet::new();
    let mut orders = std::collections::HashSet::new();

    for item in &request {
        if !ids.insert(item.id) {
            return Err(ApiError::BadRequest("Id de noticia duplicado.".into()));
        }

        if !orders.insert(item.orden) {
            return Err(ApiError::BadRequest("Orden duplicado.".into()));
        }
    }

    repositories::noticia::change_order(&state.db, request).await?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn delete_new(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> ApiResult<Json<Noticia>> {
    user.require(ADMIN_NOTICIAS)?;

    let noticia = repositories::noticia::delete(&state.db, id).await.unwrap();

    utils::image::delete_image(
        utils::noticia::path_news_img(noticia.id).map_err(|_| ApiError::InternalServerError)?,
    )
    .map_err(|_| ApiError::InternalServerError)?;

    Ok(Json(noticia))
}

pub async fn patch_news(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    mut multipart: Multipart,
) -> ApiResult<Json<Noticia>> {
    user.require(ADMIN_NOTICIAS)?;

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
                        .map_err(|_| ApiError::BadRequest("Título duplicado.".into()))?,
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
                        .map_err(|_| {
                            ApiError::BadRequest("El orden debe de ser un número.".into())
                        })?,
                );
            }

            Some("image") | Some("imagen") => {
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

    let update = UpdateNoticia {
        titulo,
        contenido,
        orden,
    };

    let noticia = repositories::noticia::update(&state.db, id, update).await?;

    if let Some(image) = image {
        utils::image::save_image(
            utils::noticia::path_news_img(noticia.id).map_err(|_| ApiError::InternalServerError)?,
            &image,
        )
        .map_err(|_| ApiError::InternalServerError)?;
    }

    Ok(Json(noticia))
}

pub async fn get_last_4_news(State(state): State<Arc<AppState>>) -> ApiResult<Json<Vec<Noticia>>> {
    Ok(Json(repositories::noticia::get_last_4(&state.db).await?))
}
