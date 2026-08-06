use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Clone, Deserialize, Debug, sqlx::FromRow)]
pub struct Equipo {
    pub id: i64,
    pub orden: i64,
    pub nombre: String,
    pub apellido: String,
    pub puesto: String,
    pub descripcion: String,
    pub created_at: DateTime<Utc>,
}

pub struct UpdateEquipo {
    pub orden: Option<i64>,
    pub nombre: Option<String>,
    pub apellido: Option<String>,
    pub puesto: Option<String>,
    pub descripcion: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct ChangeOrderEquipo {
    pub id: i64,
    pub orden: i64,
}
