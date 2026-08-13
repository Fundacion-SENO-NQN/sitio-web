use chrono::{Datelike, Utc};

use chrono_tz::America::Argentina::Buenos_Aires;

pub fn fecha_actual_espanol() -> String {
    let fecha = Utc::now().with_timezone(&Buenos_Aires);

    let mes = match fecha.month() {
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

    format!("{} de {} de {}", fecha.day(), mes, fecha.year(),)
}
