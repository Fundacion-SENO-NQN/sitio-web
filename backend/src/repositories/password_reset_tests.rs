use super::*;
use crate::{
    auth::password,
    repositories::user,
    services::password_reset::{generate_token, token_hash},
};
use sqlx::{AssertSqlSafe, postgres::PgPoolOptions};

fn new_hash() -> String {
    token_hash(&generate_token().unwrap()).unwrap()
}

/// Uses only an explicitly supplied disposable database, never DATABASE_URL.
/// Four connections exercise concurrent redemption on PostgreSQL. PGlite's
/// single-connection protocol can run the same lifecycle with the override.
#[tokio::test]
#[ignore = "requires a disposable PASSWORD_RESET_TEST_DATABASE_URL; see sql/password_reset.md"]
async fn recovery_database_lifecycle() {
    let url = std::env::var("PASSWORD_RESET_TEST_DATABASE_URL")
        .expect("Set PASSWORD_RESET_TEST_DATABASE_URL to a disposable PostgreSQL database");
    let schema = format!("reset_test_{}", uuid::Uuid::new_v4().simple());
    let search_path = schema.clone();
    let connections = std::env::var("PASSWORD_RESET_TEST_CONNECTIONS")
        .ok()
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(4)
        .clamp(1, 4);
    let db = PgPoolOptions::new()
        .max_connections(connections)
        .after_connect(move |conn, _| {
            let search_path = search_path.clone();
            Box::pin(async move {
                sqlx::query("SELECT set_config('search_path', $1, false)")
                    .bind(search_path)
                    .execute(conn)
                    .await?;
                Ok(())
            })
        })
        .connect(&url)
        .await
        .unwrap();
    // These dynamic identifiers contain only a fixed prefix and a generated UUID.
    sqlx::query(AssertSqlSafe(format!("CREATE SCHEMA {schema}")))
        .execute(&db)
        .await
        .unwrap();
    sqlx::query(
        "CREATE TABLE users (
        id bigint PRIMARY KEY, username text NOT NULL, email text NOT NULL,
        active boolean NOT NULL DEFAULT true,
        password_hash text NOT NULL DEFAULT 'old-hash' CHECK (password_hash <> 'reject-test-hash')
    )",
    )
    .execute(&db)
    .await
    .unwrap();
    let migration =
        include_str!("../../sql/password_reset.sql").replace("public.", &format!("{schema}."));
    // Static repository SQL, with only the generated schema substituted.
    for _ in 0..2 {
        sqlx::raw_sql(AssertSqlSafe(migration.as_str()))
            .execute(&db)
            .await
            .unwrap();
    }
    sqlx::query(
        "INSERT INTO users (id, username, email, active) VALUES
        (1, 'ana', 'Ana@example.test', true), (2, 'inactive', 'inactive@example.test', false),
        (3, 'tres', 'duplicate@example.test', true), (4, 'cuatro', 'duplicate@example.test', true)",
    )
    .execute(&db)
    .await
    .unwrap();

    assert_eq!(find_account(&db, "ana").await.unwrap(), Some(1));
    assert_eq!(
        find_account(&db, "ANA@example.test").await.unwrap(),
        Some(1)
    );
    for identifier in ["missing", "inactive", "duplicate@example.test"] {
        assert_eq!(find_account(&db, identifier).await.unwrap(), None);
    }
    assert_eq!(find_account(&db, "tres").await.unwrap(), Some(3));

    let first = new_hash();
    assert!(issue(&db, 1, &first).await.unwrap().is_some());
    assert!(is_valid(&db, &first).await.unwrap());
    assert!(issue(&db, 1, &new_hash()).await.unwrap().is_none());
    assert!(issue(&db, 2, &new_hash()).await.unwrap().is_none());
    sqlx::query("UPDATE password_reset_tokens SET created_at = created_at - interval '2 minutes'")
        .execute(&db)
        .await
        .unwrap();
    let second = new_hash();
    let competing = new_hash();
    let (a, b) = tokio::join!(issue(&db, 1, &second), issue(&db, 1, &competing));
    assert_eq!(
        usize::from(a.unwrap().is_some()) + usize::from(b.unwrap().is_some()),
        1
    );
    sqlx::query("UPDATE password_reset_tokens SET created_at = created_at - interval '2 minutes'")
        .execute(&db)
        .await
        .unwrap();
    assert!(issue(&db, 1, &new_hash()).await.unwrap().is_some());
    sqlx::query("UPDATE password_reset_tokens SET created_at = created_at - interval '2 minutes'")
        .execute(&db)
        .await
        .unwrap();
    assert!(
        issue(&db, 1, &new_hash()).await.unwrap().is_none(),
        "three per hour"
    );

    sqlx::query("UPDATE password_reset_tokens SET expires_at = now() - interval '1 second' WHERE token_hash = $1")
        .bind(&first).execute(&db).await.unwrap();
    assert!(!is_valid(&db, &first).await.unwrap());
    assert!(
        complete(&db, &first, "unused-hash")
            .await
            .unwrap()
            .is_none()
    );
    sqlx::query("UPDATE password_reset_tokens SET expires_at = now() + interval '30 minutes' WHERE token_hash = $1")
        .bind(&first).execute(&db).await.unwrap();
    sqlx::query("UPDATE users SET email = 'changed@example.test' WHERE id = 1")
        .execute(&db)
        .await
        .unwrap();
    assert!(
        !is_valid(&db, &first).await.unwrap(),
        "changed email invalidates the link"
    );
    sqlx::query("UPDATE users SET email = 'Ana@example.test', active = false WHERE id = 1")
        .execute(&db)
        .await
        .unwrap();
    assert!(
        complete(&db, &first, "unused-hash")
            .await
            .unwrap()
            .is_none()
    );
    sqlx::query("UPDATE users SET active = true WHERE id = 1")
        .execute(&db)
        .await
        .unwrap();
    assert!(
        is_valid(&db, &first).await.unwrap(),
        "restored account before rollback test"
    );

    assert!(complete(&db, &first, "reject-test-hash").await.is_err());
    assert!(
        is_valid(&db, &first).await.unwrap(),
        "failed update must not consume a token"
    );
    let hashed = password::hash_password("Una contraseña nueva 47").unwrap();
    let (a, b) = tokio::join!(
        complete(&db, &first, &hashed),
        complete(&db, &first, &hashed)
    );
    assert_eq!(
        usize::from(a.unwrap().is_some()) + usize::from(b.unwrap().is_some()),
        1
    );
    assert!(
        complete(&db, &first, &hashed).await.unwrap().is_none(),
        "single use"
    );
    let (stored, version): (String, i64) =
        sqlx::query_as("SELECT password_hash, auth_version FROM users WHERE id = 1")
            .fetch_one(&db)
            .await
            .unwrap();
    assert!(password::verify_password(
        "Una contraseña nueva 47",
        &stored
    ));
    assert_eq!(version, 1, "previous JWTs have a different auth_version");
    let unused: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM password_reset_tokens WHERE user_id = 1 AND used_at IS NULL",
    )
    .fetch_one(&db)
    .await
    .unwrap();
    assert_eq!(unused, 0);

    let admin_changed = new_hash();
    assert!(issue(&db, 3, &admin_changed).await.unwrap().is_some());
    user::change_password(&db, 3, hashed).await.unwrap();
    assert!(
        !is_valid(&db, &admin_changed).await.unwrap(),
        "admin changes invalidate pending links"
    );
    let undelivered = new_hash();
    assert!(issue(&db, 4, &undelivered).await.unwrap().is_some());
    invalidate(&db, &undelivered).await.unwrap();
    assert!(!is_valid(&db, &undelivered).await.unwrap());
    sqlx::query(AssertSqlSafe(format!("DROP SCHEMA {schema} CASCADE")))
        .execute(&db)
        .await
        .unwrap();
    db.close().await;
}
