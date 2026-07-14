use crate::models::news::News;
use std::fs;

pub fn get_all_news() -> Result<Vec<News>, String> {
    let json = fs::read_to_string("../../frontend/src/data/noticia/noticia.json").map_err(|e| e.to_string())?;
    let news: Vec<News> = serde_json::from_str(&json).map_err(|e| e.to_string())?;

    Ok(news)
}
