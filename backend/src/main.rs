use crate::{
    handlers::{equipo, img_donation, logro, noticia},
    models::{equipo::Equipo, logro::Logro, noticia::Noticia},
    repositories::user,
};
use axum::{Router, routing::get, routing::put};
use dotenvy::dotenv;
use sqlx::PgPool;
use std::sync::{Arc, RwLock};

mod db;
mod handlers;
mod models;
mod repositories;
mod utils;

pub struct AppState {
    pub db: PgPool,
    pub news: RwLock<Vec<Noticia>>,
    pub team: RwLock<Vec<Equipo>>,
    pub logros: RwLock<Vec<Logro>>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenv().ok();

    let db = db::connection::connect().await?;

    let state = Arc::new(AppState {
        db: db.clone(),
        news: RwLock::new(Vec::new()),
        team: RwLock::new(Vec::new()),
        logros: RwLock::new(Vec::new()),
    });

    let app = Router::new()
        .route(
            "/news",
            get(noticia::get_all_news).post(noticia::post_create_news),
        )
        .route(
            "/news/{id}",
            get(noticia::get_new_by_id)
                .delete(noticia::delete_new)
                .patch(noticia::patch_news),
        )
        .route("/news/order", put(noticia::change_order_news))
        .route(
            "/team",
            get(equipo::get_all_team).post(equipo::post_create_team),
        )
        .route(
            "/team/{id}",
            get(equipo::get_member_by_id)
                .delete(equipo::delete_member)
                .patch(equipo::patch_team),
        )
        .route("/team/order", put(equipo::change_order_team))
        .route(
            "/logros",
            get(logro::get_all_logros).post(logro::post_create_logros),
        )
        .route(
            "/logros/{id}",
            get(logro::get_logro_by_id)
                .delete(logro::delete_logro)
                .patch(logro::patch_logros),
        )
        .route("/logros/order", put(logro::change_order_logros))
        .route("/img_donacion", put(img_donation::upload_donation_image))
        .with_state(state);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:3000")
        .await
        .unwrap();

    println!("Backend server running on http://127.0.0.1:3000");

    // let news: Vec<crate::models::noticia::Noticia> = repositories::noticia::get_all()?;
    // println!("{:?}", news);

    // println!("{}", utils::password::hash_password("Ruso_395")?);

    match repositories::user::get_by_username(&db, "SJS395").await {
        Ok(Some(user)) => println!("{:#?}", user),
        Ok(None) => println!("User not found"),
        Err(err) => println!("Database error: {}", err),
    }

    axum::serve(listener, app).await.unwrap();

    Ok(())
}
