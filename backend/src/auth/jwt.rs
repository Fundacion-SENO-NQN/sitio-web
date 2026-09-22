use chrono::{Duration, Utc};
use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};

use crate::auth::claims::Claims;

pub fn generate_token(
    user_id: i64,
    auth_version: i64,
    secret: &str,
) -> Result<String, jsonwebtoken::errors::Error> {
    let expiration = Utc::now() + Duration::days(30);

    let claims = Claims {
        sub: user_id,
        auth_version,
        exp: expiration.timestamp() as usize,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
}

pub fn validate_token(token: &str, secret: &str) -> Result<Claims, jsonwebtoken::errors::Error> {
    let data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )?;
    Ok(data.claims)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn jwt_versions_and_legacy_sessions() {
        let secret = "test-only-key-for-jwt-signing";
        let token = generate_token(42, 3, secret).unwrap();
        let claims = validate_token(&token, secret).unwrap();
        assert_eq!(claims.sub, 42);
        assert_eq!(claims.auth_version, 3);
        let old =
            serde_json::json!({"sub": 42, "exp": (Utc::now() + Duration::hours(1)).timestamp()});
        let token = encode(
            &Header::default(),
            &old,
            &EncodingKey::from_secret(secret.as_bytes()),
        )
        .unwrap();
        assert_eq!(validate_token(&token, secret).unwrap().auth_version, 0);
    }
}
