use crate::{models::bingo::Bingo, services::whatsapp::normalize_whatsapp_phone};
use chrono::NaiveDate;
use sqlx::{PgPool, Row};

/* ==========================================================
   CANDIDATES & OPT-OUT CHECKS
========================================================== */

pub async fn list_candidate_bingos(
    db: &PgPool,
    period_year: i16,
    period_month: i16,
) -> Result<Vec<Bingo>, sqlx::Error> {
    sqlx::query_as::<_, Bingo>(
        r#"
        SELECT
            b.id,
            b.name,
            b.last_name,
            b.phone,
            b.neighborhood,
            b.collection_date,
            b.collection_locate,
            b.start_month,
            b.locality,
            b.quote,
            b.nro_bingo,
            b.late_payment_notice,
            b.address,
            b.created_at
        FROM public.bingos b
        WHERE b.late_payment_notice BETWEEN 1 AND 31
          AND NOT EXISTS (
              SELECT 1
              FROM public.whatsapp_bingo_notices n
              WHERE n.bingo_id = b.id
                AND n.period_year = $1
                AND n.period_month = $2
                AND NOT (
                    (
                        n.status = 'transient_error'
                        AND n.attempts < 2
                        AND n.next_retry_at <= now()
                    )
                    OR (
                        n.status = 'processing'
                        AND n.updated_at < now() - interval '30 minutes'
                        AND n.attempts < 2
                    )
                )
          )
        ORDER BY b.nro_bingo ASC
        "#,
    )
    .bind(period_year)
    .bind(period_month)
    .fetch_all(db)
    .await
}

pub async fn is_phone_opted_out(db: &PgPool, phone_e164: &str) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS (
            SELECT 1
            FROM public.whatsapp_opt_outs
            WHERE phone_e164 = $1
        )
        "#,
    )
    .bind(phone_e164)
    .fetch_one(db)
    .await
}

/* ==========================================================
   ATOMIC CLAIM & NOTICE STATE TRANSITIONS
========================================================== */

pub async fn claim_bingo_notice(
    db: &PgPool,
    bingo_id: i64,
    period_year: i16,
    period_month: i16,
    scheduled_date: NaiveDate,
    recipient_phone: &str,
    late_quotes_mask: i16,
) -> Result<Option<i64>, sqlx::Error> {
    sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO public.whatsapp_bingo_notices (
            bingo_id,
            period_year,
            period_month,
            scheduled_date,
            recipient_phone,
            late_quotes_mask,
            status,
            attempts,
            next_retry_at,
            last_error_code,
            updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'processing', 1, NULL, NULL, now())
        ON CONFLICT (bingo_id, period_year, period_month)
        DO UPDATE SET
            scheduled_date = EXCLUDED.scheduled_date,
            recipient_phone = EXCLUDED.recipient_phone,
            late_quotes_mask = EXCLUDED.late_quotes_mask,
            status = 'processing',
            attempts = public.whatsapp_bingo_notices.attempts + 1,
            next_retry_at = NULL,
            updated_at = now()
        WHERE (
            public.whatsapp_bingo_notices.status = 'transient_error'
            AND public.whatsapp_bingo_notices.attempts < 2
            AND public.whatsapp_bingo_notices.next_retry_at <= now()
        ) OR (
            public.whatsapp_bingo_notices.status = 'processing'
            AND public.whatsapp_bingo_notices.updated_at < now() - interval '30 minutes'
            AND public.whatsapp_bingo_notices.attempts < 2
        )
        RETURNING id
        "#,
    )
    .bind(bingo_id)
    .bind(period_year)
    .bind(period_month)
    .bind(scheduled_date)
    .bind(recipient_phone)
    .bind(late_quotes_mask)
    .fetch_optional(db)
    .await
}

pub async fn mark_notice_sent(
    db: &PgPool,
    notice_id: i64,
    provider_message_id: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE public.whatsapp_bingo_notices
        SET
            status = 'sent',
            provider_message_id = COALESCE($2, provider_message_id),
            last_error_code = NULL,
            next_retry_at = NULL,
            updated_at = now()
        WHERE id = $1
        "#,
    )
    .bind(notice_id)
    .bind(provider_message_id)
    .execute(db)
    .await?;

    Ok(())
}

pub async fn mark_notice_transient_error(
    db: &PgPool,
    notice_id: i64,
    error_code: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE public.whatsapp_bingo_notices
        SET
            status = CASE WHEN attempts >= 2 THEN 'failed' ELSE 'transient_error' END,
            next_retry_at = CASE WHEN attempts >= 2 THEN NULL ELSE now() + interval '1 hour' END,
            last_error_code = $2,
            updated_at = now()
        WHERE id = $1
        "#,
    )
    .bind(notice_id)
    .bind(error_code)
    .execute(db)
    .await?;

    Ok(())
}

pub async fn mark_notice_failed(
    db: &PgPool,
    notice_id: i64,
    error_code: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE public.whatsapp_bingo_notices
        SET
            status = 'failed',
            next_retry_at = NULL,
            last_error_code = $2,
            updated_at = now()
        WHERE id = $1
        "#,
    )
    .bind(notice_id)
    .bind(error_code)
    .execute(db)
    .await?;

    Ok(())
}

pub async fn mark_notice_unknown(
    db: &PgPool,
    notice_id: i64,
    error_code: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE public.whatsapp_bingo_notices
        SET
            status = 'unknown',
            next_retry_at = NULL,
            last_error_code = $2,
            updated_at = now()
        WHERE id = $1
        "#,
    )
    .bind(notice_id)
    .bind(error_code)
    .execute(db)
    .await?;

    Ok(())
}

/* ==========================================================
   WEBHOOK DELIVERY STATUS & OPT-OUT UPDATES
========================================================== */

pub async fn update_delivery_status(
    db: &PgPool,
    provider_message_id: &str,
    new_status: &str,
    error_code: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE public.whatsapp_bingo_notices
        SET
            status = CASE
                WHEN status = 'read' THEN 'read'
                WHEN status = 'delivered' AND $2 = 'sent' THEN 'delivered'
                WHEN status IN ('delivered', 'read') AND $2 = 'failed' THEN status
                ELSE $2
            END,
            last_error_code = COALESCE($3, last_error_code),
            updated_at = now()
        WHERE provider_message_id = $1
        "#,
    )
    .bind(provider_message_id)
    .bind(new_status)
    .bind(error_code)
    .execute(db)
    .await?;

    Ok(())
}

pub async fn record_opt_out_and_disable_bingos(
    db: &PgPool,
    phone_e164: &str,
    reason: &str,
) -> Result<u64, sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO public.whatsapp_opt_outs (phone_e164, reason, opted_out_at)
        VALUES ($1, $2, now())
        ON CONFLICT (phone_e164)
        DO UPDATE SET
            reason = EXCLUDED.reason,
            opted_out_at = now()
        "#,
    )
    .bind(phone_e164)
    .bind(reason)
    .execute(db)
    .await?;

    let active_rows = sqlx::query(
        r#"
        SELECT id, phone
        FROM public.bingos
        WHERE late_payment_notice <> 0
        "#,
    )
    .fetch_all(db)
    .await?;

    let matching_ids: Vec<i64> = active_rows
        .into_iter()
        .filter_map(|row| {
            let id: i64 = row.get("id");
            let phone: String = row.get("phone");
            match normalize_whatsapp_phone(&phone) {
                Ok(normalized) if normalized == phone_e164 => Some(id),
                _ => None,
            }
        })
        .collect();

    if matching_ids.is_empty() {
        return Ok(0);
    }

    let result = sqlx::query(
        r#"
        UPDATE public.bingos
        SET late_payment_notice = 0
        WHERE id = ANY($1)
        "#,
    )
    .bind(&matching_ids)
    .execute(db)
    .await?;

    Ok(result.rows_affected())
}

pub async fn clear_opt_out(db: &PgPool, phone_e164: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        DELETE FROM public.whatsapp_opt_outs
        WHERE phone_e164 = $1
        "#,
    )
    .bind(phone_e164)
    .execute(db)
    .await?;

    Ok(())
}
