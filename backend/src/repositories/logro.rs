use crate::{
    error::api_error::{ApiError, ApiResult},
    models::logro::{ChangeOrderLogro, Logro, UpdateLogro},
    repositories::{
        base::{self, Ordenamiento},
        tablas::{LOGROS, LOGROS_FAV},
    },
};

use sqlx::{AssertSqlSafe, PgPool, Postgres, Transaction};

use std::collections::HashSet;

static COLUMNAS_LOGRO_INSERT: &[&str] = &["orden", "titulo", "contenido", "image_count"];
static COLUMNAS_LOGRO_UPDATE: &[&str] = &["titulo", "contenido", "image_count"];

/* ==========================================================
   GET ALL
========================================================== */

pub async fn get_all(db: &PgPool) -> ApiResult<Vec<Logro>> {
    Ok(
        base::obtener_todos::<Logro>(db, [Ordenamiento::asc("orden"), Ordenamiento::asc("id")])
            .await?,
    )
}

/* ==========================================================
   GET BY ID
========================================================== */

pub async fn get_by_id(db: &PgPool, id: i64) -> ApiResult<Option<Logro>> {
    Ok(base::obtener_por_id::<Logro>(db, id).await?)
}

/* ==========================================================
   CREATE
========================================================== */

pub async fn create(
    db: &PgPool,
    titulo: &str,
    contenido: &str,
    image_count: i16,
) -> ApiResult<Logro> {
    let mut tx = db.begin().await?;

    /*
     * Avoid two concurrent creations calculating the same
     * MAX(orden) + 1 value.
     */
    lock_logros_table(&mut tx).await?;

    let next_order = base::orden_maximo(&mut *tx, &LOGROS, -1, 1).await?;

    let sql = base::sql_insertar(&LOGROS, COLUMNAS_LOGRO_INSERT, true)?;

    let logro = sqlx::query_as::<_, Logro>(AssertSqlSafe(sql))
        .bind(next_order)
        .bind(titulo)
        .bind(contenido)
        .bind(image_count)
        .fetch_one(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok(logro)
}

/* ==========================================================
   UPDATE
========================================================== */

pub async fn update(db: &PgPool, id: i64, update: UpdateLogro) -> ApiResult<Logro> {
    let UpdateLogro {
        orden,
        titulo,
        contenido,
        image_count,
    } = update;

    let mut tx = db.begin().await?;

    /*
     * Load and lock the existing achievement.
     *
     * Sending the same order remains supported for
     * compatibility with the current frontend, but changing
     * it must be done through change_order().
     */
    let current = base::obtener_por_id_para_actualizar::<Logro>(&mut *tx, id)
        .await?
        .ok_or(ApiError::NotFound)?;

    if let Some(requested_order) = orden {
        if requested_order < 0 {
            return Err(ApiError::BadRequest(
                "El orden del logro no puede ser negativo.".into(),
            ));
        }

        if requested_order != current.orden {
            return Err(ApiError::BadRequest(
                "Para cambiar la posición del logro debe utilizarse la ruta de reordenación."
                    .into(),
            ));
        }
    }

    /*
     * Avoid an unnecessary UPDATE when the request only
     * contains the existing order.
     */
    if titulo.is_none() && contenido.is_none() && image_count.is_none() {
        tx.commit().await?;

        return Ok(current);
    }

    let sql = base::sql_actualizar_coalesce_por_id(&LOGROS, COLUMNAS_LOGRO_UPDATE, true)?;

    let logro = sqlx::query_as::<_, Logro>(AssertSqlSafe(sql))
        .bind(titulo)
        .bind(contenido)
        .bind(image_count)
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(ApiError::NotFound)?;

    tx.commit().await?;

    Ok(logro)
}

/* ==========================================================
   DELETE
========================================================== */

pub async fn delete(db: &PgPool, id: i64) -> ApiResult<Logro> {
    let mut tx = db.begin().await?;

    /*
     * Both collections are reordered during this operation.
     * Using the locks in the same order everywhere prevents
     * concurrent order modifications and reduces deadlock
     * risks.
     */
    base::bloquear_tabla(&mut *tx, &LOGROS).await?;
    base::bloquear_tabla(&mut *tx, &LOGROS_FAV).await?;

    /*
     * Load the achievement before modifying related rows.
     */
    let logro = base::obtener_por_id_para_actualizar::<Logro>(&mut *tx, id)
        .await?
        .ok_or(ApiError::NotFound)?;

    /* ======================================================
       REMOVE FROM FEATURED ACHIEVEMENTS
    ====================================================== */

    /*
     * fetch_optional returns None when the achievement is
     * not featured. That is valid and should not produce an
     * error.
     */
    let featured_order = sqlx::query_scalar::<_, i64>(
        r#"
        DELETE FROM logros_fav
        WHERE logro_id = $1
        RETURNING orden
        "#,
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?;

    if let Some(deleted_featured_order) = featured_order {
        /*
         * The deletion creates a free position. Move later
         * featured achievements one at a time in ascending
         * order so UNIQUE(orden) is never violated.
         */
        let following_featured = sqlx::query_as::<_, (i64, i64)>(
            r#"
                SELECT
                    id,
                    orden
                FROM logros_fav
                WHERE orden > $1
                ORDER BY orden ASC
                FOR UPDATE
                "#,
        )
        .bind(deleted_featured_order)
        .fetch_all(&mut *tx)
        .await?;

        for (featured_id, previous_order) in following_featured {
            let result = sqlx::query(
                r#"
                UPDATE logros_fav
                SET orden = $1
                WHERE id = $2
                "#,
            )
            .bind(previous_order - 1)
            .bind(featured_id)
            .execute(&mut *tx)
            .await?;

            if result.rows_affected() != 1 {
                return Err(ApiError::NotFound);
            }
        }
    }

    /* ======================================================
       DELETE ACHIEVEMENT
    ====================================================== */

    let rows_affected = base::eliminar_por_id(&mut *tx, &LOGROS, id).await?;

    if rows_affected != 1 {
        return Err(ApiError::NotFound);
    }

    /* ======================================================
       COMPACT ACHIEVEMENT ORDER
    ====================================================== */

    /*
     * After deleting the achievement, its position is free.
     *
     * Example:
     *
     * Before: 0, 1, 2, 3
     * Delete:       1
     * Result: 0, 2, 3
     *
     * Updates:
     * 2 -> 1
     * 3 -> 2
     */
    let following_achievements = sqlx::query_as::<_, (i64, i64)>(
        r#"
            SELECT
                id,
                orden
            FROM logros
            WHERE orden > $1
            ORDER BY orden ASC
            FOR UPDATE
            "#,
    )
    .bind(logro.orden)
    .fetch_all(&mut *tx)
    .await?;

    for (following_id, previous_order) in following_achievements {
        let result = sqlx::query(
            r#"
            UPDATE logros
            SET orden = $1
            WHERE id = $2
            "#,
        )
        .bind(previous_order - 1)
        .bind(following_id)
        .execute(&mut *tx)
        .await?;

        if result.rows_affected() != 1 {
            return Err(ApiError::NotFound);
        }
    }

    tx.commit().await?;

    Ok(logro)
}

/* ==========================================================
   CHANGE ORDER
========================================================== */

pub async fn change_order(db: &PgPool, order: Vec<ChangeOrderLogro>) -> ApiResult<()> {
    validate_order_changes(&order)?;

    let mut tx = db.begin().await?;

    /*
     * All repository functions that calculate or modify
     * ordering use the same lock, preventing concurrent
     * create/delete/reorder operations.
     */
    lock_logros_table(&mut tx).await?;

    let ids: Vec<i64> = order.iter().map(|logro| logro.id).collect();

    /*
     * Load all affected rows and verify that every supplied
     * ID exists.
     */
    let current_rows = base::obtener_ordenes_para_actualizar(&mut *tx, &LOGROS, &ids).await?;

    if current_rows.len() != order.len() {
        return Err(ApiError::BadRequest("Uno o más logros no existen.".into()));
    }

    /*
     * The request must contain every affected achievement.
     *
     * The new positions must be a permutation of the current
     * positions. This prevents:
     *
     * - Collisions with achievements outside the request.
     * - Gaps in the sequence.
     * - Arbitrary positions such as 500.
     */
    let current_orders: HashSet<i64> = current_rows
        .iter()
        .map(|(_, current_order)| *current_order)
        .collect();

    let requested_orders: HashSet<i64> = order.iter().map(|logro| logro.orden).collect();

    if current_orders != requested_orders {
        return Err(ApiError::BadRequest(
            "Los nuevos órdenes deben corresponder a las posiciones actuales de los logros enviados."
                .into(),
        ));
    }

    let maximum_order = base::orden_maximo(&mut *tx, &LOGROS, -1, 0).await?;

    let temporary_base = maximum_order.checked_add(1).ok_or_else(|| {
        ApiError::BadRequest("No se pudo calcular una posición temporal válida.".into())
    })?;

    /*
     * First phase:
     *
     * Move the affected rows to unique positive positions
     * above the current maximum.
     *
     * Existing:
     * 0, 1, 2, 3
     *
     * Temporary:
     * 4, 5
     *
     * This respects both:
     *
     * CHECK (orden >= 0)
     * UNIQUE (orden)
     */
    for (index, logro) in order.iter().enumerate() {
        let index = i64::try_from(index)
            .map_err(|_| ApiError::BadRequest("Hay demasiados cambios de orden.".into()))?;

        let temporary_order = temporary_base.checked_add(index).ok_or_else(|| {
            ApiError::BadRequest("No se pudo calcular una posición temporal válida.".into())
        })?;

        let rows = base::asignar_orden(&mut *tx, &LOGROS, logro.id, temporary_order).await?;

        if rows != 1 {
            return Err(ApiError::NotFound);
        }
    }

    /*
     * Second phase:
     *
     * The original positions are now free, so the final
     * positions can be assigned safely.
     */
    for logro in &order {
        let rows = base::asignar_orden(&mut *tx, &LOGROS, logro.id, logro.orden).await?;

        if rows != 1 {
            return Err(ApiError::NotFound);
        }
    }

    tx.commit().await?;

    Ok(())
}

/* ==========================================================
   VALIDATION
========================================================== */

fn validate_order_changes(order: &[ChangeOrderLogro]) -> ApiResult<()> {
    if order.is_empty() {
        return Err(ApiError::BadRequest(
            "Debe enviarse al menos un cambio de orden.".into(),
        ));
    }

    let mut ids = HashSet::with_capacity(order.len());
    let mut orders = HashSet::with_capacity(order.len());

    for logro in order {
        if logro.id <= 0 {
            return Err(ApiError::BadRequest(
                "Uno de los logros tiene un id inválido.".into(),
            ));
        }

        if logro.orden < 0 {
            return Err(ApiError::BadRequest(
                "El orden de los logros no puede ser negativo.".into(),
            ));
        }

        if !ids.insert(logro.id) {
            return Err(ApiError::BadRequest(
                "Hay logros repetidos en la petición.".into(),
            ));
        }

        if !orders.insert(logro.orden) {
            return Err(ApiError::BadRequest(
                "Hay posiciones repetidas en la petición.".into(),
            ));
        }
    }

    Ok(())
}

/* ==========================================================
   TABLE LOCK
========================================================== */

async fn lock_logros_table(tx: &mut Transaction<'_, Postgres>) -> ApiResult<()> {
    base::bloquear_tabla(&mut **tx, &LOGROS).await?;
    Ok(())
}
