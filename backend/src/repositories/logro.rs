use crate::{
    error::api_error::ApiResult,
    models::logro::{ChangeOrderLogro, Logro, UpdateLogro},
};
use sqlx::PgPool;

pub async fn get_all(db: &PgPool) -> ApiResult<Vec<Logro>> {
    Ok(sqlx::query_as::<_, Logro>(
        r#"
            SELECT
                id,
                orden,
                titulo,
                contenido,
                created_at
            FROM logros
            ORDER BY orden
            "#,
    )
    .fetch_all(db)
    .await?)
}

pub async fn get_by_id(db: &PgPool, id: i64) -> ApiResult<Option<Logro>> {
    Ok(sqlx::query_as::<_, Logro>(
        r#"
            SELECT
                id,
                orden,
                titulo,
                contenido,
                created_at
            FROM logros
            WHERE id = $1
            "#,
    )
    .bind(id)
    .fetch_optional(db)
    .await?)
}

pub async fn create(db: &PgPool, titulo: &str, contenido: &str) -> ApiResult<Logro> {
    Ok(sqlx::query_as::<_, Logro>(
        r#"
        INSERT INTO logros
            (
                orden,
                titulo,
                contenido
            )
        VALUES
            (
                (
                    SELECT COALESCE(MAX(orden), -1) + 1
                    FROM logros
                ),
                $1,
                $2
            )
        RETURNING
            id,
            orden,
            titulo,
            contenido,
            created_at
        "#,
    )
    .bind(titulo)
    .bind(contenido)
    .fetch_one(db)
    .await?)
}

pub async fn update(db: &PgPool, id: i64, update: UpdateLogro) -> ApiResult<Logro> {
    Ok(sqlx::query_as::<_, Logro>(
        r#"
            UPDATE logros
            SET
                orden = COALESCE($1, orden),
                titulo = COALESCE($2, titulo),
                contenido = COALESCE($3, contenido)
            WHERE id = $4
            RETURNING
                id,
                orden,
                titulo,
                contenido,
                created_at
            "#,
    )
    .bind(update.orden)
    .bind(update.titulo)
    .bind(update.contenido)
    .bind(id)
    .fetch_one(db)
    .await?)
}

pub async fn delete(db: &PgPool, id: i64) -> ApiResult<Logro> {
    let mut tx = db.begin().await?;

    let logro = sqlx::query_as::<_, Logro>(
        r#"
        DELETE FROM logros
        WHERE id = $1
        RETURNING
            id,
            orden,
            titulo,
            contenido,
            created_at
        "#,
    )
    .bind(id)
    .fetch_one(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        UPDATE logros
        SET orden = orden - 1
        WHERE orden > $1
        "#,
    )
    .bind(logro.orden)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(logro)
}

pub async fn change_order(db: &PgPool, order: Vec<ChangeOrderLogro>) -> ApiResult<()> {
    let mut tx = db.begin().await?;

    // Temporary negative values to avoid UNIQUE conflicts.
    for logro in &order {
        sqlx::query(
            r#"
            UPDATE logros
            SET orden = -$1
            WHERE id = $2
            "#,
        )
        .bind(logro.orden + 1)
        .bind(logro.id)
        .execute(&mut *tx)
        .await?;
    }

    // Final values.
    for logro in &order {
        sqlx::query(
            r#"
            UPDATE logros
            SET orden = $1
            WHERE id = $2
            "#,
        )
        .bind(logro.orden)
        .bind(logro.id)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok(())
}
