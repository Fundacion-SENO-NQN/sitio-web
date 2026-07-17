use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Noticia {
    pub id: u32,
    pub order: u32,
    pub titulo: String,
    pub fecha: String,
    pub content: String,
}

#[derive(Deserialize)]
pub struct ChangeOrderNoticia {
    pub id: u32,
    pub order: u32,
}
