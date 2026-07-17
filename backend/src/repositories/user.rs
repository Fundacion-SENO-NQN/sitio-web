use crate::models::user::User;
use sqlx::PgPool;

pub async fn get_by_username(db: &PgPool, username: &str) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as::<_, User>(
        "
        SELECT * FROM users
        WHERE username = $1
        ",
    )
    .bind(username)
    .fetch_optional(db)
    .await
}
