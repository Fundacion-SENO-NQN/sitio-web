use crate::{
    models::{equipo::Equipo, logro::Logro, noticia::Noticia},
    routes::{
        equipo, evento, health, img_donation, instagram, logro, logro_fav, metodo_donacion, noticia, roles,
        service, user, voluntariado,
    },
    services::{email::EmailService, frontend_rebuild::FrontendRebuildService, instagram::InstagramService},
};
use axum::{
    Router,
    extract::DefaultBodyLimit,
    http::{
        HeaderValue, Method,
        header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE},
    },
};
use dotenvy::dotenv;
use sqlx::PgPool;
use std::{
    env,
    sync::{Arc, RwLock},
};
use tower_http::cors::CorsLayer;

mod auth;
mod db;
mod error;
mod handlers;
mod models;
mod repositories;
mod routes;
mod services;
mod utils;

pub struct AppState {
    pub email: EmailService,
    pub db: PgPool,
    pub news: RwLock<Vec<Noticia>>,
    pub team: RwLock<Vec<Equipo>>,
    pub logros: RwLock<Vec<Logro>>,
    pub r2: utils::r2::R2Storage,
    pub frontend_rebuild: FrontendRebuildService,
    pub instagram: InstagramService,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Loads .env locally.
    // On Fly.io, the variables will come from Fly secrets and fly.toml.
    dotenv().ok();

    /* ========================================================
     * SERVER ADDRESS
     * ====================================================== */

    let port = env::var("PORT").unwrap_or_else(|_| "8080".to_string());

    let address = format!("0.0.0.0:{port}");

    /* ========================================================
     * CORS
     * ====================================================== */

    /*
     * Example:
     *
     * CORS_ALLOWED_ORIGINS=http://localhost:4321,https://plataforma.fundacionseno.org
     *
     * Origins must not contain a trailing slash.
     */
    let cors_origins =
        env::var("CORS_ALLOWED_ORIGINS").unwrap_or_else(|_| "http://localhost:4321".to_string());

    let allowed_origins: Vec<HeaderValue> = cors_origins
        .split(',')
        .map(str::trim)
        .filter(|origin| !origin.is_empty())
        .map(|origin| origin.parse::<HeaderValue>())
        .collect::<Result<Vec<_>, _>>()?;

    if allowed_origins.is_empty() {
        return Err("CORS_ALLOWED_ORIGINS cannot be empty".into());
    }

    let cors = CorsLayer::new()
        .allow_origin(allowed_origins)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([AUTHORIZATION, CONTENT_TYPE, ACCEPT]);

    /* ========================================================
     * DATABASE AND STATE
     * ====================================================== */

    let db = db::connection::connect().await?;

    let email = EmailService::from_env().expect("No se pudo configurar el servicio de correo");

    let r2 = utils::r2::R2Storage::from_env()
        .await
        .expect("No se pudo cargar r2");

    let frontend_rebuild = FrontendRebuildService::from_env(db.clone());
    let instagram = InstagramService::from_env()?;

    frontend_rebuild.clone().start();

    let state = Arc::new(AppState {
        db,
        email,
        news: RwLock::new(Vec::new()),
        team: RwLock::new(Vec::new()),
        logros: RwLock::new(Vec::new()),
        r2,
        frontend_rebuild,
        instagram,
    });

    // Keep long-lived Instagram tokens alive while this Fly machine is running.
    let refresh_state = state.clone();
    tokio::spawn(async move {
        let mut timer = tokio::time::interval(std::time::Duration::from_secs(12 * 60 * 60));
        loop {
            timer.tick().await;
            if let Err(error) = refresh_state.instagram.connection(&refresh_state.db).await {
                eprintln!("Instagram token refresh check failed: {error}");
            }
            // Containers expire; a two-day grace period covers ambiguous Meta responses.
            let old_ids = sqlx::query_scalar::<_, uuid::Uuid>(
                "SELECT request_id FROM instagram_publications WHERE temp_cleaned_at IS NULL AND created_at < now() - interval '48 hours' LIMIT 100"
            ).fetch_all(&refresh_state.db).await;
            if let Ok(old_ids) = old_ids {
                for id in old_ids {
                    let mut all_deleted = true;
                    for index in 0..10 {
                        let key = format!("instagram-temp/{id}/{index}.jpg");
                        if refresh_state.r2.delete_object(&key).await.is_err() { all_deleted = false; }
                    }
                    if all_deleted {
                        let _ = sqlx::query("UPDATE instagram_publications SET temp_cleaned_at=now(), status=CASE WHEN status='processing' THEN 'unknown' ELSE status END WHERE request_id=$1")
                            .bind(id).execute(&refresh_state.db).await;
                    }
                }
            }
        }
    });

    /* ========================================================
     * ROUTES
     * ====================================================== */

    let app = Router::new()
        .merge(voluntariado::routes())
        .merge(equipo::routes())
        .merge(logro::routes())
        .merge(logro_fav::routes())
        .merge(img_donation::routes())
        .merge(instagram::routes())
        .merge(routes::auth::routes())
        .merge(user::routes())
        .merge(roles::routes())
        .merge(service::routes())
        .merge(metodo_donacion::routes())
        .merge(evento::routes())
        .merge(health::routes())
        .merge(noticia::routes())
        // Shared state and middleware
        .with_state(state)
        .layer(DefaultBodyLimit::max(130 * 1024 * 1024))
        .layer(cors);

    /* ========================================================
     * START SERVER
     * ====================================================== */

    let listener = tokio::net::TcpListener::bind(&address).await?;

    axum::serve(listener, app).await?;

    Ok(())
}
