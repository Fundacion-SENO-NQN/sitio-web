use crate::{
    error::api_error::{ApiError, ApiResult},
    models::bingo::{Bingo, CreateBingo, UpdateBingo},
};
use sqlx::PgPool;

pub async fn get_all(db: &PgPool) -> ApiResult<Vec<Bingo>> {
    Ok(sqlx::query_as::<_, Bingo>(
        r#"
            SELECT
                *
            FROM bingos
            "#,
    )
    .fetch_all(db)
    .await?)
}

pub async fn get_by_id(db: &PgPool, id: i64) -> ApiResult<Option<Bingo>> {
    Ok(sqlx::query_as::<_, Bingo>(
        r#"
            SELECT
                *
            FROM bingos
            WHERE id = $1
            "#,
    )
    .bind(id)
    .fetch_optional(db)
    .await?)
}

pub async fn get_by_number(db: &PgPool, num: i16) -> ApiResult<Option<Bingo>> {
    Ok(sqlx::query_as::<_, Bingo>(
        r#"
            SELECT
                *
            FROM bingos
            WHERE nro_bingo = $1
            "#,
    )
    .bind(num)
    .fetch_optional(db)
    .await?)
}

/* ==========================================================
   CREATE
========================================================== */

pub async fn create(db: &PgPool, bingo: CreateBingo) -> ApiResult<Bingo> {
    let mut tx = db.begin().await?;

    let bingo_created = sqlx::query_as::<_, Bingo>(
        r#"
        INSERT INTO bingos
        (
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
            late_payment_notice
        )
        SELECT
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
            $11
        FROM bingos
        RETURNING
            *
        "#,
    )
    .bind(bingo.name)
    .bind(bingo.last_name)
    .bind(bingo.phone)
    .bind(bingo.neighborhood)
    .bind(bingo.collection_locate)
    .bind(bingo.start_month)
    .bind(bingo.collection_date)
    .bind(bingo.locality)
    .bind(bingo.quote)
    .bind(bingo.nro_bingo)
    .bind(bingo.late_payment_notice)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(bingo_created)
}

/* ==========================================================
   UPDATE
========================================================== */

pub async fn update(db: &PgPool, id: i64, update: UpdateBingo) -> ApiResult<Bingo> {
    let member = sqlx::query_as::<_, Bingo>(
        r#"
        UPDATE bingos
        SET
            name = COALESCE($1, name),
            last_name = COALESCE($2, last_name),
            phone = COALESCE($3, phone),
            neighborhood = COALESCE($4, neighborhood),
            collection_locate = COALESCE($5, collection_locate)
            start_month = COALESCE($6, start_month)
            collection_date = COALESCE($7, collection_date)
            locality = COALESCE($8, locality)
            quote = COALESCE($9, quote)
            nro_bingo = COALESCE($10, quote)
            late_payment_notice = COALESCE($11, late_payment_notice)
        WHERE id = $12
        RETURNING
            *
        "#,
    )
    .bind(update.name)
    .bind(update.last_name)
    .bind(update.phone)
    .bind(update.neighborhood)
    .bind(update.collection_locate)
    .bind(update.start_month)
    .bind(update.collection_date)
    .bind(update.locality)
    .bind(update.quote)
    .bind(update.nro_bingo)
    .bind(update.late_payment_notice)
    .bind(id)
    .fetch_optional(db)
    .await?
    .ok_or(ApiError::NotFound)?;

    Ok(member)
}

/* ==========================================================
   DELETE
========================================================== */

pub async fn delete(db: &PgPool, id: i64) -> ApiResult<Bingo> {
    let mut tx = db.begin().await?;

    let member = sqlx::query_as::<_, Bingo>(
        r#"
        DELETE FROM bingos
        WHERE id = $1
        RETURNING
            *
        "#,
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(ApiError::NotFound)?;

    tx.commit().await?;

    Ok(member)
}
