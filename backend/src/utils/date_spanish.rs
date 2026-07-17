use chrono::{Datelike, Local};

pub fn current_date_spanish() -> String {
    let today = Local::now();

    let day = today.day();
    let year = today.year();

    let month = match today.month() {
        1 => "enero",
        2 => "febrero",
        3 => "marzo",
        4 => "abril",
        5 => "mayo",
        6 => "junio",
        7 => "julio",
        8 => "agosto",
        9 => "septiembre",
        10 => "octubre",
        11 => "noviembre",
        12 => "diciembre",
        _ => unreachable!(),
    };

    format!("{day} de {month} del {year}")
}