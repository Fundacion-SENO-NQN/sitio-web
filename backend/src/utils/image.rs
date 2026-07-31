use image::ImageFormat;
use std::{
    fs,
    io::Cursor,
    path::{Path, PathBuf},
};

pub type ImageResult<T> = Result<T, Box<dyn std::error::Error + Send + Sync>>;

pub fn save_image(path: PathBuf, bytes: &[u8]) -> Result<String, Box<dyn std::error::Error>> {
    println!("entre aca");
    ensure_parent_directory(&path)?;
    println!("pase func rara");
    let input_format = image::guess_format(bytes)?;
    println!("input_format: {:?}", input_format);
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
    println!("pase if");
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

pub fn convert_to_avif(bytes: &[u8]) -> ImageResult<Vec<u8>> {
    let input_format = image::guess_format(bytes)?;

    /*
     * Avoid decoding AVIF when the uploaded image is
     * already in the desired format.
     */
    if input_format == ImageFormat::Avif {
        return Ok(bytes.to_vec());
    }

    let image = image::load_from_memory_with_format(bytes, input_format)?;

    let mut output = Cursor::new(Vec::new());

    image.write_to(&mut output, ImageFormat::Avif)?;

    Ok(output.into_inner())
}
