use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    /// user id
    pub sub: i64,

    /// expiration
    pub exp: usize,

    /// Compatibilidad con los JWT anteriores a esta funcionalidad.
    #[serde(default)]
    pub auth_version: i64,
}
