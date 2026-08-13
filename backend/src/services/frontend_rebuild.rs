use chrono::{DateTime, Utc};

use reqwest::Client;

use sqlx::{FromRow, PgPool};

use std::{env, error::Error, io, time::Duration};

use tokio::time::{self, MissedTickBehavior};

type DynError = Box<dyn Error + Send + Sync>;

const DEFAULT_REBUILD_DELAY_SECONDS: i64 = 300;
const DEFAULT_POLL_SECONDS: u64 = 15;

const FAILED_RETRY_DELAY_SECONDS: i64 = 60;

/*
 * If the backend stops after claiming a build, another
 * instance may recover it after this period.
 */
const STALE_PROCESSING_MINUTES: i64 = 10;

#[derive(Clone)]
pub struct FrontendRebuildService {
    db: PgPool,

    http: Client,

    deploy_hook_url: Option<String>,

    rebuild_delay_seconds: i64,

    poll_seconds: u64,
}

#[derive(Debug, FromRow)]
struct ClaimedRebuild {
    requested_at: DateTime<Utc>,
}

impl FrontendRebuildService {
    pub fn from_env(db: PgPool) -> Self {
        let deploy_hook_url = env::var("CLOUDFLARE_PAGES_DEPLOY_HOOK")
            .ok()
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty());

        let rebuild_delay_seconds = read_positive_i64_environment(
            "FRONTEND_REBUILD_DELAY_SECONDS",
            DEFAULT_REBUILD_DELAY_SECONDS,
        );

        let poll_seconds =
            read_positive_u64_environment("FRONTEND_REBUILD_POLL_SECONDS", DEFAULT_POLL_SECONDS);

        Self {
            db,

            http: Client::new(),

            deploy_hook_url,

            rebuild_delay_seconds,

            poll_seconds,
        }
    }

    /* ======================================================
       START WORKER
    ====================================================== */

    pub fn start(self) {
        if self.deploy_hook_url.is_none() {
            println!(
                "Frontend rebuild worker disabled: \
                 CLOUDFLARE_PAGES_DEPLOY_HOOK is not configured."
            );

            return;
        }

        tokio::spawn(async move {
            self.run().await;
        });
    }

    async fn run(self) {
        let mut interval = time::interval(Duration::from_secs(self.poll_seconds));

        interval.set_missed_tick_behavior(MissedTickBehavior::Skip);

        loop {
            interval.tick().await;

            if let Err(error) = self.process_pending_rebuild().await {
                eprintln!("Frontend rebuild worker error: {error}");
            }
        }
    }

    /* ======================================================
       MARK PENDING

       Use this manually for changes that only affect R2 and
       do not modify a database table.
    ====================================================== */

    pub async fn mark_pending(&self) -> Result<(), sqlx::Error> {
        if self.deploy_hook_url.is_none() {
            return Ok(());
        }

        sqlx::query(
            r#"
            INSERT INTO public.frontend_rebuild_state (
                id,
                requested_at,
                processing,
                next_attempt_at,
                last_error
            )
            VALUES (
                1,
                clock_timestamp(),
                false,
                NULL,
                NULL
            )
            ON CONFLICT (id)
            DO UPDATE SET
                requested_at = clock_timestamp(),
                next_attempt_at = NULL,
                last_error = NULL
            "#,
        )
        .execute(&self.db)
        .await?;

        Ok(())
    }

    /* ======================================================
       PROCESS PENDING BUILD
    ====================================================== */

    async fn process_pending_rebuild(&self) -> Result<(), DynError> {
        /*
         * This single atomic UPDATE claims the work.
         *
         * When two backend instances execute it at the same
         * time, only one can change processing to true and
         * receive the RETURNING row.
         */
        let claimed = sqlx::query_as::<_, ClaimedRebuild>(
            r#"
                UPDATE public.frontend_rebuild_state
                SET
                    processing = true,
                    processing_started_at =
                        clock_timestamp()
                WHERE
                    id = 1

                    AND requested_at IS NOT NULL

                    AND requested_at <=
                        clock_timestamp()
                        - (
                            $1::bigint
                            * INTERVAL '1 second'
                        )

                    AND (
                        triggered_at IS NULL
                        OR requested_at > triggered_at
                    )

                    AND (
                        next_attempt_at IS NULL
                        OR next_attempt_at <=
                            clock_timestamp()
                    )

                    AND (
                        processing = false

                        OR processing_started_at
                            IS NULL

                        OR processing_started_at <=
                            clock_timestamp()
                            - (
                                $2::bigint
                                * INTERVAL '1 minute'
                            )
                    )
                RETURNING
                    requested_at
                "#,
        )
        .bind(self.rebuild_delay_seconds)
        .bind(STALE_PROCESSING_MINUTES)
        .fetch_optional(&self.db)
        .await?;

        let Some(claimed) = claimed else {
            return Ok(());
        };

        let hook_url = self.deploy_hook_url.as_deref().ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::NotFound,
                "The Cloudflare deploy hook is not configured.",
            )
        })?;

        println!(
            "Triggering frontend rebuild for changes requested at {}",
            claimed.requested_at,
        );

        let response_result = self
            .http
            .post(hook_url)
            .timeout(Duration::from_secs(30))
            .send()
            .await;

        match response_result {
            Ok(response) if response.status().is_success() => {
                self.mark_success(claimed.requested_at).await?;

                println!("Cloudflare frontend build was triggered successfully.");

                Ok(())
            }

            Ok(response) => {
                let status = response.status();

                let response_body = response.text().await.unwrap_or_default();

                let message = format!(
                    "Cloudflare deploy hook returned {status}: {}",
                    truncate_text(&response_body, 500,),
                );

                self.mark_failure(&message).await?;

                Err(Box::new(io::Error::new(io::ErrorKind::Other, message)))
            }

            Err(error) => {
                let message = error.to_string();

                self.mark_failure(&message).await?;

                Err(Box::new(error))
            }
        }
    }

    /* ======================================================
       SUCCESS / FAILURE
    ====================================================== */

    async fn mark_success(&self, requested_at: DateTime<Utc>) -> Result<(), sqlx::Error> {
        /*
         * triggered_at receives the timestamp that was
         * claimed, not the current requested_at value.
         *
         * If another change happened while the hook was
         * being called, requested_at will be newer and a new
         * build will be scheduled five minutes later.
         */
        sqlx::query(
            r#"
            UPDATE public.frontend_rebuild_state
            SET
                triggered_at = $1,
                processing = false,
                processing_started_at = NULL,
                next_attempt_at = NULL,
                last_error = NULL
            WHERE id = 1
            "#,
        )
        .bind(requested_at)
        .execute(&self.db)
        .await?;

        Ok(())
    }

    async fn mark_failure(&self, error: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            UPDATE public.frontend_rebuild_state
            SET
                processing = false,
                processing_started_at = NULL,

                next_attempt_at =
                    clock_timestamp()
                    + (
                        $1::bigint
                        * INTERVAL '1 second'
                    ),

                last_error = $2
            WHERE id = 1
            "#,
        )
        .bind(FAILED_RETRY_DELAY_SECONDS)
        .bind(truncate_text(error, 2000))
        .execute(&self.db)
        .await?;

        Ok(())
    }
}

/* ==========================================================
   ENVIRONMENT
========================================================== */

fn read_positive_i64_environment(name: &str, default: i64) -> i64 {
    env::var(name)
        .ok()
        .and_then(|value| value.parse::<i64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(default)
}

fn read_positive_u64_environment(name: &str, default: u64) -> u64 {
    env::var(name)
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(default)
}

/* ==========================================================
   TEXT
========================================================== */

fn truncate_text(value: &str, maximum_characters: usize) -> String {
    value.chars().take(maximum_characters).collect()
}
