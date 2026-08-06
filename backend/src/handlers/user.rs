use crate::{
    AppState,
    auth::{self, auth_user::AuthUser, password::validate_password, services::ADMIN_USERS},
    error::api_error::{ApiError, ApiResult},
    models::{
        role::{CreateRoleRequest, PatchRoleRequest, Role, RoleWithServices},
        service::Service,
        user::{ChangePasswordRequest, CreateUserRequest, PatchUserRequest, UserResponse},
    },
    repositories::{self, user::delete},
};
use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
};
use std::sync::Arc;

pub async fn get_all_users(
    AuthUser(admin): AuthUser,
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<UserResponse>>> {
    admin.require(ADMIN_USERS)?;
    let users = repositories::user::get_all(&state.db)
        .await?
        .into_iter()
        .map(UserResponse::from)
        .collect();
    Ok(Json(users))
}

pub async fn create_user(
    AuthUser(admin): AuthUser,
    State(state): State<Arc<AppState>>,
    Json(request): Json<CreateUserRequest>,
) -> ApiResult<(StatusCode, Json<UserResponse>)> {
    admin.require(ADMIN_USERS)?;

    if validate_password(&request.password).is_err() {
        return Err(validate_password(&request.password).err().unwrap());
    }

    let password_hash = auth::password::hash_password(&request.password)?;

    let user = repositories::user::create(
        &state.db,
        request.username,
        password_hash,
        request.email,
        request.name,
        request.last_name,
        request.role_id,
    )
    .await?;

    Ok((StatusCode::CREATED, Json(user.into())))
}

pub async fn get_user_by_id(
    AuthUser(admin): AuthUser,
    State(state): State<Arc<AppState>>,
    axum::extract::Path(id): axum::extract::Path<i64>,
) -> ApiResult<Json<UserResponse>> {
    admin.require(ADMIN_USERS)?;

    let user = repositories::user::get_by_id(&state.db, id)
        .await?
        .ok_or(crate::error::api_error::ApiError::NotFound)?;

    Ok(Json(user.into()))
}

pub async fn get_user_by_username(
    AuthUser(admin): AuthUser,
    State(state): State<Arc<AppState>>,
    axum::extract::Path(username): axum::extract::Path<String>,
) -> ApiResult<Json<UserResponse>> {
    admin.require(ADMIN_USERS)?;

    let user = repositories::user::get_by_username(&state.db, &username)
        .await?
        .ok_or(crate::error::api_error::ApiError::NotFound)?;

    Ok(Json(user.into()))
}

pub async fn get_user_permissions(
    AuthUser(admin): AuthUser,
    State(state): State<Arc<AppState>>,
    axum::extract::Path(id): axum::extract::Path<i64>,
) -> ApiResult<Json<Vec<Service>>> {
    admin.require(ADMIN_USERS)?;

    let user = repositories::user::get_by_id(&state.db, id)
        .await?
        .ok_or(crate::error::api_error::ApiError::NotFound)?;

    let permissions = repositories::user::get_permissions(&state.db, user.role_id).await?;

    Ok(Json(permissions))
}

pub async fn get_user_permissions_by_username(
    AuthUser(admin): AuthUser,
    State(state): State<Arc<AppState>>,
    axum::extract::Path(username): axum::extract::Path<String>,
) -> ApiResult<Json<Vec<Service>>> {
    admin.require(ADMIN_USERS)?;

    let user = repositories::user::get_by_username(&state.db, &username)
        .await?
        .ok_or(crate::error::api_error::ApiError::NotFound)?;
    let permissions = repositories::user::get_permissions(&state.db, user.role_id).await?;
    Ok(Json(permissions))
}

pub async fn patch_user_active(
    AuthUser(admin): AuthUser,
    State(state): State<Arc<AppState>>,
    axum::extract::Path(id): axum::extract::Path<i64>,
    Json(active): Json<bool>,
) -> ApiResult<(StatusCode, Json<UserResponse>)> {
    admin.require(ADMIN_USERS)?;

    if admin.id == id {
        return Err(ApiError::BadRequest(
            "No se puede cambiar su propio estado".into(),
        ));
    }

    Ok((
        StatusCode::OK,
        Json(
            repositories::user::set_active(&state.db, id, active)
                .await?
                .into(),
        ),
    ))
}

pub async fn patch_user_password(
    AuthUser(admin): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(payload): Json<ChangePasswordRequest>,
) -> ApiResult<(StatusCode, Json<UserResponse>)> {
    admin.require(ADMIN_USERS)?;

    let user = repositories::user::get_by_id(&state.db, id)
        .await?
        .ok_or(ApiError::NotFound)?;

    /*
     * El usuario autenticado solamente puede cambiar
     * su propia contraseña.
     */
    if user.username != admin.username {
        return Err(ApiError::Unauthorized);
    }

    if !user.active {
        return Err(ApiError::BadRequest(
            "No se puede cambiar la contraseña de un usuario desactivado.".into(),
        ));
    }

    let new_password = payload.password;

    validate_password(&new_password)?;

    /*
     * Evita guardar nuevamente la contraseña actual.
     */
    if auth::password::verify_password(&new_password, &user.password_hash) {
        return Err(ApiError::BadRequest(
            "La nueva contraseña debe ser diferente a la actual.".into(),
        ));
    }

    let new_password_hash = auth::password::hash_password(&new_password)?;

    repositories::user::change_password(&state.db, id, new_password_hash).await?;

    Ok((StatusCode::OK, Json(user.into())))
}

pub async fn patch_user(
    AuthUser(admin): AuthUser,
    State(state): State<Arc<AppState>>,
    axum::extract::Path(id): axum::extract::Path<i64>,
    Json(user_update): Json<PatchUserRequest>,
) -> ApiResult<Json<UserResponse>> {
    admin.require(ADMIN_USERS)?;

    Ok(Json(
        repositories::user::update(&state.db, id, user_update)
            .await?
            .into(),
    ))
}

pub async fn get_all_roles(
    AuthUser(admin): AuthUser,
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<Role>>> {
    admin.require(ADMIN_USERS)?;
    let roles = repositories::role::get_all(&state.db)
        .await?
        .into_iter()
        .map(Role::from)
        .collect();
    Ok(Json(roles))
}

pub async fn get_role_with_service_by_id(
    AuthUser(admin): AuthUser,
    State(state): State<Arc<AppState>>,
    axum::extract::Path(id): axum::extract::Path<i64>,
) -> ApiResult<Json<RoleWithServices>> {
    admin.require(ADMIN_USERS)?;

    let role = repositories::role::get_by_id(&state.db, id)
        .await?
        .ok_or(crate::error::api_error::ApiError::NotFound)?;

    Ok(Json(role.into()))
}

pub async fn post_role(
    AuthUser(admin): AuthUser,
    State(state): State<Arc<AppState>>,
    Json(request): Json<CreateRoleRequest>,
) -> ApiResult<Json<RoleWithServices>> {
    admin.require(ADMIN_USERS)?;

    Ok(Json(repositories::role::create(&state.db, request).await?))
}

pub async fn delete_user(
    AuthUser(admin): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> ApiResult<Json<UserResponse>> {
    admin.require(ADMIN_USERS)?;

    let user = delete(&state.db, id).await?;

    Ok(Json(user))
}

pub async fn get_all_roles_with_services(
    AuthUser(admin): AuthUser,
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<RoleWithServices>>> {
    admin.require(ADMIN_USERS)?;

    let roles = repositories::role::get_all_with_services(&state.db).await?;

    Ok(Json(roles))
}

pub async fn patch_role(
    AuthUser(admin): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(request): Json<PatchRoleRequest>,
) -> ApiResult<Json<RoleWithServices>> {
    admin.require(ADMIN_USERS)?;

    Ok(Json(
        repositories::role::update(&state.db, id, request).await?,
    ))
}

pub async fn delete_role(
    AuthUser(admin): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> ApiResult<Json<Role>> {
    admin.require(ADMIN_USERS)?;

    Ok(Json(
        repositories::role::delete(&state.db, id)
            .await?
            .ok_or(crate::error::api_error::ApiError::NotFound)?
            .into(),
    ))
}
