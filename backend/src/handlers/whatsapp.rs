use crate::{AppState, error::api_error::ApiError};
use axum::{
    body::Bytes,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use std::sync::Arc;

#[derive(Deserialize)]
pub struct WebhookQuery {
    #[serde(rename = "hub.mode")]
    pub mode: Option<String>,
    #[serde(rename = "hub.verify_token")]
    pub verify_token: Option<String>,
    #[serde(rename = "hub.challenge")]
    pub challenge: Option<String>,
}

/* ==========================================================
   META WEBHOOK VERIFICATION (GET)
========================================================== */

pub async fn verify_webhook(
    State(state): State<Arc<AppState>>,
    Query(query): Query<WebhookQuery>,
) -> Result<String, StatusCode> {
    if let Some(challenge) = state.whatsapp.verify_subscription(
        query.mode.as_deref(),
        query.verify_token.as_deref(),
        query.challenge.as_deref(),
    ) {
        Ok(challenge)
    } else {
        Err(StatusCode::FORBIDDEN)
    }
}

/* ==========================================================
   META WEBHOOK EVENT RECEIVER (POST)
========================================================== */

pub async fn receive_webhook(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, StatusCode> {
    let signature = headers
        .get("x-hub-signature-256")
        .and_then(|h| h.to_str().ok());

    if !state.whatsapp.verify_signature(&body, signature) {
        eprintln!("WhatsApp webhook signature verification failed");
        return Err(StatusCode::UNAUTHORIZED);
    }

    if let Err(error) = state.whatsapp.process_webhook(&state.db, &body).await {
        eprintln!("WhatsApp webhook processing error: {error}");
        // Respond with 200/500 depending on Meta requirement; Meta recommends 200 OK
        // once received to prevent repeated deliveries, but returns 500 if DB failure.
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    Ok(StatusCode::OK.into_response())
}
