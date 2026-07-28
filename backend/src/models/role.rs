use crate::models::service::Service;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Role {
    pub id: i64,
    pub name: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct RoleRow {
    pub role_id: i64,
    pub role_name: String,
    pub role_created_at: DateTime<Utc>,

    pub service_id: Option<i64>,
    pub service_name: Option<String>,
    pub service_titulo: Option<String>,
    pub service_url: Option<String>,
    pub service_created_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize)]
pub struct RoleWithServices {
    pub id: i64,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub services: Vec<Service>,
}

#[derive(Debug, Deserialize)]
pub struct CreateRoleRequest {
    pub name: String,
    pub service_ids: Vec<i64>,
}

#[derive(Debug, Deserialize)]
pub struct PatchRoleRequest {
    pub name: Option<String>,
    pub service_ids: Option<Vec<i64>>,
}
