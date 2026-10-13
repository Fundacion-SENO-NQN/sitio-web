use chrono::{Datelike, Utc};

use chrono_tz::America::Argentina::Buenos_Aires;

pub fn fecha_actual_espanol() -> String {
    let fecha = Utc::now().with_timezone(&Buenos_Aires);
    format_fecha_espanol(&fecha)
}

fn format_fecha_espanol<T: Datelike>(fecha: &T) -> String {
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

    format!("{} de {} de {}", fecha.day(), mes, fecha.year())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    #[test]
    fn test_format_fecha_espanol_enero() {
        let date = NaiveDate::from_ymd_opt(2023, 1, 15).unwrap();
        assert_eq!(format_fecha_espanol(&date), "15 de enero de 2023");
    }

    #[test]
    fn test_format_fecha_espanol_diciembre() {
        let date = NaiveDate::from_ymd_opt(2024, 12, 31).unwrap();
        assert_eq!(format_fecha_espanol(&date), "31 de diciembre de 2024");
    }

    #[test]
    fn test_format_fecha_espanol_leap_year() {
        let date = NaiveDate::from_ymd_opt(2024, 2, 29).unwrap();
        assert_eq!(format_fecha_espanol(&date), "29 de febrero de 2024");
    }
}
