use std::{env, path::PathBuf};

pub fn path_news_img(id: i64) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let mut route = PathBuf::from(env::var("ROUTE_TO_PUBLIC")?);
    route.push("img_noticias");
    route.push(format!("{id}"));
    Ok(route)
}
