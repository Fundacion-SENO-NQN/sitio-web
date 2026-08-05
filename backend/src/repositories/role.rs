use crate::{
    error::api_error::{ApiError, ApiResult},
    models::{
        role::{CreateRoleRequest, PatchRoleRequest, Role, RoleRow, RoleWithServices},
        service::Service,
    },
};
use sqlx::PgPool;
use std::collections::HashMap;

pub async fn get_all(db: &PgPool) -> Result<Vec<Role>, sqlx::Error> {
    sqlx::query_as::<_, Role>(
        r#"
        SELECT * FROM roles
        "#,
    )
    .fetch_all(db)
    .await
}

pub async fn get_all_with_services(db: &PgPool) -> Result<Vec<RoleWithServices>, sqlx::Error> {
    let rows = sqlx::query_as::<_, RoleRow>(
        r#"
        SELECT

    r.id             AS role_id,
    r.name           AS role_name,
    r.created_at     AS role_created_at,

    s.id             AS service_id,
    s.name           AS service_name,
    s.titulo         AS service_titulo,
    s.url            AS service_url,
    s.created_at     AS service_created_at

FROM roles r

LEFT JOIN roles_services rs
    ON rs.id_role = r.id

LEFT JOIN services s
    ON s.id = rs.id_service

ORDER BY
    r.name,
    s.titulo
        "#,
    )
    .fetch_all(db)
    .await?;

    let mut roles: HashMap<i64, RoleWithServices> = HashMap::new();

    for row in rows {
        let role = roles
            .entry(row.role_id)
            .or_insert_with(|| RoleWithServices {
                id: row.role_id,
                name: row.role_name.clone(),
                created_at: row.role_created_at,
                services: Vec::new(),
            });

        if let (Some(id), Some(name), Some(titulo), Some(url), Some(created_at)) = (
            row.service_id,
            row.service_name,
            row.service_titulo,
            row.service_url,
            row.service_created_at,
        ) {
            role.services.push(Service {
                id,
                name,
                titulo,
                url,
                created_at,
            });
        }
    }

    Ok(roles.into_values().collect())
}

pub async fn get_by_id(db: &PgPool, id: i64) -> Result<Option<RoleWithServices>, sqlx::Error> {
    // Get the role
    let role = sqlx::query_as::<_, Role>(
        r#"
        SELECT
            id,
            name,
            created_at
        FROM roles
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(db)
    .await?;

    let Some(role) = role else {
        return Ok(None);
    };

    // Get all services assigned to the role
    let services = sqlx::query_as::<_, Service>(
        r#"
        SELECT
            s.id,
            s.name,
            s.titulo,
            s.url,
            s.created_at
        FROM services s
        INNER JOIN roles_services rs
            ON rs.id_service = s.id
        WHERE rs.id_role = $1
        ORDER BY s.titulo
        "#,
    )
    .bind(id)
    .fetch_all(db)
    .await?;

    Ok(Some(RoleWithServices {
        id: role.id,
        name: role.name,
        created_at: role.created_at,
        services,
    }))
}

pub async fn create(db: &PgPool, request: CreateRoleRequest) -> ApiResult<RoleWithServices> {
    let mut tx = db.begin().await?;

    let role = sqlx::query_as::<_, Role>(
        r#"
        INSERT INTO roles (name)
        VALUES ($1)
        RETURNING *
        "#,
    )
    .bind(&request.name)
    .fetch_one(&mut *tx)
    .await?;

    for service_id in &request.service_id {
        sqlx::query(
            r#"
            INSERT INTO roles_services
            (
                id_role,
                id_service
            )
            VALUES
            (
                $1,
                $2
            )
            "#,
        )
        .bind(role.id)
        .bind(service_id)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok(get_by_id(db, role.id).await?.ok_or(ApiError::NotFound)?)
}

pub async fn update(
    db: &PgPool,
    id: i64,
    request: PatchRoleRequest,
) -> ApiResult<RoleWithServices> {
    let mut tx = db.begin().await?;

    // Update role name
    sqlx::query(
        r#"
        UPDATE roles
        SET
            name = COALESCE($1, name)
        WHERE id = $2
        "#,
    )
    .bind(request.name.as_ref())
    .bind(id)
    .execute(&mut *tx)
    .await?;

    // Replace permissions if provided
    if let Some(service_ids) = request.service_id {
        sqlx::query(
            r#"
            DELETE FROM roles_services
            WHERE id_role = $1
            "#,
        )
        .bind(id)
        .execute(&mut *tx)
        .await?;

        for service_id in service_ids {
            sqlx::query(
                r#"
                INSERT INTO roles_services
                (
                    id_role,
                    id_service
                )
                VALUES
                (
                    $1,
                    $2
                )
                "#,
            )
            .bind(id)
            .bind(service_id)
            .execute(&mut *tx)
            .await?;
        }
    }

    tx.commit().await?;

    Ok(get_by_id(db, id).await?.ok_or(ApiError::NotFound)?)
}

pub async fn delete(db: &PgPool, id: i64) -> Result<Option<Role>, ApiError> {
    let mut tx = db.begin().await?;
    // Check if the role exists
    let exists = sqlx::query_as::<_, Role>(
        r#"
        SELECT *
        FROM roles
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?;

    if exists.is_none() {
        return Err(ApiError::NotFound);
    }

    // Check if any user has this role
    let users: (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(*)
        FROM users
        WHERE role_id = $1
        "#,
    )
    .bind(id)
    .fetch_one(&mut *tx)
    .await?;

    if users.0 > 0 {
        return Err(ApiError::BadRequest(
            "No se puede borrar un rol que es asigado a usuarios.".into(),
        ));
    }

    // Delete relations
    sqlx::query(
        r#"
        DELETE FROM roles_services
        WHERE id_role = $1
        "#,
    )
    .bind(id)
    .execute(&mut *tx)
    .await?;

    // Delete role
    sqlx::query(
        r#"
        DELETE FROM roles
        WHERE id = $1
        "#,
    )
    .bind(id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(exists)
}
