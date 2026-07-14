use crate::{models::news::News, repositories::news};

pub fn get_news() -> Result<Vec<News>, String> {
    news::get_all_news()
}
