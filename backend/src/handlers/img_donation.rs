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
