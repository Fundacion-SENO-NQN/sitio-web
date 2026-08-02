use std::collections::HashSet;

use sqlx::{PgPool, Postgres, QueryBuilder};

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
    let has_changes = changes.fecha.is_some()
        || changes.titulo.is_some()
        || changes.contenido.is_some()
        || changes.cant_img.is_some();

    if !has_changes {
        return get_by_id(pool, id).await;
    }

    let mut query = QueryBuilder::<Postgres>::new("UPDATE noticias SET ");

    {
        let mut fields = query.separated(", ");

        if let Some(fecha) = changes.fecha {
            fields.push("fecha = ").push_bind(fecha);
        }

        if let Some(titulo) = changes.titulo {
            fields.push("titulo = ").push_bind(titulo);
        }

        if let Some(contenido) = changes.contenido {
            fields.push("contenido = ").push_bind(contenido);
        }

        if let Some(cant_img) = changes.cant_img {
            fields.push("cant_img = ").push_bind(cant_img);
        }
    }

    query.push(" WHERE id = ").push_bind(id).push(
        r#"
            RETURNING
                id,
                created_at,
                fecha,
                titulo,
                orden,
                contenido,
                cant_img
            "#,
    );

    query.build_query_as::<Noticia>().fetch_optional(pool).await
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
