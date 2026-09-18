use axum::{
    extract::{Multipart, State},
    http::StatusCode,
};

use std::sync::Arc;

use crate::{
    AppState,
    auth::auth_user::AuthUser,
    auth::services::UPLOAD_IMG_DONATION,
    error::api_error::{ApiError, ApiResult},
    repositories,
    utils::image::convert_to_avif,
};

const MAX_DONATION_IMAGE_SIZE: usize = 12 * 1024 * 1024;

pub async fn upload_donation_image(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> ApiResult<StatusCode> {
    user.require(UPLOAD_IMG_DONATION)?;

    let image = extract_donation_image(&mut multipart).await?;

    /*
     * Image decoding and AVIF encoding are synchronous and
     * CPU-intensive, so they must not run directly on a
     * Tokio async worker.
     */
    let converted_image = tokio::task::spawn_blocking(move || convert_to_avif(&image))
        .await
        .map_err(|error| {
            eprintln!("Donation image conversion task failed: {error}");

            ApiError::InternalServerError
        })?
        .map_err(|error| {
            eprintln!("Could not convert donation image to AVIF: {error}");

            ApiError::BadRequest(
                "La imagen no pudo ser procesada. Verificá que sea JPG, PNG, WebP o AVIF.".into(),
            )
        })?;

    let mut transaction = state.db.begin().await?;

    /*
     * The database row remains locked until the R2 upload
     * finishes. This ensures two requests cannot replace the
     * same carousel position.
     */
    let slot = repositories::img_donation::reserve_next_slot(&mut transaction).await?;

    let image_key = repositories::img_donation::donation_image_key(slot);

    state
        .r2
        .upload_avif(&image_key, converted_image)
        .await
        .map_err(|error| {
            eprintln!("Could not upload donation image to R2 at {image_key}: {error}");

            ApiError::InternalServerError
        })?;

    /*
     * The slot reservation only becomes permanent after the
     * R2 upload succeeds.
     */
    transaction.commit().await?;

    /*
     * This operation only changes R2, so PostgreSQL content
     * triggers cannot detect it. Schedule the static frontend
     * rebuild manually.
     *
     * Remove this block when frontend_rebuild is not yet part
     * of AppState.
     */
    if let Err(error) = state.frontend_rebuild.mark_pending().await {
        eprintln!(
            "Donation image was uploaded, but the frontend rebuild could not be scheduled: {error}"
        );
    }

    Ok(StatusCode::OK)
}

/* ==========================================================
   MULTIPART
========================================================== */

async fn extract_donation_image(multipart: &mut Multipart) -> ApiResult<Vec<u8>> {
    let mut image: Option<Vec<u8>> = None;

    while let Some(field) = multipart.next_field().await.map_err(|error| {
        eprintln!("Invalid donation-image multipart body: {error}");

        ApiError::BadRequest("El cuerpo multiparte no es válido.".into())
    })? {
        if field.name() != Some("image") {
            continue;
        }

        if image.is_some() {
            return Err(ApiError::BadRequest(
                "Cada petición admite una sola imagen.".into(),
            ));
        }

        let filename = field.file_name().unwrap_or("imagen").to_owned();

        let bytes = field.bytes().await.map_err(|error| {
            eprintln!("Could not read donation image {filename}: {error}");

            ApiError::BadRequest("No se pudo leer la imagen enviada.".into())
        })?;

        if bytes.is_empty() {
            return Err(ApiError::BadRequest("La imagen está vacía.".into()));
        }

        if bytes.len() > MAX_DONATION_IMAGE_SIZE {
            return Err(ApiError::BadRequest(
                "La imagen supera el límite de 12 MB.".into(),
            ));
        }

        image = Some(bytes.to_vec());
    }

    image.ok_or_else(|| {
        ApiError::BadRequest("No se proporcionó ninguna imagen en el campo \"image\".".into())
    })
}

/* One multipart request represents one web update and at most one Instagram post. */
#[derive(serde::Serialize)]
pub struct BatchResult {
    website_uploaded: usize,
    instagram_status: &'static str,
    instagram_media_id: Option<String>,
    message: Option<String>,
}

pub async fn upload_donation_batch(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> ApiResult<axum::Json<BatchResult>> {
    use crate::utils::image::convert_to_instagram_jpeg;
    use uuid::Uuid;

    user.require(UPLOAD_IMG_DONATION)?;
    let mut files: Vec<Vec<u8>> = Vec::new();
    let mut title = String::new();
    let mut description = String::new();
    let mut publish = false;
    let mut comments = true;
    let mut request_id = None;
    while let Some(field) = multipart.next_field().await.map_err(|_| ApiError::BadRequest("Multipart inválido".into()))? {
        let name = field.name().unwrap_or("").to_string();
        if name == "images" {
            let bytes = field.bytes().await.map_err(|_| ApiError::BadRequest("Imagen inválida".into()))?;
            if bytes.is_empty() || bytes.len() > MAX_DONATION_IMAGE_SIZE || files.len() >= 10 {
                return Err(ApiError::BadRequest("Se admiten entre 1 y 10 imágenes de hasta 12 MB".into()));
            }
            files.push(bytes.to_vec());
        } else if ["title", "description", "publish_instagram", "instagram_comments_enabled", "request_id"].contains(&name.as_str()) {
            let value = field.text().await.map_err(|_| ApiError::BadRequest("Campo de texto inválido".into()))?;
            match name.as_str() {
                "title" => title = value,
                "description" => description = value,
                "publish_instagram" => publish = value == "true",
                "instagram_comments_enabled" => comments = value == "true",
                "request_id" => request_id = Uuid::parse_str(&value).ok(),
                _ => {}
            }
        }
    }
    if files.is_empty() || title.chars().count() > 120 || description.chars().count() > 1200 {
        return Err(ApiError::BadRequest("Revisá las imágenes, el título y la descripción".into()));
    }
    let request_id = request_id.ok_or(ApiError::BadRequest("Falta request_id UUID".into()))?;
    let connection = if publish {
        Some(state.instagram.connection(&state.db).await
            .map_err(ApiError::ServiceUnavailable)?
            .ok_or(ApiError::BadRequest("Conectá Instagram antes de publicar".into()))?)
    } else { None };
    if publish && title.trim().is_empty() && description.trim().is_empty() {
        return Err(ApiError::BadRequest("Instagram requiere un título o una descripción".into()));
    }

    // Validate and convert everything before replacing a slot on the public website.
    let mut converted = Vec::with_capacity(files.len());
    for file in files {
        let item = tokio::task::spawn_blocking(move || {
            let avif = convert_to_avif(&file)?;
            let jpeg = if publish { Some(convert_to_instagram_jpeg(&file)?) } else { None };
            Ok::<_, image::ImageError>((avif, jpeg))
        }).await.map_err(|_| ApiError::InternalServerError)?
          .map_err(|_| ApiError::BadRequest("Una imagen no se pudo procesar".into()))?;
        converted.push(item);
    }
    let inserted = sqlx::query("INSERT INTO instagram_publications (request_id, status) VALUES ($1, 'processing') ON CONFLICT DO NOTHING")
        .bind(request_id).execute(&state.db).await?;
    if inserted.rows_affected() == 0 {
        return Err(ApiError::Conflict("Este envío ya se recibió. Consultá el resultado antes de intentarlo de nuevo".into()));
    }
    let mut count = 0;
    let mut temporary = Vec::<String>::new();
    let mut urls = Vec::new();
    for (index, (avif, jpeg)) in converted.into_iter().enumerate() {
        if let Some(jpeg) = jpeg {
            let key = format!("instagram-temp/{request_id}/{index}.jpg");
            if let Err(error) = state.r2.upload_jpeg(&key, jpeg).await {
                eprintln!("R2 Instagram JPEG failed: {error}");
                return Ok(axum::Json(batch_failure(&state, request_id, count, "No se pudo guardar la imagen para Instagram").await));
            }
            urls.push(state.instagram.image_url(&key));
            temporary.push(key);
        }
        let mut transaction = state.db.begin().await?;
        let slot = repositories::img_donation::reserve_next_slot(&mut transaction).await?;
        let key = repositories::img_donation::donation_image_key(slot);
        if let Err(error) = state.r2.upload_avif(&key, avif).await {
            eprintln!("R2 donation image failed: {error}");
            return Ok(axum::Json(batch_failure(&state, request_id, count, "No se pudo guardar una imagen en la web").await));
        }
        transaction.commit().await?;
        count += 1;
    }
    if let Err(error) = state.frontend_rebuild.mark_pending().await {
        eprintln!("Frontend rebuild could not be scheduled: {error}");
    }
    if let Some(connection) = connection {
        let caption = [title.trim(), description.trim()].into_iter().filter(|s| !s.is_empty()).collect::<Vec<_>>().join("\n\n");
        match state.instagram.publish(&connection, &urls, &caption, comments).await {
            Ok(outcome) => {
                let _ = sqlx::query("UPDATE instagram_publications SET status='published', website_count=$2, media_id=$3, updated_at=now() WHERE request_id=$1")
                    .bind(request_id).bind(count as i32).bind(&outcome.id).execute(&state.db).await;
                let mut deleted = true;
                for key in temporary { if let Err(error) = state.r2.delete_object(&key).await { deleted = false; eprintln!("Temporary Instagram image cleanup failed: {error}"); } }
                if deleted { let _ = sqlx::query("UPDATE instagram_publications SET temp_cleaned_at=now() WHERE request_id=$1").bind(request_id).execute(&state.db).await; }
                Ok(axum::Json(BatchResult {
                    website_uploaded: count, instagram_status: "published", instagram_media_id: Some(outcome.id),
                    message: outcome.comments_warning.then(|| "Se publicó, pero no se pudieron desactivar los comentarios. Revisá la publicación en Instagram.".into())
                }))
            }
            Err(error) => {
                eprintln!("Instagram publication {request_id} failed or uncertain: {error}");
                let message = "La web se actualizó, pero no se confirmó la publicación en Instagram. Revisá la cuenta antes de volver a publicar.";
                let _ = sqlx::query("UPDATE instagram_publications SET status='unknown', website_count=$2, message=$3, updated_at=now() WHERE request_id=$1")
                    .bind(request_id).bind(count as i32).bind(message).execute(&state.db).await;
                Ok(axum::Json(BatchResult { website_uploaded: count, instagram_status: "unknown", instagram_media_id: None, message: Some(message.into()) }))
            }
        }
    } else {
        let _ = sqlx::query("UPDATE instagram_publications SET status='published', website_count=$2, updated_at=now() WHERE request_id=$1")
            .bind(request_id).bind(count as i32).execute(&state.db).await;
        Ok(axum::Json(BatchResult { website_uploaded: count, instagram_status: "skipped", instagram_media_id: None, message: None }))
    }
}

async fn batch_failure(state: &Arc<AppState>, request_id: uuid::Uuid, count: usize, message: &str) -> BatchResult {
    let _ = sqlx::query("UPDATE instagram_publications SET status='failed', website_count=$2, message=$3, updated_at=now() WHERE request_id=$1")
        .bind(request_id).bind(count as i32).bind(message).execute(&state.db).await;
    if count > 0 { let _ = state.frontend_rebuild.mark_pending().await; }
    BatchResult { website_uploaded: count, instagram_status: "failed", instagram_media_id: None, message: Some(message.into()) }
}

#[derive(serde::Serialize)]
pub struct BatchStatus { status: String, website_count: i32, media_id: Option<String>, message: Option<String> }

pub async fn batch_status(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    axum::extract::Path(request_id): axum::extract::Path<uuid::Uuid>,
) -> ApiResult<axum::Json<BatchStatus>> {
    use sqlx::Row;
    user.require(UPLOAD_IMG_DONATION)?;
    let row = sqlx::query("SELECT status, website_count, media_id, message FROM instagram_publications WHERE request_id=$1")
        .bind(request_id).fetch_optional(&state.db).await?.ok_or(ApiError::NotFound)?;
    Ok(axum::Json(BatchStatus {
        status: row.get("status"), website_count: row.get("website_count"),
        media_id: row.get("media_id"), message: row.get("message"),
    }))
}
