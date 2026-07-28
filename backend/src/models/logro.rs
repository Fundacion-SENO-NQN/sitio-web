use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Logro {
    pub id: i64,
    pub orden: i64,
    pub titulo: String,
    pub contenido: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateLogro {
    pub orden: Option<i64>,
    pub titulo: Option<String>,
    pub contenido: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ChangeOrderLogro {
    pub id: i64,
    pub orden: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct LogroFav {
    pub id: i64,
    pub logro_id: i64,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateLogroFav {
    pub logro_id: i64,
    pub orden: i64,
}