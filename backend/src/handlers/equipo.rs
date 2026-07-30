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
use std::sync::Arc;

pub async fn get_all_equipo(State(state): State<Arc<AppState>>) -> ApiResult<Json<Vec<Equipo>>> {
    Ok(Json(repositories::equipo::get_all(&state.db).await?))
}

pub async fn get_equipo_by_id(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> ApiResult<Json<Equipo>> {
    let member = repositories::equipo::get_by_id(&state.db, id)
        .await?
        .ok_or(ApiError::NotFound)?;

    Ok(Json(member))
}

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
    let mut orden = 0_i64;

    let mut image: Option<Vec<u8>> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| ApiError::BadRequest("Cuerpo multiparte no válido".into()))?
    {
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

            Some("orden") => {
                orden = field
                    .text()
                    .await
                    .map_err(|_| ApiError::BadRequest("Orden inválida".into()))?
                    .parse()
                    .map_err(|_| ApiError::BadRequest("Orden debe de ser un número".into()))?;
            }

            Some("image") => {
                image = Some(
                    field
                        .bytes()
                        .await
                        .map_err(|_| ApiError::BadRequest("Imagen inválida".into()))?
                        .to_vec(),
                );
            }

            _ => {}
        }
    }
    println!("antes del image");
    let image = image.ok_or(ApiError::BadRequest("La imagen es requerida".into()))?;
    println!("{:?}", image);
    let member =
        repositories::equipo::create(&state.db, orden, nombre, apellido, puesto, descripcion)
            .await?;

    utils::image::save_image(
        utils::equipo::path_team_img(member.id).map_err(|_| ApiError::InternalServerError)?,
        &image,
    )
    .map_err(|_| ApiError::InternalServerError)?;

    Ok((StatusCode::CREATED, Json(member)))
}

pub async fn patch_equipo(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    mut multipart: Multipart,
) -> ApiResult<Json<Equipo>> {
    user.require(ADMIN_MIEMBROS)?;

    let mut nombre = None;
    let mut apellido = None;
    let mut puesto = None;
    let mut descripcion = None;
    let mut orden = None;

    let mut image: Option<Vec<u8>> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| ApiError::BadRequest("Cuerpo multiparte no válido".into()))?
    {
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

            Some("orden") => {
                orden = Some(
                    field
                        .text()
                        .await
                        .map_err(|_| ApiError::BadRequest("Orden inválido".into()))?
                        .parse()
                        .map_err(|_| {
                            ApiError::BadRequest("El orden debe de ser un número".into())
                        })?,
                );
            }

            Some("image") => {
                image = Some(
                    field
                        .bytes()
                        .await
                        .map_err(|_| ApiError::BadRequest("Imagen inválida".into()))?
                        .to_vec(),
                );
            }

            _ => {}
        }
    }

    let update = UpdateEquipo {
        orden,
        nombre,
        apellido,
        puesto,
        descripcion,
    };

    let member = repositories::equipo::update(&state.db, id, update).await?;

    if let Some(image) = image {
        utils::image::save_image(
            utils::equipo::path_team_img(member.id).map_err(|_| ApiError::InternalServerError)?,
            &image,
        )
        .map_err(|_| ApiError::InternalServerError)?;
    }

    Ok(Json(member))
}

pub async fn change_order_equipo(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    Json(request): Json<Vec<ChangeOrderEquipo>>,
) -> ApiResult<StatusCode> {
    user.require(ADMIN_MIEMBROS)?;

    let mut ids = std::collections::HashSet::new();
    let mut orders = std::collections::HashSet::new();

    for item in &request {
        if !ids.insert(item.id) {
            return Err(ApiError::BadRequest("Id de miembro duplicado.".into()));
        }

        if !orders.insert(item.orden) {
            return Err(ApiError::BadRequest("Orden duplicado.".into()));
        }
    }

    repositories::equipo::change_order(&state.db, request).await?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn delete_equipo(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> ApiResult<Json<Equipo>> {
    println!("entre al delete");
    user.require(ADMIN_MIEMBROS)?;

    let member = repositories::equipo::delete(&state.db, id).await?;

    utils::image::delete_image(
        utils::equipo::path_team_img(member.id).map_err(|_| ApiError::InternalServerError)?,
    )
    .map_err(|_| ApiError::InternalServerError)?;

    Ok(Json(member))
}
