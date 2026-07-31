use crate::{
    error::api_error::{ApiError, ApiResult},
    models::noticia::{ChangeOrderNoticia, Noticia, UpdateNoticia},
};
use sqlx::PgPool;

/* ==========================================================
   GET ALL
========================================================== */

pub async fn get_all(db: &PgPool) -> ApiResult<Vec<Noticia>> {
    let noticias = sqlx::query_as::<_, Noticia>(
        r#"
            SELECT
                id,
                orden,
                titulo,
                fecha,
                contenido,
                created_at
            FROM noticias
            ORDER BY orden
            "#,
    )
    .fetch_all(db)
    .await?;

    Ok(noticias)
}

/* ==========================================================
   GET BY ID
========================================================== */

pub async fn get_by_id(db: &PgPool, id: i64) -> ApiResult<Option<Noticia>> {
    let noticia = sqlx::query_as::<_, Noticia>(
        r#"
            SELECT
                id,
                orden,
                titulo,
                fecha,
                contenido,
                created_at
            FROM noticias
            WHERE id = $1
            "#,
    )
    .bind(id)
    .fetch_optional(db)
    .await?;

    Ok(noticia)
}

/* ==========================================================
   CREATE
========================================================== */

pub async fn create(db: &PgPool, titulo: &str, fecha: &str, contenido: &str) -> ApiResult<Noticia> {
    let mut tx = db.begin().await?;

    /*
     * Prevent two concurrent creations from calculating the
     * same MAX(orden) + 1 value.
     */
    sqlx::query(
        r#"
        LOCK TABLE noticias IN EXCLUSIVE MODE
        "#,
    )
    .execute(&mut *tx)
    .await?;

    let noticia = sqlx::query_as::<_, Noticia>(
        r#"
            INSERT INTO noticias
            (
                orden,
                titulo,
                fecha,
                contenido
            )
            SELECT
                COALESCE(MAX(orden), -1) + 1,
                $1,
                $2,
                $3
            FROM noticias
            RETURNING
                id,
                orden,
                titulo,
                fecha,
                contenido,
                created_at
            "#,
    )
    .bind(titulo)
    .bind(fecha)
    .bind(contenido)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(noticia)
}

/* ==========================================================
   UPDATE
========================================================== */

pub async fn update(db: &PgPool, id: i64, update: UpdateNoticia) -> ApiResult<Noticia> {
    /*
     * `orden` is intentionally ignored here. Ordering must
     * only be changed through PUT /noticias/order.
     */
    let UpdateNoticia {
        titulo,
        contenido,
        orden: _,
    } = update;

    let noticia = sqlx::query_as::<_, Noticia>(
        r#"
            UPDATE noticias
            SET
                titulo = COALESCE($1, titulo),
                contenido = COALESCE($2, contenido)
            WHERE id = $3
            RETURNING
                id,
                orden,
                titulo,
                fecha,
                contenido,
                created_at
            "#,
    )
    .bind(titulo)
    .bind(contenido)
    .bind(id)
    .fetch_optional(db)
    .await?
    .ok_or(ApiError::NotFound)?;

    Ok(noticia)
}

/* ==========================================================
   DELETE
========================================================== */

pub async fn delete(db: &PgPool, id: i64) -> ApiResult<Noticia> {
    let mut tx = db.begin().await?;

    /*
     * Lock ordering operations while deleting and compacting.
     */
    sqlx::query(
        r#"
        LOCK TABLE noticias IN EXCLUSIVE MODE
        "#,
    )
    .execute(&mut *tx)
    .await?;

    let noticia = sqlx::query_as::<_, Noticia>(
        r#"
            DELETE FROM noticias
            WHERE id = $1
            RETURNING
                id,
                orden,
                titulo,
                fecha,
                contenido,
                created_at
            "#,
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(ApiError::NotFound)?;

    /*
     * Save the current positions before moving them to
     * temporary negative values.
     */
    let following_news = sqlx::query_as::<_, (i64, i64)>(
        r#"
            SELECT
                id,
                orden
            FROM noticias
            WHERE orden > $1
            ORDER BY orden
            "#,
    )
    .bind(noticia.orden)
    .fetch_all(&mut *tx)
    .await?;

    /*
     * Move every affected row outside the valid order range.
     * Using the row ID prevents collisions, including when an
     * order is zero.
     */
    for (following_id, _) in &following_news {
        sqlx::query(
            r#"
            UPDATE noticias
            SET orden = -id - 1
            WHERE id = $1
            "#,
        )
        .bind(following_id)
        .execute(&mut *tx)
        .await?;
    }

    /*
     * Compact the order sequence.
     *
     * Example:
     * 0, 1, 2, 3
     *
     * Delete order 1:
     * 0, 2, 3
     *
     * Final:
     * 0, 1, 2
     */
    for (following_id, previous_order) in following_news {
        sqlx::query(
            r#"
            UPDATE noticias
            SET orden = $1
            WHERE id = $2
            "#,
        )
        .bind(previous_order - 1)
        .bind(following_id)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok(noticia)
}

/* ==========================================================
   CHANGE ORDER
========================================================== */

pub async fn change_order(db: &PgPool, order: Vec<ChangeOrderNoticia>) -> ApiResult<()> {
    let mut tx = db.begin().await?;

    /*
     * Prevent concurrent creation, deletion, or order changes
     * from modifying the same ordering sequence.
     */
    sqlx::query(
        r#"
        LOCK TABLE noticias IN EXCLUSIVE MODE
        "#,
    )
    .execute(&mut *tx)
    .await?;

    /*
     * Move selected rows to temporary negative values.
     *
     * Do not use:
     *
     *     orden = -new_order
     *
     * because -0 is still 0 and can violate the UNIQUE
     * constraint.
     */
    for noticia in &order {
        let result = sqlx::query(
            r#"
            UPDATE noticias
            SET orden = -id - 1
            WHERE id = $1
            "#,
        )
        .bind(noticia.id)
        .execute(&mut *tx)
        .await?;

        if result.rows_affected() != 1 {
            return Err(ApiError::NotFound);
        }
    }

    /*
     * Apply the final positions. If a target order belongs to
     * an unaffected row, PostgreSQL rejects the change and the
     * complete transaction rolls back.
     */
    for noticia in &order {
        sqlx::query(
            r#"
            UPDATE noticias
            SET orden = $1
            WHERE id = $2
            "#,
        )
        .bind(noticia.orden)
        .bind(noticia.id)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok(())
}

/* ==========================================================
   GET LAST FOUR
========================================================== */

pub async fn get_last_4(db: &PgPool) -> ApiResult<Vec<Noticia>> {
    let noticias = sqlx::query_as::<_, Noticia>(
        r#"
            SELECT
                id,
                orden,
                titulo,
                fecha,
                contenido,
                created_at
            FROM noticias
            ORDER BY created_at DESC
            LIMIT 4
            "#,
    )
    .fetch_all(db)
    .await?;

    Ok(noticias)
}
