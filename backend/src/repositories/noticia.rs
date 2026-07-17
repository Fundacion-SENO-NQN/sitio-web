use crate::{
    AppState,
    models::noticia::Noticia,
    utils::{self, noticia::path_news_img, read_json::read_json, write_json::write_json},
};
use axum::{Json, http::StatusCode};
use serde::de::DeserializeOwned;
use std::{env, path::PathBuf};

fn get_route() -> Result<PathBuf, Box<dyn std::error::Error>> {
    let mut route = PathBuf::from(env::var("ROUTE_TO_DATA")?);
    route.push("noticia");
    route.push("noticia.json");
    Ok(route)
}

pub fn get_all<T>(state: &AppState) -> Result<T, Box<dyn std::error::Error>>
where
    T: DeserializeOwned,
{
    let _guard = state.news.read().unwrap();
    Ok(read_json(get_route()?)?)
}

pub fn push(state: &AppState, new: Noticia) -> Result<(), Box<dyn std::error::Error>> {
    let mut news: Vec<Noticia> = get_all(state)?;
    let _guard = state.news.read().unwrap();
    news.push(new);
    write_json(get_route()?, &news)?;
    Ok(())
}

pub fn delete(state: &AppState, id: u32) -> Result<Json<Noticia>, StatusCode> {
    let mut news: Vec<Noticia> = get_all(state).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let _guard = state.news.read().unwrap();
    if let Some(pos) = news.iter().position(|n| n.id == id) {
        let new_deleted = news.remove(pos).clone();
        write_json(
            get_route().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
            &news,
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        utils::image::delete_image(
            path_news_img(id).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
        );
        Ok(Json(new_deleted))
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

pub fn replace_all(state: &AppState, news: Vec<Noticia>) -> Result<(), Box<dyn std::error::Error>> {
    let _guard = state.news.read().unwrap();
    write_json(get_route()?, &news)?;
    Ok(())
}
