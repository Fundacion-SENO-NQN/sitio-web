use std::collections::HashSet;

use sqlx::{AssertSqlSafe, PgPool};

use crate::{
    models::noticia::{ChangeOrderNoticia, Noticia, UpdateNoticia},
    repositories::{
        base::{self, Ordenamiento},
        tablas::NOTICIAS,
    },
};

const NOTICIAS_ORDER_LOCK: i64 = 982_451_653;

static COLUMNAS_NOTICIA_INSERT: &[&str] = &["fecha", "titulo", "orden", "contenido", "cant_img"];

static COLUMNAS_NOTICIA_UPDATE: &[&str] = &["fecha", "titulo", "contenido", "cant_img"];

/* ==========================================================
   OBTENER TODAS
========================================================== */

pub async fn get_all(pool: &PgPool) -> Result<Vec<Noticia>, sqlx::Error> {
    base::obtener_todos::<Noticia>(pool, Some(Ordenamiento::asc("orden"))).await
}

/* ==========================================================
   OBTENER POR ID
========================================================== */

pub async fn get_by_id(pool: &PgPool, id: i64) -> Result<Option<Noticia>, sqlx::Error> {
    base::obtener_por_id::<Noticia>(pool, id).await
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

    let next_order = base::orden_maximo(&mut *transaction, &NOTICIAS, -1, 1).await?;

    let sql = base::sql_insertar(&NOTICIAS, COLUMNAS_NOTICIA_INSERT, true)?;

    let noticia = sqlx::query_as::<_, Noticia>(AssertSqlSafe(sql))
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

    let sql = base::sql_actualizar_coalesce_por_id(&NOTICIAS, COLUMNAS_NOTICIA_UPDATE, true)?;

    sqlx::query_as::<_, Noticia>(AssertSqlSafe(sql))
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

    let noticia = base::obtener_por_id_para_actualizar::<Noticia>(&mut *transaction, id).await?;

    let Some(noticia) = noticia else {
        transaction.rollback().await?;

        return Ok(None);
    };

    base::eliminar_por_id(&mut *transaction, &NOTICIAS, id).await?;

    /*
     * Las posiciones superiores se mueven temporalmente
     * fuera del rango utilizado para evitar conflictos
     * con la restricción UNIQUE.
     */
    let temporary_base = base::orden_maximo(&mut *transaction, &NOTICIAS, 0, 1000).await?;

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

    let total = base::contar(&mut *transaction, &NOTICIAS)
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

    let current_rows = base::obtener_ordenes_para_actualizar(&mut *transaction, &NOTICIAS, &ids)
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

    let temporary_base = base::orden_maximo(&mut *transaction, &NOTICIAS, 0, 1000)
        .await
        .map_err(ChangeOrderError::Database)?;

    /*
     * Primero movemos las noticias a posiciones temporales.
     */
    for (index, change) in changes.iter().enumerate() {
        base::asignar_orden(
            &mut *transaction,
            &NOTICIAS,
            change.id,
            temporary_base + index as i64,
        )
        .await
        .map_err(ChangeOrderError::Database)?;
    }

    /*
     * Después aplicamos las posiciones definitivas.
     */
    for change in changes {
        base::asignar_orden(&mut *transaction, &NOTICIAS, change.id, change.orden)
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
    base::obtener_con_limite::<Noticia>(
        pool,
        [Ordenamiento::desc("created_at"), Ordenamiento::desc("id")],
        LATEST_NEWS_LIMIT,
    )
    .await
}
