use crate::{
    error::api_error::{ApiError, ApiResult},
    models::bingo::{Bingo, CreateBingo, UpdateBingo},
};
use sqlx::PgPool;

/* ==========================================================
   GET ALL
========================================================== */

pub async fn get_all(db: &PgPool) -> ApiResult<Vec<Bingo>> {
    Ok(sqlx::query_as::<_, Bingo>(
        r#"
            SELECT
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
                created_at
            FROM bingo
            ORDER BY nro_bingo
            "#,
    )
    .fetch_all(db)
    .await?)
}

/* ==========================================================
   GET BY ID
========================================================== */

pub async fn get_by_id(db: &PgPool, id: i64) -> ApiResult<Option<Bingo>> {
    Ok(sqlx::query_as::<_, Bingo>(
        r#"
            SELECT
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
                created_at
            FROM bingo
            WHERE id = $1
            "#,
    )
    .bind(id)
    .fetch_optional(db)
    .await?)
}

/* ==========================================================
   CREATE
========================================================== */

pub async fn create(db: &PgPool, new_bingo: CreateBingo) -> ApiResult<Bingo> {
    let bingo = sqlx::query_as::<_, Bingo>(
        r#"
        INSERT INTO bingo
        (
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
            address
        )
        VALUES
        (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            $12
        )
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
            created_at
        "#,
    )
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
    let bingo = sqlx::query_as::<_, Bingo>(
        r#"
        UPDATE bingo
        SET
            name = COALESCE($1, name),
            last_name = COALESCE($2, last_name),
            phone = COALESCE($3, phone),
            neighborhood = COALESCE($4, neighborhood),
            collection_date = COALESCE($5, collection_date),
            collection_locate = COALESCE($6, collection_locate),
            address = COALESCE($7, address),
            locality = COALESCE($8, locality),
            start_month = COALESCE($9, start_month),
            quote = COALESCE($10, quote),
            nro_bingo = COALESCE($11, nro_bingo),
            late_payment_notice = COALESCE($12, late_payment_notice)
        WHERE id = $13
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
            created_at
        "#,
    )
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
    let bingo = sqlx::query_as::<_, Bingo>(
        r#"
        DELETE FROM bingo
        WHERE id = $1
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
            created_at
        "#,
    )
    .bind(id)
    .fetch_optional(db)
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
