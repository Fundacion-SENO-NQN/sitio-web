use crate::{
    AppState,
    auth::{auth_user::AuthUser, services::ADMIN_BINGO},
    error::api_error::{ApiError, ApiResult},
    models::bingo::{Bingo, CreateBingo, UpdateBingo},
    repositories::bingo,
};
use axum::{
    Json,
    extract::{Multipart, Path, State},
    http::StatusCode,
};
use std::sync::Arc;

/* ==========================================================
   GET ALL
========================================================== */

pub async fn get_all_bingos(State(state): State<Arc<AppState>>) -> ApiResult<Json<Vec<Bingo>>> {
    let bingos = bingo::get_all(&state.db).await?;

    Ok(Json(bingos))
}

/* ==========================================================
   GET BY ID
========================================================== */

pub async fn get_bingo_by_id(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> ApiResult<Json<Bingo>> {
    let bingo_selected = bingo::get_by_id(&state.db, id)
        .await?
        .ok_or(ApiError::NotFound)?;

    Ok(Json(bingo_selected))
}

/* ==========================================================
   GET BY NUMBER
========================================================== */

pub async fn get_bingo_by_number(
    State(state): State<Arc<AppState>>,
    Path(num): Path<i16>,
) -> ApiResult<Json<Bingo>> {
    let bingo_selected = bingo::get_by_number(&state.db, num)
        .await?
        .ok_or(ApiError::NotFound)?;

    Ok(Json(bingo_selected))
}

/* ==========================================================
   CREATE
========================================================== */

pub async fn create_bingo(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> ApiResult<(StatusCode, Json<Bingo>)> {
    user.require(ADMIN_BINGO)?;

    let mut name = String::new();
    let mut last_name = String::new();
    let mut phone = String::new();
    let mut neighborhood = String::new();
    let mut collection_locate = String::new();
    let mut start_month: i16 = -1;
    let mut collection_date = String::new();
    let mut locality = String::new();
    let mut quote: i16 = -1;
    let mut nro_bingo: i16 = -1;
    let mut late_payment_notice: i16 = -1;

    while let Some(field) = multipart.next_field().await.map_err(|error| {
        eprintln!("Invalid member multipart body: {error}",);

        ApiError::BadRequest("Cuerpo multiparte no válido".into())
    })? {
        match field.name() {
            Some("name") => {
                name = field
                    .text()
                    .await
                    .map_err(|_| ApiError::BadRequest("Nombre inválido".into()))?;
            }

            Some("last_name") => {
                last_name = field
                    .text()
                    .await
                    .map_err(|_| ApiError::BadRequest("Apellido inválido".into()))?;
            }

            Some("phone") => {
                phone = field
                    .text()
                    .await
                    .map_err(|_| ApiError::BadRequest("Teléfono inválido".into()))?;
            }

            Some("neighborhood") => {
                neighborhood = field
                    .text()
                    .await
                    .map_err(|_| ApiError::BadRequest("Barrio inválido".into()))?;
            }

            Some("collection_locate") => {
                collection_locate = field
                    .text()
                    .await
                    .map_err(|_| ApiError::BadRequest("Lugar de cobro inválido".into()))?;
            }

            Some("start_month") => {
                start_month = field
                    .text()
                    .await
                    .map_err(|_| ApiError::BadRequest("Mes de inicio inválido".into()))?
                    .parse::<i16>()
                    .map_err(|_| ApiError::BadRequest("Mes de inicio inválido".into()))?;
            }

            Some("collection_date") => {
                collection_date = field
                    .text()
                    .await
                    .map_err(|_| ApiError::BadRequest("Fecha de cobro inválido".into()))?;
            }

            Some("locality") => {
                locality = field
                    .text()
                    .await
                    .map_err(|_| ApiError::BadRequest("Localidad inválida".into()))?;
            }

            Some("quote") => {
                quote = field
                    .text()
                    .await
                    .map_err(|_| ApiError::BadRequest("Cuotas inválidas".into()))?
                    .parse::<i16>()
                    .map_err(|_| ApiError::BadRequest("Cuotas inválidas".into()))?;
            }

            Some("nro_bingo") => {
                nro_bingo = field
                    .text()
                    .await
                    .map_err(|_| ApiError::BadRequest("Número bingo inválido".into()))?
                    .parse::<i16>()
                    .map_err(|_| ApiError::BadRequest("Número bingo inválido".into()))?;
            }

            Some("late_payment_notice") => {
                late_payment_notice = field
                    .text()
                    .await
                    .map_err(|_| ApiError::BadRequest("Aviso de pago atrasado inválido".into()))?
                    .parse::<i16>()
                    .map_err(|_| ApiError::BadRequest("Aviso de pago atrasado inválido".into()))?;
            }

            /*
             * The order is calculated automatically by
             * the repository. Unexpected fields are ignored.
             */
            _ => {}
        }
    }

    let name = name.trim();
    let last_name = last_name.trim();
    let phone = phone.trim();
    let neighborhood = neighborhood.trim();
    let collection_locate = collection_locate.trim();
    let start_month = start_month;
    let collection_date = collection_date.trim();
    let locality = locality.trim();
    let quote = quote;
    let nro_bingo = nro_bingo;
    let late_payment_notice = late_payment_notice;

    validate_required_text(name, "El nombre es requerido")?;
    validate_required_text(last_name, "El apellido es requerido")?;
    validate_required_text(phone, "El teléfono es requerido")?;
    validate_required_text(neighborhood, "El barrio es requerido")?;
    validate_required_text(collection_locate, "El lugar de cobro es requerido")?;
    validate_required_i16(start_month, "El mes de inicio es requerido")?;
    validate_required_text(collection_date, "La fecha de cobro es requerida")?;
    validate_required_text(locality, "La localidad es requerida")?;
    validate_required_i16(quote, "Las cuotas son requeridas")?;
    validate_required_i16(nro_bingo, "El número de bingo es requerido")?;
    validate_required_i16(
        late_payment_notice,
        "El aviso de pago atrasado es requerido",
    )?;

    let bingo_to_create = CreateBingo {
        name: name.into(),
        last_name: last_name.into(),
        phone: phone.into(),
        neighborhood: neighborhood.into(),
        collection_locate: collection_locate.into(),
        start_month,
        collection_date: collection_date.into(),
        locality: locality.into(),
        quote,
        nro_bingo,
        late_payment_notice,
    };

    let bingo_created = bingo::create(&state.db, bingo_to_create).await?;

    Ok((StatusCode::CREATED, Json(bingo_created)))
}

/* ==========================================================
   PATCH
========================================================== */

pub async fn patch_bingo(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    mut multipart: Multipart,
) -> ApiResult<Json<Bingo>> {
    user.require(ADMIN_BINGO)?;

    let mut name: Option<String> = None;
    let mut last_name: Option<String> = None;
    let mut phone: Option<String> = None;
    let mut neighborhood: Option<String> = None;
    let mut collection_locate: Option<String> = None;
    let mut start_month: Option<i16> = None;
    let mut collection_date: Option<String> = None;
    let mut locality: Option<String> = None;
    let mut quote: Option<i16> = None;
    let mut nro_bingo: Option<i16> = None;
    let mut late_payment_notice: Option<i16> = None;

    while let Some(field) = multipart.next_field().await.map_err(|error| {
        eprintln!("Invalid member multipart body: {error}",);

        ApiError::BadRequest("Cuerpo multiparte no válido".into())
    })? {
        match field.name() {
            Some("name") => {
                name = Some(
                    field
                        .text()
                        .await
                        .map_err(|_| ApiError::BadRequest("Nombre inválido".into()))?,
                );
            }

            Some("last_name") => {
                last_name = Some(
                    field
                        .text()
                        .await
                        .map_err(|_| ApiError::BadRequest("Apellido inválido".into()))?,
                );
            }

            Some("phone") => {
                phone = Some(
                    field
                        .text()
                        .await
                        .map_err(|_| ApiError::BadRequest("Teléfono inválido".into()))?,
                );
            }

            Some("neighborhood") => {
                neighborhood = Some(
                    field
                        .text()
                        .await
                        .map_err(|_| ApiError::BadRequest("Barrio inválido".into()))?,
                );
            }

            Some("collection_locate") => {
                collection_locate = Some(
                    field
                        .text()
                        .await
                        .map_err(|_| ApiError::BadRequest("Lugar de cobro inválido".into()))?,
                );
            }

            Some("start_month") => {
                start_month = Some(
                    field
                        .text()
                        .await
                        .map_err(|_| ApiError::BadRequest("Mes de inicio inválido".into()))?
                        .parse::<i16>()
                        .map_err(|_| ApiError::BadRequest("Mes de inicio inválido".into()))?,
                );
            }

            Some("collection_date") => {
                collection_date = Some(
                    field
                        .text()
                        .await
                        .map_err(|_| ApiError::BadRequest("Lugar de cobro inválido".into()))?,
                );
            }

            Some("locality") => {
                locality = Some(
                    field
                        .text()
                        .await
                        .map_err(|_| ApiError::BadRequest("Localidad inválida".into()))?,
                );
            }

            Some("quote") => {
                quote = Some(
                    field
                        .text()
                        .await
                        .map_err(|_| ApiError::BadRequest("Cuotas inválidas".into()))?
                        .parse::<i16>()
                        .map_err(|_| ApiError::BadRequest("Cuotas inválidas".into()))?,
                );
            }

            Some("nro_bingo") => {
                nro_bingo = Some(
                    field
                        .text()
                        .await
                        .map_err(|_| ApiError::BadRequest("Número de bingo inválido".into()))?
                        .parse::<i16>()
                        .map_err(|_| ApiError::BadRequest("Número de bingo inválido".into()))?,
                );
            }

            Some("late_payment_notice") => {
                late_payment_notice = Some(
                    field
                        .text()
                        .await
                        .map_err(|_| {
                            ApiError::BadRequest("Aviso de pago atrasado inválido".into())
                        })?
                        .parse::<i16>()
                        .map_err(|_| {
                            ApiError::BadRequest("Aviso de pago atrasado inválido".into())
                        })?,
                );
            }
            _ => {}
        }
    }

    let name = clean_optional_text(name, "El nombre no puede estar vacío")?;
    let last_name = clean_optional_text(last_name, "El apellido no puede estar vacío")?;
    let phone = clean_optional_text(phone, "El teléfono no puede estar vacía")?;
    let neighborhood = clean_optional_text(neighborhood, "El barrio no puede estar vacío")?;
    let collection_locate =
        clean_optional_text(collection_locate, "El lugar de cobro no puede estar vacío")?;
    let start_month = clean_optional_i16(start_month, "El mes de inicio no puede ser negativo")?;
    let collection_date =
        clean_optional_text(collection_date, "La fecha de cobro no puede estar vacía")?;
    let locality = clean_optional_text(locality, "La localidad no puede estar vacía")?;
    let quote = clean_optional_i16(quote, "Las cuotas no pueden ser negativas")?;
    let nro_bingo = clean_optional_i16(nro_bingo, "El número de bingo no puede ser negativo")?;
    let late_payment_notice = clean_optional_i16(
        late_payment_notice,
        "El aviso de pago atrasado no puede ser negativo",
    )?;

    if name.is_none()
        && last_name.is_none()
        && phone.is_none()
        && neighborhood.is_none()
        && collection_locate.is_none()
        && start_month.is_none()
        && collection_date.is_none()
        && locality.is_none()
        && quote.is_none()
        && nro_bingo.is_none()
        && late_payment_notice.is_none()
    {
        return Err(ApiError::BadRequest("No se enviaron cambios".into()));
    }

    let update = UpdateBingo {
        name,
        last_name,
        phone,
        neighborhood,
        collection_locate,
        start_month,
        collection_date,
        locality,
        quote,
        nro_bingo,
        late_payment_notice,
    };

    let bingo_edited = bingo::update(&state.db, id, update).await?;

    Ok(Json(bingo_edited))
}

/* ==========================================================
   DELETE
========================================================== */

pub async fn delete_bingo(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> ApiResult<Json<Bingo>> {
    user.require(ADMIN_BINGO)?;

    Ok(Json(bingo::delete(&state.db, id).await?))
}

/* ==========================================================
   PRIVATE HELPERS
========================================================== */

fn validate_required_text(value: &str, message: &str) -> ApiResult<()> {
    if value.is_empty() {
        return Err(ApiError::BadRequest(message.to_string()));
    }

    Ok(())
}

fn validate_required_i16(value: i16, message: &str) -> ApiResult<()> {
    if value < 0 {
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

fn clean_optional_i16(value: Option<i16>, bad_request_msg: &str) -> ApiResult<Option<i16>> {
    value
        .map(|value| {
            if value < 0 {
                return Err(ApiError::BadRequest(bad_request_msg.to_string()));
            }

            Ok(value)
        })
        .transpose()
}
