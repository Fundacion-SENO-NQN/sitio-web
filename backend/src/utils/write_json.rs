use std::{fs, path::Path};
use serde::Serialize;

pub fn write_json<T, P>(
    route: P,
    data: &[T],
) -> Result<(), Box<dyn std::error::Error>>
where
    T: Serialize,
    P: AsRef<Path>,
{
    let json = serde_json::to_string_pretty(data)?;
    fs::write(route, json)?;
    Ok(())
}