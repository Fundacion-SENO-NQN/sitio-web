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

    /// Comprueba si el tipo representa una fecha o marca temporal.
    pub const fn es_temporal(self) -> bool {
        matches!(
            self,
            TipoColumna::Date | TipoColumna::DateTime | TipoColumna::TimestampTz
        )
    }
}

/// Columna de una tabla con sus restricciones de mutabilidad.
#[derive(Debug, Clone, Copy)]
pub struct Columna {
    pub nombre: &'static str,
    pub tipo: TipoColumna,
    pub nullable: bool,
    pub insertable: bool,
    pub updatable: bool,
}

impl Columna {
    /// Columna `NOT NULL`, insertable y modificable por UPDATE.
    pub const fn requerida(nombre: &'static str, tipo: TipoColumna) -> Self {
        assert!(
            es_identificador_valido(nombre),
            "nombre de columna inválido"
        );

        Self {
            nombre,
            tipo,
            nullable: false,
            insertable: true,
            updatable: true,
        }
    }

    /// Columna que admite `NULL` (se decodifica como `Option<T>`), insertable y modificable.
    pub const fn opcional(nombre: &'static str, tipo: TipoColumna) -> Self {
        assert!(
            es_identificador_valido(nombre),
            "nombre de columna inválido"
        );

        Self {
            nombre,
            tipo,
            nullable: true,
            insertable: true,
            updatable: true,
        }
    }

    /// Columna asignable únicamente al crear el registro (ej. `orden` en noticias o claves fijas).
    /// No se permite incluirla en actualizaciones generales.
    pub const fn solo_insercion(nombre: &'static str, tipo: TipoColumna) -> Self {
        assert!(
            es_identificador_valido(nombre),
            "nombre de columna inválido"
        );

        Self {
            nombre,
            tipo,
            nullable: false,
            insertable: true,
            updatable: false,
        }
    }

    /// Columna opcional asignable únicamente al crear el registro.
    #[allow(dead_code)]
    pub const fn solo_insercion_opcional(nombre: &'static str, tipo: TipoColumna) -> Self {
        assert!(
            es_identificador_valido(nombre),
            "nombre de columna inválido"
        );

        Self {
            nombre,
            tipo,
            nullable: true,
            insertable: true,
            updatable: false,
        }
    }

    /// Columna administrada por la base de datos o el sistema (`id` serial, `created_at`, `updated_at`, etc.).
    /// No admite inserciones ni actualizaciones directas mediante parámetros del usuario.
    pub const fn inmutable(nombre: &'static str, tipo: TipoColumna) -> Self {
        assert!(
            es_identificador_valido(nombre),
            "nombre de columna inválido"
        );

        Self {
            nombre,
            tipo,
            nullable: false,
            insertable: false,
            updatable: false,
        }
    }

    /// Columna opcional no modificable por el usuario.
    #[allow(dead_code)]
    pub const fn inmutable_opcional(nombre: &'static str, tipo: TipoColumna) -> Self {
        assert!(
            es_identificador_valido(nombre),
            "nombre de columna inválido"
        );

        Self {
            nombre,
            tipo,
            nullable: true,
            insertable: false,
            updatable: false,
        }
    }

    /// Constructor exhaustivo para columnas con configuraciones particulares.
    #[allow(dead_code)]
    pub const fn personalizada(
        nombre: &'static str,
        tipo: TipoColumna,
        nullable: bool,
        insertable: bool,
        updatable: bool,
    ) -> Self {
        assert!(
            es_identificador_valido(nombre),
            "nombre de columna inválido"
        );

        Self {
            nombre,
            tipo,
            nullable,
            insertable,
            updatable,
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

    pub const fn es_insertable(&self) -> bool {
        self.insertable
    }

    pub const fn es_actualizable(&self) -> bool {
        self.updatable
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

    /// Columnas aptas para operaciones de inserción directa.
    #[allow(dead_code)]
    pub fn columnas_insertables(&self) -> impl Iterator<Item = &'static Columna> {
        self.columnas.iter().filter(|col| col.es_insertable())
    }

    /// Columnas aptas para operaciones de actualización directa.
    #[allow(dead_code)]
    pub fn columnas_actualizables(&self) -> impl Iterator<Item = &'static Columna> {
        self.columnas.iter().filter(|col| col.es_actualizable())
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
            Columna::inmutable("id", TipoColumna::I64),
            Columna::requerida("nombre", TipoColumna::String),
            Columna::opcional("detalle", TipoColumna::String),
            Columna::solo_insercion("posicion", TipoColumna::I64),
        ],
    );

    #[test]
    fn conserva_orden_y_nulabilidad() {
        let nombres: Vec<_> = PRUEBA.columnas().iter().map(Columna::nombre).collect();

        assert_eq!(nombres, ["id", "nombre", "detalle", "posicion"]);
        assert!(!PRUEBA.columna("nombre").unwrap().nullable());
        assert!(PRUEBA.columna("detalle").unwrap().nullable());
        assert_eq!(PRUEBA.clave_primaria().nombre(), "id");
        assert_eq!(PRUEBA.clave_primaria().tipo(), TipoColumna::I64);
    }

    #[test]
    fn respeta_reglas_de_mutabilidad() {
        let id = PRUEBA.columna("id").unwrap();
        assert!(!id.es_insertable());
        assert!(!id.es_actualizable());

        let nombre = PRUEBA.columna("nombre").unwrap();
        assert!(nombre.es_insertable());
        assert!(nombre.es_actualizable());

        let posicion = PRUEBA.columna("posicion").unwrap();
        assert!(posicion.es_insertable());
        assert!(!posicion.es_actualizable());

        let insertables: Vec<_> = PRUEBA.columnas_insertables().map(Columna::nombre).collect();
        assert_eq!(insertables, ["nombre", "detalle", "posicion"]);

        let actualizables: Vec<_> = PRUEBA
            .columnas_actualizables()
            .map(Columna::nombre)
            .collect();
        assert_eq!(actualizables, ["nombre", "detalle"]);
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
