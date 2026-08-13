use chrono::{DateTime, Utc};

use serde::{Deserialize, Serialize};

/* ==========================================================
   EVENT RESPONSE
========================================================== */

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Evento {
    pub id: i64,
    pub created_at: DateTime<Utc>,

    pub titulo: String,
    pub descripcion: String,
    pub orden: i64,

    pub lugar: Option<String>,
    pub fecha: Option<String>,
    pub horario: Option<String>,

    pub cant_img: i64,

    pub url_id: Option<i64>,
    pub url: Option<String>,
    pub url_titulo: Option<String>,
}

/* ==========================================================
   URL INPUT
========================================================== */

#[derive(Debug, Clone)]
pub struct UrlEventoInput {
    pub url: String,
    pub titulo: Option<String>,
}

/* ==========================================================
   URL PATCH
========================================================== */

#[derive(Debug)]
pub enum UrlEventoPatch {
    /*
     * Remove the relationship and delete the corresponding
     * url_eventos row.
     */
    Clear,

    /*
     * Update an existing URL or create one if the event
     * currently does not have it.
     *
     * url:
     *   None => keep the existing URL
     *   Some => replace the URL
     *
     * titulo:
     *   None             => keep existing title
     *   Some(None)       => clear the title
     *   Some(Some(text)) => replace the title
     */
    Update {
        url: Option<String>,
        titulo: Option<Option<String>>,
    },
}

/* ==========================================================
   EVENT PATCH
========================================================== */

#[derive(Debug)]
pub struct UpdateEvento {
    pub titulo: Option<String>,
    pub descripcion: Option<String>,

    /*
     * Outer Option:
     *   None => field was not submitted
     *
     * Inner Option:
     *   None => set SQL NULL
     *   Some => set the submitted value
     */
    pub lugar: Option<Option<String>>,
    pub fecha: Option<Option<String>>,
    pub horario: Option<Option<String>>,

    pub cant_img: Option<i64>,

    pub url: Option<UrlEventoPatch>,
}

/* ==========================================================
   ORDER
========================================================== */

#[derive(Debug, Deserialize)]
pub struct ChangeOrderEvento {
    pub id: i64,
    pub orden: i64,
}
