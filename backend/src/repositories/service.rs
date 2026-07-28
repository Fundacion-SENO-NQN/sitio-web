use crate::models::service::Service;
use sqlx::PgPool;

pub async fn get_all(db: &PgPool) -> Result<Vec<Service>, sqlx::Error> {
    sqlx::query_as::<_, Service>("SELECT * FROM services")
        .fetch_all(db)
        .await
}
