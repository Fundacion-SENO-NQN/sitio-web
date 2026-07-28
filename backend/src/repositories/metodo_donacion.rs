use crate::{
    error::api_error::ApiResult,
    models::metodo_donacion::{
        CreateMetodoDonacionRequest, InformacionDonacion, MetodoDonacion, MetodoDonacionResponse,
        PatchMetodoDonacionRequest,
    },
};
use sqlx::PgPool;

async fn load_information(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    metodo_id: i64,
) -> ApiResult<Vec<InformacionDonacion>> {
    Ok(sqlx::query_as::<_, InformacionDonacion>(
        r#"
            SELECT
                id,
                titulo,
                valor,
                created_at,
                metodo_donacion_id
            FROM informacion_donacion
            WHERE metodo_donacion_id = $1
            ORDER BY id
            "#,
    )
    .bind(metodo_id)
    .fetch_all(&mut **tx)
    .await?)
}

pub async fn get_all(db: &PgPool) -> ApiResult<Vec<MetodoDonacionResponse>> {
    let metodos = sqlx::query_as::<_, MetodoDonacion>(
        r#"
        SELECT
            id,
            nombre,
            descripcion,
            created_at
        FROM metodo_donacion
        ORDER BY id
        "#,
    )
    .fetch_all(db)
    .await?;

    let mut result = Vec::new();

    for metodo in metodos {
        let mut tx = db.begin().await?;

        let informacion = load_information(&mut tx, metodo.id).await?;

        tx.commit().await?;

        result.push(MetodoDonacionResponse {
            id: metodo.id,
            nombre: metodo.nombre,
            descripcion: metodo.descripcion,
            created_at: metodo.created_at,
            informacion,
        });
    }

    Ok(result)
}

pub async fn get_by_id(db: &PgPool, id: i64) -> ApiResult<Option<MetodoDonacionResponse>> {
    let metodo = sqlx::query_as::<_, MetodoDonacion>(
        r#"
        SELECT
            id,
            nombre,
            descripcion,
            created_at
        FROM metodo_donacion
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(db)
    .await?;

    let Some(metodo) = metodo else {
        return Ok(None);
    };

    let mut tx = db.begin().await?;

    let informacion = load_information(&mut tx, metodo.id).await?;

    tx.commit().await?;

    Ok(Some(MetodoDonacionResponse {
        id: metodo.id,
        nombre: metodo.nombre,
        descripcion: metodo.descripcion,
        created_at: metodo.created_at,
        informacion,
    }))
}

pub async fn create(
    db: &PgPool,
    request: CreateMetodoDonacionRequest,
) -> ApiResult<MetodoDonacionResponse> {
    let mut tx = db.begin().await?;

    let metodo = sqlx::query_as::<_, MetodoDonacion>(
        r#"
        INSERT INTO metodo_donacion
            (
                nombre,
                descripcion
            )
        VALUES
            ($1,$2)
        RETURNING
            id,
            nombre,
            descripcion,
            created_at
        "#,
    )
    .bind(request.nombre)
    .bind(request.descripcion)
    .fetch_one(&mut *tx)
    .await?;

    let mut informacion = Vec::new();

    for item in request.informacion {
        let info = sqlx::query_as::<_, InformacionDonacion>(
            r#"
            INSERT INTO informacion_donacion
                (
                    titulo,
                    valor,
                    metodo_donacion_id
                )
            VALUES
                ($1,$2,$3)
            RETURNING
                id,
                titulo,
                valor,
                created_at,
                metodo_donacion_id
            "#,
        )
        .bind(item.titulo)
        .bind(item.valor)
        .bind(metodo.id)
        .fetch_one(&mut *tx)
        .await?;

        informacion.push(info);
    }

    tx.commit().await?;

    Ok(MetodoDonacionResponse {
        id: metodo.id,
        nombre: metodo.nombre,
        descripcion: metodo.descripcion,
        created_at: metodo.created_at,
        informacion,
    })
}

pub async fn update(
    db: &PgPool,
    id: i64,
    request: PatchMetodoDonacionRequest,
) -> ApiResult<MetodoDonacionResponse> {
    let mut tx = db.begin().await?;

    let metodo = sqlx::query_as::<_, MetodoDonacion>(
        r#"
        UPDATE metodo_donacion
        SET
            nombre = COALESCE($1,nombre),
            descripcion = COALESCE($2,descripcion)
        WHERE id = $3
        RETURNING
            id,
            nombre,
            descripcion,
            created_at
        "#,
    )
    .bind(request.nombre)
    .bind(request.descripcion)
    .bind(id)
    .fetch_one(&mut *tx)
    .await?;

    if let Some(informacion) = request.informacion {
        let existing: Vec<i64> =
            sqlx::query_scalar("SELECT id FROM informacion_donacion WHERE metodo_donacion_id = $1")
                .bind(id)
                .fetch_all(&mut *tx)
                .await?;

        let mut received = std::collections::HashSet::new();

        for item in informacion {
            match item.id {
                Some(info_id) => {
                    received.insert(info_id);

                    sqlx::query(
                        r#"
                        UPDATE informacion_donacion
                        SET
                            titulo=$1,
                            valor=$2
                        WHERE id=$3
                        "#,
                    )
                    .bind(item.titulo)
                    .bind(item.valor)
                    .bind(info_id)
                    .execute(&mut *tx)
                    .await?;
                }

                None => {
                    sqlx::query(
                        r#"
                        INSERT INTO informacion_donacion
                            (
                                titulo,
                                valor,
                                metodo_donacion_id
                            )
                        VALUES
                            ($1,$2,$3)
                        "#,
                    )
                    .bind(item.titulo)
                    .bind(item.valor)
                    .bind(id)
                    .execute(&mut *tx)
                    .await?;
                }
            }
        }

        for info_id in existing {
            if !received.contains(&info_id) {
                sqlx::query("DELETE FROM informacion_donacion WHERE id = $1")
                    .bind(info_id)
                    .execute(&mut *tx)
                    .await?;
            }
        }
    }

    let informacion = load_information(&mut tx, id).await?;

    tx.commit().await?;

    Ok(MetodoDonacionResponse {
        id: metodo.id,
        nombre: metodo.nombre,
        descripcion: metodo.descripcion,
        created_at: metodo.created_at,
        informacion,
    })
}

pub async fn delete(db: &PgPool, id: i64) -> ApiResult<MetodoDonacionResponse> {
    let mut tx = db.begin().await?;

    let metodo = sqlx::query_as::<_, MetodoDonacion>(
        r#"
        SELECT
            id,
            nombre,
            descripcion,
            created_at
        FROM metodo_donacion
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_one(&mut *tx)
    .await?;

    let informacion = load_information(&mut tx, id).await?;

    sqlx::query("DELETE FROM metodo_donacion WHERE id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok(MetodoDonacionResponse {
        id: metodo.id,
        nombre: metodo.nombre,
        descripcion: metodo.descripcion,
        created_at: metodo.created_at,
        informacion,
    })
}
