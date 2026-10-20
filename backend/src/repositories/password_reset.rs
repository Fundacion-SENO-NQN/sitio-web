use sqlx::{FromRow, PgPool};

#[derive(FromRow)]
pub struct ResetAccount {
    pub id: i64,
    pub email: String,
    pub auth_version: i64,
}

/// No elegir arbitrariamente una cuenta si el correo está duplicado.
pub async fn find_account(db: &PgPool, identifier: &str) -> Result<Option<i64>, sqlx::Error> {
    let ids = sqlx::query_scalar::<_, i64>(
        "SELECT id FROM users WHERE active = true
         AND (username = $1 OR lower(btrim(email)) = lower($1)) LIMIT 2",
    )
    .bind(identifier)
    .fetch_all(db)
    .await?;
    Ok(if ids.len() == 1 { Some(ids[0]) } else { None })
}

/// El bloqueo por usuario comparte los límites entre las máquinas de Fly.
pub async fn issue(
    db: &PgPool,
    user_id: i64,
    token_hash: &str,
) -> Result<Option<ResetAccount>, sqlx::Error> {
    let mut tx = db.begin().await?;
    let account = sqlx::query_as::<_, ResetAccount>(
        "SELECT id, email, auth_version FROM users WHERE id = $1 AND active = true FOR UPDATE",
    )
    .bind(user_id)
    .fetch_optional(&mut *tx)
    .await?;
    let Some(account) = account else {
        tx.rollback().await?;
        return Ok(None);
    };
    // Conservar los intentos recientes, incluso usados, para el límite horario.
    sqlx::query("DELETE FROM password_reset_tokens WHERE user_id = $1 AND created_at < now() - interval '1 day'")
        .bind(user_id).execute(&mut *tx).await?;
    let allowed: bool = sqlx::query_scalar(
        "SELECT count(*) < 3 AND count(*) FILTER
         (WHERE created_at > now() - interval '1 minute') = 0
         FROM password_reset_tokens WHERE user_id = $1 AND created_at > now() - interval '1 hour'",
    )
    .bind(user_id)
    .fetch_one(&mut *tx)
    .await?;
    if !allowed {
        tx.rollback().await?;
        return Ok(None);
    }
    sqlx::query(
        "INSERT INTO password_reset_tokens (token_hash, user_id, email_snapshot, auth_version, expires_at)
         VALUES ($1, $2, $3, $4, now() + interval '30 minutes')",
    ).bind(token_hash).bind(account.id).bind(&account.email).bind(account.auth_version)
        .execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(Some(account))
}

const VALID_TOKEN: &str = "SELECT u.id, u.email, u.auth_version FROM password_reset_tokens t
     JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > clock_timestamp()
     AND u.active = true AND u.auth_version = t.auth_version AND u.email = t.email_snapshot";

pub async fn is_valid(db: &PgPool, token_hash: &str) -> Result<bool, sqlx::Error> {
    Ok(sqlx::query_as::<_, ResetAccount>(VALID_TOKEN)
        .bind(token_hash)
        .fetch_optional(db)
        .await?
        .is_some())
}

/// Cambiar la contraseña y consumir todos los enlaces en una sola transacción.
pub async fn complete(
    db: &PgPool,
    token_hash: &str,
    password_hash: &str,
) -> Result<Option<ResetAccount>, sqlx::Error> {
    let mut tx = db.begin().await?;
    // Bloquear el usuario y volver a comprobar el token DESPUÉS del bloqueo.
    sqlx::query(
        "SELECT u.id FROM users u JOIN password_reset_tokens t ON t.user_id = u.id
         WHERE t.token_hash = $1 FOR UPDATE OF u",
    )
    .bind(token_hash)
    .fetch_optional(&mut *tx)
    .await?;
    let account = sqlx::query_as::<_, ResetAccount>(VALID_TOKEN)
        .bind(token_hash)
        .fetch_optional(&mut *tx)
        .await?;
    let Some(account) = account else {
        tx.rollback().await?;
        return Ok(None);
    };
    let updated = sqlx::query(
        "UPDATE users SET password_hash = $1, auth_version = auth_version + 1 WHERE id = $2",
    )
    .bind(password_hash)
    .bind(account.id)
    .execute(&mut *tx)
    .await;
    if let Err(error) = updated {
        tx.rollback().await?;
        return Err(error);
    }
    sqlx::query(
        "UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL",
    )
    .bind(account.id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Some(account))
}

pub async fn invalidate(db: &PgPool, token_hash: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE password_reset_tokens SET used_at = now() WHERE token_hash = $1")
        .bind(token_hash)
        .execute(db)
        .await?;
    Ok(())
}

#[cfg(test)]
#[path = "password_reset_tests.rs"]
mod tests;
