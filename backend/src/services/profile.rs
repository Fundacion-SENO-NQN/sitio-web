use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};

#[derive(Default)]
pub struct ProfileService {
    attempts: Mutex<HashMap<i64, (Instant, u8)>>,
}

impl ProfileService {
    // Authenticated password checks: 5 attempts/minute/account/process.
    // Expired entries and a hard cap keep memory bounded.
    pub fn allow_change(&self, user_id: i64) -> bool {
        let now = Instant::now();
        let Ok(mut attempts) = self.attempts.lock() else {
            return false;
        };
        attempts.retain(|_, (start, _)| now.duration_since(*start) < Duration::from_secs(60));
        if attempts.len() >= 4096 && !attempts.contains_key(&user_id) {
            return false;
        }
        let (_, count) = attempts.entry(user_id).or_insert((now, 0));
        if *count >= 5 {
            return false;
        }
        *count += 1;
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn password_attempts_are_limited_per_account() {
        let limiter = ProfileService::default();
        for _ in 0..5 {
            assert!(limiter.allow_change(1));
        }
        assert!(!limiter.allow_change(1));
        assert!(limiter.allow_change(2));
        limiter.attempts.lock().unwrap().get_mut(&1).unwrap().0 -= Duration::from_secs(61);
        assert!(limiter.allow_change(1));
    }
}
