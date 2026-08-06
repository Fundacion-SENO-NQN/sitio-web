use crate::{
    AppState,
    auth::{auth_user::AuthUser, services::ADMIN_MIEMBROS},
    error::api_error::{ApiError, ApiResult},
    models::equipo::{ChangeOrderEquipo, Equipo, UpdateEquipo},
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

pub async fn get_all_equipo(State(state): State<Arc<AppState>>) -> ApiResult<Json<Vec<Equipo>>> {
    let members = repositories::equipo::get_all(&state.db).await?;

    Ok(Json(members))
}

/* ==========================================================
   GET BY ID
========================================================== */

pub async fn get_equipo_by_id(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> ApiResult<Json<Equipo>> {
    let member = repositories::equipo::get_by_id(&state.db, id)
        .await?
        .ok_or(ApiError::NotFound)?;

    Ok(Json(member))
}

/* ==========================================================
   CREATE
========================================================== */

pub async fn create_equipo(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> ApiResult<(StatusCode, Json<Equipo>)> {
    user.require(ADMIN_MIEMBROS)?;

    let mut nombre = String::new();
    let mut apellido = String::new();
    let mut puesto = String::new();
    let mut descripcion = String::new();

    let mut image: Option<Vec<u8>> = None;

    while let Some(field) = multipart.next_field().await.map_err(|error| {
        eprintln!("Invalid member multipart body: {error}",);

        ApiError::BadRequest("Cuerpo multiparte no válido".into())
    })? {
        match field.name() {
            Some("nombre") => {
                nombre = field
                    .text()
                    .await
                    .map_err(|_| ApiError::BadRequest("Nombre inválido".into()))?;
            }

            Some("apellido") => {
                apellido = field
                    .text()
                    .await
                    .map_err(|_| ApiError::BadRequest("Apellido inválido".into()))?;
            }

            Some("puesto") => {
                puesto = field
                    .text()
                    .await
                    .map_err(|_| ApiError::BadRequest("Puesto inválido".into()))?;
            }

            Some("descripcion") => {
                descripcion = field
                    .text()
                    .await
                    .map_err(|_| ApiError::BadRequest("Descripción inválida".into()))?;
            }

            Some("image") => {
                let bytes = field
                    .bytes()
                    .await
                    .map_err(|_| ApiError::BadRequest("Imagen inválida".into()))?;

                if bytes.is_empty() {
                    return Err(ApiError::BadRequest("La imagen está vacía".into()));
                }

                image = Some(bytes.to_vec());
            }

            /*
             * The order is calculated automatically by
             * the repository. Unexpected fields are ignored.
             */
            _ => {}
        }
    }

    let nombre = nombre.trim();
    let apellido = apellido.trim();
    let puesto = puesto.trim();
    let descripcion = descripcion.trim();

    validate_required_text(nombre, "El nombre es requerido")?;

    validate_required_text(apellido, "El apellido es requerido")?;

    validate_required_text(puesto, "El puesto es requerido")?;

    validate_required_text(descripcion, "La descripción es requerida")?;

    let image = image.ok_or_else(|| ApiError::BadRequest("La imagen es requerida".into()))?;

    /*
     * Convert the image before inserting the database row.
     * This prevents creating a member when the uploaded
     * image cannot be decoded.
     */
    let avif_image = utils::image::convert_to_avif(&image).map_err(|error| {
        eprintln!(
            "Could not convert member image to AVIF: \
                     {error}",
        );

        ApiError::BadRequest("No se pudo procesar la imagen".into())
    })?;

    let member =
        repositories::equipo::create(&state.db, nombre, apellido, puesto, descripcion).await?;

    let image_key = member_image_key(member.id);

    /*
     * Convert the R2 error into a String before the rollback
     * await. This also avoids non-Send error values remaining
     * alive across an await point.
     */
    let upload_result = state
        .r2
        .upload_avif(&image_key, avif_image)
        .await
        .map_err(|error| error.to_string());

    if let Err(error_message) = upload_result {
        eprintln!(
            "Could not upload image for member {} to R2: {}",
            member.id, error_message,
        );

        /*
         * Do not leave a member in the database without its
         * required image.
         */
        if let Err(rollback_error) = repositories::equipo::delete(&state.db, member.id).await {
            eprintln!(
                "Could not roll back member {} after R2 \
                 upload failure: {}",
                member.id, rollback_error,
            );
        }

        return Err(ApiError::InternalServerError);
    }

    Ok((StatusCode::CREATED, Json(member)))
}

/* ==========================================================
   PATCH
========================================================== */

pub async fn patch_equipo(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    mut multipart: Multipart,
) -> ApiResult<Json<Equipo>> {
    user.require(ADMIN_MIEMBROS)?;

    let mut nombre: Option<String> = None;
    let mut apellido: Option<String> = None;
    let mut puesto: Option<String> = None;
    let mut descripcion: Option<String> = None;

    let mut image: Option<Vec<u8>> = None;

    while let Some(field) = multipart.next_field().await.map_err(|error| {
        eprintln!("Invalid member multipart body: {error}",);

        ApiError::BadRequest("Cuerpo multiparte no válido".into())
    })? {
        match field.name() {
            Some("nombre") => {
                nombre = Some(
                    field
                        .text()
                        .await
                        .map_err(|_| ApiError::BadRequest("Nombre inválido".into()))?,
                );
            }

            Some("apellido") => {
                apellido = Some(
                    field
                        .text()
                        .await
                        .map_err(|_| ApiError::BadRequest("Apellido inválido".into()))?,
                );
            }

            Some("puesto") => {
                puesto = Some(
                    field
                        .text()
                        .await
                        .map_err(|_| ApiError::BadRequest("Puesto inválido".into()))?,
                );
            }

            Some("descripcion") => {
                descripcion = Some(
                    field
                        .text()
                        .await
                        .map_err(|_| ApiError::BadRequest("Descripción inválida".into()))?,
                );
            }

            Some("image") => {
                let bytes = field
                    .bytes()
                    .await
                    .map_err(|_| ApiError::BadRequest("Imagen inválida".into()))?;

                if bytes.is_empty() {
                    return Err(ApiError::BadRequest("La imagen está vacía".into()));
                }

                image = Some(bytes.to_vec());
            }

            /*
             * Order changes must use PUT /equipo/order.
             * A PATCH must not modify the member order.
             */
            _ => {}
        }
    }

    let nombre = clean_optional_text(nombre, "El nombre no puede estar vacío")?;

    let apellido = clean_optional_text(apellido, "El apellido no puede estar vacío")?;

    let puesto = clean_optional_text(puesto, "El puesto no puede estar vacío")?;

    let descripcion = clean_optional_text(descripcion, "La descripción no puede estar vacía")?;

    if nombre.is_none()
        && apellido.is_none()
        && puesto.is_none()
        && descripcion.is_none()
        && image.is_none()
    {
        return Err(ApiError::BadRequest("No se enviaron cambios".into()));
    }

    /*
     * Convert before changing the database, so a malformed
     * image does not apply the textual changes.
     */
    let avif_image = match image {
        Some(image) => Some(utils::image::convert_to_avif(&image).map_err(|error| {
            eprintln!(
                "Could not convert member image to \
                         AVIF: {error}",
            );

            ApiError::BadRequest("No se pudo procesar la imagen".into())
        })?),

        None => None,
    };

    let update = UpdateEquipo {
        orden: None,
        nombre,
        apellido,
        puesto,
        descripcion,
    };

    let member = repositories::equipo::update(&state.db, id, update).await?;

    if let Some(avif_image) = avif_image {
        let image_key = member_image_key(member.id);

        state
            .r2
            .upload_avif(&image_key, avif_image)
            .await
            .map_err(|error| {
                eprintln!(
                    "Could not replace image for member {} \
                     in R2: {}",
                    member.id, error,
                );

                ApiError::InternalServerError
            })?;
    }

    Ok(Json(member))
}

/* ==========================================================
   CHANGE ORDER
========================================================== */

pub async fn change_order_equipo(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    Json(request): Json<Vec<ChangeOrderEquipo>>,
) -> ApiResult<StatusCode> {
    println!("entre");
    user.require(ADMIN_MIEMBROS)?;
    println!("es el require verdad");
    if request.is_empty() {
        return Err(ApiError::BadRequest(
            "Debe proporcionar al menos un miembro.".into(),
        ));
    }
    println!("q");

    let mut ids = HashSet::new();
    let mut orders = HashSet::new();

    println!("request: {:?}", request);

    for item in &request {
        if item.orden < 0 {
            return Err(ApiError::BadRequest(
                "El orden no puede ser negativo.".into(),
            ));
        }

        println!("que hago aca");

        if !ids.insert(item.id) {
            return Err(ApiError::BadRequest("Id de miembro duplicado.".into()));
        }

        println!("bueno esto ya es bastante");

        if !orders.insert(item.orden) {
            return Err(ApiError::BadRequest("Orden duplicado.".into()));
        }

        println!("okay");
    }
    println!("pase esto?");
    repositories::equipo::change_order(&state.db, request).await?;

    Ok(StatusCode::NO_CONTENT)
}

/* ==========================================================
   DELETE
========================================================== */

pub async fn delete_equipo(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> ApiResult<Json<Equipo>> {
    user.require(ADMIN_MIEMBROS)?;

    let member = repositories::equipo::delete(&state.db, id).await?;

    let image_key = member_image_key(member.id);

    /*
     * The database deletion already succeeded. An R2 failure
     * should be logged, but it should not falsely report that
     * the member still exists.
     */
    if let Err(error) = state.r2.delete_object(&image_key).await {
        eprintln!(
            "Could not delete R2 image for member {}: {}",
            member.id, error,
        );
    }

    Ok(Json(member))
}

/* ==========================================================
   PRIVATE HELPERS
========================================================== */

fn member_image_key(member_id: i64) -> String {
    format!("img_equipo/{member_id}.avif",)
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
