use crate::{
    AppState,
    models::logro::{ChangeOrderLogro, Logro},
    repositories::logro::replace_all,
    utils::{self, logro::path_logro_img},
};
use axum::{
    Json,
    extract::{Multipart, Path, State},
    http::StatusCode,
};
use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};

pub async fn get_all_logros(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<Logro>>, StatusCode> {
    Ok(Json(
        crate::repositories::logro::get_all(state.as_ref())
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
    ))
}

pub async fn get_logro_by_id(
    State(state): State<Arc<AppState>>,
    Path(id): Path<u32>,
) -> Result<Json<Logro>, StatusCode> {
    let logros: Vec<Logro> = crate::repositories::logro::get_all(state.as_ref())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Some(logro) = logros.iter().find(|n| n.id == id) {
        Ok(Json(logro.clone()))
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

pub async fn post_create_logros(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<Logro>), StatusCode> {
    let logros: Vec<Logro> = crate::repositories::logro::get_all(state.as_ref())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let logro_id = logros.iter().map(|n| n.id).max().unwrap_or(0) + 1;

    let mut titulo = String::new();
    let mut contenido = String::new();
    let mut image: Option<Vec<u8>> = None;
    let mut order = 0;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?
    {
        let title = field.name().unwrap_or("").to_string();

        match title.as_str() {
            "titulo" => {
                titulo = field.text().await.map_err(|_| StatusCode::BAD_REQUEST)?;
            }
            "contenido" => {
                contenido = field.text().await.map_err(|_| StatusCode::BAD_REQUEST)?;
            }
            "order" => {
                order = field
                    .text()
                    .await
                    .map_err(|_| StatusCode::BAD_REQUEST)?
                    .parse::<u32>()
                    .map_err(|_| StatusCode::BAD_REQUEST)?;
            }
            "image" => {
                image = Some(
                    field
                        .bytes()
                        .await
                        .map_err(|_| StatusCode::BAD_REQUEST)?
                        .to_vec(),
                );
            }
            _ => {}
        }
    }
    let image = image.ok_or(StatusCode::BAD_REQUEST)?;
    utils::image::save_image(
        path_logro_img(logro_id).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
        &image,
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let logro = Logro {
        id: logro_id,
        titulo,
        contenido,
        order,
    };

    crate::repositories::logro::push(state.as_ref(), logro.clone())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok((StatusCode::CREATED, Json(logro)))
}

pub async fn change_order_logros(
    State(state): State<Arc<AppState>>,
    Json(request): Json<Vec<ChangeOrderLogro>>,
) -> Result<StatusCode, StatusCode> {
    let mut logros: Vec<Logro> = crate::repositories::logro::get_all(state.as_ref())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if request.len() != logros.len() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let valid_ids: HashSet<u32> = logros.iter().map(|n| n.id).collect();

    let mut received_ids = HashSet::new();

    let mut logro_orders = HashMap::new();

    for item in &request {
        if !received_ids.insert(item.id) {
            return Err(StatusCode::BAD_REQUEST);
        }

        if !valid_ids.contains(&item.id) {
            return Err(StatusCode::BAD_REQUEST);
        }

        if logro_orders.insert(item.id, item.order).is_some() {
            return Err(StatusCode::BAD_REQUEST);
        }
    }

    if received_ids != valid_ids {
        return Err(StatusCode::BAD_REQUEST);
    }

    for logro in &mut logros {
        logro.order = *logro_orders.get(&logro.id).unwrap();
    }

    logros.sort_by_key(|n| n.order);

    crate::repositories::logro::replace_all(&state, logros)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::OK)
}

pub async fn delete_logro(
    State(state): State<Arc<AppState>>,
    Path(id): Path<u32>,
) -> Result<Json<Logro>, StatusCode> {
    let res = crate::repositories::logro::delete(state.as_ref(), id);
    if res.is_ok() {
        Ok(res.unwrap())
    } else {
        Err(res.unwrap_err())
    }
}

pub async fn patch_logros(
    Path(id): Path<u32>,
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> Result<Json<Logro>, StatusCode> {
    let mut logros: Vec<Logro> = crate::repositories::logro::get_all(state.as_ref())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut titulo = None;
    let mut contenido = None;
    let mut image: Option<Vec<u8>> = None;
    let mut order = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?
    {
        let name = field.name().unwrap_or("");

        match name {
            "titulo" => {
                titulo = Some(field.text().await.map_err(|_| StatusCode::BAD_REQUEST)?);
            }
            "contenido" => {
                contenido = Some(field.text().await.map_err(|_| StatusCode::BAD_REQUEST)?);
            }
            "order" => {
                order = Some(
                    field
                        .text()
                        .await
                        .map_err(|_| StatusCode::BAD_REQUEST)?
                        .parse::<u32>()
                        .map_err(|_| StatusCode::BAD_REQUEST)?,
                );
            }
            "image" => {
                image = Some(
                    field
                        .bytes()
                        .await
                        .map_err(|_| StatusCode::BAD_REQUEST)?
                        .to_vec(),
                );
            }
            _ => {}
        }
    }

    let logro = logros
        .iter_mut()
        .find(|n| n.id == id)
        .ok_or(StatusCode::NOT_FOUND)?;

    if let Some(t) = titulo {
        logro.titulo = t;
    }

    if let Some(c) = contenido {
        logro.contenido = c;
    }

    if let Some(o) = order {
        logro.order = o;
    }

    if let Some(img) = image {
        utils::image::save_image(
            path_logro_img(id).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
            &img,
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    let resp = logro.clone();

    replace_all(&state, logros).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(resp))
}
