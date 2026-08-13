use crate::{
    error::api_error::{ApiError, ApiResult},
    models::equipo::{ChangeOrderEquipo, Equipo, UpdateEquipo},
};
use sqlx::PgPool;
use std::collections::HashSet;

pub async fn get_all(db: &PgPool) -> ApiResult<Vec<Equipo>> {
    Ok(sqlx::query_as::<_, Equipo>(
        r#"
            SELECT
                id,
                orden,
                nombre,
                apellido,
                puesto,
                descripcion,
                created_at
            FROM equipo
            ORDER BY orden
            "#,
    )
    .fetch_all(db)
    .await?)
}

pub async fn get_by_id(db: &PgPool, id: i64) -> ApiResult<Option<Equipo>> {
    Ok(sqlx::query_as::<_, Equipo>(
        r#"
            SELECT
                id,
                orden,
                nombre,
                apellido,
                puesto,
                descripcion,
                created_at
            FROM equipo
            WHERE id = $1
            "#,
    )
    .bind(id)
    .fetch_optional(db)
    .await?)
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
    sqlx::query(
        r#"
        LOCK TABLE equipo IN EXCLUSIVE MODE
        "#,
    )
    .execute(&mut *tx)
    .await?;

    let member = sqlx::query_as::<_, Equipo>(
        r#"
        INSERT INTO equipo
        (
            orden,
            nombre,
            apellido,
            puesto,
            descripcion
        )
        SELECT
            COALESCE(MAX(orden), -1) + 1,
            $1,
            $2,
            $3,
            $4
        FROM equipo
        RETURNING
            id,
            orden,
            nombre,
            apellido,
            puesto,
            descripcion,
            created_at
        "#,
    )
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
    let member = sqlx::query_as::<_, Equipo>(
        r#"
        UPDATE equipo
        SET
            orden = COALESCE($1, orden),
            nombre = COALESCE($2, nombre),
            apellido = COALESCE($3, apellido),
            puesto = COALESCE($4, puesto),
            descripcion = COALESCE($5, descripcion)
        WHERE id = $6
        RETURNING
            id,
            orden,
            nombre,
            apellido,
            puesto,
            descripcion,
            created_at
        "#,
    )
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

    let member = sqlx::query_as::<_, Equipo>(
        r#"
        DELETE FROM equipo
        WHERE id = $1
        RETURNING
            id,
            orden,
            nombre,
            apellido,
            puesto,
            descripcion,
            created_at
        "#,
    )
    .bind(id)
    .fetch_optional(&mut *tx)
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

    let total_members = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM equipo
        "#,
    )
    .fetch_one(&mut *tx)
    .await?;

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
    let current_rows = sqlx::query_as::<_, (i64, i64)>(
        r#"
        SELECT
            id,
            orden
        FROM equipo
        WHERE id = ANY($1)
        FOR UPDATE
        "#,
    )
    .bind(&ids)
    .fetch_all(&mut *tx)
    .await?;

    if current_rows.len() != order.len() {
        return Err(ApiError::NotFound);
    }

    /*
     * When only some members are sent, their destination
     * positions must be the same positions currently occupied
     * by that group.
     *
     * Example:
     *
     * Member A currently has order 2.
     * Member B currently has order 3.
     *
     * Valid destinations: 2 and 3.
     *
     * Sending destination 4 would collide with a member that
     * was not included in the request.
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
    let temporary_base = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COALESCE(MAX(orden), -1) + 1
        FROM equipo
        "#,
    )
    .fetch_one(&mut *tx)
    .await?;

    /*
     * First move every selected member outside the active
     * order range. This frees their original positions.
     */
    for (index, member) in order.iter().enumerate() {
        let temporary_order = temporary_base
            .checked_add(index as i64)
            .ok_or(ApiError::InternalServerError)?;

        let result = sqlx::query(
            r#"
            UPDATE equipo
            SET orden = $1
            WHERE id = $2
            "#,
        )
        .bind(temporary_order)
        .bind(member.id)
        .execute(&mut *tx)
        .await?;

        if result.rows_affected() != 1 {
            return Err(ApiError::NotFound);
        }
    }

    /*
     * Now the original positions are free, so the final
     * orders can be assigned without violating UNIQUE.
     */
    for member in &order {
        let result = sqlx::query(
            r#"
            UPDATE equipo
            SET orden = $1
            WHERE id = $2
            "#,
        )
        .bind(member.orden)
        .bind(member.id)
        .execute(&mut *tx)
        .await?;

        if result.rows_affected() != 1 {
            return Err(ApiError::NotFound);
        }
    }

    tx.commit().await?;

    Ok(())
}
