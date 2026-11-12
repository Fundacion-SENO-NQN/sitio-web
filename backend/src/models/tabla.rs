/* ==========================================================
   METADATOS DE TABLAS
   ----------------------------------------------------------
   Describen, de forma estática, el nombre real de cada tabla
   y sus columnas en el mismo orden en que se declaran.

   Las definiciones concretas viven en
   `repositories::tablas`. Estos tipos sólo pueden
   construirse mediante `const fn` que validan los
   identificadores: un nombre inválido, una tabla sin
   columnas, una columna repetida o una clave primaria
   inexistente provocan un error de compilación cuando la
   definición es un `static`/`const`.
========================================================== */

/// Tipo de una columna expresado como el tipo Rust con el que se decodifica.
///
/// Sólo describe el esquema: la decodificación real la siguen haciendo SQLx
/// y los modelos (`FromRow`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TipoColumna {
    /// `SMALLINT` ↔ `i16`
    I16,
    /// `INTEGER` ↔ `i32`
    I32,
    /// `BIGINT` ↔ `i64`
    I64,
    /// `REAL` ↔ `f32`
    F32,
    /// `DOUBLE PRECISION` ↔ `f64`
    F64,
    /// `TEXT` / `VARCHAR` ↔ `String`
    String,
    /// `BOOLEAN` ↔ `bool`
    Bool,
    /// `DATE` ↔ `chrono::NaiveDate`
    Date,
    /// `TIMESTAMP` ↔ `chrono::NaiveDateTime`
    DateTime,
    /// `TIMESTAMPTZ` ↔ `chrono::DateTime<Utc>`
    TimestampTz,
    /// `UUID` ↔ `uuid::Uuid`
    Uuid,
    /// `JSON` / `JSONB` ↔ `serde_json::Value`
    Json,
}

impl TipoColumna {
    /// Nombre del tipo PostgreSQL equivalente (usado en mensajes de error).
    pub const fn nombre_postgres(self) -> &'static str {
        match self {
            TipoColumna::I16 => "SMALLINT",
            TipoColumna::I32 => "INTEGER",
            TipoColumna::I64 => "BIGINT",
            TipoColumna::F32 => "REAL",
            TipoColumna::F64 => "DOUBLE PRECISION",
            TipoColumna::String => "TEXT",
            TipoColumna::Bool => "BOOLEAN",
            TipoColumna::Date => "DATE",
            TipoColumna::DateTime => "TIMESTAMP",
            TipoColumna::TimestampTz => "TIMESTAMPTZ",
            TipoColumna::Uuid => "UUID",
            TipoColumna::Json => "JSONB",
        }
    }
}

/// Columna de una tabla.
#[derive(Debug, Clone, Copy)]
pub struct Columna {
    pub nombre: &'static str,
    pub tipo: TipoColumna,
    pub nullable: bool,
}

impl Columna {
    /// Columna `NOT NULL`.
    pub const fn requerida(nombre: &'static str, tipo: TipoColumna) -> Self {
        assert!(
            es_identificador_valido(nombre),
            "nombre de columna inválido"
        );

        Self {
            nombre,
            tipo,
            nullable: false,
        }
    }

    /// Columna que admite `NULL` (se decodifica como `Option<T>`).
    pub const fn opcional(nombre: &'static str, tipo: TipoColumna) -> Self {
        assert!(
            es_identificador_valido(nombre),
            "nombre de columna inválido"
        );

        Self {
            nombre,
            tipo,
            nullable: true,
        }
    }

    pub const fn nombre(&self) -> &'static str {
        self.nombre
    }

    pub const fn tipo(&self) -> TipoColumna {
        self.tipo
    }

    pub const fn nullable(&self) -> bool {
        self.nullable
    }
}

/// Tabla de la base de datos con sus columnas en orden de declaración.
#[derive(Debug)]
pub struct Tabla {
    pub nombre: &'static str,
    pub clave_primaria: &'static str,
    pub columnas: &'static [Columna],
}

impl Tabla {
    /// Crea la descripción de una tabla validando sus identificadores.
    ///
    /// Al usarse en un `static` se evalúa en tiempo de compilación, por lo
    /// que cualquier error de definición impide compilar.
    pub const fn nueva(
        nombre: &'static str,
        clave_primaria: &'static str,
        columnas: &'static [Columna],
    ) -> Self {
        assert!(es_identificador_valido(nombre), "nombre de tabla inválido");
        assert!(!columnas.is_empty(), "la tabla debe declarar columnas");

        let mut clave_encontrada = false;
        let mut i = 0;

        while i < columnas.len() {
            let actual = columnas[i].nombre;

            if mismo_texto(actual, clave_primaria) {
                clave_encontrada = true;
            }

            let mut j = 0;

            while j < i {
                assert!(
                    !mismo_texto(actual, columnas[j].nombre),
                    "columna declarada dos veces"
                );
                j += 1;
            }

            i += 1;
        }

        assert!(
            clave_encontrada,
            "la clave primaria debe ser una columna declarada"
        );

        Self {
            nombre,
            clave_primaria,
            columnas,
        }
    }

    pub const fn nombre(&self) -> &'static str {
        self.nombre
    }

    pub const fn columnas(&self) -> &'static [Columna] {
        self.columnas
    }

    /// Columna de la clave primaria (siempre existe: se valida al construir).
    pub fn clave_primaria(&self) -> &'static Columna {
        self.columna(self.clave_primaria)
            .expect("clave primaria validada en Tabla::nueva")
    }

    /// Busca una columna declarada.
    ///
    /// Es la única forma de convertir un nombre en un identificador SQL:
    /// lo que no está declarado no puede llegar a una consulta.
    pub fn columna(&self, nombre: &str) -> Option<&'static Columna> {
        self.columnas
            .iter()
            .find(|columna| columna.nombre == nombre)
    }
}

/* ==========================================================
   VALIDACIÓN DE IDENTIFICADORES (CONST)
========================================================== */

/// Longitud máxima de un identificador en PostgreSQL (NAMEDATALEN - 1).
const LONGITUD_MAXIMA_IDENTIFICADOR: usize = 63;

/// Acepta sólo identificadores simples en minúscula: `[a-z_][a-z0-9_]*`.
///
/// Esto excluye espacios, comillas, puntos y cualquier carácter capaz de
/// alterar la sentencia. Las palabras reservadas sí son válidas: se citan al
/// generar el SQL.
pub const fn es_identificador_valido(nombre: &str) -> bool {
    let bytes = nombre.as_bytes();

    if bytes.is_empty() || bytes.len() > LONGITUD_MAXIMA_IDENTIFICADOR {
        return false;
    }

    if bytes[0].is_ascii_digit() {
        return false;
    }

    let mut i = 0;

    while i < bytes.len() {
        let byte = bytes[i];

        if !(byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_') {
            return false;
        }

        i += 1;
    }

    true
}

const fn mismo_texto(a: &str, b: &str) -> bool {
    let a = a.as_bytes();
    let b = b.as_bytes();

    if a.len() != b.len() {
        return false;
    }

    let mut i = 0;

    while i < a.len() {
        if a[i] != b[i] {
            return false;
        }

        i += 1;
    }

    true
}

#[cfg(test)]
mod tests {
    use super::*;

    static PRUEBA: Tabla = Tabla::nueva(
        "prueba",
        "id",
        &[
            Columna::requerida("id", TipoColumna::I64),
            Columna::requerida("nombre", TipoColumna::String),
            Columna::opcional("detalle", TipoColumna::String),
        ],
    );

    #[test]
    fn conserva_orden_y_nulabilidad() {
        let nombres: Vec<_> = PRUEBA.columnas().iter().map(Columna::nombre).collect();

        assert_eq!(nombres, ["id", "nombre", "detalle"]);
        assert!(!PRUEBA.columna("nombre").unwrap().nullable());
        assert!(PRUEBA.columna("detalle").unwrap().nullable());
        assert_eq!(PRUEBA.clave_primaria().nombre(), "id");
        assert_eq!(PRUEBA.clave_primaria().tipo(), TipoColumna::I64);
    }

    #[test]
    fn busca_solo_columnas_declaradas() {
        assert!(PRUEBA.columna("nombre").is_some());
        assert!(PRUEBA.columna("NOMBRE").is_none());
        assert!(PRUEBA.columna("nombre; DROP TABLE prueba").is_none());
    }

    #[test]
    fn valida_identificadores() {
        for valido in ["id", "created_at", "_interno", "col2", "order"] {
            assert!(es_identificador_valido(valido), "{valido}");
        }

        for invalido in [
            "",
            "1col",
            "Nombre",
            "nombre apellido",
            "nombre;",
            "\"id\"",
            "public.bingos",
            "id--",
            "ñandú",
            &"a".repeat(64),
        ] {
            assert!(!es_identificador_valido(invalido), "{invalido}");
        }
    }

    #[test]
    #[should_panic(expected = "columna declarada dos veces")]
    fn rechaza_columnas_repetidas() {
        static COLUMNAS: [Columna; 2] = [
            Columna::requerida("id", TipoColumna::I64),
            Columna::requerida("id", TipoColumna::I64),
        ];

        let _ = Tabla::nueva("repetida", "id", &COLUMNAS);
    }

    #[test]
    #[should_panic(expected = "la tabla debe declarar columnas")]
    fn rechaza_tabla_sin_columnas() {
        let _ = Tabla::nueva("vacia", "id", &[]);
    }

    #[test]
    #[should_panic(expected = "la clave primaria debe ser una columna declarada")]
    fn rechaza_clave_primaria_inexistente() {
        static COLUMNAS: [Columna; 1] = [Columna::requerida("id", TipoColumna::I64)];

        let _ = Tabla::nueva("sin_clave", "codigo", &COLUMNAS);
    }

    #[test]
    #[should_panic(expected = "nombre de tabla inválido")]
    fn rechaza_nombre_de_tabla_invalido() {
        static COLUMNAS: [Columna; 1] = [Columna::requerida("id", TipoColumna::I64)];

        let _ = Tabla::nueva("equipo; DROP TABLE equipo", "id", &COLUMNAS);
    }
}
