use axum::{extract::Query, response::Redirect};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct TikTokCallback {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
    pub error_description: Option<String>,
}

pub async fn tiktok_callback(Query(params): Query<TikTokCallback>) -> Redirect {
    println!("TikTok callback: {:?}", params);

    Redirect::to("https://fundacionseno.org/")
}
