use std::{env, path::PathBuf};

pub fn path_team_img(id: u32) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let mut route = PathBuf::from(env::var("ROUTE_TO_IMG")?);
    route.push("img_equipo");
    route.push(format!("{id}"));
    Ok(route)
}
