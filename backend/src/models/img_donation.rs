use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct DonationImagesState {
    pub next: u8,
}
