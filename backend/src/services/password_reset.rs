use argon2::password_hash::rand_core::{OsRng, RngCore};
use reqwest::Url;
use sha2::{Digest, Sha256};
use std::{
    collections::VecDeque,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

pub const REQUEST_MESSAGE: &str = "Si los datos corresponden a una cuenta activa, recibirás un enlace en su correo. Revisá también la carpeta de spam.";
pub const INVALID_LINK: &str = "El enlace no es válido o venció. Solicitá uno nuevo.";

pub struct PasswordResetService {
    reset_url: Option<Url>,
    email_slots: Arc<Semaphore>,
    hash_slots: Arc<Semaphore>,
    requests: Mutex<VecDeque<Instant>>,
}

impl PasswordResetService {
    pub fn from_env() -> Result<Self, String> {
        Self::new(std::env::var("PASSWORD_RESET_URL").ok().as_deref())
    }

    pub fn new(value: Option<&str>) -> Result<Self, String> {
        Ok(Self {
            reset_url: value.map(validate_url).transpose()?,
            email_slots: Arc::new(Semaphore::new(4)),
            hash_slots: Arc::new(Semaphore::new(2)),
            requests: Mutex::new(VecDeque::new()),
        })
    }

    pub fn configured(&self) -> bool {
        self.reset_url.is_some()
    }

    // Límite global acotado en memoria; el límite por cuenta vive en PostgreSQL.
    pub fn allow_request(&self) -> bool {
        let now = Instant::now();
        let Ok(mut requests) = self.requests.lock() else {
            return false;
        };
        while requests
            .front()
            .is_some_and(|time| now.duration_since(*time) >= Duration::from_secs(60))
        {
            requests.pop_front();
        }
        if requests.len() >= 30 {
            return false;
        }
        requests.push_back(now);
        true
    }

    pub fn email_slot(&self) -> Option<OwnedSemaphorePermit> {
        self.email_slots.clone().try_acquire_owned().ok()
    }

    pub fn hash_slot(&self) -> Option<OwnedSemaphorePermit> {
        self.hash_slots.clone().try_acquire_owned().ok()
    }

    pub fn link(&self, token: &str) -> Option<String> {
        let mut url = self.reset_url.clone()?;
        // El fragmento no se envía a Cloudflare ni se incluye en el Referer.
        url.set_fragment(Some(&format!("token={token}")));
        Some(url.into())
    }
}

fn validate_url(value: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|_| "PASSWORD_RESET_URL no es una URL válida")?;
    let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    if (url.scheme() != "https" && !(url.scheme() == "http" && local))
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("PASSWORD_RESET_URL debe usar HTTPS (HTTP solo en localhost), sin credenciales, query ni fragmento".into());
    }
    Ok(url)
}

pub fn generate_token() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    OsRng
        .try_fill_bytes(&mut bytes)
        .map_err(|_| "token generation")?;
    Ok(hex::encode(bytes))
}

pub fn token_hash(token: &str) -> Option<String> {
    if token.len() != 64
        || !token
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
    {
        return None;
    }
    Some(hex::encode(Sha256::digest(token.as_bytes())))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn random_tokens_are_hashed_and_malformed_tokens_are_rejected() {
        let first = generate_token().unwrap();
        assert_ne!(first, generate_token().unwrap());
        assert_eq!(first.len(), 64);
        assert_ne!(first, token_hash(&first).unwrap());
        assert!(token_hash("invalid").is_none());
        assert!(token_hash(&"x".repeat(64)).is_none());
    }
    #[test]
    fn reset_url_requires_trusted_scheme_and_places_token_in_fragment() {
        let service =
            PasswordResetService::new(Some("https://fundacionseno.org/login/restablecer/"))
                .unwrap();
        let token = generate_token().unwrap();
        let url = Url::parse(&service.link(&token).unwrap()).unwrap();
        assert_eq!(url.fragment().unwrap(), format!("token={token}"));
        assert!(url.query().is_none());
        for bad in [
            "http://example.org/reset",
            "https://user:pass@example.org/reset",
            "https://example.org/?x=1",
            "https://example.org/#x",
            "javascript:alert(1)",
        ] {
            assert!(PasswordResetService::new(Some(bad)).is_err());
        }
        assert!(
            PasswordResetService::new(Some("http://localhost:4321/login/restablecer/")).is_ok()
        );
        assert!(!PasswordResetService::new(None).unwrap().configured());
    }
    #[test]
    fn public_requests_and_background_jobs_are_bounded() {
        let service = PasswordResetService::new(None).unwrap();
        for _ in 0..30 {
            assert!(service.allow_request());
        }
        assert!(!service.allow_request());
        let permits: Vec<_> = (0..4).map(|_| service.email_slot().unwrap()).collect();
        assert!(service.email_slot().is_none());
        drop(permits);
        assert!(service.email_slot().is_some());
    }
}
