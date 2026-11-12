use crate::{
    models::voluntariado::{CreateSolicitudVoluntariado, SolicitudVoluntariadoCreada},
    repositories::{base, tablas::SOLICITUDES_VOLUNTARIADO},
};
use sqlx::{AssertSqlSafe, PgPool};

static COLUMNAS_SOLICITUD_INSERT: &[&str] = &[
    "nombre",
    "apellido",
    "localidad",
    "email",
    "tipo",
    "descripcion",
    "acepta_contacto",
];

pub async fn create(
    pool: &PgPool,
    solicitud: &CreateSolicitudVoluntariado,
) -> Result<SolicitudVoluntariadoCreada, sqlx::Error> {
    let sql = base::sql_insertar_retornando(
        &SOLICITUDES_VOLUNTARIADO,
        COLUMNAS_SOLICITUD_INSERT,
        &["id", "created_at"],
    )?;

    sqlx::query_as::<_, SolicitudVoluntariadoCreada>(AssertSqlSafe(sql))
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
    let sql = base::ConsultaUpdate::en(&SOLICITUDES_VOLUNTARIADO)
        .asignar("email_estado")
        .asignar_nulo("email_error")
        .asignar_ahora("email_enviado_at")
        .donde_clave_primaria()
        .construir()?;

    sqlx::query(AssertSqlSafe(sql))
        .bind("enviado")
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

    let sql = base::ConsultaUpdate::en(&SOLICITUDES_VOLUNTARIADO)
        .asignar("email_estado")
        .asignar("email_error")
        .donde_clave_primaria()
        .construir()?;

    sqlx::query(AssertSqlSafe(sql))
        .bind("error")
        .bind(shortened_error)
        .bind(solicitud_id)
        .execute(pool)
        .await?;

    Ok(())
}
