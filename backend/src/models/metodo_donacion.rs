use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct MetodoDonacion {
    pub id: i64,
    pub nombre: String,
    pub descripcion: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct InformacionDonacion {
    pub id: i64,
    pub titulo: String,
    pub valor: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MetodoDonacionResponse {
    pub id: i64,
    pub nombre: String,
    pub descripcion: String,
    pub created_at: DateTime<Utc>,
    pub informacion: Vec<InformacionDonacion>,
}

#[derive(Debug, Deserialize)]
pub struct CreateMetodoDonacionRequest {
    pub nombre: String,
    pub descripcion: String,
    pub informacion: Vec<CreateInformacionDonacionRequest>,
}

#[derive(Debug, Deserialize)]
pub struct CreateInformacionDonacionRequest {
    pub titulo: String,
    pub valor: String,
}

#[derive(Debug, Deserialize)]
pub struct PatchMetodoDonacionRequest {
    pub nombre: Option<String>,
    pub descripcion: Option<String>,
    pub informacion: Option<Vec<PatchInformacionDonacionRequest>>,
}

#[derive(Debug, Deserialize)]
pub struct PatchInformacionDonacionRequest {
    pub id: Option<i64>,
    pub titulo: String,
    pub valor: String,
}
