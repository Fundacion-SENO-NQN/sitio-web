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
    fn test_generate_token_claims() {
        let secret = "test_secret";
        let user_id = 123;
        let auth_version = 2;

        let before = Utc::now();
        let token = generate_token(user_id, auth_version, secret).unwrap();

        let mut validation = Validation::default();
        validation.validate_exp = false;
        validation.required_spec_claims.clear();

        let decoded = decode::<Claims>(
            &token,
            &DecodingKey::from_secret(secret.as_bytes()),
            &validation,
        ).unwrap();

        assert_eq!(decoded.claims.sub, user_id);
        assert_eq!(decoded.claims.auth_version, auth_version);

        let expected_exp = (before + Duration::days(30)).timestamp() as usize;
        let exp_diff = (decoded.claims.exp as i64) - (expected_exp as i64);
        assert!(exp_diff.abs() <= 5);
    }

    #[test]
    fn jwt_versions_and_legacy_sessions() {
        let secret = uuid::Uuid::new_v4().to_string();
        let token = generate_token(42, 3, &secret).unwrap();
        let claims = validate_token(&token, &secret).unwrap();
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
        assert_eq!(validate_token(&token, &secret).unwrap().auth_version, 0);
    }
}
