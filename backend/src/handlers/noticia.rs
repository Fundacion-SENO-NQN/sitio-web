use crate::{
    AppState,
    auth::{auth_user::AuthUser, services::ADMIN_NOTICIAS},
    error::api_error::{ApiError, ApiResult},
    models::noticia::{ChangeOrderNoticia, Noticia, UpdateNoticia},
    repositories, utils,
};
use axum::{
    Json,
    extract::{Multipart, Path, State},
    http::StatusCode,
};
use std::{collections::HashSet, sync::Arc};

/* ==========================================================
   GET ALL
========================================================== */

pub async fn get_all_news(State(state): State<Arc<AppState>>) -> ApiResult<Json<Vec<Noticia>>> {
    let noticias = repositories::noticia::get_all(&state.db).await?;

    Ok(Json(noticias))
}

/* ==========================================================
   GET BY ID
========================================================== */

pub async fn get_new_by_id(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> ApiResult<Json<Noticia>> {
    let noticia = repositories::noticia::get_by_id(&state.db, id)
        .await?
        .ok_or(ApiError::NotFound)?;

    Ok(Json(noticia))
}

/* ==========================================================
   CREATE
========================================================== */

pub async fn create_news(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> ApiResult<(StatusCode, Json<Noticia>)> {
    user.require(ADMIN_NOTICIAS)?;

    let mut titulo = String::new();
    let mut contenido = String::new();
    let mut image: Option<Vec<u8>> = None;

    while let Some(field) = multipart.next_field().await.map_err(|error| {
        eprintln!("Invalid news multipart body: {error}",);

        ApiError::BadRequest("Cuerpo multiparte no válido.".into())
    })? {
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

            Some("image") | Some("imagen") => {
                let bytes = field
                    .bytes()
                    .await
                    .map_err(|_| ApiError::BadRequest("Imagen inválida.".into()))?;

                if bytes.is_empty() {
                    return Err(ApiError::BadRequest("La imagen está vacía.".into()));
                }

                image = Some(bytes.to_vec());
            }

            /*
             * `orden` and every unexpected field are ignored.
             * The repository calculates the next order.
             */
            _ => {}
        }
    }

    let titulo = titulo.trim();
    let contenido = contenido.trim();

    validate_required_text(titulo, "El título es requerido.")?;

    validate_required_text(contenido, "El contenido es requerido.")?;

    let image = image.ok_or_else(|| ApiError::BadRequest("La imagen es requerida.".into()))?;

    /*
     * Convert before inserting into PostgreSQL. A malformed
     * image therefore cannot create an incomplete news item.
     */
    let avif_image = utils::image::convert_to_avif(&image).map_err(|error| {
        eprintln!(
            "Could not convert news image to AVIF: \
                     {error}",
        );

        ApiError::BadRequest("No se pudo procesar la imagen.".into())
    })?;

    let fecha = utils::date_spanish::current_date_spanish();

    let noticia = repositories::noticia::create(&state.db, titulo, &fecha, contenido).await?;

    let image_key = news_image_key(noticia.id);

    /*
     * Convert the R2 error into String so no non-Send error
     * value remains alive across the rollback await.
     */
    let upload_result = state
        .r2
        .upload_avif(&image_key, avif_image)
        .await
        .map_err(|error| error.to_string());

    if let Err(error_message) = upload_result {
        eprintln!(
            "Could not upload image for news {} to R2: {}",
            noticia.id, error_message,
        );

        /*
         * Do not leave a news item without its required image.
         * Because the new item is the last one, repository
         * deletion also leaves the ordering valid.
         */
        if let Err(rollback_error) = repositories::noticia::delete(&state.db, noticia.id).await {
            eprintln!(
                "Could not roll back news {} after R2 \
                 failure: {:?}",
                noticia.id, rollback_error,
            );
        }

        return Err(ApiError::InternalServerError);
    }

    Ok((StatusCode::CREATED, Json(noticia)))
}

/* ==========================================================
   PATCH
========================================================== */

pub async fn patch_news(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    mut multipart: Multipart,
) -> ApiResult<Json<Noticia>> {
    user.require(ADMIN_NOTICIAS)?;

    let mut titulo: Option<String> = None;
    let mut contenido: Option<String> = None;
    let mut image: Option<Vec<u8>> = None;

    while let Some(field) = multipart.next_field().await.map_err(|error| {
        eprintln!("Invalid news multipart body: {error}",);

        ApiError::BadRequest("Cuerpo multiparte no válido.".into())
    })? {
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

            Some("image") | Some("imagen") => {
                let bytes = field
                    .bytes()
                    .await
                    .map_err(|_| ApiError::BadRequest("Imagen inválida.".into()))?;

                if bytes.is_empty() {
                    return Err(ApiError::BadRequest("La imagen está vacía.".into()));
                }

                image = Some(bytes.to_vec());
            }

            /*
             * Ordering changes must use PUT /noticias/order.
             */
            _ => {}
        }
    }

    let titulo = clean_optional_text(titulo, "El título no puede estar vacío.")?;

    let contenido = clean_optional_text(contenido, "El contenido no puede estar vacío.")?;

    if titulo.is_none() && contenido.is_none() && image.is_none() {
        return Err(ApiError::BadRequest("No se enviaron cambios.".into()));
    }

    /*
     * Convert before changing the database. If image
     * processing fails, text changes are not applied.
     */
    let avif_image = match image {
        Some(image) => Some(utils::image::convert_to_avif(&image).map_err(|error| {
            eprintln!(
                "Could not convert news image to \
                         AVIF: {error}",
            );

            ApiError::BadRequest("No se pudo procesar la imagen.".into())
        })?),

        None => None,
    };

    let update = UpdateNoticia {
        titulo,
        contenido,
        orden: None,
    };

    let noticia = repositories::noticia::update(&state.db, id, update).await?;

    if let Some(avif_image) = avif_image {
        let image_key = news_image_key(noticia.id);

        state
            .r2
            .upload_avif(&image_key, avif_image)
            .await
            .map_err(|error| {
                eprintln!(
                    "Could not replace image for news {} in \
                     R2: {}",
                    noticia.id, error,
                );

                ApiError::InternalServerError
            })?;
    }

    Ok(Json(noticia))
}

/* ==========================================================
   CHANGE ORDER
========================================================== */

pub async fn change_order_news(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    Json(request): Json<Vec<ChangeOrderNoticia>>,
) -> ApiResult<StatusCode> {
    user.require(ADMIN_NOTICIAS)?;

    if request.is_empty() {
        return Err(ApiError::BadRequest(
            "Debe proporcionar al menos una noticia.".into(),
        ));
    }

    let mut ids = HashSet::new();
    let mut orders = HashSet::new();

    for item in &request {
        if item.id <= 0 {
            return Err(ApiError::BadRequest(
                "El id de la noticia no es válido.".into(),
            ));
        }

        if item.orden < 0 {
            return Err(ApiError::BadRequest(
                "El orden no puede ser negativo.".into(),
            ));
        }

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

/* ==========================================================
   DELETE
========================================================== */

pub async fn delete_new(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> ApiResult<Json<Noticia>> {
    user.require(ADMIN_NOTICIAS)?;

    let noticia = repositories::noticia::delete(&state.db, id).await?;

    let image_key = news_image_key(noticia.id);

    /*
     * The database deletion already succeeded. Failure to
     * delete R2 media is logged, but does not falsely report
     * that the news item still exists.
     */
    if let Err(error) = state.r2.delete_object(&image_key).await {
        eprintln!(
            "Could not delete R2 image for news {}: {}",
            noticia.id, error,
        );
    }

    Ok(Json(noticia))
}

/* ==========================================================
   GET LAST FOUR
========================================================== */

pub async fn get_last_4_news(State(state): State<Arc<AppState>>) -> ApiResult<Json<Vec<Noticia>>> {
    let noticias = repositories::noticia::get_last_4(&state.db).await?;

    Ok(Json(noticias))
}

/* ==========================================================
   PRIVATE HELPERS
========================================================== */

fn news_image_key(noticia_id: i64) -> String {
    format!("img_noticias/{noticia_id}.avif",)
}

fn validate_required_text(value: &str, message: &str) -> ApiResult<()> {
    if value.is_empty() {
        return Err(ApiError::BadRequest(message.to_string()));
    }

    Ok(())
}

fn clean_optional_text(value: Option<String>, empty_message: &str) -> ApiResult<Option<String>> {
    value
        .map(|value| {
            let value = value.trim().to_string();

            if value.is_empty() {
                return Err(ApiError::BadRequest(empty_message.to_string()));
            }

            Ok(value)
        })
        .transpose()
}
