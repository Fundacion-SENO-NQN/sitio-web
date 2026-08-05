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
    let UpdateEvento {
        titulo,
        descripcion,
        lugar,
        fecha,
        horario,
        cant_img,
        url: url_patch,
    } = update;

    let has_event_changes = titulo.is_some()
        || descripcion.is_some()
        || lugar.is_some()
        || fecha.is_some()
        || horario.is_some()
        || cant_img.is_some();

    let has_url_changes = url_patch.is_some();

    if !has_event_changes && !has_url_changes {
        return Err(ApiError::BadRequest(
            "No se enviaron cambios para actualizar el evento.".into(),
        ));
    }

    let mut tx = db.begin().await?;

    /*
     * fetch_optional returns Option<Option<i64>>:
     *
     * Outer Option:
     *   Whether the event exists.
     *
     * Inner Option:
     *   Whether the event has a URL relation.
     *
     * After ok_or(), current_url_id is Option<i64>.
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

    /* ======================================================
       URL
    ====================================================== */

    match url_patch {
        None => {}

        Some(UrlEventoPatch::Clear) => {
            /*
             * Detach the URL first. With the current
             * ON DELETE CASCADE relationship, deleting the
             * URL before this could delete the event.
             */
            if current_url_id.is_some() {
                let result = sqlx::query(
                    r#"
                    UPDATE eventos
                    SET url_id = NULL
                    WHERE id = $1
                    "#,
                )
                .bind(id)
                .execute(&mut *tx)
                .await?;

                if result.rows_affected() != 1 {
                    return Err(ApiError::NotFound);
                }
            }

            if let Some(url_id) = current_url_id {
                /*
                 * The NOT EXISTS condition prevents deleting
                 * the URL row if another event references it.
                 */
                sqlx::query(
                    r#"
                    DELETE FROM url_eventos AS u
                    WHERE
                        u.id = $1
                        AND NOT EXISTS (
                            SELECT 1
                            FROM eventos AS e
                            WHERE e.url_id = u.id
                        )
                    "#,
                )
                .bind(url_id)
                .execute(&mut *tx)
                .await?;
            }
        }

        Some(UrlEventoPatch::Update {
            url: new_url,
            titulo: new_url_title,
        }) => {
            if new_url.is_none() && new_url_title.is_none() {
                return Err(ApiError::BadRequest(
                    "No se enviaron cambios para el enlace del evento.".into(),
                ));
            }

            match current_url_id {
                Some(url_id) => {
                    /*
                     * new_url_title is Option<Option<String>>:
                     *
                     * None:
                     *   Preserve the current title.
                     *
                     * Some(None):
                     *   Set the title to NULL.
                     *
                     * Some(Some(value)):
                     *   Replace the title.
                     */
                    let title_was_sent = new_url_title.is_some();
                    let title_value = new_url_title.flatten();

                    let result = sqlx::query(
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
                    .bind(new_url)
                    .bind(title_was_sent)
                    .bind(title_value)
                    .bind(url_id)
                    .execute(&mut *tx)
                    .await?;

                    if result.rows_affected() != 1 {
                        return Err(ApiError::NotFound);
                    }
                }

                None => {
                    /*
                     * A new URL relation cannot be created
                     * without the actual URL.
                     */
                    let new_url = new_url.ok_or_else(|| {
                        ApiError::BadRequest(
                            "Debe proporcionar una URL para crear el enlace.".into(),
                        )
                    })?;

                    let new_url_title = new_url_title.flatten();

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
                    .bind(new_url_title)
                    .fetch_one(&mut *tx)
                    .await?;

                    let result = sqlx::query(
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

                    if result.rows_affected() != 1 {
                        return Err(ApiError::NotFound);
                    }
                }
            }
        }
    }

    /* ======================================================
       EVENT FIELDS
    ====================================================== */

    if has_event_changes {
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

                descripcion = COALESCE(
                    $2,
                    descripcion
                ),

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

                cant_img = COALESCE(
                    $9,
                    cant_img
                )
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
    }

    /* ======================================================
       RESPONSE
    ====================================================== */

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
        FROM eventos AS e
        LEFT JOIN url_eventos AS u
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

    /*
     * Eliminar primero el evento libera su posición.
     *
     * Ejemplo:
     *
     * Antes: 0, 1, 2, 3
     * Eliminar orden 1
     * Queda: 0, 2, 3
     *
     * Después:
     * 2 -> 1
     * 3 -> 2
     *
     * Como se actualiza en orden ascendente, cada evento
     * utiliza la posición que acaba de quedar libre.
     */
    let delete_result = sqlx::query(
        r#"
        DELETE FROM eventos
        WHERE id = $1
        "#,
    )
    .bind(id)
    .execute(&mut *tx)
    .await?;

    if delete_result.rows_affected() != 1 {
        return Err(ApiError::NotFound);
    }

    let following_events = sqlx::query_as::<_, (i64, i64)>(
        r#"
        SELECT
            id,
            orden
        FROM eventos
        WHERE orden > $1
        ORDER BY orden ASC
        FOR UPDATE
        "#,
    )
    .bind(evento.orden)
    .fetch_all(&mut *tx)
    .await?;

    /*
     * No se requieren valores temporales negativos ni
     * positivos: la eliminación ya creó un espacio libre.
     */
    for (following_id, previous_order) in following_events {
        let update_result = sqlx::query(
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

        if update_result.rows_affected() != 1 {
            return Err(ApiError::NotFound);
        }
    }

    /*
     * El evento ya fue eliminado, por lo que su URL dejó
     * de estar referenciada.
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
     * Obtain a value greater than every current order.
     * Temporary values remain positive, so they respect:
     *
     *     CHECK (orden >= 0)
     *
     * and do not conflict with existing unique values.
     */
    let max_order: i64 = sqlx::query_scalar(
        r#"
        SELECT COALESCE(MAX(orden), 0)
        FROM eventos
        "#,
    )
    .fetch_one(&mut *tx)
    .await?;

    let temporary_base = max_order + 1;

    /*
     * First move every affected event to a unique temporary
     * positive position.
     */
    for (index, evento) in order.iter().enumerate() {
        let temporary_order = temporary_base + index as i64;

        let result = sqlx::query(
            r#"
            UPDATE eventos
            SET orden = $1
            WHERE id = $2
            "#,
        )
        .bind(temporary_order)
        .bind(evento.id)
        .execute(&mut *tx)
        .await?;

        if result.rows_affected() != 1 {
            return Err(ApiError::NotFound);
        }
    }

    /*
     * Once the original positions are free, assign the final
     * requested orders.
     */
    for evento in &order {
        let result = sqlx::query(
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

        if result.rows_affected() != 1 {
            return Err(ApiError::NotFound);
        }
    }

    tx.commit().await?;

    Ok(())
}
