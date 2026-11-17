use crate::{
    error::api_error::ApiResult,
    models::logro::{CreateLogroFav, Logro, LogroFav},
    repositories::{
        base,
        tablas::{LOGROS, LOGROS_FAV},
    },
};
use sqlx::{AssertSqlSafe, PgPool};

static COLUMNAS_LOGRO_FAV_INSERT: &[&str] = &["logro_id", "orden"];

pub async fn get_all(db: &PgPool) -> ApiResult<Vec<Logro>> {
    Ok(sqlx::query_as::<_, Logro>(
        r#"
            SELECT
                l.id,
                l.orden,
                l.titulo,
                l.contenido,
                l.image_count,
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
                l.contenido,
                l.created_at,
                l.image_count
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
    if !base::existe_por_id(&mut *tx, &LOGROS, logro_id).await? {
        return Err(sqlx::Error::RowNotFound.into());
    }

    // Remove the last favorite if there are already 3.
    sqlx::query("DELETE FROM logros_fav WHERE orden = 2")
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

    let sql = base::sql_insertar(&LOGROS_FAV, COLUMNAS_LOGRO_FAV_INSERT, true)?;

    let logro_fav = sqlx::query_as::<_, LogroFav>(AssertSqlSafe(sql))
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
                created_at,
                image_count
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

    let sql = base::sql_insertar(&LOGROS_FAV, COLUMNAS_LOGRO_FAV_INSERT, false)?;

    for item in request {
        sqlx::query(AssertSqlSafe(sql.clone()))
            .bind(item.logro_id)
            .bind(item.orden)
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;

    Ok(())
}
