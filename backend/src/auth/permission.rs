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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::service::Service;
    use chrono::Utc;

    fn mock_service(name: &str) -> Service {
        Service {
            id: 1,
            name: name.to_string(),
            titulo: name.to_string(),
            url: format!("/{}", name),
            created_at: Utc::now(),
        }
    }

    fn mock_auth_user_data(permissions: Vec<&str>) -> AuthUserData {
        AuthUserData {
            id: 1,
            auth_version: 1,
            username: "testuser".to_string(),
            role_id: 1,
            permissions: permissions.into_iter().map(mock_service).collect(),
        }
    }

    #[test]
    fn test_has_permission() {
        let user = mock_auth_user_data(vec!["read", "write"]);
        assert!(user.has_permission("read"));
        assert!(user.has_permission("write"));
        assert!(!user.has_permission("delete"));
    }

    #[test]
    fn test_require() {
        let user = mock_auth_user_data(vec!["read"]);
        assert!(user.require("read").is_ok());
        assert!(matches!(user.require("write"), Err(ApiError::Forbidden)));
    }

    #[test]
    fn test_require_any() {
        let user = mock_auth_user_data(vec!["read", "write"]);
        assert!(user.require_any(&["read", "delete"]).is_ok());
        assert!(user.require_any(&["write"]).is_ok());
        assert!(matches!(user.require_any(&["delete", "admin"]), Err(ApiError::Forbidden)));
        assert!(matches!(user.require_any(&[]), Err(ApiError::Forbidden)));
    }

    #[test]
    fn test_require_all() {
        let user = mock_auth_user_data(vec!["read", "write"]);
        assert!(user.require_all(&["read", "write"]).is_ok());
        assert!(user.require_all(&["read"]).is_ok());
        assert!(matches!(user.require_all(&["read", "delete"]), Err(ApiError::Forbidden)));
        assert!(user.require_all(&[]).is_ok());
    }
}
