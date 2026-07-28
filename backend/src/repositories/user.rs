use crate::{
    error::api_error::ApiResult,
    models::{
        service::Service,
        user::{PatchUserRequest, User, UserResponse},
    },
};
use sqlx::PgPool;

pub async fn get_all(db: &PgPool) -> Result<Vec<User>, sqlx::Error> {
    sqlx::query_as::<_, User>(
        r#"
        SELECT
            u.id,
            u.username,
            u.password_hash,
            u.email,
            u.name,
            u.last_name,
            u.created_at,
            u.role_id,
            r.name AS role_name,
            u.active
        FROM users u
        JOIN roles r
    ON r.id = u.role_id
        ORDER BY u.username
        "#,
    )
    .fetch_all(db)
    .await
}

pub async fn get_by_username(db: &PgPool, username: &str) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as::<_, User>(
        r#"
        SELECT
            u.id,
            u.username,
            u.password_hash,
            u.email,
            u.name,
            u.last_name,
            u.created_at,
            u.role_id,
            r.name AS role_name,
            u.active
        FROM users u
        JOIN roles r
    ON r.id = u.role_id
        WHERE u.username = $1
        "#,
    )
    .bind(username)
    .fetch_optional(db)
    .await
}

pub async fn get_by_id(db: &PgPool, id: i64) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as::<_, User>(
        r#"
        SELECT
            u.id,
            u.username,
            u.password_hash,
            u.email,
            u.name,
            u.last_name,
            u.created_at,
            u.role_id,
            r.name AS role_name,
            u.active
        FROM users u
        JOIN roles r
    ON r.id = u.role_id
        WHERE u.id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(db)
    .await
}

pub async fn get_permissions(db: &PgPool, role_id: i64) -> Result<Vec<Service>, sqlx::Error> {
    let permissions = sqlx::query_as::<_, Service>(
        r#"
            SELECT s.name, s.titulo, s.url, s.created_at, s.id
            FROM services s
            JOIN roles_services rs
                ON rs.id_service = s.id
            WHERE rs.id_role = $1
            ORDER BY s.name
            "#,
    )
    .bind(role_id)
    .fetch_all(db)
    .await?;

    Ok(permissions)
}

pub async fn create(
    db: &PgPool,
    username: String,
    password_hash: String,
    email: String,
    name: String,
    last_name: String,
    role_id: i64,
) -> Result<UserResponse, sqlx::Error> {
    sqlx::query_as::<_, UserResponse>(
        r#"
        WITH new_user AS (
    INSERT INTO users
    (
        username,
        password_hash,
        email,
        name,
        last_name,
        role_id
    )
    VALUES
    (
        $1, $2, $3, $4, $5, $6
    )
    RETURNING
        id,
        username,
        password_hash,
        email,
        name,
        last_name,
        created_at,
        role_id,
        active
)

SELECT
    nu.id,
    nu.username,
    nu.email,
    nu.name,
    nu.last_name,
    nu.created_at,
    nu.role_id,
    nu.active,
    r.name AS role_name
FROM new_user nu
JOIN roles r
    ON r.id = nu.role_id;
        "#,
    )
    .bind(username)
    .bind(password_hash)
    .bind(email)
    .bind(name)
    .bind(last_name)
    .bind(role_id)
    .fetch_one(db)
    .await
}

pub async fn change_password(
    db: &PgPool,
    id: i64,
    password_hash: String,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE users
        SET password_hash = $1
        WHERE id = $2
        "#,
    )
    .bind(password_hash)
    .bind(id)
    .execute(db)
    .await?;

    Ok(())
}

pub async fn set_active(db: &PgPool, id: i64, active: bool) -> Result<UserResponse, sqlx::Error> {
    sqlx::query_as::<_, UserResponse>(
        r#"
        WITH updated_user AS (
            UPDATE users
            SET active = $1
            WHERE id = $2
            RETURNING *
        )

        SELECT
            u.id,
            u.username,
            u.password_hash,
            u.email,
            u.name,
            u.last_name,
            u.created_at,
            u.role_id,
            r.name AS role_name,
            u.active
        FROM updated_user u
        JOIN roles r
            ON r.id = u.role_id
        "#,
    )
    .bind(active)
    .bind(id)
    .fetch_one(db)
    .await
}

pub async fn update(db: &PgPool, id: i64, update: PatchUserRequest) -> ApiResult<UserResponse> {
    Ok(sqlx::query_as::<_, UserResponse>(
        r#"
            WITH updated_user AS (
                UPDATE users
                SET
                    username  = COALESCE($1, username),
                    email      = COALESCE($2, email),
                    name       = COALESCE($3, name),
                    last_name  = COALESCE($4, last_name),
                    role_id    = COALESCE($5, role_id)
                WHERE id = $6
                RETURNING *
            )

            SELECT
                u.id,
                u.username,
                u.password_hash,
                u.email,
                u.name,
                u.last_name,
                u.created_at,
                u.role_id,
                r.name AS role_name,
                u.active
            FROM updated_user u
            JOIN roles r
                ON r.id = u.role_id
            "#,
    )
    .bind(update.username)
    .bind(update.email)
    .bind(update.name)
    .bind(update.last_name)
    .bind(update.role_id)
    .bind(id)
    .fetch_one(db)
    .await?)
}

pub async fn delete(db: &PgPool, id: i64) -> ApiResult<UserResponse> {
    let mut tx = db.begin().await?;

    let user = get_by_id(db, id)
        .await?
        .ok_or(crate::error::api_error::ApiError::NotFound)?;

    sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok(UserResponse {
        id: user.id,
        name: user.name,
        last_name: user.last_name,
        created_at: user.created_at,
        username: user.username,
        role_id: user.role_id,
        role_name: user.role_name,
        active: user.active,
        email: user.email,
    })
}
