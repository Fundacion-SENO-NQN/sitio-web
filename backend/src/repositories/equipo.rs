use crate::{
    error::api_error::{ApiError, ApiResult},
    models::equipo::{ChangeOrderEquipo, Equipo, UpdateEquipo},
};
use sqlx::PgPool;

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

pub async fn change_order(db: &PgPool, order: Vec<ChangeOrderEquipo>) -> ApiResult<()> {
    println!("LLEGUE ACAAAAAAAAAAAAAA");
    let mut tx = db.begin().await?;
    println!("en serio falle aca");
    println!("order: {:?}", order);
    /*
     * Use values based on the row ID rather than the target
     * order.
     *
     * The previous implementation used:
     *
     *     orden = -new_order
     *
     * But when new_order is 0:
     *
     *     -0 == 0
     *
     * That can still violate the UNIQUE constraint.
     */
    for member in &order {
        let result = sqlx::query(
            r#"
            UPDATE equipo
            SET orden = -id - 1
            WHERE id = $1
            "#,
        )
        .bind(member.id + 1)
        .execute(&mut *tx)
        .await?;

        if result.rows_affected() != 1 {
            return Err(ApiError::NotFound);
        }
    }
    println!("no hay chance que haya llegado aca");

    for member in &order {
        sqlx::query(
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
    }

    tx.commit().await?;

    Ok(())
}
