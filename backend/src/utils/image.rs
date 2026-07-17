use std::{fs, path::PathBuf};

pub fn save_image(path: PathBuf, bytes: &[u8]) -> Result<String, Box<dyn std::error::Error>> {
    let img = image::load_from_memory(bytes)?;

    img.save(path.clone())
        .expect("ERR: utils/image.rs -> save_image save");

    Ok(path
        .to_str()
        .expect("utils/image.rs -> save_image to_str")
        .to_string())
}

pub fn delete_image(image_path: PathBuf) {
    if let Err(err) = fs::remove_file(image_path.clone()) {
        eprintln!("Couldn't delete image '{:?}': {}", image_path, err);
    }
}
