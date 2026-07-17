use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Logro {
    pub id: u32,
    pub order: u32,
    pub titulo: String,
    pub contenido: String,
}

#[derive(Deserialize)]
pub struct ChangeOrderLogro {
    pub id: u32,
    pub order: u32,
}
