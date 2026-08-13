use sqlx::{Postgres, Transaction};

/* ==========================================================
   RESERVAR SIGUIENTE POSICIÓN
========================================================== */

/*
 * Reserves the next donation-image position.
 *
 * The update is performed inside the caller's transaction.
 * Therefore:
 *
 * - Concurrent requests cannot reserve the same position.
 * - If the R2 upload fails, rolling back the transaction also
 *   rolls back the index change.
 */
pub async fn reserve_next_slot(
    transaction: &mut Transaction<'_, Postgres>,
) -> Result<i32, sqlx::Error> {
    sqlx::query_scalar::<_, i32>(
        r#"
        UPDATE public.img_donation_state
        SET
            next_index = (next_index + 1) % 10,
            updated_at = clock_timestamp()
        WHERE id = 1
        RETURNING
            (next_index + 9) % 10
        "#,
    )
    .fetch_optional(&mut **transaction)
    .await?
    .ok_or(sqlx::Error::RowNotFound)
}

/* ==========================================================
   CLAVE R2
========================================================== */

pub fn donation_image_key(slot: i32) -> String {
    format!("img_donaciones/{slot}.avif")
}
