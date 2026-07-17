use std::{env, path::PathBuf};

pub fn path_logro_img(id: u32) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let mut route = PathBuf::from(env::var("ROUTE_TO_IMG")?);
    route.push("img_logros");
    route.push(format!("{id}"));
    Ok(route)
}
