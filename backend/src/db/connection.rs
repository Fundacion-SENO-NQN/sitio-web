use sqlx::PgPool;
use std::env;

pub async fn connect() -> Result<PgPool, sqlx::Error> {
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL no encontrado");
    println!("{}",database_url);
    PgPool::connect(&database_url).await
}
