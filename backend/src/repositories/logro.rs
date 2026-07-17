use crate::{
    AppState,
    models::logro::Logro,
    utils::{self, logro::path_logro_img, read_json::read_json, write_json::write_json},
};
use axum::{Json, http::StatusCode};
use serde::de::DeserializeOwned;
use std::{env, path::PathBuf};

fn get_route() -> Result<PathBuf, Box<dyn std::error::Error>> {
    let mut route = PathBuf::from(env::var("ROUTE_TO_DATA")?);
    route.push("logros");
    route.push("logros.json");
    Ok(route)
}

pub fn get_all<T>(state: &AppState) -> Result<T, Box<dyn std::error::Error>>
where
    T: DeserializeOwned,
{
    let _guard = state.logros.read().unwrap();
    Ok(read_json(get_route()?)?)
}

pub fn push(state: &AppState, logro: Logro) -> Result<(), Box<dyn std::error::Error>> {
    let mut logros: Vec<Logro> = get_all(state)?;
    let _guard = state.logros.read().unwrap();
    logros.push(logro);
    write_json(get_route()?, &logros)?;
    Ok(())
}

pub fn delete(state: &AppState, id: u32) -> Result<Json<Logro>, StatusCode> {
    let mut logros: Vec<Logro> = get_all(state).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let _guard = state.logros.read().unwrap();
    if let Some(pos) = logros.iter().position(|n| n.id == id) {
        let logro_deleted = logros.remove(pos).clone();
        write_json(
            get_route().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
            &logros,
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        utils::image::delete_image(
            path_logro_img(id).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
        );
        Ok(Json(logro_deleted))
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

pub fn replace_all(state: &AppState, logros: Vec<Logro>) -> Result<(), Box<dyn std::error::Error>> {
    let _guard = state.logros.read().unwrap();
    write_json(get_route()?, &logros)?;
    Ok(())
}
