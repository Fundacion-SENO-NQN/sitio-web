use crate::{
    error::api_error::ApiResult,
    models::logro::{CreateLogroFav, Logro, LogroFav},
};
use sqlx::PgPool;

pub async fn get_all(db: &PgPool) -> ApiResult<Vec<Logro>> {
    Ok(sqlx::query_as::<_, Logro>(
        r#"
            SELECT
                l.id,
                l.orden,
                l.titulo,
                l.contenido,
                l.created_at
            FROM logros_fav lf
            JOIN logros l
                ON l.id = lf.logro_id
            ORDER BY lf.orden
            "#,
    )
    .fetch_all(db)
    .await?)
}

pub async fn get_by_id(db: &PgPool, id: i64) -> ApiResult<Logro> {
    Ok(sqlx::query_as::<_, Logro>(
        r#"
            SELECT
                l.id,
                l.orden,
                l.titulo,
                l.descripcion,
                l.created_at
            FROM logros_fav lf
            JOIN logros l
                ON l.id = lf.logro_id
            WHERE lf.id = $1
            "#,
    )
    .bind(id)
    .fetch_one(db)
    .await?)
}

pub async fn create(db: &PgPool, logro_id: i64, orden: i64) -> ApiResult<LogroFav> {
    let mut tx = db.begin().await?;

    // Verify the logro exists.
    sqlx::query("SELECT 1 FROM logros WHERE id = $1")
        .bind(logro_id)
        .fetch_one(&mut *tx)
        .await?;

    // Remove the last favorite if there are already 3.
    sqlx::query("DELETE FROM logros_fav WHERE orden = 3")
        .execute(&mut *tx)
        .await?;

    // Shift the remaining favorites.
    sqlx::query(
        r#"
        UPDATE logros_fav
        SET orden = orden + 1
        WHERE orden >= $1
        "#,
    )
    .bind(orden)
    .execute(&mut *tx)
    .await?;

    let logro_fav = sqlx::query_as::<_, LogroFav>(
        r#"
        INSERT INTO logros_fav
            (
                logro_id,
                orden
            )
        VALUES
            ($1, $2)
        RETURNING
            id,
            logro_id,
            orden,
            created_at
        "#,
    )
    .bind(logro_id)
    .bind(orden)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(logro_fav)
}

pub async fn delete(db: &PgPool, id: i64) -> ApiResult<LogroFav> {
    Ok(sqlx::query_as::<_, LogroFav>(
        r#"
            DELETE FROM logros_fav
            WHERE id = $1
            RETURNING
                id,
                logro_id,
                orden,
                created_at
            "#,
    )
    .bind(id)
    .fetch_one(db)
    .await?)
}

pub async fn replace_all(db: &PgPool, request: Vec<CreateLogroFav>) -> ApiResult<()> {
    let mut tx = db.begin().await?;

    sqlx::query(
        r#"
        DELETE FROM logros_fav
        "#,
    )
    .execute(&mut *tx)
    .await?;

    for item in request {
        sqlx::query(
            r#"
            INSERT INTO logros_fav
            (
                logro_id,
                orden
            )
            VALUES
            (
                $1,
                $2
            )
            "#,
        )
        .bind(item.logro_id)
        .bind(item.orden)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok(())
}
