use axum::{extract::Query, response::Redirect};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct InstagramCallback {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
    pub error_reason: Option<String>,
    pub error_description: Option<String>,
}

pub async fn instagram_callback(Query(params): Query<InstagramCallback>) -> Redirect {
    println!("Instagram OAuth callback: {:?}", params);

    Redirect::to("https://fundacionseno.org/")
}
