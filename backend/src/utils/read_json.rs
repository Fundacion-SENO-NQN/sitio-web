use serde::de::DeserializeOwned;
use std::{fs, path::Path};

pub fn read_json<T, P: AsRef<Path>>(route: P) -> Result<T, Box<dyn std::error::Error>>
where
    T: DeserializeOwned,
{
    let content = fs::read_to_string(route)?;
    let data = serde_json::from_str(&content)?;
    Ok(data)
}
