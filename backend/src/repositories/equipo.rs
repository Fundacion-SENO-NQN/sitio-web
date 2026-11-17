use crate::{
    error::api_error::{ApiError, ApiResult},
    models::equipo::{ChangeOrderEquipo, Equipo, UpdateEquipo},
    repositories::{
        base::{self, Ordenamiento},
        tablas::EQUIPO,
    },
};
use sqlx::{AssertSqlSafe, PgPool};
use std::collections::HashSet;

static COLUMNAS_EQUIPO_MUTABLES: &[&str] =
    &["orden", "nombre", "apellido", "puesto", "descripcion"];

pub async fn get_all(db: &PgPool) -> ApiResult<Vec<Equipo>> {
    Ok(base::obtener_todos::<Equipo>(db, Some(Ordenamiento::asc("orden"))).await?)
}

pub async fn get_by_id(db: &PgPool, id: i64) -> ApiResult<Option<Equipo>> {
    Ok(base::obtener_por_id::<Equipo>(db, id).await?)
}

/* ==========================================================
   CREATE
========================================================== */

pub async fn create(
    db: &PgPool,
    nombre: &str,
    apellido: &str,
    puesto: &str,
    descripcion: &str,
) -> ApiResult<Equipo> {
    let mut tx = db.begin().await?;

    /*
     * Prevent two simultaneous creations from receiving
     * the same MAX(orden) + 1 value.
     */
    base::bloquear_tabla(&mut *tx, &EQUIPO).await?;

    let next_order = base::orden_maximo(&mut *tx, &EQUIPO, -1, 1).await?;

    let sql = base::sql_insertar(&EQUIPO, COLUMNAS_EQUIPO_MUTABLES, true)?;

    let member = sqlx::query_as::<_, Equipo>(AssertSqlSafe(sql))
        .bind(next_order)
        .bind(nombre)
        .bind(apellido)
        .bind(puesto)
        .bind(descripcion)
        .fetch_one(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok(member)
}

/* ==========================================================
   UPDATE
========================================================== */

pub async fn update(db: &PgPool, id: i64, update: UpdateEquipo) -> ApiResult<Equipo> {
    let sql = base::sql_actualizar_coalesce_por_id(&EQUIPO, COLUMNAS_EQUIPO_MUTABLES, true)?;

    let member = sqlx::query_as::<_, Equipo>(AssertSqlSafe(sql))
        .bind(update.orden)
        .bind(update.nombre)
        .bind(update.apellido)
        .bind(update.puesto)
        .bind(update.descripcion)
        .bind(id)
        .fetch_optional(db)
        .await?
        .ok_or(ApiError::NotFound)?;

    Ok(member)
}

/* ==========================================================
   DELETE
========================================================== */

pub async fn delete(db: &PgPool, id: i64) -> ApiResult<Equipo> {
    let mut tx = db.begin().await?;

    let member = base::eliminar_por_id_retornando::<Equipo>(&mut *tx, id)
        .await?
        .ok_or(ApiError::NotFound)?;

    /*
     * Compact every order after the deleted member.
     *
     * Before:
     * 0, 1, 2, 3
     *
     * Delete order 1:
     * 0, 2, 3
     *
     * After compacting:
     * 0, 1, 2
     */
    sqlx::query(
        r#"
        UPDATE equipo
        SET orden = orden - 1
        WHERE orden > $1
        "#,
    )
    .bind(member.orden)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(member)
}

/* ==========================================================
   CHANGE ORDER
========================================================== */

const EQUIPO_ORDER_LOCK: i64 = 982_451_654;

pub async fn change_order(db: &PgPool, order: Vec<ChangeOrderEquipo>) -> ApiResult<()> {
    if order.is_empty() {
        return Err(ApiError::BadRequest(
            "Debe proporcionar al menos un miembro.".into(),
        ));
    }

    let mut received_ids = HashSet::new();
    let mut received_orders = HashSet::new();

    for member in &order {
        if member.id <= 0 {
            return Err(ApiError::BadRequest(
                "Uno de los ids de miembro no es válido.".into(),
            ));
        }

        if member.orden < 0 {
            return Err(ApiError::BadRequest(
                "El orden no puede ser negativo.".into(),
            ));
        }

        if !received_ids.insert(member.id) {
            return Err(ApiError::BadRequest(
                "Hay ids de miembros repetidos.".into(),
            ));
        }

        if !received_orders.insert(member.orden) {
            return Err(ApiError::BadRequest("Hay órdenes repetidos.".into()));
        }
    }

    let mut tx = db.begin().await?;

    /*
     * Prevents two reorder operations from running at the
     * same time and choosing conflicting temporary orders.
     */
    sqlx::query(
        r#"
        SELECT pg_advisory_xact_lock($1)
        "#,
    )
    .bind(EQUIPO_ORDER_LOCK)
    .execute(&mut *tx)
    .await?;

    let total_members = base::contar(&mut *tx, &EQUIPO).await?;

    for member in &order {
        if member.orden >= total_members {
            return Err(ApiError::BadRequest(format!(
                "El orden {} está fuera del rango permitido.",
                member.orden,
            )));
        }
    }

    let ids = order.iter().map(|member| member.id).collect::<Vec<_>>();

    /*
     * Lock and read every member that participates in the
     * reorder.
     */
    let current_rows = base::obtener_ordenes_para_actualizar(&mut *tx, &EQUIPO, &ids).await?;

    if current_rows.len() != order.len() {
        return Err(ApiError::NotFound);
    }

    /*
     * When only some members are sent, their destination
     * positions must be the same positions currently occupied
     * by that group.
     */
    let current_orders = current_rows
        .iter()
        .map(|(_, current_order)| *current_order)
        .collect::<HashSet<_>>();

    if current_orders != received_orders {
        return Err(ApiError::BadRequest(
            "Los órdenes enviados no coinciden con las posiciones actuales de los miembros seleccionados."
                .into(),
        ));
    }

    /*
     * Temporary orders must be:
     *
     * - Positive, because orden has CHECK (orden >= 0).
     * - Outside the currently used range.
     * - Unique for every member.
     */
    let temporary_base = base::orden_maximo(&mut *tx, &EQUIPO, -1, 1).await?;

    /*
     * First move every selected member outside the active
     * order range. This frees their original positions.
     */
    for (index, member) in order.iter().enumerate() {
        let temporary_order = temporary_base
            .checked_add(index as i64)
            .ok_or(ApiError::InternalServerError)?;

        let rows = base::asignar_orden(&mut *tx, &EQUIPO, member.id, temporary_order).await?;

        if rows != 1 {
            return Err(ApiError::NotFound);
        }
    }

    /*
     * Now the original positions are free, so the final
     * orders can be assigned without violating UNIQUE.
     */
    for member in &order {
        let rows = base::asignar_orden(&mut *tx, &EQUIPO, member.id, member.orden).await?;

        if rows != 1 {
            return Err(ApiError::NotFound);
        }
    }

    tx.commit().await?;

    Ok(())
}
