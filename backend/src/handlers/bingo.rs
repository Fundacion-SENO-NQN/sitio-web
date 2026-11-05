use crate::{
    AppState,
    auth::{auth_user::AuthUser, services::ADMIN_BINGOS},
    error::api_error::{ApiError, ApiResult},
    models::bingo::{Bingo, CreateBingo, UpdateBingo},
    repositories,
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

pub async fn get_all_bingo(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<Bingo>>> {
    user.require(ADMIN_BINGOS)?;
    Ok(Json(repositories::bingo::get_all(&state.db).await?))
}

/* ==========================================================
   GET BY ID
========================================================== */

pub async fn get_bingo_by_id(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> ApiResult<Json<Bingo>> {
    user.require(ADMIN_BINGOS)?;

    let bingo = repositories::bingo::get_by_id(&state.db, id)
        .await?
        .ok_or(ApiError::NotFound)?;

    Ok(Json(bingo))
}

/* ==========================================================
   CREATE
========================================================== */

pub async fn create_bingo(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> ApiResult<(StatusCode, Json<Bingo>)> {
    user.require(ADMIN_BINGOS)?;

    let mut name = String::new();
    let mut last_name = String::new();
    let mut phone = String::new();
    let mut neighborhood = String::new();
    let mut collection_date = String::new();
    let mut collection_locate = String::new();
    let mut address = String::new();
    let mut locality = String::new();
    let mut start_month: Option<i16> = None;
    let mut quote: Option<i16> = None;
    let mut nro_bingo: Option<i16> = None;
    let mut late_payment_notice: Option<i16> = None;

    while let Some(field) = multipart.next_field().await.map_err(|error| {
        eprintln!("Invalid bingo multipart body: {error}");

        ApiError::BadRequest("Cuerpo multiparte no válido".into())
    })? {
        match field.name() {
            Some("name") => {
                name = read_text(field, "Nombre inválido").await?;
            }

            Some("last_name") => {
                last_name = read_text(field, "Apellido inválido").await?;
            }

            Some("phone") => {
                phone = read_text(field, "Teléfono inválido").await?;
            }

            Some("neighborhood") => {
                neighborhood = read_text(field, "Barrio inválido").await?;
            }

            Some("collection_date") => {
                collection_date = read_text(field, "Fecha de cobro inválida").await?;
            }

            Some("collection_locate") => {
                collection_locate = read_text(field, "Lugar de cobro inválido").await?;
            }

            Some("address") => {
                address = read_text(field, "Dirección inválida").await?;
            }

            Some("locality") => {
                locality = read_text(field, "Localidad inválida").await?;
            }

            Some("start_month") => {
                let raw = read_text(field, "Mes de inicio inválido").await?;
                start_month = Some(parse_start_month(&raw)?);
            }

            Some("quote") => {
                let raw = read_text(field, "Cuotas inválidas").await?;
                quote = Some(parse_quotes(&raw)?);
            }

            Some("nro_bingo") => {
                let raw = read_text(field, "Número de bingo inválido").await?;
                nro_bingo = Some(parse_nro_bingo(&raw)?);
            }

            Some("late_payment_notice") => {
                let raw = read_text(field, "Aviso automático inválido").await?;
                late_payment_notice = Some(parse_i16(&raw, "Aviso automático inválido")?);
            }

            _ => {}
        }
    }

    let name = validate_required_text(&name, "El nombre es requerido")?;
    let last_name = validate_required_text(&last_name, "El apellido es requerido")?;
    let phone = validate_required_text(&phone, "El teléfono es requerido")?;
    let neighborhood = validate_required_text(&neighborhood, "El barrio es requerido")?;
    let collection_date =
        validate_required_text(&collection_date, "La fecha de cobro es requerida")?;
    let collection_locate =
        validate_required_text(&collection_locate, "El lugar de cobro es requerido")?;
    let address = validate_required_text(&address, "La dirección es requerida")?;
    let locality = validate_required_text(&locality, "La localidad es requerida")?;

    let start_month =
        start_month.ok_or_else(|| ApiError::BadRequest("El mes de inicio es requerido".into()))?;
    let nro_bingo =
        nro_bingo.ok_or_else(|| ApiError::BadRequest("El número de bingo es requerido".into()))?;
    let quote = quote.unwrap_or(0);
    let late_payment_notice = late_payment_notice.unwrap_or(0);

    let bingo = repositories::bingo::create(
        &state.db,
        CreateBingo {
            name,
            last_name,
            phone,
            neighborhood,
            collection_date,
            collection_locate,
            address,
            locality,
            start_month,
            quote,
            nro_bingo,
            late_payment_notice,
        },
    )
    .await?;

    Ok((StatusCode::CREATED, Json(bingo)))
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
    user.require(ADMIN_BINGOS)?;

    let mut name: Option<String> = None;
    let mut last_name: Option<String> = None;
    let mut phone: Option<String> = None;
    let mut neighborhood: Option<String> = None;
    let mut collection_date: Option<String> = None;
    let mut collection_locate: Option<String> = None;
    let mut address: Option<String> = None;
    let mut locality: Option<String> = None;
    let mut start_month: Option<i16> = None;
    let mut quote: Option<i16> = None;
    let mut nro_bingo: Option<i16> = None;
    let mut late_payment_notice: Option<i16> = None;

    while let Some(field) = multipart.next_field().await.map_err(|error| {
        eprintln!("Invalid bingo multipart body: {error}");

        ApiError::BadRequest("Cuerpo multiparte no válido".into())
    })? {
        match field.name() {
            Some("name") => {
                name = Some(read_text(field, "Nombre inválido").await?);
            }

            Some("last_name") => {
                last_name = Some(read_text(field, "Apellido inválido").await?);
            }

            Some("phone") => {
                phone = Some(read_text(field, "Teléfono inválido").await?);
            }

            Some("neighborhood") => {
                neighborhood = Some(read_text(field, "Barrio inválido").await?);
            }

            Some("collection_date") => {
                collection_date = Some(read_text(field, "Fecha de cobro inválida").await?);
            }

            Some("collection_locate") => {
                collection_locate = Some(read_text(field, "Lugar de cobro inválido").await?);
            }

            Some("address") => {
                address = Some(read_text(field, "Dirección inválida").await?);
            }

            Some("locality") => {
                locality = Some(read_text(field, "Localidad inválida").await?);
            }

            Some("start_month") => {
                let raw = read_text(field, "Mes de inicio inválido").await?;
                start_month = Some(parse_start_month(&raw)?);
            }

            Some("quote") => {
                let raw = read_text(field, "Cuotas inválidas").await?;
                quote = Some(parse_quotes(&raw)?);
            }

            Some("nro_bingo") => {
                let raw = read_text(field, "Número de bingo inválido").await?;
                nro_bingo = Some(parse_nro_bingo(&raw)?);
            }

            Some("late_payment_notice") => {
                let raw = read_text(field, "Aviso automático inválido").await?;
                late_payment_notice = Some(parse_i16(&raw, "Aviso automático inválido")?);
            }

            _ => {}
        }
    }

    let name = clean_optional_text(name, "El nombre no puede estar vacío")?;
    let last_name = clean_optional_text(last_name, "El apellido no puede estar vacío")?;
    let phone = clean_optional_text(phone, "El teléfono no puede estar vacío")?;
    let neighborhood = clean_optional_text(neighborhood, "El barrio no puede estar vacío")?;
    let collection_date =
        clean_optional_text(collection_date, "La fecha de cobro no puede estar vacía")?;
    let collection_locate =
        clean_optional_text(collection_locate, "El lugar de cobro no puede estar vacío")?;
    let address = clean_optional_text(address, "La dirección no puede estar vacía")?;
    let locality = clean_optional_text(locality, "La localidad no puede estar vacía")?;

    if name.is_none()
        && last_name.is_none()
        && phone.is_none()
        && neighborhood.is_none()
        && collection_date.is_none()
        && collection_locate.is_none()
        && address.is_none()
        && locality.is_none()
        && start_month.is_none()
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
        collection_date,
        collection_locate,
        address,
        locality,
        start_month,
        quote,
        nro_bingo,
        late_payment_notice,
    };

    let bingo = repositories::bingo::update(&state.db, id, update).await?;

    Ok(Json(bingo))
}

/* ==========================================================
   DELETE
========================================================== */

pub async fn delete_bingo(
    AuthUser(user): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> ApiResult<Json<Bingo>> {
    user.require(ADMIN_BINGOS)?;

    let bingo = repositories::bingo::delete(&state.db, id).await?;

    Ok(Json(bingo))
}

/* ==========================================================
   PRIVATE HELPERS
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

fn validate_required_text(value: &str, message: &str) -> ApiResult<String> {
    let trimmed = value.trim();

    if trimmed.is_empty() {
        return Err(ApiError::BadRequest(message.to_string()));
    }

    Ok(trimmed.to_string())
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

fn parse_i16(raw: &str, error_message: &str) -> ApiResult<i16> {
    raw.trim()
        .parse::<i16>()
        .map_err(|_| ApiError::BadRequest(error_message.to_string()))
}

fn parse_nro_bingo(raw: &str) -> ApiResult<i16> {
    let nro = parse_i16(raw, "Número de bingo inválido")?;

    if nro < 0 {
        return Err(ApiError::BadRequest(
            "El número de bingo no puede ser negativo".into(),
        ));
    }

    Ok(nro)
}

fn parse_start_month(raw: &str) -> ApiResult<i16> {
    let month = parse_i16(raw, "Mes de inicio inválido")?;

    if !(1..=12).contains(&month) {
        return Err(ApiError::BadRequest(
            "El mes de inicio debe estar entre 1 y 12".into(),
        ));
    }

    Ok(month)
}

/// Parses and validates the 2-byte quote value.
/// Each of the 8 quotes uses 2 bits:
/// - `00`: unpaid
/// - `01`: paid with cash
/// - `10`: paid by bank transfer
/// - `11`: invalid
fn parse_quotes(raw: &str) -> ApiResult<i16> {
    let parsed = raw
        .trim()
        .parse::<i32>()
        .map_err(|_| ApiError::BadRequest("Cuotas inválidas".into()))?;

    let bits: u16 = if (0..=i32::from(u16::MAX)).contains(&parsed) {
        parsed as u16
    } else if (i32::from(i16::MIN)..0).contains(&parsed) {
        (parsed as i16) as u16
    } else {
        return Err(ApiError::BadRequest(
            "El valor de las cuotas excede los 2 bytes".into(),
        ));
    };

    for quote_index in 0..8 {
        let state = (bits >> (quote_index * 2)) & 0b11;

        if state == 0b11 {
            return Err(ApiError::BadRequest(
                "El estado de una de las cuotas no es válido".into(),
            ));
        }
    }

    Ok(bits as i16)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_quotes_accepts_example_25() {
        // 25 = 0b0000_0000_0001_1001:
        // quote 1 = 01 (cash), quote 2 = 10 (bank transfer), quote 3 = 01 (cash)
        let result = parse_quotes("25").unwrap();
        assert_eq!(result, 25);
    }

    #[test]
    fn parse_quotes_accepts_zero_and_all_valid_states() {
        assert_eq!(parse_quotes("0").unwrap(), 0);
        // All 8 quotes paid with cash: 0b0101_0101_0101_0101 = 0x5555 = 21845
        assert_eq!(parse_quotes("21845").unwrap(), 21845);
        // All 8 quotes paid by bank transfer: 0b1010_1010_1010_1010 = 0xAAAA = 43690 (u16) = -21846 (i16)
        assert_eq!(parse_quotes("43690").unwrap(), -21846);
        assert_eq!(parse_quotes("-21846").unwrap(), -21846);
    }

    #[test]
    fn parse_quotes_rejects_invalid_bit_pair_11() {
        // 3 = 0b11 in first quote
        assert!(parse_quotes("3").is_err());
        // 27 = 0b0001_1011 (first quote is 11)
        assert!(parse_quotes("27").is_err());
        // 8th quote is 11: 0b1100_0000_0000_0000 = 49152
        assert!(parse_quotes("49152").is_err());
    }

    #[test]
    fn parse_quotes_rejects_out_of_range_and_non_numeric() {
        assert!(parse_quotes("70000").is_err());
        assert!(parse_quotes("-40000").is_err());
        assert!(parse_quotes("abc").is_err());
    }

    #[test]
    fn parse_start_month_validates_range() {
        assert_eq!(parse_start_month("1").unwrap(), 1);
        assert_eq!(parse_start_month("12").unwrap(), 12);
        assert!(parse_start_month("0").is_err());
        assert!(parse_start_month("13").is_err());
    }

    #[test]
    fn parse_nro_bingo_validates_non_negative() {
        assert_eq!(parse_nro_bingo("0").unwrap(), 0);
        assert_eq!(parse_nro_bingo("42").unwrap(), 42);
        assert!(parse_nro_bingo("-1").is_err());
    }
}
