use std::{env, path::PathBuf};

pub fn path_team_img(id: i64) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let mut route = PathBuf::from(env::var("ROUTE_TO_PUBLIC")?);
    route.push("img_equipo");
    route.push(format!("{id}.avif"));
    Ok(route)
}
