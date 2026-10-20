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

    #[test]
    fn verify_password_correct_password_matches_hash() {
        let password = "MySecurePassword123!";
        let hash = hash_password(password).unwrap();
        assert!(verify_password(password, &hash));
    }

    #[test]
    fn verify_password_incorrect_password_fails() {
        let password = "MySecurePassword123!";
        let wrong_password = "WrongPassword123!";
        let hash = hash_password(password).unwrap();
        assert!(!verify_password(wrong_password, &hash));
    }

    #[test]
    fn verify_password_malformed_hash_returns_false() {
        let password = "MySecurePassword123!";
        let malformed_hash = "not_a_valid_hash";
        assert!(!verify_password(password, malformed_hash));
    }

    #[test]
    fn verify_password_fails_against_hash_of_another_password() {
        let password_1 = "PasswordOne";
        let password_2 = "PasswordTwo";
        let hash_2 = hash_password(password_2).unwrap();
        assert!(!verify_password(password_1, &hash_2));
    }
}
