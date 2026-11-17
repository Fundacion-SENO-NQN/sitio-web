use crate::{models::service::Service, repositories::base};
use sqlx::PgPool;

pub async fn get_all(db: &PgPool) -> Result<Vec<Service>, sqlx::Error> {
    base::obtener_todos::<Service>(db, &[]).await
}
