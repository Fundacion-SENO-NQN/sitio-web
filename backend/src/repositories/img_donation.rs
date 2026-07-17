use crate::models::img_donation::DonationImagesState;
use image::{ImageEncoder, codecs::avif::AvifEncoder};
use std::{env, fs, fs::File, io::BufWriter, path::PathBuf};

fn get_route_next_img() -> Result<PathBuf, Box<dyn std::error::Error>> {
    let mut state_path = PathBuf::from(env::var("ROUTE_TO_DATA")?);
    state_path.push("imgDonacion");
    state_path.push("nextImg.json");
    Ok(state_path)
}

fn get_route_img_donation() -> Result<PathBuf, Box<dyn std::error::Error>> {
    let mut state_path = PathBuf::from(env::var("ROUTE_TO_IMG")?);
    state_path.push("img_donaciones");
    Ok(state_path)
}

fn load_donation_state() -> Result<DonationImagesState, Box<dyn std::error::Error>> {
    if !std::path::Path::new(&get_route_next_img()?).exists() {
        return Ok(DonationImagesState { next: 0 });
    }

    let content = fs::read_to_string(get_route_next_img()?)?;
    Ok(serde_json::from_str(&content)?)
}

fn save_donation_state(state: &DonationImagesState) -> Result<(), Box<dyn std::error::Error>> {
    fs::write(get_route_next_img()?, serde_json::to_string_pretty(state)?)?;
    Ok(())
}

pub fn replace_oldest_donation_image(bytes: &[u8]) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let mut state = load_donation_state()?;

    let mut img = image::load_from_memory(bytes)?;

    const MAX_WIDTH: u32 = 1920;

    if img.width() > MAX_WIDTH {
        let ratio = MAX_WIDTH as f32 / img.width() as f32;
        let new_height = (img.height() as f32 * ratio) as u32;

        img = img.resize(MAX_WIDTH, new_height, image::imageops::FilterType::Lanczos3);
    }

    let mut path = get_route_img_donation()?;
    path.push(format!("{}", state.next));

    let file = File::create(&path)?;
    let writer = BufWriter::new(file);

    let encoder = AvifEncoder::new(writer);

    encoder.write_image(
        img.as_bytes(),
        img.width(),
        img.height(),
        img.color().into(),
    )?;

    state.next = (state.next + 1) % 10;

    save_donation_state(&state)?;

    let mut route = get_route_img_donation()?;
    route.push(format!("{}.avif", (state.next + 9) % 10));

    Ok(route)
}
