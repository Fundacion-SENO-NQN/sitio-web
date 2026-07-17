use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct User {
    pub id: i64,
    pub username: String,
    pub name: String,
    pub last_name: String,
    pub created_at: DateTime<Utc>,
    pub email: String,
    pub password_hash: String,
    pub role_id: i64,
    pub active: bool,
}

#[derive(Deserialize)]
pub struct CreateUser {
    pub username: String,
    pub name: String,
    pub last_name: String,
    pub active: bool,
    pub email: String,
    pub password: String,
    pub role_id: i32,
}

#[derive(Deserialize)]
pub struct UpdateUser {
    pub username: Option<String>,
    pub email: Option<String>,
    pub name: Option<String>,
    pub last_name: Option<String>,
    pub password: Option<String>,
    pub role_id: Option<i32>,
    pub active: Option<bool>,
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct LoginResponse {
    pub token: String,
}
