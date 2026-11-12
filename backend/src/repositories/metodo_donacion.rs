use crate::{
    error::api_error::{ApiError, ApiResult},
    models::metodo_donacion::{
        CreateMetodoDonacionRequest, InformacionDonacion, MetodoDonacion, MetodoDonacionResponse,
        PatchInformacionDonacionRequest, PatchMetodoDonacionRequest,
    },
    repositories::{
        base::{self, Entidad, Ordenamiento},
        tablas::{INFORMACION_DONACION, METODO_DONACION},
    },
};

use sqlx::{AssertSqlSafe, FromRow, PgPool, Postgres, Transaction};

use std::collections::{HashMap, HashSet};

static COLUMNAS_METODO_INSERT: &[&str] = &["nombre", "descripcion"];
static COLUMNAS_METODO_UPDATE: &[&str] = &["nombre", "descripcion"];
static COLUMNAS_INFO_INSERT: &[&str] = &["titulo", "valor", "metodo_donacion_id"];

/* ==========================================================
   PRIVATE INFORMATION ROW
========================================================== */

/*
 * metodo_donacion_id is needed internally to group the
 * information, but it is not exposed in the public response.
 */
#[derive(Debug, FromRow)]
struct InformacionDonacionRow {
    id: i64,
    titulo: String,
    valor: String,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
    metodo_donacion_id: i64,
}

impl Entidad for InformacionDonacionRow {
    const TABLA: &'static crate::models::tabla::Tabla = &INFORMACION_DONACION;
}

impl From<InformacionDonacionRow> for InformacionDonacion {
    fn from(row: InformacionDonacionRow) -> Self {
        Self {
            id: row.id,
            titulo: row.titulo,
            valor: row.valor,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

/* ==========================================================
   GET ALL
========================================================== */

pub async fn get_all(db: &PgPool) -> ApiResult<Vec<MetodoDonacionResponse>> {
    let mut tx = db.begin().await?;

    let metodos =
        base::obtener_todos::<MetodoDonacion>(&mut *tx, Some(Ordenamiento::asc("id"))).await?;

    let information_rows = base::obtener_todos::<InformacionDonacionRow>(
        &mut *tx,
        [
            Ordenamiento::asc("metodo_donacion_id"),
            Ordenamiento::asc("id"),
        ],
    )
    .await?;

    tx.commit().await?;

    let mut information_by_method: HashMap<i64, Vec<InformacionDonacion>> = HashMap::new();

    for row in information_rows {
        information_by_method
            .entry(row.metodo_donacion_id)
            .or_default()
            .push(row.into());
    }

    Ok(metodos
        .into_iter()
        .map(|metodo| {
            let informacion = information_by_method.remove(&metodo.id).unwrap_or_default();

            build_response(metodo, informacion)
        })
        .collect())
}

/* ==========================================================
   GET BY ID
========================================================== */

pub async fn get_by_id(db: &PgPool, id: i64) -> ApiResult<Option<MetodoDonacionResponse>> {
    let mut tx = db.begin().await?;

    let metodo = base::obtener_por_id::<MetodoDonacion>(&mut *tx, id).await?;

    let Some(metodo) = metodo else {
        tx.rollback().await?;

        return Ok(None);
    };

    let informacion = load_information(&mut tx, metodo.id).await?;

    tx.commit().await?;

    Ok(Some(build_response(metodo, informacion)))
}

/* ==========================================================
   CREATE
========================================================== */

pub async fn create(
    db: &PgPool,
    request: CreateMetodoDonacionRequest,
) -> ApiResult<MetodoDonacionResponse> {
    let CreateMetodoDonacionRequest {
        nombre,
        descripcion,
        informacion,
    } = request;

    let mut tx = db.begin().await?;

    let sql_metodo = base::sql_insertar(&METODO_DONACION, COLUMNAS_METODO_INSERT, true)?;

    let metodo = sqlx::query_as::<_, MetodoDonacion>(AssertSqlSafe(sql_metodo))
        .bind(nombre)
        .bind(descripcion)
        .fetch_one(&mut *tx)
        .await?;

    let sql_info = base::sql_insertar(&INFORMACION_DONACION, COLUMNAS_INFO_INSERT, true)?;

    let mut created_information = Vec::with_capacity(informacion.len());

    for item in informacion {
        let created = sqlx::query_as::<_, InformacionDonacion>(AssertSqlSafe(sql_info.clone()))
            .bind(item.titulo)
            .bind(item.valor)
            .bind(metodo.id)
            .fetch_one(&mut *tx)
            .await?;

        created_information.push(created);
    }

    tx.commit().await?;

    Ok(build_response(metodo, created_information))
}

/* ==========================================================
   UPDATE
========================================================== */

pub async fn update(
    db: &PgPool,
    id: i64,
    request: PatchMetodoDonacionRequest,
) -> ApiResult<MetodoDonacionResponse> {
    let PatchMetodoDonacionRequest {
        nombre,
        descripcion,
        informacion,
    } = request;

    let mut tx = db.begin().await?;

    /*
     * updated_at is also changed for icon-only updates.
     *
     * In that case nombre and descripcion are both None,
     * but the handler still calls this function.
     */
    let sql = base::sql_actualizar_coalesce_con_timestamp_por_id(
        &METODO_DONACION,
        COLUMNAS_METODO_UPDATE,
        "updated_at",
        true,
    )?;

    let metodo = sqlx::query_as::<_, MetodoDonacion>(AssertSqlSafe(sql))
        .bind(nombre)
        .bind(descripcion)
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(ApiError::NotFound)?;

    if let Some(informacion) = informacion {
        synchronize_information(&mut tx, metodo.id, informacion).await?;
    }

    let informacion = load_information(&mut tx, metodo.id).await?;

    tx.commit().await?;

    Ok(build_response(metodo, informacion))
}

/* ==========================================================
   DELETE
========================================================== */

pub async fn delete(db: &PgPool, id: i64) -> ApiResult<MetodoDonacionResponse> {
    let mut tx = db.begin().await?;

    let metodo = base::obtener_por_id::<MetodoDonacion>(&mut *tx, id)
        .await?
        .ok_or(ApiError::NotFound)?;

    let informacion = load_information(&mut tx, metodo.id).await?;

    /*
     * informacion_donacion is removed automatically through
     * ON DELETE CASCADE.
     */
    base::eliminar_por_id(&mut *tx, &METODO_DONACION, id).await?;

    tx.commit().await?;

    Ok(build_response(metodo, informacion))
}

/* ==========================================================
   LOAD INFORMATION
========================================================== */

async fn load_information(
    tx: &mut Transaction<'_, Postgres>,
    metodo_id: i64,
) -> ApiResult<Vec<InformacionDonacion>> {
    let rows = base::obtener_donde::<InformacionDonacionRow, _>(
        &mut **tx,
        "metodo_donacion_id",
        metodo_id,
        Some(Ordenamiento::asc("id")),
    )
    .await?;

    Ok(rows.into_iter().map(Into::into).collect())
}

/* ==========================================================
   SYNCHRONIZE INFORMATION
========================================================== */

async fn synchronize_information(
    tx: &mut Transaction<'_, Postgres>,
    metodo_id: i64,
    informacion: Vec<PatchInformacionDonacionRequest>,
) -> ApiResult<()> {
    let existing_ids: HashSet<i64> = sqlx::query_scalar(
        r#"
        SELECT id
        FROM informacion_donacion
        WHERE metodo_donacion_id = $1
        "#,
    )
    .bind(metodo_id)
    .fetch_all(&mut **tx)
    .await?
    .into_iter()
    .collect();

    let mut received_ids = HashSet::new();

    let sql_update_info = base::ConsultaUpdate::en(&INFORMACION_DONACION)
        .asignar("titulo")
        .asignar("valor")
        .asignar_ahora("updated_at")
        .donde_clave_primaria()
        .donde_igual("metodo_donacion_id")
        .construir()?;

    let sql_insert_info = base::sql_insertar(&INFORMACION_DONACION, COLUMNAS_INFO_INSERT, false)?;

    for item in informacion {
        match item.id {
            Some(information_id) => {
                if !received_ids.insert(information_id) {
                    return Err(ApiError::BadRequest(
                        "Hay datos de donación repetidos.".into(),
                    ));
                }

                /*
                 * Prevent an information row belonging to another
                 * payment method from being modified.
                 */
                if !existing_ids.contains(&information_id) {
                    return Err(ApiError::BadRequest(
                        "Uno de los datos no pertenece al método de pago.".into(),
                    ));
                }

                let result = sqlx::query(AssertSqlSafe(sql_update_info.clone()))
                    .bind(item.titulo)
                    .bind(item.valor)
                    .bind(information_id)
                    .bind(metodo_id)
                    .execute(&mut **tx)
                    .await?;

                if result.rows_affected() != 1 {
                    return Err(ApiError::BadRequest(
                        "No se pudo actualizar uno de los datos.".into(),
                    ));
                }
            }

            None => {
                sqlx::query(AssertSqlSafe(sql_insert_info.clone()))
                    .bind(item.titulo)
                    .bind(item.valor)
                    .bind(metodo_id)
                    .execute(&mut **tx)
                    .await?;
            }
        }
    }

    /*
     * Existing rows that were not included in the request
     * are removed.
     */
    for existing_id in existing_ids {
        if received_ids.contains(&existing_id) {
            continue;
        }

        sqlx::query(
            r#"
            DELETE FROM informacion_donacion
            WHERE id = $1
            "#,
        )
        .bind(existing_id)
        .execute(&mut **tx)
        .await?;
    }

    Ok(())
}

/* ==========================================================
   RESPONSE BUILDER
========================================================== */

fn build_response(
    metodo: MetodoDonacion,
    informacion: Vec<InformacionDonacion>,
) -> MetodoDonacionResponse {
    MetodoDonacionResponse {
        id: metodo.id,
        nombre: metodo.nombre,
        descripcion: metodo.descripcion,
        created_at: metodo.created_at,
        updated_at: metodo.updated_at,
        informacion,
    }
}
