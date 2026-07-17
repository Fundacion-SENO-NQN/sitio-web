use std::{env, path::PathBuf};

pub fn path_news_img(id: u32) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let mut route = PathBuf::from(env::var("ROUTE_TO_IMG")?);
    route.push("img_noticias");
    route.push(format!("{id}"));
    Ok(route)
}
