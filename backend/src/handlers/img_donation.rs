use axum::{extract::Multipart, http::StatusCode};

use crate::{
    auth::{auth_user::AuthUser, services::UPLOAD_IMG_DONATION},
    error::api_error::{ApiError, ApiResult},
    repositories,
};

pub async fn upload_donation_image(
    AuthUser(user): AuthUser,
    mut multipart: Multipart,
) -> ApiResult<StatusCode> {
    user.require(UPLOAD_IMG_DONATION)?;

    let mut image: Option<Vec<u8>> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| ApiError::BadRequest("Cuerpo multiparte no válido".into()))?
    {
        if field.name() == Some("image") {
            image = Some(
                field
                    .bytes()
                    .await
                    .map_err(|_| ApiError::BadRequest("Imagen inválida".into()))?
                    .to_vec(),
            );

            break;
        }
    }

    let image = image.ok_or(ApiError::BadRequest("No se proporcionó imagen".into()))?;

    repositories::img_donation::replace_oldest_donation_image(&image)
        .map_err(|_| ApiError::InternalServerError)?;

    Ok(StatusCode::OK)
}
