use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

/* ==========================================================
   DATABASE MODELS
========================================================== */

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Bingo {
    pub id: i64,
    pub name: String,
    pub last_name: String,
    pub phone: String,
    pub neighborhood: String,
    pub collection_locate: String,
    pub start_month: i16,
    pub collection_date: String,
    pub locality: String,
    pub quote: i16,
    pub created_at: DateTime<Utc>,
    pub nro_bingo: i16,
    pub late_payment_notice: i16,
}

pub struct UpdateBingo {
    pub name: Option<String>,
    pub last_name: Option<String>,
    pub phone: Option<String>,
    pub neighborhood: Option<String>,
    pub collection_locate: Option<String>,
    pub start_month: Option<i16>,
    pub collection_date: Option<String>,
    pub locality: Option<String>,
    pub quote: Option<i16>,
    pub nro_bingo: Option<i16>,
    pub late_payment_notice: Option<i16>,
}

pub struct CreateBingo {
    pub name: String,
    pub last_name: String,
    pub phone: String,
    pub neighborhood: String,
    pub collection_locate: String,
    pub start_month: i16,
    pub collection_date: String,
    pub locality: String,
    pub quote: i16,
    pub nro_bingo: i16,
    pub late_payment_notice: i16,
}
