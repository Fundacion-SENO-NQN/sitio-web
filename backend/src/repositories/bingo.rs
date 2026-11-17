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
];

static COLUMNAS_UPDATE: &[&str] = &[
    "name",
    "last_name",
    "phone",
    "neighborhood",
    "collection_date",
    "collection_locate",
    "address",
    "locality",
    "start_month",
    "quote",
    "nro_bingo",
    "late_payment_notice",
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
        .fetch_one(db)
        .await
        .map_err(map_bingo_db_error)?;

    Ok(bingo)
}

/* ==========================================================
   UPDATE
========================================================== */

pub async fn update(db: &PgPool, id: i64, update: UpdateBingo) -> ApiResult<Bingo> {
    let sql = base::sql_actualizar_coalesce_por_id(&BINGOS, COLUMNAS_UPDATE, true)?;

    let bingo = sqlx::query_as::<_, Bingo>(AssertSqlSafe(sql))
        .bind(update.name)
        .bind(update.last_name)
        .bind(update.phone)
        .bind(update.neighborhood)
        .bind(update.collection_date)
        .bind(update.collection_locate)
        .bind(update.address)
        .bind(update.locality)
        .bind(update.start_month)
        .bind(update.quote)
        .bind(update.nro_bingo)
        .bind(update.late_payment_notice)
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
