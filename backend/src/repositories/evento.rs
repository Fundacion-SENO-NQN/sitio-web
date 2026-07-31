use crate::{
    error::api_error::{ApiError, ApiResult},
    models::evento::{ChangeOrderEvento, Evento, UpdateEvento, UrlEventoInput, UrlEventoPatch},
};

use sqlx::PgPool;

/* ==========================================================
   GET ALL
========================================================== */

pub async fn get_all(db: &PgPool) -> ApiResult<Vec<Evento>> {
    let eventos = sqlx::query_as::<_, Evento>(
        r#"
        SELECT
            e.id,
            e.created_at,
            e.titulo,
            e.descripcion,
            e.orden,
            e.lugar,
            e.fecha,
            e.horario,
            e.cant_img,
            e.url_id,
            u.url,
            u.titulo AS url_titulo
        FROM eventos e
        LEFT JOIN url_eventos u
            ON u.id = e.url_id
        ORDER BY e.orden
        "#,
    )
    .fetch_all(db)
    .await?;

    Ok(eventos)
}

/* ==========================================================
   GET BY ID
========================================================== */

pub async fn get_by_id(db: &PgPool, id: i64) -> ApiResult<Option<Evento>> {
    let evento = sqlx::query_as::<_, Evento>(
        r#"
        SELECT
            e.id,
            e.created_at,
            e.titulo,
            e.descripcion,
            e.orden,
            e.lugar,
            e.fecha,
            e.horario,
            e.cant_img,
            e.url_id,
            u.url,
            u.titulo AS url_titulo
        FROM eventos e
        LEFT JOIN url_eventos u
            ON u.id = e.url_id
        WHERE e.id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(db)
    .await?;

    Ok(evento)
}

/* ==========================================================
   CREATE
========================================================== */

pub async fn create(
    db: &PgPool,
    titulo: &str,
    descripcion: &str,
    lugar: Option<&str>,
    fecha: Option<&str>,
    horario: Option<&str>,
    cant_img: i64,
    url: Option<UrlEventoInput>,
) -> ApiResult<Evento> {
    let mut tx = db.begin().await?;

    /*
     * Prevent concurrent creations from calculating the
     * same MAX(orden) + 1 value.
     */
    sqlx::query(
        r#"
        LOCK TABLE eventos IN EXCLUSIVE MODE
        "#,
    )
    .execute(&mut *tx)
    .await?;

    let url_id = match url {
        Some(url_data) => {
            let id = sqlx::query_scalar::<_, i64>(
                r#"
                INSERT INTO url_eventos
                (
                    url,
                    titulo
                )
                VALUES
                (
                    $1,
                    $2
                )
                RETURNING id
                "#,
            )
            .bind(url_data.url)
            .bind(url_data.titulo)
            .fetch_one(&mut *tx)
            .await?;

            Some(id)
        }

        None => None,
    };

    let evento_id = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO eventos
        (
            titulo,
            descripcion,
            orden,
            lugar,
            fecha,
            horario,
            cant_img,
            url_id
        )
        SELECT
            $1,
            $2,
            COALESCE(MAX(orden), -1) + 1,
            $3,
            $4,
            $5,
            $6,
            $7
        FROM eventos
        RETURNING id
        "#,
    )
    .bind(titulo)
    .bind(descripcion)
    .bind(lugar)
    .bind(fecha)
    .bind(horario)
    .bind(cant_img)
    .bind(url_id)
    .fetch_one(&mut *tx)
    .await?;

    let evento = sqlx::query_as::<_, Evento>(
        r#"
        SELECT
            e.id,
            e.created_at,
            e.titulo,
            e.descripcion,
            e.orden,
            e.lugar,
            e.fecha,
            e.horario,
            e.cant_img,
            e.url_id,
            u.url,
            u.titulo AS url_titulo
        FROM eventos e
        LEFT JOIN url_eventos u
            ON u.id = e.url_id
        WHERE e.id = $1
        "#,
    )
    .bind(evento_id)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(evento)
}

/* ==========================================================
   UPDATE
========================================================== */

pub async fn update(db: &PgPool, id: i64, update: UpdateEvento) -> ApiResult<Evento> {
    let mut tx = db.begin().await?;

    let UpdateEvento {
        titulo,
        descripcion,
        lugar,
        fecha,
        horario,
        cant_img,
        url,
    } = update;

    /*
     * fetch_optional returns:
     *
     * Option<Option<i64>>
     *
     * Outer Option:
     *   event exists
     *
     * Inner Option:
     *   event has a URL relation
     */
    let current_url_id = sqlx::query_scalar::<_, Option<i64>>(
        r#"
            SELECT url_id
            FROM eventos
            WHERE id = $1
            FOR UPDATE
            "#,
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(ApiError::NotFound)?;

    match url {
        None => {}

        Some(UrlEventoPatch::Clear) => {
            /*
             * Remove the FK first. With ON DELETE CASCADE,
             * deleting url_eventos first would delete the
             * complete event.
             */
            sqlx::query(
                r#"
                UPDATE eventos
                SET url_id = NULL
                WHERE id = $1
                "#,
            )
            .bind(id)
            .execute(&mut *tx)
            .await?;

            if let Some(url_id) = current_url_id {
                sqlx::query(
                    r#"
                    DELETE FROM url_eventos
                    WHERE id = $1
                    "#,
                )
                .bind(url_id)
                .execute(&mut *tx)
                .await?;
            }
        }

        Some(UrlEventoPatch::Update { url, titulo }) => match current_url_id {
            Some(url_id) => {
                let title_was_sent = titulo.is_some();

                let title_value = titulo.flatten();

                sqlx::query(
                    r#"
                        UPDATE url_eventos
                        SET
                            url = COALESCE($1, url),
                            titulo = CASE
                                WHEN $2 THEN $3
                                ELSE titulo
                            END
                        WHERE id = $4
                        "#,
                )
                .bind(url)
                .bind(title_was_sent)
                .bind(title_value)
                .bind(url_id)
                .execute(&mut *tx)
                .await?;
            }

            None => {
                let new_url = url.ok_or_else(|| {
                    ApiError::BadRequest("Debe proporcionar una URL para crear el enlace.".into())
                })?;

                let new_title = titulo.flatten();

                let new_url_id = sqlx::query_scalar::<_, i64>(
                    r#"
                            INSERT INTO url_eventos
                            (
                                url,
                                titulo
                            )
                            VALUES
                            (
                                $1,
                                $2
                            )
                            RETURNING id
                            "#,
                )
                .bind(new_url)
                .bind(new_title)
                .fetch_one(&mut *tx)
                .await?;

                sqlx::query(
                    r#"
                        UPDATE eventos
                        SET url_id = $1
                        WHERE id = $2
                        "#,
                )
                .bind(new_url_id)
                .bind(id)
                .execute(&mut *tx)
                .await?;
            }
        },
    }

    let lugar_was_sent = lugar.is_some();

    let lugar_value = lugar.flatten();

    let fecha_was_sent = fecha.is_some();

    let fecha_value = fecha.flatten();

    let horario_was_sent = horario.is_some();

    let horario_value = horario.flatten();

    let result = sqlx::query(
        r#"
        UPDATE eventos
        SET
            titulo = COALESCE($1, titulo),
            descripcion = COALESCE($2, descripcion),

            lugar = CASE
                WHEN $3 THEN $4
                ELSE lugar
            END,

            fecha = CASE
                WHEN $5 THEN $6
                ELSE fecha
            END,

            horario = CASE
                WHEN $7 THEN $8
                ELSE horario
            END,

            cant_img = COALESCE($9, cant_img)
        WHERE id = $10
        "#,
    )
    .bind(titulo)
    .bind(descripcion)
    .bind(lugar_was_sent)
    .bind(lugar_value)
    .bind(fecha_was_sent)
    .bind(fecha_value)
    .bind(horario_was_sent)
    .bind(horario_value)
    .bind(cant_img)
    .bind(id)
    .execute(&mut *tx)
    .await?;

    if result.rows_affected() != 1 {
        return Err(ApiError::NotFound);
    }

    let evento = sqlx::query_as::<_, Evento>(
        r#"
        SELECT
            e.id,
            e.created_at,
            e.titulo,
            e.descripcion,
            e.orden,
            e.lugar,
            e.fecha,
            e.horario,
            e.cant_img,
            e.url_id,
            u.url,
            u.titulo AS url_titulo
        FROM eventos e
        LEFT JOIN url_eventos u
            ON u.id = e.url_id
        WHERE e.id = $1
        "#,
    )
    .bind(id)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(evento)
}

/* ==========================================================
   DELETE
========================================================== */

pub async fn delete(db: &PgPool, id: i64) -> ApiResult<Evento> {
    let mut tx = db.begin().await?;

    sqlx::query(
        r#"
        LOCK TABLE eventos IN EXCLUSIVE MODE
        "#,
    )
    .execute(&mut *tx)
    .await?;

    let evento = sqlx::query_as::<_, Evento>(
        r#"
        SELECT
            e.id,
            e.created_at,
            e.titulo,
            e.descripcion,
            e.orden,
            e.lugar,
            e.fecha,
            e.horario,
            e.cant_img,
            e.url_id,
            u.url,
            u.titulo AS url_titulo
        FROM eventos e
        LEFT JOIN url_eventos u
            ON u.id = e.url_id
        WHERE e.id = $1
        FOR UPDATE OF e
        "#,
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(ApiError::NotFound)?;

    sqlx::query(
        r#"
        DELETE FROM eventos
        WHERE id = $1
        "#,
    )
    .bind(id)
    .execute(&mut *tx)
    .await?;

    /*
     * Store the existing positions before moving affected
     * events to temporary negative values.
     */
    let following_events = sqlx::query_as::<_, (i64, i64)>(
        r#"
            SELECT
                id,
                orden
            FROM eventos
            WHERE orden > $1
            ORDER BY orden
            "#,
    )
    .bind(evento.orden)
    .fetch_all(&mut *tx)
    .await?;

    for (following_id, _) in &following_events {
        sqlx::query(
            r#"
            UPDATE eventos
            SET orden = -id - 1
            WHERE id = $1
            "#,
        )
        .bind(following_id)
        .execute(&mut *tx)
        .await?;
    }

    for (following_id, previous_order) in following_events {
        sqlx::query(
            r#"
            UPDATE eventos
            SET orden = $1
            WHERE id = $2
            "#,
        )
        .bind(previous_order - 1)
        .bind(following_id)
        .execute(&mut *tx)
        .await?;
    }

    /*
     * The event has already been deleted, so its URL row is
     * no longer referenced.
     */
    if let Some(url_id) = evento.url_id {
        sqlx::query(
            r#"
            DELETE FROM url_eventos
            WHERE id = $1
            "#,
        )
        .bind(url_id)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok(evento)
}

/* ==========================================================
   CHANGE ORDER
========================================================== */

pub async fn change_order(db: &PgPool, order: Vec<ChangeOrderEvento>) -> ApiResult<()> {
    let mut tx = db.begin().await?;

    sqlx::query(
        r#"
        LOCK TABLE eventos IN EXCLUSIVE MODE
        "#,
    )
    .execute(&mut *tx)
    .await?;

    /*
     * Use the row ID for temporary values.
     *
     * Never use:
     *
     *     orden = -new_order
     *
     * because -0 is still 0.
     */
    for evento in &order {
        let result = sqlx::query(
            r#"
            UPDATE eventos
            SET orden = -id - 1
            WHERE id = $1
            "#,
        )
        .bind(evento.id)
        .execute(&mut *tx)
        .await?;

        if result.rows_affected() != 1 {
            return Err(ApiError::NotFound);
        }
    }

    for evento in &order {
        sqlx::query(
            r#"
            UPDATE eventos
            SET orden = $1
            WHERE id = $2
            "#,
        )
        .bind(evento.orden)
        .bind(evento.id)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok(())
}
