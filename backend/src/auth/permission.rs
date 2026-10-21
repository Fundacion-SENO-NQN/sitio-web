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

    fn create_auth_user_data(permissions: Vec<&str>) -> AuthUserData {
        AuthUserData {
            id: 1,
            auth_version: 1,
            username: "testuser".to_string(),
            role_id: 1,
            permissions: permissions
                .into_iter()
                .enumerate()
                .map(|(i, name)| Service {
                    id: i as i64,
                    name: name.to_string(),
                    titulo: format!("Title for {}", name),
                    url: format!("/url/{}", name),
                    created_at: Utc::now(),
                })
                .collect(),
        }
    }

    #[test]
    fn test_has_permission() {
        let user = create_auth_user_data(vec!["perm1", "perm2"]);
        assert!(user.has_permission("perm1"));
        assert!(user.has_permission("perm2"));
        assert!(!user.has_permission("perm3"));
    }

    #[test]
    fn test_require() {
        let user = create_auth_user_data(vec!["perm1"]);
        assert!(user.require("perm1").is_ok());
        assert!(matches!(user.require("perm2"), Err(ApiError::Forbidden)));
    }

    #[test]
    fn test_require_any() {
        let user = create_auth_user_data(vec!["perm1", "perm2"]);
        assert!(user.require_any(&["perm1", "perm3"]).is_ok());
        assert!(user.require_any(&["perm2", "perm3"]).is_ok());
        assert!(user.require_any(&["perm1", "perm2"]).is_ok());
        assert!(matches!(user.require_any(&["perm3", "perm4"]), Err(ApiError::Forbidden)));
        assert!(matches!(user.require_any(&[]), Err(ApiError::Forbidden)));
    }

    #[test]
    fn test_require_all() {
        let user = create_auth_user_data(vec!["perm1", "perm2"]);
        assert!(user.require_all(&["perm1"]).is_ok());
        assert!(user.require_all(&["perm1", "perm2"]).is_ok());
        assert!(user.require_all(&[]).is_ok()); // Requires nothing, so it should be Ok
        assert!(matches!(user.require_all(&["perm1", "perm3"]), Err(ApiError::Forbidden)));
        assert!(matches!(user.require_all(&["perm3", "perm4"]), Err(ApiError::Forbidden)));
    }
}
