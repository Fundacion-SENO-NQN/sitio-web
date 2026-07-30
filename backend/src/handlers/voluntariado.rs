use crate::{
    error::api_error::ApiError,
    models::voluntariado::{CreateSolicitudVoluntariado, SolicitudVoluntariadoResponse},
    repositories::voluntariado as voluntariado_repository,
    AppState,
};
use axum::{Json, extract::State, http::StatusCode};
use std::sync::Arc;
use tracing::{error, warn};
use validator::Validate;

pub async fn create_solicitud(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateSolicitudVoluntariado>,
) -> Result<(StatusCode, Json<SolicitudVoluntariadoResponse>), ApiError> {
    let solicitud = payload.normalize();

    solicitud.validate().map_err(|validation_error| {
        warn!(
            error = ?validation_error,
            "Solicitud de voluntariado inválida"
        );

        ApiError::BadRequest("Revisa los datos ingresados en el formulario".to_owned())
    })?;

    if !solicitud.acepta_contacto {
        return Err(ApiError::BadRequest(
            "Debes autorizar a la Fundación a contactarte".to_owned(),
        ));
    }

    let created = voluntariado_repository::create(&state.db, &solicitud)
        .await
        .map_err(|database_error| {
            error!(
                error = ?database_error,
                "No se pudo guardar la solicitud de voluntariado"
            );
            ApiError::InternalServerError
        })?;

    if let Err(email_error) = state
        .email
        .send_volunteer_request(created.id, &solicitud)
        .await
    {
        error!(
            solicitud_id = created.id,
            error = %email_error,
            "No se pudo enviar el correo de voluntariado"
        );

        if let Err(database_error) =
            voluntariado_repository::mark_email_error(&state.db, created.id, &email_error).await
        {
            error!(
                solicitud_id = created.id,
                error = ?database_error,
                "No se pudo registrar el error de correo"
            );
        }

        return Err(ApiError::ServiceUnavailable(
            concat!(
                "La solicitud quedó registrada, pero no pudimos enviar ",
                "la notificación por correo. No es necesario volver a ",
                "completar el formulario."
            )
            .to_owned(),
        ));
    }

    if let Err(database_error) =
        voluntariado_repository::mark_email_sent(&state.db, created.id).await
    {
        // The email was already delivered, so the request should still
        // return success. We only register the database inconsistency.
        error!(
            solicitud_id = created.id,
            error = ?database_error,
            "El correo fue enviado, pero no se pudo actualizar su estado"
        );
    }

    Ok((
        StatusCode::CREATED,
        Json(SolicitudVoluntariadoResponse {
            id: created.id,
            message: concat!(
                "Tu solicitud fue enviada correctamente. ",
                "Fundación SENO se comunicará contigo por correo electrónico."
            )
            .to_owned(),
        }),
    ))
}
