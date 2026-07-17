use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Equipo {
    pub id: u32,
    pub order: u32,
    pub nombre: String,
    pub apellido: String,
    pub puesto: String,
    pub descripcion: String
}

#[derive(Deserialize)]
pub struct ChangeOrderEquipo {
    pub id: u32,
    pub order: u32,
}
