use axum::Json;

use crate::{models::news::News, services};

pub async fn get_news() -> Json<Vec<News>> {
    let news = services::news::get_news().unwrap();

    Json(news)
}
