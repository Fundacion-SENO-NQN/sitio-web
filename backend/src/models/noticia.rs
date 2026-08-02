use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct Noticia {
    pub id: i64,
    pub created_at: DateTime<Utc>,
    pub fecha: String,
    pub titulo: String,
    pub orden: i64,
    pub contenido: String,
    pub cant_img: i64,
}

#[derive(Debug, Deserialize)]
pub struct ChangeOrderNoticia {
    pub id: i64,
    pub orden: i64,
}

#[derive(Debug, Default)]
pub struct UpdateNoticia {
    pub fecha: Option<String>,
    pub titulo: Option<String>,
    pub contenido: Option<String>,
    pub cant_img: Option<i64>,
}
