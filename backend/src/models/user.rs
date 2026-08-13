use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct User {
    pub id: i64,
    pub username: String,
    pub password_hash: String,
    pub email: String,
    pub name: String,
    pub last_name: String,
    pub created_at: DateTime<Utc>,
    pub role_id: i64,
    pub role_name: String,
    pub active: bool,
}

#[derive(Debug, Deserialize)]
pub struct CreateUserRequest {
    pub username: String,
    pub password: String,
    pub email: String,
    pub name: String,
    pub last_name: String,
    pub role_id: i64,
}

#[derive(Debug, Deserialize)]
pub struct PatchUserRequest {
    pub username: Option<String>,
    pub email: Option<String>,
    pub name: Option<String>,
    pub last_name: Option<String>,
    pub role_id: Option<i64>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct UserResponse {
    pub id: i64,
    pub username: String,
    pub email: String,
    pub name: String,
    pub last_name: String,
    pub role_name: String,
    pub role_id: i64,
    pub active: bool,
    pub created_at: DateTime<Utc>,
}

impl From<User> for UserResponse {
    fn from(user: User) -> Self {
        Self {
            id: user.id,
            username: user.username,
            email: user.email,
            name: user.name,
            last_name: user.last_name,
            role_name: user.role_name,
            role_id: user.role_id,
            active: user.active,
            created_at: user.created_at,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub username: String,
    pub name: String,
    pub last_name: String,
    pub role_name: String,
}

#[derive(Debug, Deserialize)]
pub struct ChangePasswordRequest {
    pub password: String,
}
