use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use validator::Validate;

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum TipoVoluntariado {
    VoluntariadoGeneral,
    VoluntariadoUniversitario,
}

impl TipoVoluntariado {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::VoluntariadoGeneral => "voluntariado-general",
            Self::VoluntariadoUniversitario => "voluntariado-universitario",
        }
    }

    pub fn display_name(self) -> &'static str {
        match self {
            Self::VoluntariadoGeneral => "Voluntariado general",
            Self::VoluntariadoUniversitario => "Voluntariado por materia o actividad universitaria",
        }
    }
}

#[derive(Debug, Clone, Deserialize, Validate)]
pub struct CreateSolicitudVoluntariado {
    #[validate(length(
        min = 2,
        max = 80,
        message = "El nombre debe tener entre 2 y 80 caracteres"
    ))]
    pub nombre: String,

    #[validate(length(
        min = 2,
        max = 80,
        message = "El apellido debe tener entre 2 y 80 caracteres"
    ))]
    pub apellido: String,

    #[validate(length(
        min = 2,
        max = 100,
        message = "La localidad debe tener entre 2 y 100 caracteres"
    ))]
    pub localidad: String,

    #[validate(
        email(message = "El correo electrónico no es válido"),
        length(max = 150, message = "El correo electrónico es demasiado largo")
    )]
    pub email: String,

    pub tipo: TipoVoluntariado,

    #[validate(length(
        min = 30,
        max = 1500,
        message = "La descripción debe tener entre 30 y 1500 caracteres"
    ))]
    pub descripcion: String,

    pub acepta_contacto: bool,
}

impl CreateSolicitudVoluntariado {
    /// Normalizes the values before performing validation and saving them.
    pub fn normalize(mut self) -> Self {
        self.nombre = normalize_single_line(&self.nombre);
        self.apellido = normalize_single_line(&self.apellido);
        self.localidad = normalize_single_line(&self.localidad);

        self.email = self.email.trim().to_ascii_lowercase();
        self.descripcion = self.descripcion.trim().to_owned();

        self
    }
}

fn normalize_single_line(value: &str) -> String {
    value.split_whitespace().collect::<Vec<&str>>().join(" ")
}

#[derive(Debug, FromRow)]
pub struct SolicitudVoluntariadoCreada {
    pub id: i64,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct SolicitudVoluntariadoResponse {
    pub id: i64,
    pub message: String,
}
