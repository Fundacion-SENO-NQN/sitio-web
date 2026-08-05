use crate::{
    AppState,
    auth::{auth_user::AuthUser, services::ADMIN_EVENTOS},
    error::api_error::{ApiError, ApiResult},
    models::evento::{ChangeOrderEvento, Evento, UpdateEvento, UrlEventoInput, UrlEventoPatch},
    repositories, utils,
};

use axum::{
    Json,
    extract::{Multipart, Path, State},
    http::StatusCode,
};

use std::{collections::HashSet, sync::Arc};

const MAX_EVENT_IMAGES: usize = 10;
const MAX_IMAGE_BYTES: usize = 12 * 1024 * 1024;

/* ==========================================================
   GET ALL
========================================================== */

pub async fn get_all_eventos(State(state): State<Arc<AppState>>) -> ApiResult<Json<Vec<Evento>>> {
    let eventos = repositories::evento::get_all(&state.db).await?;
    println!("holaa");
    Ok(Json(eventos))
}

/* ==========================================================
   GET BY ID
========================================================== */

pub async fn get_evento_by_id(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> ApiResult<Json<Evento>> {
    let evento = repositories::evento::get_by_id(&state.db, id)
        .await?
        .ok_or(ApiError::NotFound)?;

    Ok(Json(evento))
}

/* ==========================================================
   CREATE
========================================================== */

pub async fn create_evento(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> ApiResult<(StatusCode, Json<Evento>)> {
    println!("Entre al handler");
    user.require(ADMIN_EVENTOS)?;
    println!("Pase permisos");
    let mut titulo = String::new();
    let mut descripcion = String::new();

    let mut lugar: Option<String> = None;
    let mut fecha: Option<String> = None;
    let mut horario: Option<String> = None;

    let mut url: Option<String> = None;
    let mut url_titulo: Option<String> = None;

    let mut images: Vec<Vec<u8>> = Vec::new();
    println!("Pase inicializaciones");
    while let Some(field) = multipart.next_field().await.map_err(|error| {
        eprintln!("Invalid event multipart body: {error}",);

        ApiError::BadRequest("Cuerpo multiparte no válido.".into())
    })? {
        match field.name() {
            Some("titulo") => {
                titulo = read_text(field, "Título inválido.").await?;
            }

            Some("descripcion") => {
                descripcion = read_text(field, "Descripción inválida.").await?;
            }

            Some("lugar") => {
                lugar = normalize_nullable(read_text(field, "Lugar inválido.").await?);
            }

            Some("fecha") => {
                fecha = normalize_nullable(read_text(field, "Fecha inválida.").await?);
            }

            Some("horario") => {
                horario = normalize_nullable(read_text(field, "Horario inválido.").await?);
            }

            Some("url") => {
                url = normalize_nullable(read_text(field, "URL inválida.").await?);
            }

            Some("url_titulo") => {
                url_titulo =
                    normalize_nullable(read_text(field, "Título del enlace inválido.").await?);
            }

            /*
             * All these names are accepted. The frontend can
             * append multiple files using the same field.
             */
            Some("image") | Some("imagen") | Some("images") => {
                if images.len() >= MAX_EVENT_IMAGES {
                    return Err(ApiError::BadRequest(format!(
                        "Un evento puede tener como máximo {MAX_EVENT_IMAGES} imágenes.",
                    )));
                }

                let image = read_image(field).await?;

                images.push(image);
            }

            /*
             * cant_img and orden are controlled by the
             * backend and therefore ignored.
             */
            _ => {}
        }
    }
    println!("Pase while");
    let titulo = titulo.trim();
    let descripcion = descripcion.trim();

    validate_required(titulo, "El título es requerido.")?;

    validate_required(descripcion, "La descripción es requerida.")?;
    println!("Pase validaciones");
    if images.is_empty() {
        return Err(ApiError::BadRequest(
            "Debe proporcionar al menos una imagen.".into(),
        ));
    }
    println!("Pase images.is_empty()");
    let url_data = build_create_url(url, url_titulo)?;

    let avif_images = convert_images(images)?;

    let cant_img = avif_images.len() as i64;
    println!("pase images");
    let evento = repositories::evento::create(
        &state.db,
        titulo,
        descripcion,
        lugar.as_deref(),
        fecha.as_deref(),
        horario.as_deref(),
        cant_img,
        url_data,
    )
    .await?;
    println!("Pase create");
    let mut uploaded_images = 0usize;

    for (index, avif_image) in avif_images.into_iter().enumerate() {
        let key = event_image_key(evento.id, index);

        let upload_result = state
            .r2
            .upload_avif(&key, avif_image)
            .await
            .map_err(|error| error.to_string());

        if let Err(error_message) = upload_result {
            eprintln!(
                "Could not upload image {} for event {}: {}",
                index, evento.id, error_message,
            );

            delete_event_images(&state, evento.id, uploaded_images).await;

            if let Err(rollback_error) = repositories::evento::delete(&state.db, evento.id).await {
                eprintln!(
                    "Could not roll back event {}: {:?}",
                    evento.id, rollback_error,
                );
            }

            return Err(ApiError::InternalServerError);
        }

        uploaded_images += 1;
    }
    println!("Pase for");
    Ok((StatusCode::CREATED, Json(evento)))
}

/* ==========================================================
   PATCH
========================================================== */

pub async fn patch_evento(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    mut multipart: Multipart,
) -> ApiResult<Json<Evento>> {
    user.require(ADMIN_EVENTOS)?;

    let current_event = repositories::evento::get_by_id(&state.db, id)
        .await?
        .ok_or(ApiError::NotFound)?;

    let mut titulo: Option<String> = None;
    let mut descripcion: Option<String> = None;

    let mut lugar: Option<Option<String>> = None;

    let mut fecha: Option<Option<String>> = None;

    let mut horario: Option<Option<String>> = None;

    let mut url_was_sent = false;
    let mut url_value: Option<String> = None;

    let mut url_title_was_sent = false;
    let mut url_title_value: Option<String> = None;

    let mut images: Vec<Vec<u8>> = Vec::new();

    while let Some(field) = multipart.next_field().await.map_err(|error| {
        eprintln!("Invalid event multipart body: {error}",);

        ApiError::BadRequest("Cuerpo multiparte no válido.".into())
    })? {
        match field.name() {
            Some("titulo") => {
                titulo = Some(read_text(field, "Título inválido.").await?);
            }

            Some("descripcion") => {
                descripcion = Some(read_text(field, "Descripción inválida.").await?);
            }

            Some("lugar") => {
                lugar = Some(normalize_nullable(
                    read_text(field, "Lugar inválido.").await?,
                ));
            }

            Some("fecha") => {
                fecha = Some(normalize_nullable(
                    read_text(field, "Fecha inválida.").await?,
                ));
            }

            Some("horario") => {
                horario = Some(normalize_nullable(
                    read_text(field, "Horario inválido.").await?,
                ));
            }

            Some("url") => {
                url_was_sent = true;

                url_value = normalize_nullable(read_text(field, "URL inválida.").await?);
            }

            Some("url_titulo") => {
                url_title_was_sent = true;

                url_title_value =
                    normalize_nullable(read_text(field, "Título del enlace inválido.").await?);
            }

            Some("image") | Some("imagen") | Some("images") => {
                if images.len() >= MAX_EVENT_IMAGES {
                    return Err(ApiError::BadRequest(format!(
                        "Un evento puede tener como máximo {MAX_EVENT_IMAGES} imágenes.",
                    )));
                }

                images.push(read_image(field).await?);
            }

            _ => {}
        }
    }

    let titulo = clean_required_patch(titulo, "El título no puede estar vacío.")?;

    let descripcion = clean_required_patch(descripcion, "La descripción no puede estar vacía.")?;

    let url_patch = build_url_patch(url_was_sent, url_value, url_title_was_sent, url_title_value)?;

    let image_change = !images.is_empty();

    if titulo.is_none()
        && descripcion.is_none()
        && lugar.is_none()
        && fecha.is_none()
        && horario.is_none()
        && url_patch.is_none()
        && !image_change
    {
        return Err(ApiError::BadRequest("No se enviaron cambios.".into()));
    }

    let avif_images = if image_change {
        Some(convert_images(images)?)
    } else {
        None
    };

    /*
     * Upload the new files before changing cant_img in the
     * database. R2 and PostgreSQL cannot share a transaction,
     * but this prevents the database from pointing to images
     * that were never uploaded.
     */
    if let Some(images) = avif_images.as_ref() {
        for (index, image) in images.iter().enumerate() {
            let key = event_image_key(id, index);

            state
                .r2
                .upload_avif(&key, image.clone())
                .await
                .map_err(|error| {
                    eprintln!(
                        "Could not upload replacement image \
                         {} for event {}: {}",
                        index, id, error,
                    );

                    ApiError::InternalServerError
                })?;
        }
    }

    let new_image_count = avif_images.as_ref().map(|images| images.len() as i64);

    let update = UpdateEvento {
        titulo,
        descripcion,
        lugar,
        fecha,
        horario,
        cant_img: new_image_count,
        url: url_patch,
    };

    let evento = repositories::evento::update(&state.db, id, update).await?;

    /*
     * If the replacement contains fewer images, remove the
     * old extra objects.
     */
    if let Some(images) = avif_images {
        let new_count = images.len();

        let old_count = current_event.cant_img as usize;

        if new_count < old_count {
            for index in new_count..old_count {
                let key = event_image_key(id, index);

                if let Err(error) = state.r2.delete_object(&key).await {
                    eprintln!(
                        "Could not delete old image {} for \
                         event {}: {}",
                        index, id, error,
                    );
                }
            }
        }
    }

    Ok(Json(evento))
}

/* ==========================================================
   CHANGE ORDER
========================================================== */

pub async fn change_order_eventos(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    Json(request): Json<Vec<ChangeOrderEvento>>,
) -> ApiResult<StatusCode> {
    user.require(ADMIN_EVENTOS)?;
    if request.is_empty() {
        return Err(ApiError::BadRequest(
            "Debe proporcionar al menos un evento.".into(),
        ));
    }
    let mut ids = HashSet::new();
    let mut orders = HashSet::new();

    for item in &request {
        if item.id <= 0 {
            return Err(ApiError::BadRequest(
                "El id del evento no es válido.".into(),
            ));
        }

        if item.orden < 0 {
            return Err(ApiError::BadRequest(
                "El orden no puede ser negativo.".into(),
            ));
        }

        if !ids.insert(item.id) {
            return Err(ApiError::BadRequest("Id de evento duplicado.".into()));
        }

        if !orders.insert(item.orden) {
            return Err(ApiError::BadRequest("Orden duplicado.".into()));
        }
    }
    repositories::evento::change_order(&state.db, request).await?;

    Ok(StatusCode::NO_CONTENT)
}

/* ==========================================================
   DELETE
========================================================== */

pub async fn delete_evento(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> ApiResult<Json<Evento>> {
    println!("entre");
    user.require(ADMIN_EVENTOS)?;
    println!("pase require");
    let evento = repositories::evento::delete(&state.db, id).await?;
    println!("pase delete evento");
    delete_event_images(&state, evento.id, evento.cant_img as usize).await;
    println!("pase delete imagenes");
    Ok(Json(evento))
}

/* ==========================================================
   MULTIPART HELPERS
========================================================== */

async fn read_text(
    field: axum::extract::multipart::Field<'_>,
    error_message: &str,
) -> ApiResult<String> {
    field
        .text()
        .await
        .map_err(|_| ApiError::BadRequest(error_message.to_string()))
}

async fn read_image(field: axum::extract::multipart::Field<'_>) -> ApiResult<Vec<u8>> {
    let bytes = field
        .bytes()
        .await
        .map_err(|_| ApiError::BadRequest("Imagen inválida.".into()))?;

    if bytes.is_empty() {
        return Err(ApiError::BadRequest("La imagen está vacía.".into()));
    }

    if bytes.len() > MAX_IMAGE_BYTES {
        return Err(ApiError::BadRequest(
            "Cada imagen puede pesar como máximo 12 MB.".into(),
        ));
    }

    Ok(bytes.to_vec())
}

/* ==========================================================
   IMAGE HELPERS
========================================================== */

fn convert_images(images: Vec<Vec<u8>>) -> ApiResult<Vec<Vec<u8>>> {
    images
        .into_iter()
        .enumerate()
        .map(|(index, image)| {
            utils::image::convert_to_avif(&image).map_err(|error| {
                eprintln!(
                    "Could not convert event image {} to \
                     AVIF: {}",
                    index, error,
                );

                ApiError::BadRequest(format!("No se pudo procesar la imagen {}.", index + 1,))
            })
        })
        .collect()
}

fn event_image_key(evento_id: i64, image_index: usize) -> String {
    format!("img_eventos/{evento_id}/{image_index}.avif",)
}

async fn delete_event_images(state: &AppState, evento_id: i64, image_count: usize) {
    for index in 0..image_count {
        let key = event_image_key(evento_id, index);

        if let Err(error) = state.r2.delete_object(&key).await {
            eprintln!(
                "Could not delete image {} for event {}: {}",
                index, evento_id, error,
            );
        }
    }
}

/* ==========================================================
   TEXT HELPERS
========================================================== */

fn validate_required(value: &str, message: &str) -> ApiResult<()> {
    if value.is_empty() {
        return Err(ApiError::BadRequest(message.to_string()));
    }

    Ok(())
}

fn clean_required_patch(value: Option<String>, message: &str) -> ApiResult<Option<String>> {
    value
        .map(|value| {
            let value = value.trim().to_string();

            if value.is_empty() {
                return Err(ApiError::BadRequest(message.to_string()));
            }

            Ok(value)
        })
        .transpose()
}

fn normalize_nullable(value: String) -> Option<String> {
    let value = value.trim().to_string();

    if value.is_empty() { None } else { Some(value) }
}

/* ==========================================================
   URL HELPERS
========================================================== */

fn build_create_url(
    url: Option<String>,
    titulo: Option<String>,
) -> ApiResult<Option<UrlEventoInput>> {
    match url {
        Some(url) => {
            validate_url(&url)?;

            Ok(Some(UrlEventoInput { url, titulo }))
        }

        None => {
            if titulo.is_some() {
                return Err(ApiError::BadRequest(
                    "No puede proporcionar un título de enlace sin una URL.".into(),
                ));
            }

            Ok(None)
        }
    }
}

fn build_url_patch(
    url_was_sent: bool,
    url: Option<String>,
    title_was_sent: bool,
    title: Option<String>,
) -> ApiResult<Option<UrlEventoPatch>> {
    if !url_was_sent && !title_was_sent {
        return Ok(None);
    }

    /*
     * Sending an empty URL clears the complete relationship.
     */
    if url_was_sent && url.is_none() {
        if title.is_some() {
            return Err(ApiError::BadRequest(
                "No puede proporcionar un título de enlace al eliminar la URL.".into(),
            ));
        }

        return Ok(Some(UrlEventoPatch::Clear));
    }

    if let Some(url) = &url {
        validate_url(url)?;
    }

    let title_patch = if title_was_sent { Some(title) } else { None };

    Ok(Some(UrlEventoPatch::Update {
        url,
        titulo: title_patch,
    }))
}

fn validate_url(url: &str) -> ApiResult<()> {
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err(ApiError::BadRequest(
            "La URL debe comenzar con http:// o https://.".into(),
        ));
    }

    Ok(())
}
