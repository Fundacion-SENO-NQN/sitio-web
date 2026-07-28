use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct Noticia {
    pub id: i64,
    pub orden: i64,
    pub titulo: String,
    pub fecha: String,
    pub contenido: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Deserialize)]
pub struct ChangeOrderNoticia {
    pub id: i64,
    pub orden: i64,
}

pub struct UpdateNoticia {
    pub titulo: Option<String>,
    pub contenido: Option<String>,
    pub orden: Option<i64>,
}
