use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Service {
    pub id: i64,
    pub name: String,
    pub titulo: String,
    pub url: String,
    pub created_at: DateTime<Utc>,
}
