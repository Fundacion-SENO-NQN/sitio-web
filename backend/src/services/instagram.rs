use aes_gcm::{Aes256Gcm, KeyInit, Nonce, aead::Aead};
use chrono::{DateTime, Duration as ChronoDuration, Utc};
use reqwest::{Client, Url};
use serde::Deserialize;
use sqlx::{PgPool, Row};
use std::{env, time::Duration};
use tokio::time::sleep;
use uuid::Uuid;

#[derive(Clone)]
pub struct InstagramService {
    client: Client,
    app_id: String,
    app_secret: String,
    redirect_uri: String,
    return_uri: String,
    graph: String,
    public_image_url: String,
    key: [u8; 32],
}

#[derive(Deserialize)]
struct Token { access_token: String, expires_in: Option<i64> }
#[derive(Deserialize)]
struct Profile { id: Option<String>, user_id: Option<String>, username: String }
#[derive(Deserialize)]
struct Id { id: String }
#[derive(Deserialize)]
struct Container { status_code: String }

pub struct Connection {
    pub user_id: String,
    pub username: String,
    pub token: String,
    pub expires_at: DateTime<Utc>,
}

pub struct PublishOutcome { pub id: String, pub comments_warning: bool }

impl InstagramService {
    pub fn from_env() -> Result<Self, Box<dyn std::error::Error>> {
        let raw = hex::decode(env::var("SOCIAL_TOKEN_KEY")?)?;
        let key: [u8; 32] = raw.try_into().map_err(|_| "SOCIAL_TOKEN_KEY debe contener 32 bytes en hexadecimal")?;
        let public_image_url = env::var("INSTAGRAM_IMAGE_BASE_URL")?.trim_end_matches('/').to_string();
        if !public_image_url.starts_with("https://") { return Err("INSTAGRAM_IMAGE_BASE_URL debe usar HTTPS".into()); }
        let redirect_uri = env::var("INSTAGRAM_REDIRECT_URI")?;
        let return_uri = env::var("INSTAGRAM_FRONTEND_RETURN_URL")?;
        if !redirect_uri.starts_with("https://") || !return_uri.starts_with("https://") {
            return Err("Los redirects de Instagram deben usar HTTPS".into());
        }
        let version = env::var("INSTAGRAM_API_VERSION").unwrap_or_else(|_| "v26.0".into());
        if !version.starts_with('v') || !version[1..].chars().all(|c| c.is_ascii_digit() || c == '.') {
            return Err("INSTAGRAM_API_VERSION inválida".into());
        }
        Ok(Self {
            client: Client::builder().timeout(Duration::from_secs(30)).build()?,
            app_id: env::var("INSTAGRAM_APP_ID")?, app_secret: env::var("INSTAGRAM_APP_SECRET")?,
            redirect_uri, return_uri, graph: format!("https://graph.instagram.com/{version}"),
            public_image_url, key,
        })
    }

    pub fn return_uri(&self, status: &str) -> String {
        format!("{}?instagram={status}", self.return_uri)
    }

    pub fn image_url(&self, key: &str) -> String {
        format!("{}/{key}", self.public_image_url)
    }

    pub fn authorization_url(&self, state: &str) -> Result<String, String> {
        let mut url = Url::parse("https://www.instagram.com/oauth/authorize").map_err(|e| e.to_string())?;
        url.query_pairs_mut()
            .append_pair("client_id", &self.app_id)
            .append_pair("redirect_uri", &self.redirect_uri)
            .append_pair("response_type", "code")
            .append_pair("scope", "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_comments")
            .append_pair("state", state);
        Ok(url.to_string())
    }

    async fn checked(&self, response: reqwest::Response) -> Result<reqwest::Response, String> {
        if response.status().is_success() { return Ok(response); }
        let code = response.status();
        // Do not log raw responses: Meta may echo credentials or private details.
        Err(format!("Instagram devolvió HTTP {code}"))
    }

    pub async fn exchange(&self, code: &str) -> Result<(String, String, String, DateTime<Utc>), String> {
        let response = self.client.post("https://api.instagram.com/oauth/access_token")
            .form(&[("client_id", self.app_id.as_str()), ("client_secret", self.app_secret.as_str()),
                ("grant_type", "authorization_code"), ("redirect_uri", self.redirect_uri.as_str()), ("code", code)])
            .send().await.map_err(|e| e.to_string())?;
        let short: Token = self.checked(response).await?.json().await.map_err(|e| e.to_string())?;
        let response = self.client.get(format!("{}/access_token", self.graph))
            .query(&[("grant_type", "ig_exchange_token"), ("client_secret", self.app_secret.as_str()),
                ("access_token", short.access_token.as_str())])
            .send().await.map_err(|e| e.to_string())?;
        let long: Token = self.checked(response).await?.json().await.map_err(|e| e.to_string())?;
        let response = self.client.get(format!("{}/me", self.graph))
            .bearer_auth(&long.access_token).query(&[("fields", "user_id,username")])
            .send().await.map_err(|e| e.to_string())?;
        let profile: Profile = self.checked(response).await?.json().await.map_err(|e| e.to_string())?;
        let id = profile.user_id.or(profile.id).ok_or("Instagram no devolvió el ID")?;
        let expires = Utc::now() + ChronoDuration::seconds(long.expires_in.ok_or("Instagram no devolvió la duración del token")?);
        Ok((id, profile.username, long.access_token, expires))
    }

    pub fn encrypt(&self, token: &str) -> Result<String, String> {
        let nonce_bytes = Uuid::new_v4().into_bytes();
        let cipher = Aes256Gcm::new_from_slice(&self.key).map_err(|e| e.to_string())?;
        let ciphertext = cipher.encrypt(Nonce::from_slice(&nonce_bytes[..12]), token.as_bytes()).map_err(|e| e.to_string())?;
        Ok(format!("{}:{}", hex::encode(&nonce_bytes[..12]), hex::encode(ciphertext)))
    }

    fn decrypt(&self, value: &str) -> Result<String, String> {
        let (nonce, ciphertext) = value.split_once(':').ok_or("Token cifrado inválido")?;
        let nonce = hex::decode(nonce).map_err(|e| e.to_string())?;
        let ciphertext = hex::decode(ciphertext).map_err(|e| e.to_string())?;
        let cipher = Aes256Gcm::new_from_slice(&self.key).map_err(|e| e.to_string())?;
        let plain = cipher.decrypt(Nonce::from_slice(&nonce), ciphertext.as_ref()).map_err(|_| "No se pudo descifrar el token")?;
        String::from_utf8(plain).map_err(|e| e.to_string())
    }

    pub async fn connection(&self, db: &PgPool) -> Result<Option<Connection>, String> {
        let row = sqlx::query("SELECT external_user_id, username, access_token_enc, expires_at FROM social_connections WHERE platform = 'instagram'")
            .fetch_optional(db).await.map_err(|e| e.to_string())?;
        let Some(row) = row else { return Ok(None); };
        let mut connection = Connection {
            user_id: row.get("external_user_id"), username: row.get("username"),
            token: self.decrypt(row.get("access_token_enc"))?, expires_at: row.get("expires_at"),
        };
        let now = Utc::now();
        if connection.expires_at <= now { return Err("La conexión de Instagram venció; volvé a conectarla".into()); }
        // A token must be at least 24 hours old to be refreshed.
        if connection.expires_at < now + ChronoDuration::days(7) {
            let response = self.client.get(format!("{}/refresh_access_token", self.graph))
                .query(&[("grant_type", "ig_refresh_token"), ("access_token", connection.token.as_str())])
                .send().await.map_err(|e| e.to_string())?;
            let refreshed: Token = self.checked(response).await?.json().await.map_err(|e| e.to_string())?;
            let encrypted = self.encrypt(&refreshed.access_token)?;
            let expires = now + ChronoDuration::seconds(refreshed.expires_in.ok_or("Falta expires_in")?);
            sqlx::query("UPDATE social_connections SET access_token_enc=$1, expires_at=$2, updated_at=NOW() WHERE platform='instagram' AND access_token_enc=$3")
                .bind(encrypted).bind(expires).bind(row.get::<String, _>("access_token_enc"))
                .execute(db).await.map_err(|e| e.to_string())?;
            connection.token = refreshed.access_token;
            connection.expires_at = expires;
        }
        Ok(Some(connection))
    }

    async fn create(&self, user: &str, token: &str, fields: &[(&str, &str)]) -> Result<String, String> {
        let response = self.client.post(format!("{}/{user}/media", self.graph))
            .bearer_auth(token).form(fields).send().await.map_err(|e| e.to_string())?;
        let id: Id = self.checked(response).await?.json().await.map_err(|e| e.to_string())?;
        Ok(id.id)
    }

    async fn ready(&self, id: &str, token: &str) -> Result<(), String> {
        for _ in 0..30 {
            let response = self.client.get(format!("{}/{id}", self.graph))
                .bearer_auth(token).query(&[("fields", "status_code")])
                .send().await.map_err(|e| e.to_string())?;
            let status: Container = self.checked(response).await?.json().await.map_err(|e| e.to_string())?;
            match status.status_code.as_str() {
                "FINISHED" => return Ok(()),
                "ERROR" | "EXPIRED" => return Err(format!("Instagram no procesó el contenedor: {}", status.status_code)),
                _ => sleep(Duration::from_secs(2)).await,
            }
        }
        Err("Instagram todavía no terminó de procesar la publicación".into())
    }

    pub async fn publish(&self, connection: &Connection, urls: &[String], caption: &str, comments: bool) -> Result<PublishOutcome, String> {
        if urls.is_empty() || urls.len() > 10 { return Err("Instagram requiere entre 1 y 10 fotos".into()); }
        let id = if urls.len() == 1 {
            let id = self.create(&connection.user_id, &connection.token,
                &[("image_url", &urls[0]), ("caption", caption)]).await?;
            self.ready(&id, &connection.token).await?;
            id
        } else {
            let mut children = Vec::new();
            for url in urls {
                let id = self.create(&connection.user_id, &connection.token,
                    &[("image_url", url), ("is_carousel_item", "true")]).await?;
                self.ready(&id, &connection.token).await?;
                children.push(id);
            }
            let joined = children.join(",");
            let id = self.create(&connection.user_id, &connection.token,
                &[("media_type", "CAROUSEL"), ("children", &joined), ("caption", caption)]).await?;
            self.ready(&id, &connection.token).await?;
            id
        };
        let response = self.client.post(format!("{}/{}/media_publish", self.graph, connection.user_id))
            .bearer_auth(&connection.token).form(&[("creation_id", id.as_str())])
            .send().await.map_err(|e| e.to_string())?;
        let published: Id = self.checked(response).await?.json().await.map_err(|e| e.to_string())?;
        let mut comments_warning = false;
        if !comments {
            let response = self.client.post(format!("{}/{}", self.graph, published.id))
                .bearer_auth(&connection.token).form(&[("comment_enabled", "false")])
                .send().await;
            if !response.is_ok_and(|response| response.status().is_success()) { comments_warning = true; }
        }
        Ok(PublishOutcome { id: published.id, comments_warning })
    }
}
