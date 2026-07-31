use crate::services::email::EmailService;
use crate::{
    handlers::{equipo, evento, img_donation, logro, logro_fav, noticia},
    models::{equipo::Equipo, logro::Logro, noticia::Noticia},
};
use axum::{
    Router,
    extract::DefaultBodyLimit,
    http::{
        HeaderValue, Method,
        header::{AUTHORIZATION, CONTENT_TYPE},
    },
    routing::{get, patch, post, put},
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
mod services;
mod utils;

pub struct AppState {
    pub email: EmailService,
    pub db: PgPool,
    pub news: RwLock<Vec<Noticia>>,
    pub team: RwLock<Vec<Equipo>>,
    pub logros: RwLock<Vec<Logro>>,
    pub r2: utils::r2::R2Storage,
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
            Method::PATCH,
            Method::DELETE,
            Method::PUT,
        ])
        .allow_headers([AUTHORIZATION, CONTENT_TYPE]);

    /* ========================================================
     * DATABASE AND STATE
     * ====================================================== */

    let db = db::connection::connect().await?;

    let email = EmailService::from_env().expect("No se pudo configurar el servicio de correo");

    let r2 = utils::r2::R2Storage::from_env()
        .await
        .expect("No se pudo cargar r2");

    let state = Arc::new(AppState {
        db,
        email,
        news: RwLock::new(Vec::new()),
        team: RwLock::new(Vec::new()),
        logros: RwLock::new(Vec::new()),
        r2,
    });

    /* ========================================================
     * ROUTES
     * ====================================================== */

    let app = Router::new()
        .route(
            "/voluntariado/solicitud",
            post(handlers::voluntariado::create_solicitud),
        )
        // Fly.io health endpoint
        .route("/health", get(|| async { "OK" }))
        // Noticias
        .route(
            "/noticias",
            get(noticia::get_all_news).post(noticia::create_news),
        )
        .route(
            "/noticias/{id}",
            get(noticia::get_new_by_id)
                .delete(noticia::delete_new)
                .patch(noticia::patch_news),
        )
        .route("/noticias/order", put(noticia::change_order_news))
        .route("/ultimas_noticias", get(noticia::get_last_4_news))
        // Equipo
        .route(
            "/equipo",
            get(equipo::get_all_equipo).post(equipo::create_equipo),
        )
        .route(
            "/equipo/{id}",
            get(equipo::get_equipo_by_id)
                .delete(equipo::delete_equipo)
                .patch(equipo::patch_equipo),
        )
        .route("/equipo/order", put(equipo::change_order_equipo))
        // Logros
        .route(
            "/logros",
            get(logro::get_all_logros).post(logro::create_logro),
        )
        .route(
            "/logros/{id}",
            get(logro::get_logro_by_id)
                .delete(logro::delete_logro)
                .patch(logro::patch_logro),
        )
        .route("/logros/order", put(logro::change_order_logros))
        // Logros favoritos
        .route(
            "/logros_fav",
            get(logro_fav::get_all_logros_fav)
                .post(logro_fav::create_logro_fav)
                .put(logro_fav::replace_logros_fav),
        )
        .route(
            "/logros_fav/{id}",
            get(logro_fav::get_by_id_logros_fav).delete(logro_fav::delete_logro_fav),
        )
        // Imágenes de donación
        .route("/img_donacion", put(img_donation::upload_donation_image))
        // Autenticación
        .route("/login", post(handlers::auth::login))
        // Usuarios
        .route(
            "/users",
            post(handlers::user::create_user).get(handlers::user::get_all_users),
        )
        .route(
            "/users/{id}",
            get(handlers::user::get_user_by_id)
                .patch(handlers::user::patch_user)
                .delete(handlers::user::delete_user),
        )
        .route(
            "/users/username/{username}",
            get(handlers::user::get_user_by_username),
        )
        .route("/user/state/{id}", patch(handlers::user::patch_user_active))
        .route(
            "/user/permissions/{id}",
            get(handlers::user::get_user_permissions),
        )
        .route(
            "/user/permissions/username/{username}",
            get(handlers::user::get_user_permissions_by_username),
        )
        .route(
            "/users/password/{id}",
            patch(handlers::user::patch_user_password),
        )
        // Roles
        .route("/roles", get(handlers::user::get_all_roles))
        .route(
            "/roles/{id}",
            get(handlers::user::get_role_with_service_by_id)
                .patch(handlers::user::patch_role)
                .delete(handlers::user::delete_role),
        )
        .route(
            "/roles-services",
            get(handlers::user::get_all_roles_with_services).post(handlers::user::post_role),
        )
        .route(
            "/roles-service/{id}",
            get(handlers::user::get_role_with_service_by_id),
        )
        // Servicios
        .route("/services", get(handlers::service::get_all_services))
        // Métodos de donación
        .route(
            "/metodos_donacion",
            get(handlers::metodo_donacion::get_all_metodos_donacion)
                .post(handlers::metodo_donacion::create_metodo_donacion),
        )
        .route(
            "/metodos_donacion/{id}",
            get(handlers::metodo_donacion::get_metodo_donacion)
                .patch(handlers::metodo_donacion::patch_metodo_donacion)
                .delete(handlers::metodo_donacion::delete_metodo_donacion),
        )
        .route("/eventos/order", put(evento::change_order_eventos))
        .route(
            "/eventos",
            get(evento::get_all_eventos).post(evento::create_evento),
        )
        .route(
            "/eventos/{id}",
            get(evento::get_evento_by_id)
                .patch(evento::patch_evento)
                .delete(evento::delete_evento),
        )
        // Shared state and middleware
        .with_state(state)
        .layer(DefaultBodyLimit::max(130 * 1024 * 1024))
        .layer(cors);

    /* ========================================================
     * START SERVER
     * ====================================================== */

    let listener = tokio::net::TcpListener::bind(&address).await?;

    println!("Backend server running on http://{address}");

    axum::serve(listener, app).await?;

    Ok(())
}
