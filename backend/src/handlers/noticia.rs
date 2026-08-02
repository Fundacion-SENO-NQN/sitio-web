use crate::{
    AppState,
    auth::{auth_user::AuthUser, services::ADMIN_NOTICIAS},
    error::api_error::ApiError,
    models::noticia::{ChangeOrderNoticia, Noticia, UpdateNoticia},
    repositories::noticia::{self, ChangeOrderError},
    utils::{date_spanish::fecha_actual_espanol, image::convert_to_avif},
};
use axum::{
    Json, Router,
    extract::{Multipart, Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, patch},
};
use bytes::Bytes;
use std::sync::Arc;

const MAX_IMAGES: usize = 10;

const MAX_IMAGE_SIZE: usize = 12 * 1024 * 1024;

const VALID_IMAGE_TYPES: [&str; 4] = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/* ==========================================================
   RUTAS
========================================================== */

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/noticias", get(get_all).post(create))
        .route("/noticias/order", patch(change_order))
        .route(
            "/noticias/:id",
            get(get_by_id).patch(update).delete(delete_by_id),
        )
}

/* ==========================================================
   GET /noticias
========================================================== */

pub async fn get_all(State(state): State<Arc<AppState>>) -> Result<Json<Vec<Noticia>>, ApiError> {
    let noticias = noticia::get_all(&state.db).await.map_err(ApiError::from)?;

    Ok(Json(noticias))
}

/* ==========================================================
   GET /noticias/:id
========================================================== */

pub async fn get_by_id(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Result<Json<Noticia>, ApiError> {
    validate_id(id)?;

    let noticia = noticia::get_by_id(&state.db, id)
        .await
        .map_err(ApiError::from)?;

    noticia
        .map(Json)
        .ok_or_else(|| ApiError::BadRequest(String::from("La noticia no existe.")))
}

/* ==========================================================
   POST /noticias
========================================================== */

pub async fn create(
    AuthUser(admin): AuthUser,
    State(state): State<Arc<AppState>>,
    multipart: Multipart,
) -> Result<impl IntoResponse, ApiError> {
    admin.require(ADMIN_NOTICIAS)?;

    let payload = parse_multipart(multipart).await?;

    let titulo = required_text(payload.titulo, "El título es requerido.")?;

    let contenido = required_text(payload.contenido, "El contenido es requerido.")?;

    if payload.images.is_empty() {
        return Err(ApiError::BadRequest(String::from(
            "Debe enviarse al menos una imagen.",
        )));
    }

    let fecha = match payload.fecha {
        Some(value) if !value.trim().is_empty() => value.trim().to_string(),

        _ => fecha_actual_espanol(),
    };

    let converted_images = convert_images(payload.images).await?;

    let noticia = noticia::create(
        &state.db,
        fecha,
        titulo,
        contenido,
        converted_images.len() as i64,
    )
    .await
    .map_err(ApiError::from)?;

    let upload_result = upload_images(&state, noticia.id, &converted_images).await;

    if let Err(error) = upload_result {
        eprintln!("Error uploading news images: {error}");

        /*
         * Intentamos eliminar la noticia para no dejar
         * un registro que no tiene imágenes.
         */
        let _ = noticia::delete(&state.db, noticia.id).await;

        let _ = delete_images(&state, noticia.id, converted_images.len()).await;

        return Err(ApiError::BadRequest(String::from(
            "No se pudieron guardar las imágenes.",
        )));
    }

    Ok((StatusCode::CREATED, Json(noticia)))
}

/* ==========================================================
   PATCH /noticias/:id
========================================================== */

pub async fn update(
    AuthUser(admin): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    multipart: Multipart,
) -> Result<Json<Noticia>, ApiError> {
    admin.require(ADMIN_NOTICIAS)?;

    validate_id(id)?;

    let current = noticia::get_by_id(&state.db, id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::BadRequest(String::from("La noticia no existe.")))?;

    let payload = parse_multipart(multipart).await?;

    let titulo = optional_required_text(payload.titulo, "El título no puede estar vacío.")?;

    let contenido =
        optional_required_text(payload.contenido, "El contenido no puede estar vacío.")?;

    let fecha = optional_required_text(payload.fecha, "La fecha no puede estar vacía.")?;

    let has_new_images = !payload.images.is_empty();

    let mut new_image_count = None;

    if has_new_images {
        let converted_images = convert_images(payload.images).await?;

        upload_images(&state, id, &converted_images)
            .await
            .map_err(|error| {
                eprintln!("Error replacing news images: {error}");

                ApiError::BadRequest(String::from("No se pudieron reemplazar las imágenes."))
            })?;

        /*
         * Si antes había más imágenes, eliminamos las
         * posiciones sobrantes.
         */
        if converted_images.len() < current.cant_img as usize {
            let keys = (converted_images.len()..current.cant_img as usize)
                .map(|index| noticia_image_key(id, index))
                .collect::<Vec<_>>();

            state.r2.delete_objects(&keys).await.map_err(|error| {
                eprintln!("Error deleting old news images: {error}");

                ApiError::BadRequest(String::from("No se pudieron eliminar las imágenes anteriores."))
            })?;
        }

        new_image_count = Some(converted_images.len() as i64);
    }

    let updated = noticia::update(
        &state.db,
        id,
        UpdateNoticia {
            titulo,
            contenido,
            fecha,
            cant_img: new_image_count,
        },
    )
    .await
    .map_err(ApiError::from)?
    .ok_or_else(|| ApiError::BadRequest(String::from("La noticia no existe.")))?;

    Ok(Json(updated))
}

/* ==========================================================
   DELETE /noticias/:id
========================================================== */

pub async fn delete_by_id(
    AuthUser(admin): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Result<StatusCode, ApiError> {
    admin.require(ADMIN_NOTICIAS)?;

    validate_id(id)?;

    let deleted = noticia::delete(&state.db, id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::BadRequest(String::from("La noticia no existe.")))?;

    /*
     * La noticia ya fue eliminada de PostgreSQL.
     * Si R2 falla, registramos el error, pero no
     * revertimos la eliminación.
     */
    if let Err(error) = delete_images(&state, id, deleted.cant_img as usize).await {
        eprintln!("Could not delete news images from R2: {error}");
    }

    Ok(StatusCode::NO_CONTENT)
}

/* ==========================================================
   PATCH /noticias/order
========================================================== */

pub async fn change_order(
    AuthUser(admin): AuthUser,
    State(state): State<Arc<AppState>>,
    Json(changes): Json<Vec<ChangeOrderNoticia>>,
) -> Result<StatusCode, ApiError> {
    admin.require(ADMIN_NOTICIAS)?;

    noticia::change_order(&state.db, &changes)
        .await
        .map_err(|error| match error {
            ChangeOrderError::Invalid(message) => ApiError::BadRequest(message),

            ChangeOrderError::NotFound => {
                ApiError::BadRequest(String::from("Una de las noticias no existe."))
            }

            ChangeOrderError::Database(error) => ApiError::from(error),
        })?;

    Ok(StatusCode::NO_CONTENT)
}

/* ==========================================================
   MULTIPART
========================================================== */

#[derive(Default)]
struct NoticiaMultipart {
    titulo: Option<String>,
    contenido: Option<String>,
    fecha: Option<String>,
    images: Vec<RawImage>,
}

struct RawImage {
    bytes: Bytes,
}

async fn parse_multipart(mut multipart: Multipart) -> Result<NoticiaMultipart, ApiError> {
    let mut payload = NoticiaMultipart::default();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| ApiError::BadRequest(String::from("El formulario multipart no es válido.")))?
    {
        let field_name = field.name().unwrap_or_default().to_string();

        match field_name.as_str() {
            "titulo" => {
                payload.titulo = Some(
                    field
                        .text()
                        .await
                        .map_err(|_| invalid_form_field("titulo"))?,
                );
            }

            "contenido" => {
                payload.contenido = Some(
                    field
                        .text()
                        .await
                        .map_err(|_| invalid_form_field("contenido"))?,
                );
            }

            "fecha" => {
                payload.fecha = Some(
                    field
                        .text()
                        .await
                        .map_err(|_| invalid_form_field("fecha"))?,
                );
            }

            "images" | "imagenes" | "image" => {
                if payload.images.len() >= MAX_IMAGES {
                    return Err(ApiError::BadRequest(String::from(format!(
                        "Se permiten como máximo {MAX_IMAGES} imágenes.",
                    ))));
                }

                let content_type = field.content_type().map(str::to_string);

                if let Some(content_type) = content_type {
                    if !VALID_IMAGE_TYPES.contains(&content_type.as_str()) {
                        return Err(ApiError::BadRequest(String::from(
                            "Una de las imágenes tiene un formato no permitido.",
                        )));
                    }
                }

                let bytes = field.bytes().await.map_err(|_| {
                    ApiError::BadRequest(String::from("No se pudo leer una de las imágenes."))
                })?;

                if bytes.is_empty() {
                    return Err(ApiError::BadRequest(String::from(
                        "Una de las imágenes está vacía.",
                    )));
                }

                if bytes.len() > MAX_IMAGE_SIZE {
                    return Err(ApiError::BadRequest(String::from(
                        "Una de las imágenes supera el límite de 12 MB.",
                    )));
                }

                payload.images.push(RawImage { bytes });
            }

            _ => {
                /*
                 * Los campos desconocidos se ignoran para
                 * permitir futuras extensiones.
                 */
            }
        }
    }

    Ok(payload)
}

/* ==========================================================
   CONVERSIÓN
========================================================== */

async fn convert_images(images: Vec<RawImage>) -> Result<Vec<Vec<u8>>, ApiError> {
    let mut converted = Vec::with_capacity(images.len());

    for image in images {
        let bytes = image.bytes.to_vec();

        let result = tokio::task::spawn_blocking(move || convert_to_avif(&bytes))
            .await
            .map_err(|error| {
                eprintln!("Image task error: {error}");

                ApiError::BadRequest(String::from("No se pudo procesar una imagen."))
            })?
            .map_err(|error| {
                eprintln!("Invalid image: {error}");

                ApiError::BadRequest(String::from("Una de las imágenes no es válida."))
            })?;

        converted.push(result);
    }

    Ok(converted)
}

/* ==========================================================
   R2
========================================================== */

async fn upload_images(
    state: &Arc<AppState>,
    noticia_id: i64,
    images: &[Vec<u8>],
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    for (index, image) in images.iter().enumerate() {
        let key = noticia_image_key(noticia_id, index);

        state.r2.upload_avif(&key, image.clone()).await?;
    }

    Ok(())
}

async fn delete_images(
    state: &Arc<AppState>,
    noticia_id: i64,
    amount: usize,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    if amount == 0 {
        return Ok(());
    }

    let keys = (0..amount)
        .map(|index| noticia_image_key(noticia_id, index))
        .collect::<Vec<_>>();

    state.r2.delete_objects(&keys).await?;

    Ok(())
}

fn noticia_image_key(noticia_id: i64, index: usize) -> String {
    format!("img_noticias/{noticia_id}/{index}.avif")
}

/* ==========================================================
   VALIDACIONES
========================================================== */

fn validate_id(id: i64) -> Result<(), ApiError> {
    if id <= 0 {
        return Err(ApiError::BadRequest(String::from("El id no es válido.")));
    }

    Ok(())
}

fn required_text(value: Option<String>, error_message: &str) -> Result<String, ApiError> {
    let value = value.unwrap_or_default().trim().to_string();

    if value.is_empty() {
        return Err(ApiError::BadRequest(String::from(error_message)));
    }

    Ok(value)
}

fn optional_required_text(
    value: Option<String>,
    error_message: &str,
) -> Result<Option<String>, ApiError> {
    let Some(value) = value else {
        return Ok(None);
    };

    let value = value.trim().to_string();

    if value.is_empty() {
        return Err(ApiError::BadRequest(String::from(error_message)));
    }

    Ok(Some(value))
}

fn invalid_form_field(field: &str) -> ApiError {
    ApiError::BadRequest(String::from(format!("El campo {field} no es válido.")))
}
