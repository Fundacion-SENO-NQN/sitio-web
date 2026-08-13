use std::collections::HashSet;

use sqlx::PgPool;

use crate::models::noticia::{ChangeOrderNoticia, Noticia, UpdateNoticia};

const NOTICIAS_ORDER_LOCK: i64 = 982_451_653;

/* ==========================================================
   OBTENER TODAS
========================================================== */

pub async fn get_all(pool: &PgPool) -> Result<Vec<Noticia>, sqlx::Error> {
    sqlx::query_as::<_, Noticia>(
        r#"
        SELECT
            id,
            created_at,
            fecha,
            titulo,
            orden,
            contenido,
            cant_img
        FROM noticias
        ORDER BY orden ASC
        "#,
    )
    .fetch_all(pool)
    .await
}

/* ==========================================================
   OBTENER POR ID
========================================================== */

pub async fn get_by_id(pool: &PgPool, id: i64) -> Result<Option<Noticia>, sqlx::Error> {
    sqlx::query_as::<_, Noticia>(
        r#"
        SELECT
            id,
            created_at,
            fecha,
            titulo,
            orden,
            contenido,
            cant_img
        FROM noticias
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

/* ==========================================================
   CREAR
========================================================== */

pub async fn create(
    pool: &PgPool,
    fecha: String,
    titulo: String,
    contenido: String,
    cant_img: i64,
) -> Result<Noticia, sqlx::Error> {
    let mut transaction = pool.begin().await?;

    /*
     * Evita que dos noticias creadas simultáneamente
     * intenten utilizar el mismo orden.
     */
    sqlx::query(
        r#"
        SELECT pg_advisory_xact_lock($1)
        "#,
    )
    .bind(NOTICIAS_ORDER_LOCK)
    .execute(&mut *transaction)
    .await?;

    let next_order = sqlx::query_scalar::<_, i64>(
        r#"
            SELECT
                COALESCE(
                    MAX(orden),
                    -1
                ) + 1
            FROM noticias
            "#,
    )
    .fetch_one(&mut *transaction)
    .await?;

    let noticia = sqlx::query_as::<_, Noticia>(
        r#"
            INSERT INTO noticias (
                fecha,
                titulo,
                orden,
                contenido,
                cant_img
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                $5
            )
            RETURNING
                id,
                created_at,
                fecha,
                titulo,
                orden,
                contenido,
                cant_img
            "#,
    )
    .bind(fecha)
    .bind(titulo)
    .bind(next_order)
    .bind(contenido)
    .bind(cant_img)
    .fetch_one(&mut *transaction)
    .await?;

    transaction.commit().await?;

    Ok(noticia)
}

/* ==========================================================
   ACTUALIZAR
========================================================== */

pub async fn update(
    pool: &PgPool,
    id: i64,
    changes: UpdateNoticia,
) -> Result<Option<Noticia>, sqlx::Error> {
    let UpdateNoticia {
        fecha,
        titulo,
        contenido,
        cant_img,
    } = changes;

    /*
     * Avoid executing an unnecessary UPDATE when the request
     * does not contain any changes.
     */
    if fecha.is_none() && titulo.is_none() && contenido.is_none() && cant_img.is_none() {
        return get_by_id(pool, id).await;
    }

    sqlx::query_as::<_, Noticia>(
        r#"
        UPDATE noticias
        SET
            fecha = COALESCE($1, fecha),
            titulo = COALESCE($2, titulo),
            contenido = COALESCE($3, contenido),
            cant_img = COALESCE($4, cant_img)
        WHERE id = $5
        RETURNING
            id,
            created_at,
            fecha,
            titulo,
            orden,
            contenido,
            cant_img
        "#,
    )
    .bind(fecha)
    .bind(titulo)
    .bind(contenido)
    .bind(cant_img)
    .bind(id)
    .fetch_optional(pool)
    .await
}

/* ==========================================================
   ELIMINAR Y COMPACTAR ORDEN
========================================================== */

pub async fn delete(pool: &PgPool, id: i64) -> Result<Option<Noticia>, sqlx::Error> {
    let mut transaction = pool.begin().await?;

    sqlx::query(
        r#"
        SELECT pg_advisory_xact_lock($1)
        "#,
    )
    .bind(NOTICIAS_ORDER_LOCK)
    .execute(&mut *transaction)
    .await?;

    let noticia = sqlx::query_as::<_, Noticia>(
        r#"
            SELECT
                id,
                created_at,
                fecha,
                titulo,
                orden,
                contenido,
                cant_img
            FROM noticias
            WHERE id = $1
            FOR UPDATE
            "#,
    )
    .bind(id)
    .fetch_optional(&mut *transaction)
    .await?;

    let Some(noticia) = noticia else {
        transaction.rollback().await?;

        return Ok(None);
    };

    sqlx::query(
        r#"
        DELETE FROM noticias
        WHERE id = $1
        "#,
    )
    .bind(id)
    .execute(&mut *transaction)
    .await?;

    /*
     * Las posiciones superiores se mueven temporalmente
     * fuera del rango utilizado para evitar conflictos
     * con la restricción UNIQUE.
     */
    let temporary_base = sqlx::query_scalar::<_, i64>(
        r#"
            SELECT
                COALESCE(
                    MAX(orden),
                    0
                ) + 1000
            FROM noticias
            "#,
    )
    .fetch_one(&mut *transaction)
    .await?;

    sqlx::query(
        r#"
        UPDATE noticias
        SET orden = orden + $1
        WHERE orden > $2
        "#,
    )
    .bind(temporary_base)
    .bind(noticia.orden)
    .execute(&mut *transaction)
    .await?;

    sqlx::query(
        r#"
        UPDATE noticias
        SET orden = orden - $1 - 1
        WHERE orden >= $1
        "#,
    )
    .bind(temporary_base)
    .execute(&mut *transaction)
    .await?;

    transaction.commit().await?;

    Ok(Some(noticia))
}

/* ==========================================================
   CAMBIAR ORDEN
========================================================== */

pub async fn change_order(
    pool: &PgPool,
    changes: &[ChangeOrderNoticia],
) -> Result<(), ChangeOrderError> {
    if changes.is_empty() {
        return Err(ChangeOrderError::Invalid(
            "Debe enviarse al menos un cambio.".to_string(),
        ));
    }

    let mut received_ids = HashSet::new();

    let mut received_orders = HashSet::new();

    for change in changes {
        if change.id <= 0 {
            return Err(ChangeOrderError::Invalid(
                "Uno de los ids no es válido.".to_string(),
            ));
        }

        if change.orden < 0 {
            return Err(ChangeOrderError::Invalid(
                "El orden no puede ser negativo.".to_string(),
            ));
        }

        if !received_ids.insert(change.id) {
            return Err(ChangeOrderError::Invalid("Hay ids repetidos.".to_string()));
        }

        if !received_orders.insert(change.orden) {
            return Err(ChangeOrderError::Invalid(
                "Hay órdenes repetidos.".to_string(),
            ));
        }
    }

    let mut transaction = pool.begin().await.map_err(ChangeOrderError::Database)?;

    sqlx::query(
        r#"
        SELECT pg_advisory_xact_lock($1)
        "#,
    )
    .bind(NOTICIAS_ORDER_LOCK)
    .execute(&mut *transaction)
    .await
    .map_err(ChangeOrderError::Database)?;

    let total = sqlx::query_scalar::<_, i64>(
        r#"
            SELECT COUNT(*)
            FROM noticias
            "#,
    )
    .fetch_one(&mut *transaction)
    .await
    .map_err(ChangeOrderError::Database)?;

    for change in changes {
        if change.orden >= total {
            return Err(ChangeOrderError::Invalid(format!(
                "El orden {} está fuera del rango.",
                change.orden,
            )));
        }
    }

    let ids = changes.iter().map(|change| change.id).collect::<Vec<_>>();

    let current_rows = sqlx::query_as::<_, (i64, i64)>(
        r#"
            SELECT
                id,
                orden
            FROM noticias
            WHERE id = ANY($1)
            FOR UPDATE
            "#,
    )
    .bind(&ids)
    .fetch_all(&mut *transaction)
    .await
    .map_err(ChangeOrderError::Database)?;

    if current_rows.len() != changes.len() {
        return Err(ChangeOrderError::NotFound);
    }

    /*
     * Para cambiar solamente dos posiciones, los órdenes
     * nuevos deben ser los mismos órdenes que ya ocupaban
     * las noticias seleccionadas.
     *
     * Esto evita pisar una noticia que no fue enviada.
     */
    let current_orders = current_rows
        .iter()
        .map(|(_, order)| *order)
        .collect::<HashSet<_>>();

    if current_orders != received_orders {
        return Err(ChangeOrderError::Invalid(
            "Los órdenes enviados no coinciden con las posiciones actuales.".to_string(),
        ));
    }

    let temporary_base = sqlx::query_scalar::<_, i64>(
        r#"
            SELECT
                COALESCE(
                    MAX(orden),
                    0
                ) + 1000
            FROM noticias
            "#,
    )
    .fetch_one(&mut *transaction)
    .await
    .map_err(ChangeOrderError::Database)?;

    /*
     * Primero movemos las noticias a posiciones temporales.
     */
    for (index, change) in changes.iter().enumerate() {
        sqlx::query(
            r#"
            UPDATE noticias
            SET orden = $1
            WHERE id = $2
            "#,
        )
        .bind(temporary_base + index as i64)
        .bind(change.id)
        .execute(&mut *transaction)
        .await
        .map_err(ChangeOrderError::Database)?;
    }

    /*
     * Después aplicamos las posiciones definitivas.
     */
    for change in changes {
        sqlx::query(
            r#"
            UPDATE noticias
            SET orden = $1
            WHERE id = $2
            "#,
        )
        .bind(change.orden)
        .bind(change.id)
        .execute(&mut *transaction)
        .await
        .map_err(ChangeOrderError::Database)?;
    }

    transaction
        .commit()
        .await
        .map_err(ChangeOrderError::Database)?;

    Ok(())
}

/* ==========================================================
   ERRORES DE ORDEN
========================================================== */

#[derive(Debug)]
pub enum ChangeOrderError {
    Invalid(String),
    NotFound,
    Database(sqlx::Error),
}

/* ==========================================================
   OBTENER ÚLTIMAS NOTICIAS
========================================================== */

const LATEST_NEWS_LIMIT: i64 = 4;

pub async fn get_latest(pool: &PgPool) -> Result<Vec<Noticia>, sqlx::Error> {
    sqlx::query_as::<_, Noticia>(
        r#"
        SELECT
            id,
            created_at,
            fecha,
            titulo,
            orden,
            contenido,
            cant_img
        FROM noticias
        ORDER BY
            created_at DESC,
            id DESC
        LIMIT $1
        "#,
    )
    .bind(LATEST_NEWS_LIMIT)
    .fetch_all(pool)
    .await
}
