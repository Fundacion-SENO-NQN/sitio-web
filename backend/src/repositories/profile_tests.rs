use super::*;
use crate::{auth::password, repositories::user};
use sqlx::{AssertSqlSafe, postgres::PgPoolOptions};

/// Runs in a generated schema of an explicitly supplied disposable database.
#[tokio::test]
#[ignore = "requires PROFILE_TEST_DATABASE_URL; see docs/perfil.md"]
async fn profile_database_lifecycle() {
    let url = std::env::var("PROFILE_TEST_DATABASE_URL")
        .expect("Set a disposable PROFILE_TEST_DATABASE_URL");
    let schema = format!("profile_test_{}", uuid::Uuid::new_v4().simple());
    let search_path = schema.clone();
    let connections = std::env::var("PROFILE_TEST_CONNECTIONS")
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
    sqlx::query(AssertSqlSafe(format!("CREATE SCHEMA {schema}")))
        .execute(&db)
        .await
        .unwrap();
    sqlx::raw_sql(
        "CREATE TABLE roles (id bigint PRIMARY KEY, name text NOT NULL);
        INSERT INTO roles VALUES (1, 'Voluntariado');
        CREATE TABLE users (
            id bigint PRIMARY KEY, username text NOT NULL UNIQUE, email text NOT NULL UNIQUE,
            name text NOT NULL, last_name text NOT NULL, password_hash text NOT NULL,
            role_id bigint NOT NULL REFERENCES roles(id), auth_version bigint NOT NULL DEFAULT 0,
            active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());",
    )
    .execute(&db)
    .await
    .unwrap();
    let old_hash = password::hash_password("old-password").unwrap();
    sqlx::query(
        "INSERT INTO users (id, username, email, name, last_name, password_hash, role_id) VALUES
        (1, 'ana', 'ana@example.org', 'Ana', 'Pérez', $1, 1),
        (2, 'bea', 'bea@example.org', 'Bea', 'Díaz', $1, 1)",
    )
    .bind(&old_hash)
    .execute(&db)
    .await
    .unwrap();
    let current = user::get_by_id(&db, 1).await.unwrap().unwrap();
    let mut request = UpdateProfile {
        username: current.username.clone(),
        email: current.email.clone(),
        name: "Ana María".into(),
        last_name: current.last_name.clone(),
        current_password: "old-password".into(),
    };
    let updated = update(&db, &current, &request).await.unwrap();
    assert_eq!(updated.name, "Ana María");
    assert_eq!(updated.auth_version, 0, "names do not invalidate sessions");
    assert_eq!(updated.role_id, 1);
    assert_eq!(user::get_by_id(&db, 2).await.unwrap().unwrap().name, "Bea");
    request.username = "bea".into();
    assert!(matches!(
        update(&db, &current, &request).await,
        Err(ApiError::Conflict(_))
    ));
    request.username = "ana.nueva".into();
    request.email = "bea@example.org".into();
    assert!(matches!(
        update(&db, &current, &request).await,
        Err(ApiError::Conflict(_))
    ));
    request.email = "nueva@example.org".into();
    let updated = update(&db, &current, &request).await.unwrap();
    assert_eq!(updated.auth_version, 1);
    assert!(matches!(
        update(&db, &current, &request).await,
        Err(ApiError::Unauthorized)
    ));
    assert!(matches!(
        change_password(&db, &current, "stale").await,
        Err(ApiError::Unauthorized)
    ));

    let new_hash = password::hash_password("new-password").unwrap();
    let (first, second) = tokio::join!(
        change_password(&db, &updated, &new_hash),
        change_password(&db, &updated, &new_hash)
    );
    assert_eq!(usize::from(first.is_ok()) + usize::from(second.is_ok()), 1);
    let changed = user::get_by_id(&db, 1).await.unwrap().unwrap();
    assert_eq!(changed.auth_version, 2);
    assert!(password::verify_password(
        "new-password",
        &changed.password_hash
    ));
    assert!(!password::verify_password(
        "old-password",
        &changed.password_hash
    ));
    assert_eq!(
        user::get_by_id(&db, 2)
            .await
            .unwrap()
            .unwrap()
            .password_hash,
        old_hash
    );
    sqlx::query("UPDATE users SET active = false WHERE id = 1")
        .execute(&db)
        .await
        .unwrap();
    assert!(matches!(
        change_password(&db, &changed, "inactive").await,
        Err(ApiError::Unauthorized)
    ));
    assert!(matches!(
        update(&db, &changed, &request).await,
        Err(ApiError::Unauthorized)
    ));

    sqlx::query(AssertSqlSafe(format!("DROP SCHEMA {schema} CASCADE")))
        .execute(&db)
        .await
        .unwrap();
    db.close().await;
}
