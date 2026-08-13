use crate::{
    AppState,
    auth::{auth_user::AuthUser, services::ADMIN_METODO_PAGO_DONACION},
    error::api_error::{ApiError, ApiResult},
    models::metodo_donacion::{
        CreateInformacionDonacionRequest, CreateMetodoDonacionRequest, MetodoDonacionResponse,
        PatchInformacionDonacionRequest, PatchMetodoDonacionRequest,
    },
    repositories,
};
use axum::{
    Json,
    extract::{Multipart, Path, State},
    http::StatusCode,
};
use std::{collections::HashSet, path::Path as FilePath, sync::Arc};

const MAX_ICON_SIZE: usize = 512 * 1024;

const MAX_METHOD_NAME_LENGTH: usize = 150;
const MAX_METHOD_DESCRIPTION_LENGTH: usize = 2_000;

const MAX_INFORMATION_TITLE_LENGTH: usize = 100;
const MAX_INFORMATION_VALUE_LENGTH: usize = 500;

/* ==========================================================
   MULTIPART DATA
========================================================== */

#[derive(Default)]
struct MetodoDonacionMultipart {
    nombre: Option<String>,
    descripcion: Option<String>,
    informacion_json: Option<String>,
    icon: Option<Vec<u8>>,
}

/* ==========================================================
   GET ALL
========================================================== */

pub async fn get_all_metodos_donacion(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<MetodoDonacionResponse>>> {
    let metodos = repositories::metodo_donacion::get_all(&state.db).await?;

    Ok(Json(metodos))
}

/* ==========================================================
   GET BY ID
========================================================== */

pub async fn get_metodo_donacion(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> ApiResult<Json<MetodoDonacionResponse>> {
    let metodo = repositories::metodo_donacion::get_by_id(&state.db, id)
        .await?
        .ok_or(ApiError::NotFound)?;

    Ok(Json(metodo))
}

/* ==========================================================
   CREATE
========================================================== */

pub async fn create_metodo_donacion(
    AuthUser(admin): AuthUser,
    State(state): State<Arc<AppState>>,
    multipart: Multipart,
) -> ApiResult<(StatusCode, Json<MetodoDonacionResponse>)> {
    admin.require(ADMIN_METODO_PAGO_DONACION)?;

    let multipart = parse_multipart(multipart).await?;

    let nombre = clean_required_text(
        multipart.nombre,
        "El nombre del método es requerido.",
        MAX_METHOD_NAME_LENGTH,
    )?;

    let descripcion = clean_required_text(
        multipart.descripcion,
        "La descripción del método es requerida.",
        MAX_METHOD_DESCRIPTION_LENGTH,
    )?;

    let informacion_json = multipart
        .informacion_json
        .ok_or_else(|| ApiError::BadRequest("La información del método es requerida.".into()))?;

    let informacion: Vec<CreateInformacionDonacionRequest> =
        serde_json::from_str(&informacion_json).map_err(|error| {
            eprintln!("Invalid donation method information JSON: {error}");

            ApiError::BadRequest("La información del método no es válida.".into())
        })?;

    validate_create_information(&informacion)?;

    let icon = multipart
        .icon
        .ok_or_else(|| ApiError::BadRequest("El ícono SVG del método es requerido.".into()))?;

    let request = CreateMetodoDonacionRequest {
        nombre,
        descripcion,
        informacion,
    };

    /*
     * First create the database record to obtain the ID used
     * in the R2 object key.
     */
    let metodo = repositories::metodo_donacion::create(&state.db, request).await?;

    let icon_key = donation_method_icon_key(metodo.id);

    let upload_result = state
        .r2
        .upload_svg(&icon_key, icon)
        .await
        .map_err(|error| error.to_string());

    if let Err(error_message) = upload_result {
        eprintln!(
            "Could not upload donation method icon {} to R2: {}",
            metodo.id, error_message,
        );

        /*
         * Compensating rollback: remove the database record
         * when the required icon could not be uploaded.
         */
        if let Err(rollback_error) =
            repositories::metodo_donacion::delete(&state.db, metodo.id).await
        {
            eprintln!(
                "Could not roll back donation method {}: {:?}",
                metodo.id, rollback_error,
            );
        }

        return Err(ApiError::InternalServerError);
    }

    Ok((StatusCode::CREATED, Json(metodo)))
}

/* ==========================================================
   PATCH
========================================================== */

pub async fn patch_metodo_donacion(
    AuthUser(admin): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    multipart: Multipart,
) -> ApiResult<Json<MetodoDonacionResponse>> {
    admin.require(ADMIN_METODO_PAGO_DONACION)?;

    /*
     * Confirm that the method exists before processing an
     * optional icon replacement.
     */
    repositories::metodo_donacion::get_by_id(&state.db, id)
        .await?
        .ok_or(ApiError::NotFound)?;

    let multipart = parse_multipart(multipart).await?;

    let nombre = clean_optional_text(
        multipart.nombre,
        "El nombre no puede estar vacío.",
        MAX_METHOD_NAME_LENGTH,
    )?;

    let descripcion = clean_optional_text(
        multipart.descripcion,
        "La descripción no puede estar vacía.",
        MAX_METHOD_DESCRIPTION_LENGTH,
    )?;

    let informacion = match multipart.informacion_json {
        Some(information_json) => {
            let parsed: Vec<PatchInformacionDonacionRequest> =
                serde_json::from_str(&information_json).map_err(|error| {
                    eprintln!(
                        "Invalid donation method patch information: \
                             {error}"
                    );

                    ApiError::BadRequest("La información del método no es válida.".into())
                })?;

            validate_patch_information(&parsed)?;

            Some(parsed)
        }

        None => None,
    };

    let icon = multipart.icon;

    if nombre.is_none() && descripcion.is_none() && informacion.is_none() && icon.is_none() {
        return Err(ApiError::BadRequest("No se enviaron cambios.".into()));
    }

    /*
     * This also updates updated_at for icon-only requests.
     */
    let metodo = repositories::metodo_donacion::update(
        &state.db,
        id,
        PatchMetodoDonacionRequest {
            nombre,
            descripcion,
            informacion,
        },
    )
    .await?;

    if let Some(icon) = icon {
        let icon_key = donation_method_icon_key(metodo.id);

        state
            .r2
            .upload_svg(&icon_key, icon)
            .await
            .map_err(|error| {
                eprintln!(
                    "Could not replace donation method icon {}: {}",
                    metodo.id, error,
                );

                ApiError::InternalServerError
            })?;
    }

    Ok(Json(metodo))
}

/* ==========================================================
   DELETE
========================================================== */

pub async fn delete_metodo_donacion(
    AuthUser(admin): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> ApiResult<Json<MetodoDonacionResponse>> {
    admin.require(ADMIN_METODO_PAGO_DONACION)?;

    let metodo = repositories::metodo_donacion::delete(&state.db, id).await?;

    let icon_key = donation_method_icon_key(metodo.id);

    /*
     * The database deletion remains valid even when R2 is
     * temporarily unavailable. In that case only an orphaned
     * object remains and the public API no longer exposes it.
     */
    if let Err(error) = state.r2.delete_object(&icon_key).await {
        eprintln!(
            "Could not delete R2 icon for donation method {}: {}",
            metodo.id, error,
        );
    }

    Ok(Json(metodo))
}

/* ==========================================================
   MULTIPART PARSER
========================================================== */

async fn parse_multipart(mut multipart: Multipart) -> ApiResult<MetodoDonacionMultipart> {
    let mut result = MetodoDonacionMultipart::default();

    while let Some(field) = multipart.next_field().await.map_err(|error| {
        eprintln!("Invalid donation method multipart body: {error}");

        ApiError::BadRequest("Cuerpo multiparte no válido.".into())
    })? {
        let field_name = field.name().unwrap_or_default().to_string();

        match field_name.as_str() {
            "nombre" => {
                result.nombre = Some(
                    field
                        .text()
                        .await
                        .map_err(|_| ApiError::BadRequest("Nombre inválido.".into()))?,
                );
            }

            "descripcion" => {
                result.descripcion = Some(
                    field
                        .text()
                        .await
                        .map_err(|_| ApiError::BadRequest("Descripción inválida.".into()))?,
                );
            }

            "informacion" => {
                result.informacion_json = Some(
                    field
                        .text()
                        .await
                        .map_err(|_| ApiError::BadRequest("Información inválida.".into()))?,
                );
            }

            "icon" | "icono" => {
                let file_name = field.file_name().map(str::to_string);

                let content_type = field.content_type().map(str::to_string);

                validate_svg_file_metadata(file_name.as_deref(), content_type.as_deref())?;

                let bytes = field
                    .bytes()
                    .await
                    .map_err(|_| ApiError::BadRequest("No se pudo leer el ícono SVG.".into()))?;

                result.icon = Some(sanitize_svg(bytes.as_ref())?);
            }

            _ => {
                /*
                 * Unknown fields are ignored to maintain forward
                 * compatibility with the frontend.
                 */
            }
        }
    }

    Ok(result)
}

/* ==========================================================
   SVG
========================================================== */

fn validate_svg_file_metadata(
    file_name: Option<&str>,
    content_type: Option<&str>,
) -> ApiResult<()> {
    let file_name = file_name
        .ok_or_else(|| ApiError::BadRequest("El ícono debe tener un nombre de archivo.".into()))?;

    let extension = FilePath::new(file_name)
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default();

    if !extension.eq_ignore_ascii_case("svg") {
        return Err(ApiError::BadRequest(
            "El ícono debe estar en formato SVG.".into(),
        ));
    }

    if let Some(content_type) = content_type {
        let mime = content_type.split(';').next().unwrap_or_default().trim();

        if !mime.is_empty() && !mime.eq_ignore_ascii_case("image/svg+xml") {
            return Err(ApiError::BadRequest(
                "El tipo de archivo del ícono no es válido.".into(),
            ));
        }
    }

    Ok(())
}

fn sanitize_svg(bytes: &[u8]) -> ApiResult<Vec<u8>> {
    if bytes.is_empty() {
        return Err(ApiError::BadRequest("El archivo SVG está vacío.".into()));
    }

    if bytes.len() > MAX_ICON_SIZE {
        return Err(ApiError::BadRequest(
            "El ícono SVG no puede superar los 512 KB.".into(),
        ));
    }

    let mut input = bytes;
    let mut output = Vec::new();

    let filter = svg_hush::Filter::new();

    filter.filter(&mut input, &mut output).map_err(|error| {
        eprintln!("Could not sanitize SVG: {error}");

        ApiError::BadRequest(
            "El archivo SVG no es válido o contiene contenido no permitido.".into(),
        )
    })?;

    if output.is_empty() {
        return Err(ApiError::BadRequest(
            "El archivo SVG no contiene una imagen válida.".into(),
        ));
    }

    if output.len() > MAX_ICON_SIZE {
        return Err(ApiError::BadRequest(
            "El SVG procesado supera los 512 KB.".into(),
        ));
    }

    Ok(output)
}

/* ==========================================================
   INFORMATION VALIDATION
========================================================== */

fn validate_create_information(information: &[CreateInformacionDonacionRequest]) -> ApiResult<()> {
    let mut titles = HashSet::new();

    for item in information {
        validate_information_item(&item.titulo, &item.valor, &mut titles)?;
    }

    Ok(())
}

fn validate_patch_information(information: &[PatchInformacionDonacionRequest]) -> ApiResult<()> {
    let mut titles = HashSet::new();
    let mut ids = HashSet::new();

    for item in information {
        if let Some(id) = item.id {
            if id <= 0 {
                return Err(ApiError::BadRequest(
                    "Uno de los datos tiene un id inválido.".into(),
                ));
            }

            if !ids.insert(id) {
                return Err(ApiError::BadRequest(
                    "Hay datos repetidos en la petición.".into(),
                ));
            }
        }

        validate_information_item(&item.titulo, &item.valor, &mut titles)?;
    }

    Ok(())
}

fn validate_information_item(
    title: &str,
    value: &str,
    titles: &mut HashSet<String>,
) -> ApiResult<()> {
    let title = title.trim();
    let value = value.trim();

    if title.is_empty() {
        return Err(ApiError::BadRequest(
            "El título de cada dato es requerido.".into(),
        ));
    }

    if value.is_empty() {
        return Err(ApiError::BadRequest(
            "El valor de cada dato es requerido.".into(),
        ));
    }

    if title.chars().count() > MAX_INFORMATION_TITLE_LENGTH {
        return Err(ApiError::BadRequest(format!(
            "El título de un dato no puede superar los {} caracteres.",
            MAX_INFORMATION_TITLE_LENGTH
        )));
    }

    if value.chars().count() > MAX_INFORMATION_VALUE_LENGTH {
        return Err(ApiError::BadRequest(format!(
            "El valor de un dato no puede superar los {} caracteres.",
            MAX_INFORMATION_VALUE_LENGTH
        )));
    }

    let normalized_title = title.to_lowercase();

    if !titles.insert(normalized_title) {
        return Err(ApiError::BadRequest(format!(
            "El dato “{}” está repetido dentro del método.",
            title
        )));
    }

    Ok(())
}

/* ==========================================================
   TEXT VALIDATION
========================================================== */

fn clean_required_text(
    value: Option<String>,
    required_message: &str,
    maximum_length: usize,
) -> ApiResult<String> {
    let value = value.unwrap_or_default().trim().to_string();

    if value.is_empty() {
        return Err(ApiError::BadRequest(required_message.to_string()));
    }

    if value.chars().count() > maximum_length {
        return Err(ApiError::BadRequest(format!(
            "El campo no puede superar los {} caracteres.",
            maximum_length
        )));
    }

    Ok(value)
}

fn clean_optional_text(
    value: Option<String>,
    empty_message: &str,
    maximum_length: usize,
) -> ApiResult<Option<String>> {
    value
        .map(|value| {
            let value = value.trim().to_string();

            if value.is_empty() {
                return Err(ApiError::BadRequest(empty_message.to_string()));
            }

            if value.chars().count() > maximum_length {
                return Err(ApiError::BadRequest(format!(
                    "El campo no puede superar los {} caracteres.",
                    maximum_length
                )));
            }

            Ok(value)
        })
        .transpose()
}

/* ==========================================================
   R2 KEY
========================================================== */

fn donation_method_icon_key(method_id: i64) -> String {
    format!("img_metodos_donacion/{method_id}.svg")
}
