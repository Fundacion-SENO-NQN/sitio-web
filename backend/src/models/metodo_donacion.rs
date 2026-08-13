use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

/* ==========================================================
   DATABASE MODELS
========================================================== */

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct MetodoDonacion {
    pub id: i64,
    pub nombre: String,
    pub descripcion: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct InformacionDonacion {
    pub id: i64,
    pub titulo: String,
    pub valor: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/* ==========================================================
   API RESPONSE
========================================================== */

#[derive(Debug, Clone, Serialize)]
pub struct MetodoDonacionResponse {
    pub id: i64,
    pub nombre: String,
    pub descripcion: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub informacion: Vec<InformacionDonacion>,
}

/* ==========================================================
   CREATE
========================================================== */

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

/* ==========================================================
   PATCH
========================================================== */

#[derive(Debug, Deserialize)]
pub struct PatchMetodoDonacionRequest {
    pub nombre: Option<String>,
    pub descripcion: Option<String>,

    /*
     * None:
     * Conservar toda la información actual.
     *
     * Some([]):
     * Eliminar toda la información actual.
     *
     * Some([...]):
     * Sincronizar completamente con esta lista.
     */
    pub informacion: Option<Vec<PatchInformacionDonacionRequest>>,
}

#[derive(Debug, Deserialize)]
pub struct PatchInformacionDonacionRequest {
    /*
     * Con id:
     * Actualizar una fila existente.
     *
     * Sin id:
     * Crear una nueva fila.
     */
    pub id: Option<i64>,
    pub titulo: String,
    pub valor: String,
}
