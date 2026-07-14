use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct News {
    pub titulo: String,
    pub fecha: String,
    pub contenido: String,
    pub img: String,
}