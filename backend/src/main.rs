use crate::{
    handlers::{equipo, img_donation, logro, logro_fav, noticia},
    models::{equipo::Equipo, logro::Logro, noticia::Noticia},
};
use axum::{
    Router,
    http::{
        Method,
        header::{AUTHORIZATION, CONTENT_TYPE},
    },
    routing::{get, patch, post, put},
};
use dotenvy::dotenv;
use sqlx::PgPool;
use std::sync::{Arc, RwLock};
use tower_http::cors::CorsLayer;

mod auth;
mod db;
mod error;
mod handlers;
mod models;
mod repositories;
mod utils;

#[derive(Debug)]
pub struct AppState {
    pub db: PgPool,
    pub news: RwLock<Vec<Noticia>>,
    pub team: RwLock<Vec<Equipo>>,
    pub logros: RwLock<Vec<Logro>>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenv().ok();
    let cors = CorsLayer::new()
        .allow_origin("http://localhost:4321".parse::<axum::http::HeaderValue>()?)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PATCH,
            Method::DELETE,
            Method::PUT,
        ])
        .allow_headers([AUTHORIZATION, CONTENT_TYPE]);
    let db = db::connection::connect().await?;
    let state = Arc::new(AppState {
        db: db.clone(),
        news: RwLock::new(Vec::new()),
        team: RwLock::new(Vec::new()),
        logros: RwLock::new(Vec::new()),
    });
    let app = Router::new()
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
        .route("/img_donacion", put(img_donation::upload_donation_image))
        .route("/login", post(handlers::auth::login))
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
        .route("/services", get(handlers::service::get_all_services))
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
        .with_state(state)
        .layer(cors);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:3000")
        .await
        .unwrap();

    println!("Backend server running on http://127.0.0.1:3000");

    // let news: Vec<crate::models::noticia::Noticia> = repositories::noticia::get_all()?;
    // println!("{:?}", news);

    // println!("{}", utils::password::hash_password("Ruso_395")?);

    // match repositories::user::get_by_username(&db, "SJS395").await {
    //     Ok(Some(user)) => println!("{:#?}", user),
    //     Ok(None) => println!("User not found"),
    //     Err(err) => println!("Database error: {}", err),
    // }

    // let token =
    //     auth::jwt::generate_token(5, std::env::var("JWT_SECRET").unwrap().as_str()).unwrap();

    // println!("{token}");

    // let claims =
    //     auth::jwt::validate_token(&token, std::env::var("JWT_SECRET").unwrap().as_str()).unwrap();

    // println!("{:?}", claims);

    // let user = repositories::user::get_by_username(&db.clone(), "SJS395").await?;

    // println!("{:#?}", user);

    // let permissions =
    //     repositories::user::get_permissions(&db.clone(), user.as_ref().unwrap().role_id).await?;

    // println!("{:#?}", permissions);

    axum::serve(listener, app).await.unwrap();

    Ok(())
}
