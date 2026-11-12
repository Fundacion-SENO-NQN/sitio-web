//! WhatsApp Business Cloud API integration (Meta) for Bingo payment reminders.
//!
//! Meta policy notes (WhatsApp Business Messaging Policy):
//! - Business-initiated messages outside the 24h customer service window MUST use
//!   an approved message template. Reminders are sent with a UTILITY template.
//! - Recipients must have opted in (an admin enables `late_payment_notice` only for
//!   people who agreed to receive WhatsApp reminders) and opt-outs ("BAJA"/"STOP")
//!   received through the webhook are always respected.
//! - At most one reminder per bingo per month (enforced atomically in PostgreSQL),
//!   sent during reasonable local hours (Mon-Fri 10:00 to 14:00 Argentina time)
//!   and throttled.
//! - Catch-up logic: if a reminder couldn't be sent on its scheduled day (weekend,
//!   outside hours, server downtime), it is sent as soon as possible within the
//!   specified window (up to `catch_up_days` days later, Monday-Friday 10:00-14:00).
//! - Access tokens, phone numbers and raw Meta responses are never logged.

use crate::{models::bingo::Bingo, repositories};
use chrono::{DateTime, Datelike, NaiveDate, Timelike, Utc};
use chrono_tz::{America::Argentina::Buenos_Aires, Tz};
use hmac::{Hmac, Mac};
use reqwest::{Client, StatusCode};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::Sha256;
use sqlx::PgPool;
use std::{env, error::Error, fmt, sync::Arc, time::Duration};
use tokio::time::{self, MissedTickBehavior, sleep};

pub type DynError = Box<dyn Error + Send + Sync>;
type HmacSha256 = Hmac<Sha256>;

/* ==========================================================
   CONSTANTS
========================================================== */

pub const QUOTE_COUNT: usize = 8;

const DEFAULT_API_VERSION: &str = "v25.0";
const DEFAULT_TEMPLATE_NAME: &str = "aviso_cuota_bingo";
const DEFAULT_TEMPLATE_LANG: &str = "es_AR";

/// Sending window: Monday to Friday, from 10:00 to 14:00 (Argentina time).
const DEFAULT_SEND_HOUR: u32 = 10;
const DEFAULT_SEND_END_HOUR: u32 = 14;

/// A reminder that could not be sent on its day (weekend, outside hours,
/// server down) is sent as soon as possible within this many days.
const DEFAULT_CATCH_UP_DAYS: u32 = 7;
const DEFAULT_POLL_SECONDS: u64 = 15 * 60;

/// Pause between two outgoing messages (well below Meta throughput limits).
const SEND_THROTTLE: Duration = Duration::from_millis(250);

/// Meta rejects text parameters longer than this; we stay far below it.
const MAX_NAME_PARAM_CHARS: usize = 60;
const MAX_TEXT_PARAM_CHARS: usize = 900;

const MONTH_NAMES: [&str; 12] = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
];

/* ==========================================================
   SERVICE & CONFIGURATION
========================================================== */

#[derive(Clone)]
pub struct WhatsAppService {
    client: Client,
    sender: Option<Arc<SenderConfig>>,
    webhook: Option<Arc<WebhookConfig>>,
}

struct SenderConfig {
    access_token: String,
    phone_number_id: String,
    messages_url: String,
    template_name: String,
    template_lang: String,
    send_hour: u32,
    send_end_hour: u32,
    catch_up_days: i64,
    poll_seconds: u64,
}

struct WebhookConfig {
    app_secret: String,
    verify_token: String,
}

impl WhatsAppService {
    /// Reads the configuration from environment variables.
    ///
    /// - `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` (required to send;
    ///   when missing, reminders are disabled without stopping the server).
    /// - `WHATSAPP_TEMPLATE_NAME` (default `aviso_cuota_bingo`).
    /// - `WHATSAPP_TEMPLATE_LANG` (default `es_AR`).
    /// - `WHATSAPP_API_VERSION` (default `v25.0`).
    /// - `WHATSAPP_REMINDER_HOUR` / `WHATSAPP_REMINDER_END_HOUR`
    ///   (local Argentina hours, Monday to Friday, default 10 and 14).
    /// - `WHATSAPP_CATCH_UP_DAYS` (days to retry a missed reminder, default 7).
    /// - `WHATSAPP_POLL_SECONDS` (default 900).
    /// - `WHATSAPP_APP_SECRET` + `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (webhook; optional).
    ///
    /// Present but malformed values return an error (fail fast on misconfiguration).
    pub fn from_env() -> Result<Self, Box<dyn Error>> {
        let client = Client::builder().timeout(Duration::from_secs(30)).build()?;

        let access_token = read_optional_env("WHATSAPP_ACCESS_TOKEN");
        let phone_number_id = read_optional_env("WHATSAPP_PHONE_NUMBER_ID");

        let sender = match (access_token, phone_number_id) {
            (Some(access_token), Some(phone_number_id)) => {
                if !phone_number_id.chars().all(|c| c.is_ascii_digit()) {
                    return Err("WHATSAPP_PHONE_NUMBER_ID debe ser numérico".into());
                }

                let version = read_optional_env("WHATSAPP_API_VERSION")
                    .unwrap_or_else(|| DEFAULT_API_VERSION.to_string());
                if !is_valid_api_version(&version) {
                    return Err("WHATSAPP_API_VERSION inválida".into());
                }

                let template_name = read_optional_env("WHATSAPP_TEMPLATE_NAME")
                    .unwrap_or_else(|| DEFAULT_TEMPLATE_NAME.to_string());
                if !is_valid_template_name(&template_name) {
                    return Err("WHATSAPP_TEMPLATE_NAME inválido (solo a-z, 0-9 y _)".into());
                }

                let template_lang = read_optional_env("WHATSAPP_TEMPLATE_LANG")
                    .unwrap_or_else(|| DEFAULT_TEMPLATE_LANG.to_string());
                if !is_valid_language_code(&template_lang) {
                    return Err("WHATSAPP_TEMPLATE_LANG inválido (ej.: es_AR o es)".into());
                }

                let send_hour = read_u32_env("WHATSAPP_REMINDER_HOUR", DEFAULT_SEND_HOUR)?;
                let send_end_hour =
                    read_u32_env("WHATSAPP_REMINDER_END_HOUR", DEFAULT_SEND_END_HOUR)?;
                if send_hour > 23 || send_end_hour > 24 || send_hour >= send_end_hour {
                    return Err(
                        "WHATSAPP_REMINDER_HOUR / WHATSAPP_REMINDER_END_HOUR inválidos".into(),
                    );
                }

                let catch_up_days = read_u32_env("WHATSAPP_CATCH_UP_DAYS", DEFAULT_CATCH_UP_DAYS)?;
                if !(1..=27).contains(&catch_up_days) {
                    return Err("WHATSAPP_CATCH_UP_DAYS debe estar entre 1 y 27".into());
                }

                let poll_seconds = u64::from(read_u32_env(
                    "WHATSAPP_POLL_SECONDS",
                    DEFAULT_POLL_SECONDS as u32,
                )?)
                .max(60);

                Some(Arc::new(SenderConfig {
                    messages_url: format!(
                        "https://graph.facebook.com/{version}/{phone_number_id}/messages"
                    ),
                    access_token,
                    phone_number_id,
                    template_name,
                    template_lang,
                    send_hour,
                    send_end_hour,
                    catch_up_days: i64::from(catch_up_days),
                    poll_seconds,
                }))
            }
            (None, None) => None,
            _ => {
                return Err(
                    "WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID deben configurarse juntos"
                        .into(),
                );
            }
        };

        let webhook = match (
            read_optional_env("WHATSAPP_APP_SECRET"),
            read_optional_env("WHATSAPP_WEBHOOK_VERIFY_TOKEN"),
        ) {
            (Some(app_secret), Some(verify_token)) => Some(Arc::new(WebhookConfig {
                app_secret,
                verify_token,
            })),
            (None, None) => None,
            _ => {
                return Err(
                    "WHATSAPP_APP_SECRET y WHATSAPP_WEBHOOK_VERIFY_TOKEN deben configurarse juntos"
                        .into(),
                );
            }
        };

        Ok(Self {
            client,
            sender,
            webhook,
        })
    }

    pub fn is_enabled(&self) -> bool {
        self.sender.is_some()
    }

    pub fn webhook_enabled(&self) -> bool {
        self.webhook.is_some()
    }

    /* ======================================================
       BACKGROUND WORKER
    ====================================================== */

    pub fn start(self, db: PgPool) {
        let Some(poll_seconds) = self.sender.as_ref().map(|config| config.poll_seconds) else {
            println!(
                "WhatsApp reminder worker disabled: \
                 WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID are not configured."
            );
            return;
        };

        tokio::spawn(async move {
            let mut interval = time::interval(Duration::from_secs(poll_seconds));
            interval.set_missed_tick_behavior(MissedTickBehavior::Skip);

            loop {
                interval.tick().await;

                if let Err(error) = self.run_reminder_cycle(&db).await {
                    eprintln!("WhatsApp reminder worker error: {error}");
                }
            }
        });
    }

    /// Sends due reminders, including missed ones still inside the catch-up
    /// window. Safe to run repeatedly and from several instances: every send
    /// is claimed atomically (one per bingo per month).
    pub async fn run_reminder_cycle(&self, db: &PgPool) -> Result<(), DynError> {
        let Some(config) = self.sender.as_ref() else {
            return Ok(());
        };

        let now = Utc::now().with_timezone(&Buenos_Aires);

        if !is_within_send_window(now, config.send_hour, config.send_end_hour) {
            return Ok(());
        }

        let today = now.date_naive();
        let mut due = Vec::new();

        // Check both previous month (for recent end-of-month dates) and current month
        for (year, month) in reminder_periods(today) {
            let candidates =
                repositories::whatsapp::list_candidate_bingos(db, year as i16, month as i16)
                    .await?;

            for bingo in candidates {
                if let Some(date) =
                    due_notice_date(bingo.late_payment_notice, today, config.catch_up_days)
                {
                    if date.year() == year && date.month() == month {
                        due.push((bingo, date));
                    }
                }
            }
        }

        for (bingo, scheduled_date) in due {
            let period_year = scheduled_date.year() as i16;
            let period_month = scheduled_date.month() as i16;

            let late_indexes =
                late_quote_indexes(bingo.quote, bingo.start_month, bingo.created_at, now);

            if late_indexes.is_empty() {
                continue;
            }

            let late_mask = late_quotes_mask(&late_indexes);

            let phone = match normalize_whatsapp_phone(&bingo.phone) {
                Ok(phone) => phone,
                Err(error) => {
                    // Claim + fail so the invalid number is reported once per month.
                    if let Some(notice_id) = repositories::whatsapp::claim_bingo_notice(
                        db,
                        bingo.id,
                        period_year,
                        period_month,
                        scheduled_date,
                        "",
                        late_mask,
                    )
                    .await?
                    {
                        repositories::whatsapp::mark_notice_failed(db, notice_id, "invalid_phone")
                            .await?;
                    }

                    eprintln!(
                        "WhatsApp reminder skipped for bingo id {}: {error}",
                        bingo.id
                    );
                    continue;
                }
            };

            let opted_out = repositories::whatsapp::is_phone_opted_out(db, &phone).await?;

            let Some(notice_id) = repositories::whatsapp::claim_bingo_notice(
                db,
                bingo.id,
                period_year,
                period_month,
                scheduled_date,
                &phone,
                late_mask,
            )
            .await?
            else {
                continue;
            };

            if opted_out {
                repositories::whatsapp::mark_notice_failed(db, notice_id, "opted_out").await?;
                continue;
            }

            let params = ReminderParams::from_bingo(&bingo, &late_indexes);
            let outcome = self.send_payment_reminder(config, &phone, &params).await;

            let abort_cycle = match outcome {
                SendOutcome::Sent { message_id } => {
                    repositories::whatsapp::mark_notice_sent(db, notice_id, message_id.as_deref())
                        .await?;
                    false
                }
                SendOutcome::Transient { code, abort_cycle } => {
                    repositories::whatsapp::mark_notice_transient_error(db, notice_id, &code)
                        .await?;
                    eprintln!(
                        "WhatsApp reminder for bingo id {} failed temporarily [{code}]",
                        bingo.id
                    );
                    abort_cycle
                }
                SendOutcome::Failed { code, abort_cycle } => {
                    repositories::whatsapp::mark_notice_failed(db, notice_id, &code).await?;
                    eprintln!(
                        "WhatsApp reminder for bingo id {} failed [{code}]",
                        bingo.id
                    );
                    abort_cycle
                }
                SendOutcome::Unknown { code } => {
                    // The request may have reached Meta: never resend to avoid duplicates.
                    repositories::whatsapp::mark_notice_unknown(db, notice_id, &code).await?;
                    eprintln!(
                        "WhatsApp reminder for bingo id {} has unknown result [{code}]",
                        bingo.id
                    );
                    false
                }
            };

            if abort_cycle {
                eprintln!(
                    "WhatsApp reminder cycle stopped early: the error affects every message \
                     (credentials, template or rate limit). It will retry on the next cycle."
                );
                break;
            }

            sleep(SEND_THROTTLE).await;
        }

        Ok(())
    }

    /* ======================================================
       OUTGOING MESSAGES
    ====================================================== */

    async fn send_payment_reminder(
        &self,
        config: &SenderConfig,
        phone: &str,
        params: &ReminderParams,
    ) -> SendOutcome {
        let payload =
            build_template_payload(phone, &config.template_name, &config.template_lang, params);

        self.post_message(config, &payload).await
    }

    /// Free-form text is ONLY allowed as a reply inside the 24h customer service
    /// window opened by the user's own message (e.g. confirming an opt-out).
    async fn send_service_reply(&self, phone: &str, text: &str) -> SendOutcome {
        let Some(config) = self.sender.as_ref() else {
            return SendOutcome::Failed {
                code: "disabled".into(),
                abort_cycle: false,
            };
        };

        let payload = json!({
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": phone,
            "type": "text",
            "text": { "preview_url": false, "body": text }
        });

        self.post_message(config, &payload).await
    }

    async fn post_message(&self, config: &SenderConfig, payload: &Value) -> SendOutcome {
        let response = match self
            .client
            .post(&config.messages_url)
            .bearer_auth(&config.access_token)
            .json(payload)
            .send()
            .await
        {
            Ok(response) => response,
            Err(error) => {
                // Connection errors happen before Meta receives the request; timeouts
                // and broken responses might happen after, so they are "unknown".
                return if error.is_connect() {
                    SendOutcome::Transient {
                        code: "connect_error".into(),
                        abort_cycle: true,
                    }
                } else {
                    SendOutcome::Unknown {
                        code: if error.is_timeout() {
                            "timeout".into()
                        } else {
                            "network_error".into()
                        },
                    }
                };
            }
        };

        let status = response.status();

        if status.is_success() {
            return match response.json::<SendResponse>().await {
                Ok(body) => SendOutcome::Sent {
                    message_id: body.messages.into_iter().next().map(|message| message.id),
                },
                // Accepted by Meta but the body could not be read: count as sent.
                Err(_) => SendOutcome::Sent { message_id: None },
            };
        }

        // Do not log raw responses: Meta may echo phone numbers or private details.
        let error = response
            .json::<GraphErrorResponse>()
            .await
            .ok()
            .map(|body| body.error);

        classify_error(status, error.as_ref())
    }

    /* ======================================================
       WEBHOOK
    ====================================================== */

    /// Handles Meta's `GET` verification handshake
    /// (`hub.mode`, `hub.verify_token`, `hub.challenge`).
    pub fn verify_subscription(
        &self,
        mode: Option<&str>,
        token: Option<&str>,
        challenge: Option<&str>,
    ) -> Option<String> {
        let config = self.webhook.as_ref()?;

        if mode? != "subscribe" {
            return None;
        }

        if !constant_time_eq(token?.as_bytes(), config.verify_token.as_bytes()) {
            return None;
        }

        challenge.map(str::to_string)
    }

    /// Validates the `X-Hub-Signature-256: sha256=<hex>` header against the raw body.
    pub fn verify_signature(&self, body: &[u8], signature_header: Option<&str>) -> bool {
        let Some(config) = self.webhook.as_ref() else {
            return false;
        };

        verify_hub_signature(config.app_secret.as_bytes(), body, signature_header)
    }

    /// Applies a verified webhook payload: delivery statuses and opt-out / opt-in replies.
    pub async fn process_webhook(&self, db: &PgPool, body: &[u8]) -> Result<(), DynError> {
        let own_phone_number_id = self
            .sender
            .as_ref()
            .map(|config| config.phone_number_id.as_str());

        let events = parse_webhook_events(body, own_phone_number_id)?;

        for status in &events.statuses {
            repositories::whatsapp::update_delivery_status(
                db,
                &status.message_id,
                &status.status,
                status.error_code.as_deref(),
            )
            .await?;
        }

        for inbound in &events.inbound {
            let Ok(phone) = normalize_whatsapp_phone(&format!("+{}", inbound.from)) else {
                continue;
            };

            match inbound.intent {
                InboundIntent::OptOut => {
                    let disabled = repositories::whatsapp::record_opt_out_and_disable_bingos(
                        db,
                        &phone,
                        "user_reply",
                    )
                    .await?;

                    println!("WhatsApp opt-out processed ({disabled} bingo(s) disabled)");

                    let _ = self
                        .send_service_reply(
                            &phone,
                            "Listo, no vas a recibir más recordatorios de cuotas del bingo de \
                             Fundación SENO por WhatsApp. Si querés volver a recibirlos, \
                             respondé ALTA.",
                        )
                        .await;
                }
                InboundIntent::OptIn => {
                    repositories::whatsapp::clear_opt_out(db, &phone).await?;

                    let _ = self
                        .send_service_reply(
                            &phone,
                            "¡Gracias! Registramos tu pedido. Un administrador de Fundación \
                             SENO va a reactivar los recordatorios de tu bingo.",
                        )
                        .await;
                }
            }
        }

        Ok(())
    }
}

/* ==========================================================
   SEND OUTCOME & META ERROR CLASSIFICATION
========================================================== */

#[derive(Debug, PartialEq, Eq)]
pub enum SendOutcome {
    Sent {
        message_id: Option<String>,
    },
    /// Safe to retry later (the message was not accepted).
    Transient {
        code: String,
        abort_cycle: bool,
    },
    /// Permanent failure for this message.
    Failed {
        code: String,
        abort_cycle: bool,
    },
    /// The message may or may not have been accepted; never retried.
    Unknown {
        code: String,
    },
}

#[derive(Deserialize)]
struct SendResponse {
    #[serde(default)]
    messages: Vec<SentMessage>,
}

#[derive(Deserialize)]
struct SentMessage {
    id: String,
}

#[derive(Deserialize)]
struct GraphErrorResponse {
    error: GraphError,
}

#[derive(Deserialize, Debug, Clone)]
pub struct GraphError {
    pub code: Option<i64>,
    pub error_subcode: Option<i64>,
}

pub fn classify_error(status: StatusCode, error: Option<&GraphError>) -> SendOutcome {
    let code = error.and_then(|error| error.code);
    let label = match (code, error.and_then(|error| error.error_subcode)) {
        (Some(code), Some(subcode)) => format!("meta_{code}_{subcode}"),
        (Some(code), None) => format!("meta_{code}"),
        _ => format!("http_{}", status.as_u16()),
    };

    match code {
        // Throughput / rate limits: retry later and stop the current cycle.
        Some(4 | 80007 | 130429 | 131048 | 131056) => SendOutcome::Transient {
            code: label,
            abort_cycle: true,
        },
        // Temporary Meta-side errors.
        Some(1 | 2 | 131000 | 131016 | 133004) => SendOutcome::Transient {
            code: label,
            abort_cycle: false,
        },
        // Credentials, permissions, account or template problems affect every message.
        Some(0 | 3 | 10 | 190 | 200..=299 | 368 | 131031 | 132001 | 132015 | 132016 | 133010) => {
            SendOutcome::Failed {
                code: label,
                abort_cycle: true,
            }
        }
        // Any other documented error is specific to this message/recipient
        // (e.g. 131026 undeliverable, 131049 ecosystem limit, 131050 user opted out
        // of marketing, 132000 parameter mismatch).
        Some(_) => SendOutcome::Failed {
            code: label,
            abort_cycle: false,
        },
        None if status == StatusCode::TOO_MANY_REQUESTS => SendOutcome::Transient {
            code: label,
            abort_cycle: true,
        },
        None if status.is_server_error() => SendOutcome::Transient {
            code: label,
            abort_cycle: false,
        },
        None if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN => {
            SendOutcome::Failed {
                code: label,
                abort_cycle: true,
            }
        }
        None => SendOutcome::Failed {
            code: label,
            abort_cycle: false,
        },
    }
}

/* ==========================================================
   TEMPLATE PAYLOAD
========================================================== */

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReminderParams {
    /// `{{1}}` buyer full name.
    pub full_name: String,
    /// `{{2}}` bingo number.
    pub nro_bingo: String,
    /// `{{3}}` late quotes, e.g. "Cuota 1 (Marzo), Cuota 2 (Abril)".
    pub late_quotes: String,
}

impl ReminderParams {
    pub fn from_bingo(bingo: &Bingo, late_indexes: &[usize]) -> Self {
        let full_name = sanitize_template_param(
            &format!("{} {}", bingo.name, bingo.last_name),
            MAX_NAME_PARAM_CHARS,
        );

        Self {
            full_name,
            nro_bingo: bingo.nro_bingo.to_string(),
            late_quotes: sanitize_template_param(
                &describe_late_quotes(bingo.start_month, late_indexes),
                MAX_TEXT_PARAM_CHARS,
            ),
        }
    }
}

pub fn build_template_payload(
    phone: &str,
    template_name: &str,
    template_lang: &str,
    params: &ReminderParams,
) -> Value {
    json!({
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": phone,
        "type": "template",
        "template": {
            "name": template_name,
            "language": { "code": template_lang },
            "components": [
                {
                    "type": "body",
                    "parameters": [
                        { "type": "text", "text": params.full_name },
                        { "type": "text", "text": params.nro_bingo },
                        { "type": "text", "text": params.late_quotes }
                    ]
                }
            ]
        }
    })
}

/// Meta rejects template parameters containing new lines, tabs or more than
/// four consecutive spaces.
pub fn sanitize_template_param(value: &str, max_chars: usize) -> String {
    let collapsed = value
        .split_whitespace()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ");

    let cleaned: String = collapsed
        .chars()
        .filter(|c| !c.is_control())
        .take(max_chars)
        .collect();

    let cleaned = cleaned.trim().to_string();

    if cleaned.is_empty() {
        "-".to_string()
    } else {
        cleaned
    }
}

/* ==========================================================
   SCHEDULING (late_payment_notice) & SEND WINDOW
========================================================== */

pub fn days_in_month(year: i32, month: u32) -> u32 {
    let (next_year, next_month) = if month == 12 {
        (year + 1, 1)
    } else {
        (year, month + 1)
    };

    NaiveDate::from_ymd_opt(next_year, next_month, 1)
        .and_then(|first_of_next| first_of_next.pred_opt())
        .map(|last_day| last_day.day())
        .unwrap_or(28)
}

/// Day of the month on which the reminder is scheduled:
/// - `0`: never
/// - `1..=28`: that day
/// - `29`: antepenultimate day, `30`: penultimate day, `31`: last day
pub fn notice_day(late_payment_notice: i16, year: i32, month: u32) -> Option<u32> {
    let last_day = days_in_month(year, month);

    match late_payment_notice {
        1..=28 => Some(late_payment_notice as u32),
        29 => Some(last_day.saturating_sub(2)),
        30 => Some(last_day.saturating_sub(1)),
        31 => Some(last_day),
        _ => None,
    }
}

pub fn is_notice_due(late_payment_notice: i16, date: NaiveDate) -> bool {
    notice_day(late_payment_notice, date.year(), date.month()) == Some(date.day())
}

/// Monday to Friday, `start_hour <= hour < end_hour` (Argentina time).
pub fn is_within_send_window(now: DateTime<Tz>, start_hour: u32, end_hour: u32) -> bool {
    let weekday = now.weekday().number_from_monday();

    weekday <= 5 && now.hour() >= start_hour && now.hour() < end_hour
}

/// Current and previous `(year, month)` periods, previous first.
pub fn reminder_periods(today: NaiveDate) -> [(i32, u32); 2] {
    let previous = today
        .with_day(1)
        .and_then(|first| first.pred_opt())
        .unwrap_or(today);

    [
        (previous.year(), previous.month()),
        (today.year(), today.month()),
    ]
}

/// Returns the scheduled notice date that should be sent today: the most
/// recent notice date (this month or last month) that is not in the future
/// and at most `catch_up_days` days old.
pub fn due_notice_date(
    late_payment_notice: i16,
    today: NaiveDate,
    catch_up_days: i64,
) -> Option<NaiveDate> {
    reminder_periods(today)
        .into_iter()
        .rev()
        .filter_map(|(year, month)| {
            notice_day(late_payment_notice, year, month)
                .and_then(|day| NaiveDate::from_ymd_opt(year, month, day))
        })
        .find(|date| *date <= today && (today - *date).num_days() <= catch_up_days)
}

/* ==========================================================
   LATE ("YELLOW") QUOTES

   Mirrors frontend/src/js/common/quotes.js: a quote is late when it is
   unpaid (bits 00) and its month is before the current month. The start
   year is the year in which the bingo row was created.
========================================================== */

pub fn quote_state(quote: i16, index: usize) -> u16 {
    ((quote as u16) >> (index * 2)) & 0b11
}

pub fn late_quote_indexes(
    quote: i16,
    start_month: i16,
    created_at: DateTime<Utc>,
    now: DateTime<Tz>,
) -> Vec<usize> {
    if !(1..=12).contains(&start_month) {
        return Vec::new();
    }

    let start_year = i64::from(created_at.with_timezone(&Buenos_Aires).year());
    let current_total = i64::from(now.year()) * 12 + i64::from(now.month0());

    (0..QUOTE_COUNT)
        .filter(|&index| {
            let state = quote_state(quote, index);
            // 0b11 is invalid and shown as unpaid by the frontend.
            let unpaid = state == 0b00 || state == 0b11;
            let quote_total = start_year * 12 + i64::from(start_month - 1) + index as i64;

            unpaid && quote_total < current_total
        })
        .collect()
}

pub fn late_quotes_mask(late_indexes: &[usize]) -> i16 {
    late_indexes
        .iter()
        .filter(|&&index| index < QUOTE_COUNT)
        .fold(0i16, |mask, &index| mask | (1 << index))
}

pub fn quote_month_name(start_month: i16, index: usize) -> &'static str {
    let month_index = (i64::from(start_month - 1) + index as i64).rem_euclid(12) as usize;
    MONTH_NAMES[month_index]
}

pub fn describe_late_quotes(start_month: i16, late_indexes: &[usize]) -> String {
    late_indexes
        .iter()
        .map(|&index| {
            format!(
                "Cuota {} ({})",
                index + 1,
                quote_month_name(start_month, index)
            )
        })
        .collect::<Vec<_>>()
        .join(", ")
}

/* ==========================================================
   PHONE NORMALIZATION (E.164 digits, without "+")
========================================================== */

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PhoneError {
    InvalidCharacters,
    MissingAreaCode,
    InvalidLength,
}

impl fmt::Display for PhoneError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let message = match self {
            Self::InvalidCharacters => "el teléfono contiene caracteres inválidos",
            Self::MissingAreaCode => "el teléfono no incluye la característica (código de área)",
            Self::InvalidLength => "el teléfono no tiene una longitud válida",
        };

        f.write_str(message)
    }
}

impl Error for PhoneError {}

/// Normalizes a phone into the digits-only E.164 format used by WhatsApp
/// (`wa_id`). Numbers without country code are treated as Argentine mobile
/// numbers: `299 15 412-3456`, `0299 412-3456` and `+54 299 4123456` all
/// become `5492994123456`.
pub fn normalize_whatsapp_phone(raw: &str) -> Result<String, PhoneError> {
    let trimmed = raw.trim();

    if trimmed.is_empty()
        || !trimmed
            .chars()
            .all(|c| c.is_ascii_digit() || matches!(c, ' ' | '-' | '(' | ')' | '.' | '+'))
        || trimmed.chars().skip(1).any(|c| c == '+')
    {
        return Err(PhoneError::InvalidCharacters);
    }

    let digits: String = trimmed.chars().filter(char::is_ascii_digit).collect();

    let (international, digits) = if trimmed.starts_with('+') {
        (true, digits)
    } else if let Some(rest) = digits.strip_prefix("00") {
        (true, rest.to_string())
    } else if digits.starts_with("54") && digits.len() >= 12 {
        (true, digits)
    } else {
        (false, digits)
    };

    if !international {
        return Ok(format!("549{}", normalize_argentine_national(&digits)?));
    }

    if let Some(national) = digits.strip_prefix("54") {
        let national = national.strip_prefix('9').unwrap_or(national);
        return Ok(format!("549{}", normalize_argentine_national(national)?));
    }

    if (8..=15).contains(&digits.len()) && !digits.starts_with('0') {
        Ok(digits)
    } else {
        Err(PhoneError::InvalidLength)
    }
}

/// Returns the 10-digit Argentine number (area code + subscriber) without the
/// trunk prefix `0` and the mobile prefix `15`.
fn normalize_argentine_national(digits: &str) -> Result<String, PhoneError> {
    let digits = digits.strip_prefix('0').unwrap_or(digits);

    match digits.len() {
        10 => Ok(digits.to_string()),
        12 => {
            // Area codes have 2 to 4 digits and the "15" follows them.
            for area_len in 2..=4 {
                if &digits[area_len..area_len + 2] == "15" {
                    return Ok(format!(
                        "{}{}",
                        &digits[..area_len],
                        &digits[area_len + 2..]
                    ));
                }
            }

            Err(PhoneError::InvalidLength)
        }
        // Subscriber only (6-8 digits), optionally preceded by the mobile "15".
        6..=8 => Err(PhoneError::MissingAreaCode),
        9 if digits.starts_with("15") => Err(PhoneError::MissingAreaCode),
        _ => Err(PhoneError::InvalidLength),
    }
}

/* ==========================================================
   WEBHOOK PARSING & SECURITY
========================================================== */

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum InboundIntent {
    OptOut,
    OptIn,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InboundCommand {
    /// Sender `wa_id` (digits only).
    pub from: String,
    pub intent: InboundIntent,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeliveryStatus {
    pub message_id: String,
    /// One of `sent`, `delivered`, `read`, `failed`.
    pub status: String,
    pub error_code: Option<String>,
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct WebhookEvents {
    pub statuses: Vec<DeliveryStatus>,
    pub inbound: Vec<InboundCommand>,
}

#[derive(Deserialize)]
struct WebhookPayload {
    #[serde(default)]
    entry: Vec<WebhookEntry>,
}

#[derive(Deserialize)]
struct WebhookEntry {
    #[serde(default)]
    changes: Vec<WebhookChange>,
}

#[derive(Deserialize)]
struct WebhookChange {
    #[serde(default)]
    field: String,
    value: Option<WebhookValue>,
}

#[derive(Deserialize)]
struct WebhookValue {
    metadata: Option<WebhookMetadata>,
    #[serde(default)]
    messages: Vec<WebhookMessage>,
    #[serde(default)]
    statuses: Vec<WebhookStatus>,
}

#[derive(Deserialize)]
struct WebhookMetadata {
    phone_number_id: Option<String>,
}

#[derive(Deserialize)]
struct WebhookMessage {
    from: Option<String>,
    text: Option<WebhookText>,
    button: Option<WebhookButton>,
    interactive: Option<WebhookInteractive>,
}

#[derive(Deserialize)]
struct WebhookText {
    body: Option<String>,
}

#[derive(Deserialize)]
struct WebhookButton {
    payload: Option<String>,
    text: Option<String>,
}

#[derive(Deserialize)]
struct WebhookInteractive {
    button_reply: Option<WebhookReply>,
    list_reply: Option<WebhookReply>,
}

#[derive(Deserialize)]
struct WebhookReply {
    id: Option<String>,
    title: Option<String>,
}

#[derive(Deserialize)]
struct WebhookStatus {
    id: Option<String>,
    status: Option<String>,
    #[serde(default)]
    errors: Vec<WebhookStatusError>,
}

#[derive(Deserialize)]
struct WebhookStatusError {
    code: Option<i64>,
}

pub fn parse_webhook_events(
    body: &[u8],
    own_phone_number_id: Option<&str>,
) -> Result<WebhookEvents, serde_json::Error> {
    let payload: WebhookPayload = serde_json::from_slice(body)?;
    let mut events = WebhookEvents::default();

    for change in payload.entry.into_iter().flat_map(|entry| entry.changes) {
        if change.field != "messages" {
            continue;
        }

        let Some(value) = change.value else {
            continue;
        };

        // Ignore events for other phone numbers of the same Meta app.
        if let Some(own_id) = own_phone_number_id {
            let event_id = value
                .metadata
                .as_ref()
                .and_then(|metadata| metadata.phone_number_id.as_deref());

            if event_id.is_some_and(|event_id| event_id != own_id) {
                continue;
            }
        }

        for status in value.statuses {
            let (Some(message_id), Some(status_name)) = (status.id, status.status) else {
                continue;
            };

            if !matches!(
                status_name.as_str(),
                "sent" | "delivered" | "read" | "failed"
            ) {
                continue;
            }

            events.statuses.push(DeliveryStatus {
                message_id,
                status: status_name,
                error_code: status
                    .errors
                    .first()
                    .and_then(|error| error.code)
                    .map(|code| format!("meta_{code}")),
            });
        }

        for message in value.messages {
            let Some(from) = message.from.filter(|from| {
                !from.is_empty() && from.len() <= 15 && from.chars().all(|c| c.is_ascii_digit())
            }) else {
                continue;
            };

            let mut candidates: Vec<String> = Vec::new();

            if let Some(body) = message.text.and_then(|text| text.body) {
                candidates.push(body);
            }

            if let Some(button) = message.button {
                candidates.extend(button.payload);
                candidates.extend(button.text);
            }

            if let Some(interactive) = message.interactive {
                for reply in [interactive.button_reply, interactive.list_reply]
                    .into_iter()
                    .flatten()
                {
                    candidates.extend(reply.id);
                    candidates.extend(reply.title);
                }
            }

            let intent = if candidates.iter().any(|text| is_opt_out_text(text)) {
                Some(InboundIntent::OptOut)
            } else if candidates.iter().any(|text| is_opt_in_text(text)) {
                Some(InboundIntent::OptIn)
            } else {
                None
            };

            if let Some(intent) = intent {
                events.inbound.push(InboundCommand { from, intent });
            }
        }
    }

    Ok(events)
}

fn normalize_keyword(text: &str) -> String {
    text.trim()
        .to_lowercase()
        .chars()
        .map(|c| match c {
            'á' => 'a',
            'é' => 'e',
            'í' => 'i',
            'ó' => 'o',
            'ú' | 'ü' => 'u',
            _ => c,
        })
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn is_opt_out_text(text: &str) -> bool {
    matches!(
        normalize_keyword(text).as_str(),
        "baja"
            | "stop"
            | "parar"
            | "cancelar"
            | "desuscribir"
            | "desuscribirme"
            | "unsubscribe"
            | "no mas"
            | "no mas mensajes"
            | "dar de baja"
            | "darme de baja"
            | "dejar de recibir"
            | "no quiero recibir mas mensajes"
    )
}

pub fn is_opt_in_text(text: &str) -> bool {
    matches!(
        normalize_keyword(text).as_str(),
        "alta" | "start" | "suscribir" | "suscribirme"
    )
}

pub fn verify_hub_signature(secret: &[u8], body: &[u8], signature_header: Option<&str>) -> bool {
    let Some(hex_signature) = signature_header
        .map(str::trim)
        .and_then(|header| header.strip_prefix("sha256="))
    else {
        return false;
    };

    let Ok(signature) = hex::decode(hex_signature) else {
        return false;
    };

    let Ok(mut mac) = HmacSha256::new_from_slice(secret) else {
        return false;
    };

    mac.update(body);
    mac.verify_slice(&signature).is_ok()
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }

    left.iter()
        .zip(right)
        .fold(0u8, |diff, (a, b)| diff | (a ^ b))
        == 0
}

/* ==========================================================
   ENVIRONMENT HELPERS
========================================================== */

fn read_optional_env(name: &str) -> Option<String> {
    env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn read_u32_env(name: &str, default: u32) -> Result<u32, Box<dyn Error>> {
    match read_optional_env(name) {
        Some(value) => value
            .parse::<u32>()
            .map_err(|_| format!("{name} debe ser un número entero positivo").into()),
        None => Ok(default),
    }
}

fn is_valid_api_version(version: &str) -> bool {
    version.len() > 1
        && version.starts_with('v')
        && version[1..].chars().all(|c| c.is_ascii_digit() || c == '.')
}

fn is_valid_template_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 512
        && name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
}

fn is_valid_language_code(code: &str) -> bool {
    match code.split_once('_') {
        None => code.len() == 2 && code.chars().all(|c| c.is_ascii_lowercase()),
        Some((language, region)) => {
            language.len() == 2
                && language.chars().all(|c| c.is_ascii_lowercase())
                && region.len() == 2
                && region.chars().all(|c| c.is_ascii_uppercase())
        }
    }
}

/* ==========================================================
   TESTS
========================================================== */

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn ar(year: i32, month: u32, day: u32) -> DateTime<Tz> {
        Buenos_Aires
            .with_ymd_and_hms(year, month, day, 12, 0, 0)
            .single()
            .unwrap()
    }

    fn created(year: i32, month: u32, day: u32) -> DateTime<Utc> {
        ar(year, month, day).with_timezone(&Utc)
    }

    fn date(year: i32, month: u32, day: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(year, month, day).unwrap()
    }

    /* ---------- Scheduling ---------- */

    #[test]
    fn days_in_month_handles_leap_years() {
        assert_eq!(days_in_month(2027, 2), 28);
        assert_eq!(days_in_month(2028, 2), 29);
        assert_eq!(days_in_month(2026, 4), 30);
        assert_eq!(days_in_month(2026, 12), 31);
    }

    #[test]
    fn notice_day_maps_special_codes() {
        assert_eq!(notice_day(0, 2026, 11), None);
        assert_eq!(notice_day(1, 2026, 11), Some(1));
        assert_eq!(notice_day(28, 2027, 2), Some(28));
        assert_eq!(notice_day(32, 2026, 11), None);
        assert_eq!(notice_day(-1, 2026, 11), None);

        // 31-day month
        assert_eq!(notice_day(31, 2026, 12), Some(31));
        assert_eq!(notice_day(30, 2026, 12), Some(30));
        assert_eq!(notice_day(29, 2026, 12), Some(29));

        // 30-day month
        assert_eq!(notice_day(31, 2026, 11), Some(30));
        assert_eq!(notice_day(30, 2026, 11), Some(29));
        assert_eq!(notice_day(29, 2026, 11), Some(28));

        // February (common and leap year)
        assert_eq!(notice_day(31, 2027, 2), Some(28));
        assert_eq!(notice_day(30, 2027, 2), Some(27));
        assert_eq!(notice_day(29, 2027, 2), Some(26));
        assert_eq!(notice_day(31, 2028, 2), Some(29));
        assert_eq!(notice_day(30, 2028, 2), Some(28));
        assert_eq!(notice_day(29, 2028, 2), Some(27));
    }

    #[test]
    fn is_notice_due_only_on_the_exact_day() {
        assert!(is_notice_due(10, date(2026, 11, 10)));
        assert!(!is_notice_due(10, date(2026, 11, 11)));
        assert!(is_notice_due(31, date(2026, 11, 30)));
        assert!(!is_notice_due(0, date(2026, 11, 1)));
    }

    #[test]
    fn due_notice_date_on_the_day_and_catch_up() {
        // On the exact day.
        assert_eq!(
            due_notice_date(10, date(2026, 11, 10), 7),
            Some(date(2026, 11, 10))
        );
        // Before the day: nothing this month, last month's is too old.
        assert_eq!(due_notice_date(10, date(2026, 11, 9), 7), None);
        // Missed (weekend / server down): still due within the window.
        assert_eq!(
            due_notice_date(10, date(2026, 11, 17), 7),
            Some(date(2026, 11, 10))
        );
        assert_eq!(due_notice_date(10, date(2026, 11, 18), 7), None);
        // Last day of October (Saturday) caught up in November.
        assert_eq!(
            due_notice_date(31, date(2026, 11, 2), 7),
            Some(date(2026, 10, 31))
        );
        // Across the year boundary.
        assert_eq!(
            due_notice_date(31, date(2027, 1, 4), 7),
            Some(date(2026, 12, 31))
        );
        assert_eq!(due_notice_date(0, date(2026, 11, 1), 7), None);
    }

    #[test]
    fn send_window_is_weekdays_from_10_to_14() {
        let at = |day, hour| {
            Buenos_Aires
                .with_ymd_and_hms(2026, 11, day, hour, 0, 0)
                .single()
                .unwrap()
        };

        // 2026-11-10 is a Tuesday; 2026-11-14 is a Saturday.
        assert!(is_within_send_window(at(10, 10), 10, 14));
        assert!(is_within_send_window(at(10, 13), 10, 14));
        assert!(!is_within_send_window(at(10, 9), 10, 14));
        assert!(!is_within_send_window(at(10, 14), 10, 14));
        assert!(!is_within_send_window(at(14, 11), 10, 14));
        assert!(!is_within_send_window(at(15, 11), 10, 14));
    }

    #[test]
    fn reminder_periods_include_previous_month() {
        assert_eq!(reminder_periods(date(2027, 1, 4)), [(2026, 12), (2027, 1)]);
    }

    /* ---------- Late quotes ---------- */

    #[test]
    fn late_quotes_are_unpaid_quotes_before_current_month() {
        // Start in March 2026; now November 2026 -> March..October are past (indexes 0..7).
        // 25 = quote 1 cash, quote 2 transfer, quote 3 cash.
        let late = late_quote_indexes(25, 3, created(2026, 2, 15), ar(2026, 11, 10));
        assert_eq!(late, vec![3, 4, 5, 6, 7]);
    }

    #[test]
    fn current_and_future_months_are_not_late() {
        // Start in October 2026; now November 2026 -> only October (index 0) is late.
        let late = late_quote_indexes(0, 10, created(2026, 9, 1), ar(2026, 11, 10));
        assert_eq!(late, vec![0]);

        // Start in November 2026 -> nothing late yet.
        assert!(late_quote_indexes(0, 11, created(2026, 10, 1), ar(2026, 11, 10)).is_empty());
    }

    #[test]
    fn late_quotes_cross_year_boundary() {
        // Start November 2026; now February 2027 -> Nov, Dec, Jan are past.
        // Quote 2 (December) paid by transfer: 0b10 << 2 = 8.
        let late = late_quote_indexes(8, 11, created(2026, 10, 20), ar(2027, 2, 5));
        assert_eq!(late, vec![0, 2]);
        assert_eq!(
            describe_late_quotes(11, &late),
            "Cuota 1 (Noviembre), Cuota 3 (Enero)"
        );
    }

    #[test]
    fn negative_i16_quote_values_are_decoded_as_16_bits() {
        // All 8 quotes paid by transfer = 0xAAAA = -21846 as i16.
        assert!(late_quote_indexes(-21846, 1, created(2026, 1, 1), ar(2027, 6, 1)).is_empty());
    }

    #[test]
    fn invalid_start_month_yields_no_late_quotes() {
        assert!(late_quote_indexes(0, 0, created(2026, 1, 1), ar(2027, 6, 1)).is_empty());
        assert!(late_quote_indexes(0, 13, created(2026, 1, 1), ar(2027, 6, 1)).is_empty());
    }

    #[test]
    fn late_mask_sets_one_bit_per_index() {
        assert_eq!(late_quotes_mask(&[0, 2]), 0b101);
        assert_eq!(late_quotes_mask(&[7]), 0b1000_0000);
        assert_eq!(late_quotes_mask(&[]), 0);
    }

    /* ---------- Phones ---------- */

    #[test]
    fn normalizes_argentine_local_numbers() {
        assert_eq!(
            normalize_whatsapp_phone("299 412-3456").unwrap(),
            "5492994123456"
        );
        assert_eq!(
            normalize_whatsapp_phone("0299 412-3456").unwrap(),
            "5492994123456"
        );
        assert_eq!(
            normalize_whatsapp_phone("299 15 412-3456").unwrap(),
            "5492994123456"
        );
        assert_eq!(
            normalize_whatsapp_phone("0299 15 4123456").unwrap(),
            "5492994123456"
        );
        assert_eq!(
            normalize_whatsapp_phone("(011) 15 4123-4567").unwrap(),
            "5491141234567"
        );
        assert_eq!(
            normalize_whatsapp_phone("2972 15 412345").unwrap(),
            "5492972412345"
        );
    }

    #[test]
    fn normalizes_argentine_international_numbers() {
        assert_eq!(
            normalize_whatsapp_phone("+54 9 299 412 3456").unwrap(),
            "5492994123456"
        );
        assert_eq!(
            normalize_whatsapp_phone("+54 299 412 3456").unwrap(),
            "5492994123456"
        );
        assert_eq!(
            normalize_whatsapp_phone("5492994123456").unwrap(),
            "5492994123456"
        );
        assert_eq!(
            normalize_whatsapp_phone("0054 9 299 4123456").unwrap(),
            "5492994123456"
        );
    }

    #[test]
    fn keeps_foreign_international_numbers() {
        assert_eq!(
            normalize_whatsapp_phone("+56 9 1234 5678").unwrap(),
            "56912345678"
        );
    }

    #[test]
    fn rejects_invalid_phones() {
        assert_eq!(
            normalize_whatsapp_phone("15 412-3456"),
            Err(PhoneError::MissingAreaCode)
        );
        assert_eq!(
            normalize_whatsapp_phone("abc"),
            Err(PhoneError::InvalidCharacters)
        );
        assert_eq!(
            normalize_whatsapp_phone(""),
            Err(PhoneError::InvalidCharacters)
        );
        assert_eq!(
            normalize_whatsapp_phone("299+4123456"),
            Err(PhoneError::InvalidCharacters)
        );
        assert_eq!(
            normalize_whatsapp_phone("12345"),
            Err(PhoneError::InvalidLength)
        );
    }

    /* ---------- Template payload ---------- */

    #[test]
    fn builds_utility_template_payload() {
        let params = ReminderParams {
            full_name: "María González".into(),
            nro_bingo: "104".into(),
            late_quotes: "Cuota 1 (Marzo)".into(),
        };

        let payload =
            build_template_payload("5492994123456", "aviso_cuota_bingo", "es_AR", &params);

        assert_eq!(payload["messaging_product"], "whatsapp");
        assert_eq!(payload["to"], "5492994123456");
        assert_eq!(payload["type"], "template");
        assert_eq!(payload["template"]["name"], "aviso_cuota_bingo");
        assert_eq!(payload["template"]["language"]["code"], "es_AR");

        let parameters = &payload["template"]["components"][0]["parameters"];
        assert_eq!(payload["template"]["components"][0]["type"], "body");
        assert_eq!(parameters[0]["text"], "María González");
        assert_eq!(parameters[1]["text"], "104");
        assert_eq!(parameters[2]["text"], "Cuota 1 (Marzo)");
    }

    #[test]
    fn sanitizes_template_parameters() {
        assert_eq!(
            sanitize_template_param("  Ana\n\tMaría     Pérez ", 60),
            "Ana María Pérez"
        );
        assert_eq!(sanitize_template_param("   ", 60), "-");
        assert_eq!(sanitize_template_param("abcdef", 3), "abc");
    }

    /* ---------- Error classification ---------- */

    #[test]
    fn classifies_meta_errors() {
        let error = |code| GraphError {
            code: Some(code),
            error_subcode: None,
        };

        assert_eq!(
            classify_error(StatusCode::BAD_REQUEST, Some(&error(130429))),
            SendOutcome::Transient {
                code: "meta_130429".into(),
                abort_cycle: true
            }
        );
        assert_eq!(
            classify_error(StatusCode::UNAUTHORIZED, Some(&error(190))),
            SendOutcome::Failed {
                code: "meta_190".into(),
                abort_cycle: true
            }
        );
        assert_eq!(
            classify_error(StatusCode::BAD_REQUEST, Some(&error(131026))),
            SendOutcome::Failed {
                code: "meta_131026".into(),
                abort_cycle: false
            }
        );
        assert_eq!(
            classify_error(StatusCode::BAD_GATEWAY, None),
            SendOutcome::Transient {
                code: "http_502".into(),
                abort_cycle: false
            }
        );
    }

    /* ---------- Webhook ---------- */

    #[test]
    fn verifies_hub_signature() {
        let secret = b"app-secret";
        let body = br#"{"entry":[]}"#;

        let mut mac = HmacSha256::new_from_slice(secret).unwrap();
        mac.update(body);
        let header = format!("sha256={}", hex::encode(mac.finalize().into_bytes()));

        assert!(verify_hub_signature(secret, body, Some(&header)));
        assert!(!verify_hub_signature(secret, b"tampered", Some(&header)));
        assert!(!verify_hub_signature(secret, body, Some("sha256=zz")));
        assert!(!verify_hub_signature(secret, body, None));
    }

    #[test]
    fn detects_opt_out_and_opt_in_keywords() {
        assert!(is_opt_out_text("BAJA"));
        assert!(is_opt_out_text("  Stop! "));
        assert!(is_opt_out_text("No más"));
        assert!(!is_opt_out_text(
            "Ya pagué la cuota, ¿me das de baja la deuda?"
        ));
        assert!(is_opt_in_text("Alta"));
        assert!(!is_opt_in_text("hola"));
    }

    #[test]
    fn parses_webhook_messages_and_statuses() {
        let body = br#"{
            "object": "whatsapp_business_account",
            "entry": [{
                "id": "WABA",
                "changes": [{
                    "field": "messages",
                    "value": {
                        "messaging_product": "whatsapp",
                        "metadata": { "phone_number_id": "123" },
                        "messages": [
                            { "from": "5492994123456", "id": "wamid.1", "type": "text", "text": { "body": "BAJA" } },
                            { "from": "5492994000000", "id": "wamid.2", "type": "button", "button": { "payload": "ALTA", "text": "Volver a recibir" } },
                            { "from": "5492994111111", "id": "wamid.3", "type": "text", "text": { "body": "Hola" } }
                        ],
                        "statuses": [
                            { "id": "wamid.out1", "status": "delivered", "recipient_id": "5492994123456" },
                            { "id": "wamid.out2", "status": "failed", "errors": [{ "code": 131026 }] },
                            { "id": "wamid.out3", "status": "deleted" }
                        ]
                    }
                }]
            }]
        }"#;

        let events = parse_webhook_events(body, Some("123")).unwrap();

        assert_eq!(
            events.inbound,
            vec![
                InboundCommand {
                    from: "5492994123456".into(),
                    intent: InboundIntent::OptOut
                },
                InboundCommand {
                    from: "5492994000000".into(),
                    intent: InboundIntent::OptIn
                }
            ]
        );
        assert_eq!(events.statuses.len(), 2);
        assert_eq!(events.statuses[0].status, "delivered");
        assert_eq!(
            events.statuses[1].error_code.as_deref(),
            Some("meta_131026")
        );

        // Events for another phone number id are ignored.
        let other = parse_webhook_events(body, Some("999")).unwrap();
        assert_eq!(other, WebhookEvents::default());
    }

    #[test]
    fn validates_configuration_formats() {
        assert!(is_valid_api_version("v25.0"));
        assert!(!is_valid_api_version("25.0"));
        assert!(is_valid_template_name("aviso_cuota_bingo"));
        assert!(!is_valid_template_name("Aviso Cuota"));
        assert!(is_valid_language_code("es_AR"));
        assert!(is_valid_language_code("es"));
        assert!(!is_valid_language_code("es-ar"));
    }
}
