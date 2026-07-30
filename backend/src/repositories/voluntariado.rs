use crate::models::voluntariado::{CreateSolicitudVoluntariado, SolicitudVoluntariadoCreada};
use sqlx::PgPool;

pub async fn create(
    pool: &PgPool,
    solicitud: &CreateSolicitudVoluntariado,
) -> Result<SolicitudVoluntariadoCreada, sqlx::Error> {
    sqlx::query_as::<_, SolicitudVoluntariadoCreada>(
        r#"
        INSERT INTO solicitudes_voluntariado (
            nombre,
            apellido,
            localidad,
            email,
            tipo,
            descripcion,
            acepta_contacto
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, created_at
        "#,
    )
    .bind(&solicitud.nombre)
    .bind(&solicitud.apellido)
    .bind(&solicitud.localidad)
    .bind(&solicitud.email)
    .bind(solicitud.tipo.as_str())
    .bind(&solicitud.descripcion)
    .bind(solicitud.acepta_contacto)
    .fetch_one(pool)
    .await
}

pub async fn mark_email_sent(pool: &PgPool, solicitud_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE solicitudes_voluntariado
        SET
            email_estado = 'enviado',
            email_error = NULL,
            email_enviado_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(solicitud_id)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn mark_email_error(
    pool: &PgPool,
    solicitud_id: i64,
    error: &str,
) -> Result<(), sqlx::Error> {
    let shortened_error: String = error.chars().take(1000).collect();

    sqlx::query(
        r#"
        UPDATE solicitudes_voluntariado
        SET
            email_estado = 'error',
            email_error = $2
        WHERE id = $1
        "#,
    )
    .bind(solicitud_id)
    .bind(shortened_error)
    .execute(pool)
    .await?;

    Ok(())
}
