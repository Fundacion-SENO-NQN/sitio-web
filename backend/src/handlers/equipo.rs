use crate::{
    AppState,
    models::equipo::{ChangeOrderEquipo, Equipo},
    repositories::equipo::replace_all,
    utils::{self, equipo::path_team_img},
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

pub async fn get_all_team(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<Equipo>>, StatusCode> {
    Ok(Json(
        crate::repositories::equipo::get_all(state.as_ref())
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
    ))
}

pub async fn get_member_by_id(
    State(state): State<Arc<AppState>>,
    Path(id): Path<u32>,
) -> Result<Json<Equipo>, StatusCode> {
    let team: Vec<Equipo> = crate::repositories::equipo::get_all(state.as_ref())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Some(member) = team.iter().find(|n| n.id == id) {
        Ok(Json(member.clone()))
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

pub async fn post_create_team(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<Equipo>), StatusCode> {
    let team: Vec<Equipo> = crate::repositories::equipo::get_all(state.as_ref())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let member_id = team.iter().map(|n| n.id).max().unwrap_or(0) + 1;

    let mut nombre = String::new();
    let mut apellido = String::new();
    let mut puesto = String::new();
    let mut descripcion = String::new();
    let mut image: Option<Vec<u8>> = None;
    let mut order = 0;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?
    {
        let title = field.name().unwrap_or("").to_string();

        match title.as_str() {
            "nombre" => {
                nombre = field.text().await.map_err(|_| StatusCode::BAD_REQUEST)?;
            }
            "apellido" => {
                apellido = field.text().await.map_err(|_| StatusCode::BAD_REQUEST)?;
            }
            "puesto" => {
                puesto = field.text().await.map_err(|_| StatusCode::BAD_REQUEST)?;
            }
            "descripcion" => {
                descripcion = field.text().await.map_err(|_| StatusCode::BAD_REQUEST)?;
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
        path_team_img(member_id).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
        &image,
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let member = Equipo {
        id: member_id,
        nombre,
        apellido,
        puesto,
        descripcion,
        order,
    };

    crate::repositories::equipo::push(state.as_ref(), member.clone())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok((StatusCode::CREATED, Json(member)))
}

pub async fn change_order_team(
    State(state): State<Arc<AppState>>,
    Json(request): Json<Vec<ChangeOrderEquipo>>,
) -> Result<StatusCode, StatusCode> {
    let mut team: Vec<Equipo> = crate::repositories::equipo::get_all(state.as_ref())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if request.len() != team.len() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let valid_ids: HashSet<u32> = team.iter().map(|n| n.id).collect();

    let mut received_ids = HashSet::new();

    let mut member_orders = HashMap::new();

    for item in &request {
        if !received_ids.insert(item.id) {
            return Err(StatusCode::BAD_REQUEST);
        }

        if !valid_ids.contains(&item.id) {
            return Err(StatusCode::BAD_REQUEST);
        }

        if member_orders.insert(item.id, item.order).is_some() {
            return Err(StatusCode::BAD_REQUEST);
        }
    }

    if received_ids != valid_ids {
        return Err(StatusCode::BAD_REQUEST);
    }

    for member in &mut team {
        member.order = *member_orders.get(&member.id).unwrap();
    }

    team.sort_by_key(|n| n.order);

    crate::repositories::equipo::replace_all(&state, team)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::OK)
}

pub async fn delete_member(
    State(state): State<Arc<AppState>>,
    Path(id): Path<u32>,
) -> Result<Json<Equipo>, StatusCode> {
    let res = crate::repositories::equipo::delete(state.as_ref(), id);
    if res.is_ok() {
        Ok(res.unwrap())
    } else {
        Err(res.unwrap_err())
    }
}

pub async fn patch_team(
    Path(id): Path<u32>,
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> Result<Json<Equipo>, StatusCode> {
    let mut team: Vec<Equipo> = crate::repositories::equipo::get_all(state.as_ref())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut nombre = None;
    let mut apellido = None;
    let mut puesto = None;
    let mut descripcion = None;
    let mut image: Option<Vec<u8>> = None;
    let mut order = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?
    {
        let name = field.name().unwrap_or("");

        match name {
            "nombre" => {
                nombre = Some(field.text().await.map_err(|_| StatusCode::BAD_REQUEST)?);
            }
            "apellido" => {
                apellido = Some(field.text().await.map_err(|_| StatusCode::BAD_REQUEST)?);
            }
            "puesto" => {
                puesto = Some(field.text().await.map_err(|_| StatusCode::BAD_REQUEST)?);
            }
            "descripcion" => {
                descripcion = Some(field.text().await.map_err(|_| StatusCode::BAD_REQUEST)?);
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

    let member = team
        .iter_mut()
        .find(|n| n.id == id)
        .ok_or(StatusCode::NOT_FOUND)?;

    if let Some(n) = nombre {
        member.nombre = n;
    }

    if let Some(a) = apellido {
        member.apellido = a;
    }

    if let Some(p) = puesto {
        member.puesto = p;
    }

    if let Some(d) = descripcion {
        member.descripcion = d;
    }

    if let Some(o) = order {
        member.order = o;
    }

    if let Some(img) = image {
        utils::image::save_image(
            path_team_img(id).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
            &img,
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    let resp = member.clone();

    replace_all(&state, team).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(resp))
}
