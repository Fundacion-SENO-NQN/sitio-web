use crate::{
    AppState,
    models::noticia::{ChangeOrderNoticia, Noticia},
    repositories::noticia::replace_all,
    utils,
};
use axum::{
    Json,
    extract::{Multipart, Path, State},
    http::StatusCode,
};
use std::{
    collections::{HashMap, HashSet},
    env,
    path::PathBuf,
    sync::Arc,
};

fn path_news_img(id: u32) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let mut route = PathBuf::from(env::var("ROUTE_TO_IMG")?);
    route.push("img_noticias");
    route.push(format!("{id}"));
    Ok(route)
}

pub async fn get_all_news(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<Noticia>>, StatusCode> {
    Ok(Json(
        crate::repositories::noticia::get_all(state.as_ref())
            .expect("ERR: handlers/noticia.rs -> get_all_news get_all"),
    ))
}

pub async fn get_new_by_id(
    State(state): State<Arc<AppState>>,
    Path(id): Path<u32>,
) -> Result<Json<Noticia>, StatusCode> {
    let news: Vec<Noticia> = crate::repositories::noticia::get_all(state.as_ref())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Some(noticia) = news.iter().find(|n| n.id == id) {
        Ok(Json(noticia.clone()))
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

pub async fn post_create_news(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<Noticia>), StatusCode> {
    let news: Vec<Noticia> = crate::repositories::noticia::get_all(state.as_ref())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let new_id = news.iter().map(|n| n.id).max().unwrap_or(0) + 1;

    let mut titulo = String::new();
    let mut content = String::new();
    let mut order = 0;
    let mut image: Option<Vec<u8>> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?
    {
        let name = field.name().unwrap_or("").to_string();

        match name.as_str() {
            "titulo" => {
                titulo = field.text().await.map_err(|_| StatusCode::BAD_REQUEST)?;
            }
            "content" => {
                content = field.text().await.map_err(|_| StatusCode::BAD_REQUEST)?;
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
        path_news_img(new_id).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
        &image,
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let noticia = Noticia {
        id: new_id,
        titulo,
        content,
        fecha: utils::date_spanish::current_date_spanish(),
        order,
    };

    crate::repositories::noticia::push(state.as_ref(), noticia.clone())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok((StatusCode::CREATED, Json(noticia)))
}

pub async fn change_order_news(
    State(state): State<Arc<AppState>>,
    Json(request): Json<Vec<ChangeOrderNoticia>>,
) -> Result<StatusCode, StatusCode> {
    let mut news: Vec<Noticia> = crate::repositories::noticia::get_all(state.as_ref())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if request.len() != news.len() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let valid_ids: HashSet<u32> = news.iter().map(|n| n.id).collect();

    let mut received_ids = HashSet::new();

    let mut new_orders = HashMap::new();

    for item in &request {
        if !received_ids.insert(item.id) {
            return Err(StatusCode::BAD_REQUEST);
        }

        if !valid_ids.contains(&item.id) {
            return Err(StatusCode::BAD_REQUEST);
        }

        if new_orders.insert(item.id, item.order).is_some() {
            return Err(StatusCode::BAD_REQUEST);
        }
    }

    if received_ids != valid_ids {
        return Err(StatusCode::BAD_REQUEST);
    }

    for noticia in &mut news {
        noticia.order = *new_orders.get(&noticia.id).unwrap();
    }

    news.sort_by_key(|n| n.order);

    crate::repositories::noticia::replace_all(&state, news)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::OK)
}

pub async fn delete_new(
    State(state): State<Arc<AppState>>,
    Path(id): Path<u32>,
) -> Result<Json<Noticia>, StatusCode> {
    let res = crate::repositories::noticia::delete(state.as_ref(), id);
    if res.is_ok() {
        Ok(res.unwrap())
    } else {
        Err(res.unwrap_err())
    }
}

pub async fn patch_news(
    Path(id): Path<u32>,
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> Result<Json<Noticia>, StatusCode> {
    let mut news: Vec<Noticia> = crate::repositories::noticia::get_all(state.as_ref())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut titulo = None;
    let mut content = None;
    let mut order = None;
    let mut image = None;

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

            "content" => {
                content = Some(field.text().await.map_err(|_| StatusCode::BAD_REQUEST)?);
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

    let noticia = news
        .iter_mut()
        .find(|n| n.id == id)
        .ok_or(StatusCode::NOT_FOUND)?;

    if let Some(t) = titulo {
        noticia.titulo = t;
    }

    if let Some(c) = content {
        noticia.content = c;
    }

    if let Some(o) = order {
        noticia.order = o;
    }

    if let Some(img) = image {
        utils::image::save_image(
            path_news_img(id).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
            &img,
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    let resp = noticia.clone();

    replace_all(&state, news).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(resp))
}
