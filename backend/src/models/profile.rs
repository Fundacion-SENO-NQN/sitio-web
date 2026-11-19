use crate::error::api_error::{ApiError, ApiResult};
use serde::{Deserialize, Serialize};
use validator::ValidateEmail;

use super::user::UserResponse;

// No id, role, active flag, hash or session version can be supplied by the client.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateProfile {
    pub username: String,
    pub email: String,
    pub name: String,
    pub last_name: String,
    pub current_password: String,
}

impl UpdateProfile {
    pub fn normalize_and_validate(mut self) -> ApiResult<Self> {
        self.username = self.username.trim().to_owned();
        self.email = self.email.trim().to_owned();
        self.name = self.name.trim().to_owned();
        self.last_name = self.last_name.trim().to_owned();
        if !(3..=80).contains(&self.username.chars().count())
            || self
                .username
                .chars()
                .any(|c| c.is_whitespace() || c.is_control())
        {
            return Err(ApiError::BadRequest(
                "El usuario debe tener entre 3 y 80 caracteres, sin espacios.".into(),
            ));
        }
        if self.email.len() > 254 || !self.email.validate_email() {
            return Err(ApiError::BadRequest(
                "Ingresá un correo electrónico válido.".into(),
            ));
        }
        for value in [&self.name, &self.last_name] {
            if value.is_empty()
                || value.chars().count() > 100
                || value.chars().any(char::is_control)
            {
                return Err(ApiError::BadRequest(
                    "El nombre y el apellido deben tener entre 1 y 100 caracteres.".into(),
                ));
            }
        }
        validate_current_password(&self.current_password)?;
        Ok(self)
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdatePassword {
    pub current_password: String,
    pub password: String,
    pub password_confirmation: String,
}

pub fn validate_current_password(value: &str) -> ApiResult<()> {
    // Old accounts may have shorter passwords. Do not trim passwords.
    if value.is_empty() || value.chars().count() > 256 {
        return Err(ApiError::BadRequest("Ingresá tu contraseña actual.".into()));
    }
    Ok(())
}

#[derive(Serialize)]
pub struct ProfileUpdated {
    pub user: UserResponse,
    pub reauthenticate: bool,
}

pub const MAX_PROFILE_SETTINGS_BYTES: usize = 4096;

pub fn validate_profile_settings(value: serde_json::Value) -> ApiResult<serde_json::Value> {
    let Some(map) = value.as_object() else {
        return Err(ApiError::BadRequest(
            "La configuración del perfil debe ser un objeto JSON.".into(),
        ));
    };

    for (key, section) in map {
        if key.is_empty()
            || key.chars().count() > 64
            || key.chars().any(|c| c.is_whitespace() || c.is_control())
        {
            return Err(ApiError::BadRequest(
                "Una de las claves de configuración no es válida.".into(),
            ));
        }

        if !section.is_object() {
            return Err(ApiError::BadRequest(
                "Cada sección de configuración debe ser un objeto JSON.".into(),
            ));
        }
    }

    let serialized = serde_json::to_string(&value).map_err(|_| ApiError::BadRequest(
        "No se pudo procesar la configuración del perfil.".into(),
    ))?;

    if serialized.len() > MAX_PROFILE_SETTINGS_BYTES {
        return Err(ApiError::BadRequest(
            "La configuración del perfil excede el tamaño máximo permitido.".into(),
        ));
    }

    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn profile_settings_validates_object_sections_and_limits() {
        let valid = json!({
            "bingo": {
                "columns": ["nro", "name", "quotes"]
            }
        });
        assert!(validate_profile_settings(valid).is_ok());

        assert!(validate_profile_settings(json!(["not-an-object"])).is_err());
        assert!(validate_profile_settings(json!({"": {}})).is_err());
        assert!(validate_profile_settings(json!({"bad key": {}})).is_err());
        assert!(validate_profile_settings(json!({"bingo": "not-an-object"})).is_err());

        let oversized = json!({
            "bingo": {
                "data": "x".repeat(MAX_PROFILE_SETTINGS_BYTES + 1)
            }
        });
        assert!(validate_profile_settings(oversized).is_err());
    }

    #[test]
    fn profile_rejects_privileged_fields_and_invalid_data() {
        let valid = json!({"username":" ana ","email":"ana@example.org","name":" Ana ",
            "last_name":"Pérez","current_password":" secret "});
        let normalized = serde_json::from_value::<UpdateProfile>(valid.clone())
            .unwrap()
            .normalize_and_validate()
            .unwrap();
        assert_eq!(normalized.username, "ana");
        assert_eq!(normalized.name, "Ana");
        assert_eq!(normalized.current_password, " secret ");
        for field in [
            "id",
            "user_id",
            "role_id",
            "active",
            "auth_version",
            "password_hash",
        ] {
            let mut value = valid.clone();
            value[field] = json!(1);
            assert!(serde_json::from_value::<UpdateProfile>(value).is_err());
        }
        for (field, value) in [
            ("username", "a b"),
            ("email", "invalid"),
            ("name", " "),
            ("current_password", ""),
        ] {
            let mut request = valid.clone();
            request[field] = json!(value);
            assert!(
                serde_json::from_value::<UpdateProfile>(request)
                    .unwrap()
                    .normalize_and_validate()
                    .is_err()
            );
        }
    }
}
