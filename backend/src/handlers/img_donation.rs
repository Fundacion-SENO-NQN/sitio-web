use axum::{extract::Multipart, http::StatusCode};

pub async fn upload_donation_image(mut multipart: Multipart) -> Result<StatusCode, StatusCode> {
    let mut image: Option<Vec<u8>> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?
    {
        if field.name() == Some("image") {
            image = Some(
                field
                    .bytes()
                    .await
                    .map_err(|_| StatusCode::BAD_REQUEST)?
                    .to_vec(),
            );

            break;
        }
    }

    let image = image.ok_or(StatusCode::BAD_REQUEST)?;

    crate::repositories::img_donation::replace_oldest_donation_image(&image)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::OK)
}
