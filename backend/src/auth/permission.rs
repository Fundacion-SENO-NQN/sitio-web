use crate::{auth::auth_user::AuthUserData, error::api_error::ApiError};

impl AuthUserData {
    pub fn has_permission(&self, permission: &str) -> bool {
        self.permissions.iter().any(|p| p.name == permission)
    }

    pub fn require(&self, permission: &str) -> Result<(), ApiError> {
        if self.has_permission(permission) {
            Ok(())
        } else {
            Err(ApiError::Forbidden)
        }
    }

    pub fn require_any(&self, permissions: &[&str]) -> Result<(), ApiError> {
        if permissions.iter().any(|p| self.has_permission(*p)) {
            Ok(())
        } else {
            Err(ApiError::Forbidden)
        }
    }

    pub fn require_all(&self, permissions: &[&str]) -> Result<(), ApiError> {
        if permissions.iter().all(|p| self.has_permission(*p)) {
            Ok(())
        } else {
            Err(ApiError::Forbidden)
        }
    }
}
