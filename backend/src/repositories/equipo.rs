use crate::{
    error::api_error::ApiResult,
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

pub async fn create(
    db: &PgPool,
    orden: i64,
    nombre: String,
    apellido: String,
    puesto: String,
    descripcion: String,
) -> ApiResult<Equipo> {
    Ok(sqlx::query_as::<_, Equipo>(
        r#"
            INSERT INTO equipo
                (
                    orden,
                    nombre,
                    apellido,
                    puesto,
                    descripcion
                )
            VALUES
                ($1,$2,$3,$4,$5)
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
    .bind(orden)
    .bind(nombre)
    .bind(apellido)
    .bind(puesto)
    .bind(descripcion)
    .fetch_one(db)
    .await?)
}

pub async fn update(db: &PgPool, id: i64, update: UpdateEquipo) -> ApiResult<Equipo> {
    Ok(sqlx::query_as::<_, Equipo>(
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
    .fetch_one(db)
    .await?)
}

pub async fn delete(db: &PgPool, id: i64) -> ApiResult<Equipo> {
    Ok(sqlx::query_as::<_, Equipo>(
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
    .fetch_one(db)
    .await?)
}

pub async fn change_order(db: &PgPool, order: Vec<ChangeOrderEquipo>) -> ApiResult<()> {
    let mut tx = db.begin().await?;

    // Temporary negative values to avoid UNIQUE conflicts.
    for member in &order {
        sqlx::query(
            r#"
            UPDATE equipo
            SET orden = -$1
            WHERE id = $2
            "#,
        )
        .bind(member.orden)
        .bind(member.id)
        .execute(&mut *tx)
        .await?;
    }

    // Final values.
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
