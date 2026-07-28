use crate::{
    models::noticia::{ChangeOrderNoticia, Noticia, UpdateNoticia},
    error::api_error::ApiResult,
};
use axum::http::StatusCode;
use sqlx::{Error, PgPool};

pub async fn get_all(db: &PgPool) -> Result<Vec<Noticia>, sqlx::Error> {
    sqlx::query_as::<_, Noticia>("SELECT * FROM noticias")
        .fetch_all(db)
        .await
}

pub async fn get_by_id(db: &PgPool, id: i64) -> Result<Option<Noticia>, sqlx::Error> {
    sqlx::query_as::<_, Noticia>(
        "SELECT * FROM noticias
         WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(db)
    .await
}

pub async fn create(
    db: &PgPool,
    orden: i64,
    titulo: String,
    fecha: String,
    contenido: String,
) -> Result<Noticia, sqlx::Error> {
    sqlx::query_as::<_, Noticia>(
        r#"
        INSERT INTO noticias
            (orden, titulo, fecha, contenido, img)
        VALUES
            ($1, $2, $3, $4, $5)
        RETURNING
            id,
            orden,
            titulo,
            fecha,
            contenido,
            created_at
        "#,
    )
    .bind(orden)
    .bind(titulo)
    .bind(fecha)
    .bind(contenido)
    .fetch_one(db)
    .await
}

pub async fn delete(db: &PgPool, id: i64) -> Result<Noticia, StatusCode> {
    let noticia = sqlx::query_as::<_, Noticia>(
        "DELETE FROM noticias
         WHERE id = $1
         RETURNING *",
    )
    .bind(id)
    .fetch_one(db)
    .await
    .map_err(|_| StatusCode::NOT_FOUND)?;

    Ok(noticia)
}

pub async fn change_order(db: &PgPool, order: Vec<ChangeOrderNoticia>) -> Result<(), Error> {
    let mut tx = db.begin().await?;

    // Temporarily move every order out of the normal range
    for noticia in &order {
        sqlx::query(
            "UPDATE noticias
             SET orden = -$1
             WHERE id = $2",
        )
        .bind(noticia.orden)
        .bind(noticia.id)
        .execute(&mut *tx)
        .await?;
    }

    // Set the final order
    for noticia in &order {
        sqlx::query(
            "UPDATE noticias
             SET orden = $1
             WHERE id = $2",
        )
        .bind(noticia.orden)
        .bind(noticia.id)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok(())
}

pub async fn update(db: &PgPool, id: i64, update: UpdateNoticia) -> Result<Noticia, sqlx::Error> {
    let noticia = get_by_id(db, id).await?.ok_or(sqlx::Error::RowNotFound)?;

    let titulo = update.titulo.unwrap_or(noticia.titulo);
    let contenido = update.contenido.unwrap_or(noticia.contenido);
    let orden = update.orden.unwrap_or(noticia.orden);

    sqlx::query_as::<_, Noticia>(
        r#"
        UPDATE noticias
        SET
            titulo = $1,
            contenido = $2,
            orden = $3
        WHERE id = $4
        RETURNING *
        "#,
    )
    .bind(titulo)
    .bind(contenido)
    .bind(orden)
    .bind(id)
    .fetch_one(db)
    .await
}

pub async fn get_last_4(db: &PgPool) -> ApiResult<Vec<Noticia>> {
    Ok(sqlx::query_as::<_, Noticia>(
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
    .await?)
}
