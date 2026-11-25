use crate::{
    error::api_error::{ApiError, ApiResult},
    models::bingo::{Bingo, CreateBingo, UpdateBingo},
    repositories::{
        base::{self, Ordenamiento},
        tablas::BINGOS,
    },
};
use sqlx::{AssertSqlSafe, PgPool};

static COLUMNAS_CREATE: &[&str] = &[
    "name",
    "last_name",
    "phone",
    "neighborhood",
    "collection_date",
    "collection_locate",
    "start_month",
    "locality",
    "quote",
    "nro_bingo",
    "late_payment_notice",
    "address",
    "seller",
    "cancelled",
];

/* ==========================================================
   GET ALL
========================================================== */

pub async fn get_all(db: &PgPool) -> ApiResult<Vec<Bingo>> {
    Ok(base::obtener_todos::<Bingo>(db, &[Ordenamiento::asc("nro_bingo")]).await?)
}

/* ==========================================================
   GET BY ID
========================================================== */

pub async fn get_by_id(db: &PgPool, id: i64) -> ApiResult<Option<Bingo>> {
    Ok(base::obtener_por_id::<Bingo>(db, id).await?)
}

/* ==========================================================
   CREATE
========================================================== */

pub async fn create(db: &PgPool, new_bingo: CreateBingo) -> ApiResult<Bingo> {
    let sql = base::sql_insertar(&BINGOS, COLUMNAS_CREATE, true)?;

    let bingo = sqlx::query_as::<_, Bingo>(AssertSqlSafe(sql))
        .bind(new_bingo.name)
        .bind(new_bingo.last_name)
        .bind(new_bingo.phone)
        .bind(new_bingo.neighborhood)
        .bind(new_bingo.collection_date)
        .bind(new_bingo.collection_locate)
        .bind(new_bingo.start_month)
        .bind(new_bingo.locality)
        .bind(new_bingo.quote)
        .bind(new_bingo.nro_bingo)
        .bind(new_bingo.late_payment_notice)
        .bind(new_bingo.address)
        .bind(new_bingo.seller)
        .bind(new_bingo.cancelled)
        .fetch_one(db)
        .await
        .map_err(map_bingo_db_error)?;

    Ok(bingo)
}

/* ==========================================================
   UPDATE
========================================================== */

pub async fn update(db: &PgPool, id: i64, update: UpdateBingo) -> ApiResult<Bingo> {
    let neighborhood_was_sent = update.neighborhood.is_some();
    let neighborhood_value = update.neighborhood.flatten();

    let collection_date_was_sent = update.collection_date.is_some();
    let collection_date_value = update.collection_date.flatten();

    let collection_locate_was_sent = update.collection_locate.is_some();
    let collection_locate_value = update.collection_locate.flatten();

    let address_was_sent = update.address.is_some();
    let address_value = update.address.flatten();

    let locality_was_sent = update.locality.is_some();
    let locality_value = update.locality.flatten();

    let seller_was_sent = update.seller.is_some();
    let seller_value = update.seller.flatten();

    let bingo = sqlx::query_as::<_, Bingo>(
        r#"
        UPDATE bingos
        SET
            name = COALESCE($1, name),
            last_name = COALESCE($2, last_name),
            phone = COALESCE($3, phone),
            neighborhood = CASE
                WHEN $4 THEN $5
                ELSE neighborhood
            END,
            collection_date = CASE
                WHEN $6 THEN $7
                ELSE collection_date
            END,
            collection_locate = CASE
                WHEN $8 THEN $9
                ELSE collection_locate
            END,
            address = CASE
                WHEN $10 THEN $11
                ELSE address
            END,
            locality = CASE
                WHEN $12 THEN $13
                ELSE locality
            END,
            start_month = COALESCE($14, start_month),
            quote = COALESCE($15, quote),
            nro_bingo = COALESCE($16, nro_bingo),
            late_payment_notice = COALESCE($17, late_payment_notice),
            seller = CASE
                WHEN $18 THEN $19
                ELSE seller
            END,
            cancelled = COALESCE($20, cancelled)
        WHERE id = $21
        RETURNING
            id,
            name,
            last_name,
            phone,
            neighborhood,
            collection_date,
            collection_locate,
            start_month,
            locality,
            quote,
            nro_bingo,
            late_payment_notice,
            address,
            created_at,
            seller,
            cancelled
        "#,
    )
    .bind(update.name)
    .bind(update.last_name)
    .bind(update.phone)
    .bind(neighborhood_was_sent)
    .bind(neighborhood_value)
    .bind(collection_date_was_sent)
    .bind(collection_date_value)
    .bind(collection_locate_was_sent)
    .bind(collection_locate_value)
    .bind(address_was_sent)
    .bind(address_value)
    .bind(locality_was_sent)
    .bind(locality_value)
    .bind(update.start_month)
    .bind(update.quote)
    .bind(update.nro_bingo)
    .bind(update.late_payment_notice)
    .bind(seller_was_sent)
    .bind(seller_value)
    .bind(update.cancelled)
    .bind(id)
    .fetch_optional(db)
    .await
    .map_err(map_bingo_db_error)?
    .ok_or(ApiError::NotFound)?;

    Ok(bingo)
}

/* ==========================================================
   DELETE
========================================================== */

pub async fn delete(db: &PgPool, id: i64) -> ApiResult<Bingo> {
    let bingo = base::eliminar_por_id_retornando::<Bingo>(db, id)
        .await?
        .ok_or(ApiError::NotFound)?;

    Ok(bingo)
}

fn map_bingo_db_error(error: sqlx::Error) -> ApiError {
    if let sqlx::Error::Database(ref db_error) = error
        && db_error.is_unique_violation()
    {
        return ApiError::Conflict("El número de bingo ya está en uso.".into());
    }

    ApiError::from(error)
}
