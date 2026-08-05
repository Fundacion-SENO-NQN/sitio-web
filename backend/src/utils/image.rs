use image::{
    ExtendedColorType, GenericImageView, ImageEncoder, ImageError, ImageFormat,
    codecs::avif::AvifEncoder, imageops::FilterType,
};
use std::{
    fs,
    path::{Path, PathBuf},
};

pub type ImageResult<T> = Result<T, Box<dyn std::error::Error + Send + Sync>>;

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

const MAX_IMAGE_DIMENSION: u32 = 1280;
const AVIF_SPEED: u8 = 10;
const AVIF_QUALITY: u8 = 70;

pub fn convert_to_avif(bytes: &[u8]) -> Result<Vec<u8>, ImageError> {
    let input_format = image::guess_format(bytes)?;

    if input_format == ImageFormat::Avif {
        return Ok(bytes.to_vec());
    }

    let original = image::load_from_memory(bytes)?;

    let (original_width, original_height) = original.dimensions();

    let image = if original_width > MAX_IMAGE_DIMENSION || original_height > MAX_IMAGE_DIMENSION {
        original.resize(
            MAX_IMAGE_DIMENSION,
            MAX_IMAGE_DIMENSION,
            FilterType::Lanczos3,
        )
    } else {
        original
    };

    let rgba = image.to_rgba8();

    let (width, height) = rgba.dimensions();

    let mut output = Vec::new();

    let encoder = AvifEncoder::new_with_speed_quality(&mut output, AVIF_SPEED, AVIF_QUALITY)
        .with_num_threads(None);

    encoder.write_image(rgba.as_raw(), width, height, ExtendedColorType::Rgba8)?;

    Ok(output)
}
