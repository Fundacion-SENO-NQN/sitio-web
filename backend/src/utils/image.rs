use image::ImageFormat;
use std::{
    fs,
    path::{Path, PathBuf},
};

pub fn save_image(path: PathBuf, bytes: &[u8]) -> Result<String, Box<dyn std::error::Error>> {
    ensure_parent_directory(&path)?;

    let input_format = image::guess_format(bytes)?;

    if input_format == ImageFormat::Avif {
        // The uploaded image is already AVIF.
        // Replace the destination directly without decoding it.
        fs::write(&path, bytes)?;
    } else {
        // Decode PNG, JPEG, WebP, etc., and save as the format
        // indicated by the destination extension, normally AVIF.
        let img = image::load_from_memory_with_format(bytes, input_format)?;

        img.save(&path)?;
    }

    Ok(path.to_string_lossy().into_owned())
}

fn ensure_parent_directory(path: &Path) -> Result<(), std::io::Error> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    Ok(())
}

pub fn delete_image(image_path: PathBuf) -> Result<(), Box<dyn std::error::Error>> {
    if let Err(err) = fs::remove_file(image_path.clone()) {
        eprintln!("No se pudo borrar la imagen '{:?}': {}", image_path, err);
        return Err(err.into());
    }
    Ok(())
}
