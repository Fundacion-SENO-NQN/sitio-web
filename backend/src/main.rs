use axum::Router;
use tokio::net::TcpListener;

mod handlers;
mod models;
mod repositories;
mod routes;
mod services;

#[tokio::main]
async fn main() {
    let app: Router = routes::create_router();

    let listener = TcpListener::bind("127.0.0.1:3000")
        .await
        .expect("No se pudo iniciar el servidor");

    println!("Servidor iniciado en http://127.0.0.1:3000");

    axum::serve(listener, app)
        .await
        .expect("Error al iniciar el servidor");
}
