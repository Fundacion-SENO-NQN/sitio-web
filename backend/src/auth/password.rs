use crate::error::api_error::{ApiError, ApiResult};
use argon2::{
    Argon2,
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString, rand_core::OsRng},
};

pub fn hash_password(password: &str) -> Result<String, argon2::password_hash::Error> {
    let salt = SaltString::generate(&mut OsRng);

    let hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)?
        .to_string();

    Ok(hash)
}

pub fn verify_password(password: &str, hash: &str) -> bool {
    let parsed = match PasswordHash::new(hash) {
        Ok(h) => h,
        Err(_) => return false,
    };

    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok()
}

pub fn validate_password(password: &str) -> ApiResult<()> {
    if password.chars().count() < 8 {
        return Err(ApiError::BadRequest(
            "La contraseña debe de contener al menos 8 caracteres.".into(),
        ));
    }

    if password.chars().count() > 128 {
        return Err(ApiError::BadRequest("La contraseña es muy larga.".into()));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn password_length_counts_unicode_characters() {
        assert!(validate_password("áááá").is_err());
        assert!(validate_password("áááááááá").is_ok());
        assert!(validate_password(&"🔒".repeat(128)).is_ok());
        assert!(validate_password(&"a".repeat(129)).is_err());
    }
}
