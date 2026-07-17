use crate::{
    AppState,
    models::equipo::Equipo,
    utils::{self, equipo::path_team_img, read_json::read_json, write_json::write_json},
};
use axum::{Json, http::StatusCode};
use serde::de::DeserializeOwned;
use std::{env, path::PathBuf};

fn get_route() -> Result<PathBuf, Box<dyn std::error::Error>> {
    let mut route = PathBuf::from(env::var("ROUTE_TO_DATA")?);
    route.push("equipo");
    route.push("equipo.json");
    Ok(route)
}

pub fn get_all<T>(state: &AppState) -> Result<T, Box<dyn std::error::Error>>
where
    T: DeserializeOwned,
{
    let _guard = state.team.read().unwrap();
    Ok(read_json(get_route()?)?)
}

pub fn push(state: &AppState, member: Equipo) -> Result<(), Box<dyn std::error::Error>> {
    let mut team: Vec<Equipo> = get_all(state)?;
    let _guard = state.team.read().unwrap();
    team.push(member);
    write_json(get_route()?, &team)?;
    Ok(())
}

pub fn delete(state: &AppState, id: u32) -> Result<Json<Equipo>, StatusCode> {
    let mut team: Vec<Equipo> = get_all(state).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let _guard = state.team.read().unwrap();
    if let Some(pos) = team.iter().position(|n| n.id == id) {
        let member_deleted = team.remove(pos).clone();
        write_json(
            get_route().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
            &team,
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        utils::image::delete_image(
            path_team_img(id).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
        );
        Ok(Json(member_deleted))
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

pub fn replace_all(state: &AppState, team: Vec<Equipo>) -> Result<(), Box<dyn std::error::Error>> {
    let _guard = state.team.read().unwrap();
    write_json(get_route()?, &team)?;
    Ok(())
}
