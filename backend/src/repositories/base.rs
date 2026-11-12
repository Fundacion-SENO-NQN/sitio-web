/* ==========================================================
   INFRAESTRUCTURA COMÚN DE REPOSITORIOS
   ----------------------------------------------------------
   Genera y ejecuta las consultas que se repetían en varios
   repositorios (SELECT por tabla, por id, con filtros, con
   ORDER BY / LIMIT / FOR UPDATE, DELETE por id y las
   operaciones de las tablas con columna `orden`).

   Reglas de seguridad:

   - Los nombres de tabla salen exclusivamente de los
     metadatos estáticos (`repositories::tablas`), validados
     en tiempo de compilación.
   - Las columnas se reciben como `&'static str` y sólo se
     usan si están declaradas en la tabla; de lo contrario la
     consulta se rechaza con `ErrorConsulta`.
   - La dirección de ORDER BY es un enum, nunca texto.
   - Todos los valores viajan como parámetros (`$n`) con
     `bind`; jamás se concatenan en el SQL.
   - Los identificadores que son palabras reservadas de
     PostgreSQL se citan con comillas dobles.

   Las consultas con JOIN, CTE, reglas de negocio o
   proyecciones especiales siguen siendo SQL estático en cada
   repositorio.
========================================================== */

use crate::models::tabla::{Columna, Tabla, TipoColumna};
use sqlx::{AssertSqlSafe, Encode, FromRow, PgExecutor, Postgres, Type, postgres::PgRow};
use std::fmt::{self, Write};

/* ==========================================================
   ENTIDADES Y VALORES
========================================================== */

/// Modelo que se lee completo desde una única tabla.
///
/// Las columnas seleccionadas son exactamente las declaradas en `TABLA`, en
/// su orden. SQLx (`FromRow`) sigue siendo quien decodifica y comprueba los
/// tipos reales del modelo.
pub trait Entidad: for<'r> FromRow<'r, PgRow> + Send + Unpin {
    const TABLA: &'static Tabla;
}

/// Asocia un tipo Rust con el `TipoColumna` que le corresponde.
///
/// Permite rechazar filtros cuyo valor no coincide con el tipo declarado de
/// la columna (por ejemplo, filtrar un `BIGINT` con un `String`).
pub trait ValorColumna {
    const TIPO: TipoColumna;
    const ADMITE_NULO: bool = false;
}

macro_rules! valor_columna {
    ($($rust:ty => $tipo:ident),* $(,)?) => {
        $(impl ValorColumna for $rust {
            const TIPO: TipoColumna = TipoColumna::$tipo;
        })*
    };
}

valor_columna! {
    i16 => I16,
    i32 => I32,
    i64 => I64,
    f32 => F32,
    f64 => F64,
    String => String,
    str => String,
    bool => Bool,
    chrono::NaiveDate => Date,
    chrono::NaiveDateTime => DateTime,
    chrono::DateTime<chrono::Utc> => TimestampTz,
    uuid::Uuid => Uuid,
    serde_json::Value => Json,
}

impl<T: ValorColumna + ?Sized> ValorColumna for &T {
    const TIPO: TipoColumna = T::TIPO;
    const ADMITE_NULO: bool = T::ADMITE_NULO;
}

impl<T: ValorColumna> ValorColumna for Option<T> {
    const TIPO: TipoColumna = T::TIPO;
    const ADMITE_NULO: bool = true;
}

/* ==========================================================
   ORDENAMIENTO
========================================================== */

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DireccionOrden {
    Asc,
    Desc,
}

impl DireccionOrden {
    pub const fn sql(self) -> &'static str {
        match self {
            DireccionOrden::Asc => "ASC",
            DireccionOrden::Desc => "DESC",
        }
    }
}

/// Criterio de ORDER BY. La columna debe estar declarada en la tabla.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Ordenamiento {
    pub columna: &'static str,
    pub direccion: DireccionOrden,
}

impl Ordenamiento {
    pub const fn asc(columna: &'static str) -> Self {
        Self {
            columna,
            direccion: DireccionOrden::Asc,
        }
    }

    pub const fn desc(columna: &'static str) -> Self {
        Self {
            columna,
            direccion: DireccionOrden::Desc,
        }
    }
}

/// Abstracción para aceptar ordenamientos opcionales, individuales o múltiples
/// sin asignaciones dinámicas innecesarias.
pub trait CriteriosOrden {
    fn aplicar_orden<R>(&self, f: impl FnOnce(&[Ordenamiento]) -> R) -> R;
}

impl CriteriosOrden for () {
    fn aplicar_orden<R>(&self, f: impl FnOnce(&[Ordenamiento]) -> R) -> R {
        f(&[])
    }
}

impl CriteriosOrden for Ordenamiento {
    fn aplicar_orden<R>(&self, f: impl FnOnce(&[Ordenamiento]) -> R) -> R {
        f(std::slice::from_ref(self))
    }
}

impl CriteriosOrden for Option<Ordenamiento> {
    fn aplicar_orden<R>(&self, f: impl FnOnce(&[Ordenamiento]) -> R) -> R {
        match self {
            Some(orden) => f(std::slice::from_ref(orden)),
            None => f(&[]),
        }
    }
}

impl CriteriosOrden for &[Ordenamiento] {
    fn aplicar_orden<R>(&self, f: impl FnOnce(&[Ordenamiento]) -> R) -> R {
        f(self)
    }
}

impl<const N: usize> CriteriosOrden for [Ordenamiento; N] {
    fn aplicar_orden<R>(&self, f: impl FnOnce(&[Ordenamiento]) -> R) -> R {
        f(self.as_slice())
    }
}

impl<const N: usize> CriteriosOrden for &[Ordenamiento; N] {
    fn aplicar_orden<R>(&self, f: impl FnOnce(&[Ordenamiento]) -> R) -> R {
        f(self.as_slice())
    }
}

impl CriteriosOrden for Vec<Ordenamiento> {
    fn aplicar_orden<R>(&self, f: impl FnOnce(&[Ordenamiento]) -> R) -> R {
        f(self.as_slice())
    }
}

impl CriteriosOrden for &Vec<Ordenamiento> {
    fn aplicar_orden<R>(&self, f: impl FnOnce(&[Ordenamiento]) -> R) -> R {
        f(self.as_slice())
    }
}

/* ==========================================================
   ERRORES DE CONSTRUCCIÓN
========================================================== */

/// Error al generar SQL. Indica un error de programación (una columna mal
/// escrita, un tipo de filtro incorrecto), nunca un dato del usuario.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ErrorConsulta {
    ColumnaDesconocida {
        tabla: &'static str,
        columna: &'static str,
    },
    TipoIncompatible {
        tabla: &'static str,
        columna: &'static str,
        declarado: TipoColumna,
        recibido: TipoColumna,
    },
    NuloNoPermitido {
        tabla: &'static str,
        columna: &'static str,
    },
    SinColumnas {
        tabla: &'static str,
    },
}

impl fmt::Display for ErrorConsulta {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ErrorConsulta::ColumnaDesconocida { tabla, columna } => {
                write!(f, "la columna `{columna}` no está declarada en `{tabla}`")
            }
            ErrorConsulta::TipoIncompatible {
                tabla,
                columna,
                declarado,
                recibido,
            } => write!(
                f,
                "`{tabla}.{columna}` es {} pero se recibió un valor {}",
                declarado.nombre_postgres(),
                recibido.nombre_postgres(),
            ),
            ErrorConsulta::NuloNoPermitido { tabla, columna } => {
                write!(f, "`{tabla}.{columna}` no admite comparaciones con NULL")
            }
            ErrorConsulta::SinColumnas { tabla } => {
                write!(f, "la consulta sobre `{tabla}` no selecciona columnas")
            }
        }
    }
}

impl std::error::Error for ErrorConsulta {}

/// Se integra con el manejo existente: los repositorios ya convierten
/// `sqlx::Error` en `ApiError::InternalServerError`.
impl From<ErrorConsulta> for sqlx::Error {
    fn from(error: ErrorConsulta) -> Self {
        sqlx::Error::InvalidArgument(error.to_string())
    }
}

/* ==========================================================
   IDENTIFICADORES
========================================================== */

/// Palabras reservadas de PostgreSQL (incluye las que sólo pueden ser
/// nombres de función o tipo). Ordenadas para búsqueda binaria.
const PALABRAS_RESERVADAS: &[&str] = &[
    "all",
    "analyse",
    "analyze",
    "and",
    "any",
    "array",
    "as",
    "asc",
    "asymmetric",
    "authorization",
    "binary",
    "both",
    "case",
    "cast",
    "check",
    "collate",
    "collation",
    "column",
    "concurrently",
    "constraint",
    "create",
    "cross",
    "current_catalog",
    "current_date",
    "current_role",
    "current_schema",
    "current_time",
    "current_timestamp",
    "current_user",
    "default",
    "deferrable",
    "desc",
    "distinct",
    "do",
    "else",
    "end",
    "except",
    "false",
    "fetch",
    "for",
    "foreign",
    "freeze",
    "from",
    "full",
    "grant",
    "group",
    "having",
    "ilike",
    "in",
    "initially",
    "inner",
    "intersect",
    "into",
    "is",
    "isnull",
    "join",
    "lateral",
    "leading",
    "left",
    "like",
    "limit",
    "localtime",
    "localtimestamp",
    "natural",
    "not",
    "notnull",
    "null",
    "offset",
    "on",
    "only",
    "or",
    "order",
    "outer",
    "overlaps",
    "placing",
    "primary",
    "references",
    "returning",
    "right",
    "select",
    "session_user",
    "similar",
    "some",
    "symmetric",
    "system_user",
    "table",
    "tablesample",
    "then",
    "to",
    "trailing",
    "true",
    "union",
    "unique",
    "user",
    "using",
    "variadic",
    "verbose",
    "when",
    "where",
    "window",
    "with",
];

/// Escribe un identificador ya validado por los metadatos.
///
/// Sólo contiene `[a-z0-9_]`, así que citarlo no requiere escapar nada.
pub fn escribir_identificador(sql: &mut String, nombre: &'static str) {
    if PALABRAS_RESERVADAS.binary_search(&nombre).is_ok() {
        sql.push('"');
        sql.push_str(nombre);
        sql.push('"');
    } else {
        sql.push_str(nombre);
    }
}

pub fn escribir_columnas(sql: &mut String, columnas: impl IntoIterator<Item = &'static Columna>) {
    for (indice, columna) in columnas.into_iter().enumerate() {
        if indice > 0 {
            sql.push_str(", ");
        }

        escribir_identificador(sql, columna.nombre());
    }
}

fn escribir_parametro(sql: &mut String, numero: usize) {
    write!(sql, "${numero}").expect("escribir en un String no falla");
}

fn resolver_columna(
    tabla: &'static Tabla,
    nombre: &'static str,
) -> Result<&'static Columna, ErrorConsulta> {
    tabla
        .columna(nombre)
        .ok_or(ErrorConsulta::ColumnaDesconocida {
            tabla: tabla.nombre(),
            columna: nombre,
        })
}

fn resolver_columna_tipada(
    tabla: &'static Tabla,
    nombre: &'static str,
    tipo: TipoColumna,
) -> Result<&'static Columna, ErrorConsulta> {
    let columna = resolver_columna(tabla, nombre)?;

    if columna.tipo() != tipo {
        return Err(ErrorConsulta::TipoIncompatible {
            tabla: tabla.nombre(),
            columna: columna.nombre(),
            declarado: columna.tipo(),
            recibido: tipo,
        });
    }

    Ok(columna)
}

/// Lista explícita de columnas de una tabla (`id, nombre, ...`).
#[allow(dead_code)]
pub fn lista_columnas(tabla: &'static Tabla) -> String {
    let mut sql = String::new();
    escribir_columnas(&mut sql, tabla.columnas());
    sql
}

/* ==========================================================
   CONSTRUCTOR DE SELECT
========================================================== */

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Operador {
    Igual,
    Mayor,
    Cualquiera,
}

#[derive(Debug, Clone, Copy)]
struct Condicion {
    columna: &'static str,
    operador: Operador,
    tipo: TipoColumna,
    admite_nulo: bool,
}

/// SELECT sobre una única tabla con columnas explícitas.
///
/// Los parámetros se numeran en el orden en que se agregan las condiciones
/// y, al final, el de `LIMIT`. Los valores se enlazan en ese mismo orden.
#[derive(Debug, Clone)]
pub struct ConsultaSelect {
    tabla: &'static Tabla,
    columnas: Option<Vec<&'static str>>,
    condiciones: Vec<Condicion>,
    orden: Vec<Ordenamiento>,
    limite: bool,
    para_actualizar: bool,
}

impl ConsultaSelect {
    /// Selecciona todas las columnas declaradas, en su orden.
    pub fn de(tabla: &'static Tabla) -> Self {
        Self {
            tabla,
            columnas: None,
            condiciones: Vec::new(),
            orden: Vec::new(),
            limite: false,
            para_actualizar: false,
        }
    }

    /// Restringe la proyección a un subconjunto de columnas declaradas.
    pub fn columnas(mut self, columnas: impl IntoIterator<Item = &'static str>) -> Self {
        self.columnas = Some(columnas.into_iter().collect());
        self
    }

    /// `columna = $n`. Si `V` es `Option<_>` y la columna es nullable se usa
    /// `IS NOT DISTINCT FROM`, de modo que `None` encuentre los `NULL`.
    pub fn donde_igual<V: ValorColumna + ?Sized>(self, columna: &'static str) -> Self {
        self.condicion::<V>(columna, Operador::Igual)
    }

    /// `columna > $n`.
    pub fn donde_mayor<V: ValorColumna + ?Sized>(self, columna: &'static str) -> Self {
        self.condicion::<V>(columna, Operador::Mayor)
    }

    /// `columna = ANY($n)`; `V` es el tipo de cada elemento del arreglo.
    pub fn donde_en<V: ValorColumna + ?Sized>(self, columna: &'static str) -> Self {
        self.condicion::<V>(columna, Operador::Cualquiera)
    }

    pub fn ordenar(mut self, orden: &[Ordenamiento]) -> Self {
        self.orden.extend_from_slice(orden);
        self
    }

    /// Agrega `LIMIT $n` (el límite también es un parámetro).
    pub fn limitar(mut self) -> Self {
        self.limite = true;
        self
    }

    /// Agrega `FOR UPDATE`.
    pub fn para_actualizar(mut self) -> Self {
        self.para_actualizar = true;
        self
    }

    fn condicion<V: ValorColumna + ?Sized>(
        mut self,
        columna: &'static str,
        operador: Operador,
    ) -> Self {
        self.condiciones.push(Condicion {
            columna,
            operador,
            tipo: V::TIPO,
            admite_nulo: V::ADMITE_NULO,
        });
        self
    }

    pub fn construir(&self) -> Result<String, ErrorConsulta> {
        let tabla = self.tabla;
        let mut sql = String::from("SELECT ");

        match &self.columnas {
            None => escribir_columnas(&mut sql, tabla.columnas()),
            Some(nombres) => {
                if nombres.is_empty() {
                    return Err(ErrorConsulta::SinColumnas {
                        tabla: tabla.nombre(),
                    });
                }

                let columnas = nombres
                    .iter()
                    .map(|nombre| resolver_columna(tabla, nombre))
                    .collect::<Result<Vec<_>, _>>()?;

                escribir_columnas(&mut sql, columnas);
            }
        }

        sql.push_str(" FROM ");
        escribir_identificador(&mut sql, tabla.nombre());

        let mut parametro = 0;

        for (indice, condicion) in self.condiciones.iter().enumerate() {
            let columna = resolver_columna_tipada(tabla, condicion.columna, condicion.tipo)?;

            let comparacion_nula = condicion.admite_nulo;

            if comparacion_nula && !(columna.nullable() && condicion.operador == Operador::Igual) {
                return Err(ErrorConsulta::NuloNoPermitido {
                    tabla: tabla.nombre(),
                    columna: columna.nombre(),
                });
            }

            sql.push_str(if indice == 0 { " WHERE " } else { " AND " });
            escribir_identificador(&mut sql, columna.nombre());

            parametro += 1;

            match condicion.operador {
                Operador::Igual if comparacion_nula => sql.push_str(" IS NOT DISTINCT FROM "),
                Operador::Igual => sql.push_str(" = "),
                Operador::Mayor => sql.push_str(" > "),
                Operador::Cualquiera => sql.push_str(" = ANY("),
            }

            escribir_parametro(&mut sql, parametro);

            if condicion.operador == Operador::Cualquiera {
                sql.push(')');
            }
        }

        for (indice, criterio) in self.orden.iter().enumerate() {
            let columna = resolver_columna(tabla, criterio.columna)?;

            sql.push_str(if indice == 0 { " ORDER BY " } else { ", " });
            escribir_identificador(&mut sql, columna.nombre());
            sql.push(' ');
            sql.push_str(criterio.direccion.sql());
        }

        if self.limite {
            parametro += 1;
            sql.push_str(" LIMIT ");
            escribir_parametro(&mut sql, parametro);
        }

        if self.para_actualizar {
            sql.push_str(" FOR UPDATE");
        }

        Ok(sql)
    }
}

/* ==========================================================
   GENERADORES DE SQL
   (funciones puras: se prueban sin base de datos)
========================================================== */

/// Columna usada por las tablas con posición manual.
pub const COLUMNA_ORDEN: &str = "orden";

fn clave_primaria_i64(tabla: &'static Tabla) -> Result<&'static Columna, ErrorConsulta> {
    resolver_columna_tipada(tabla, tabla.clave_primaria().nombre(), TipoColumna::I64)
}

pub fn sql_obtener_todos(
    tabla: &'static Tabla,
    orden: impl CriteriosOrden,
) -> Result<String, ErrorConsulta> {
    orden.aplicar_orden(|criterios| ConsultaSelect::de(tabla).ordenar(criterios).construir())
}

pub fn sql_obtener_por_id(
    tabla: &'static Tabla,
    para_actualizar: bool,
) -> Result<String, ErrorConsulta> {
    let consulta = ConsultaSelect::de(tabla).donde_igual::<i64>(tabla.clave_primaria().nombre());

    if para_actualizar {
        consulta.para_actualizar().construir()
    } else {
        consulta.construir()
    }
}

pub fn sql_obtener_donde<V: ValorColumna + ?Sized>(
    tabla: &'static Tabla,
    columna: &'static str,
    orden: impl CriteriosOrden,
) -> Result<String, ErrorConsulta> {
    orden.aplicar_orden(|criterios| {
        ConsultaSelect::de(tabla)
            .donde_igual::<V>(columna)
            .ordenar(criterios)
            .construir()
    })
}

pub fn sql_obtener_con_limite(
    tabla: &'static Tabla,
    orden: impl CriteriosOrden,
) -> Result<String, ErrorConsulta> {
    orden.aplicar_orden(|criterios| {
        ConsultaSelect::de(tabla)
            .ordenar(criterios)
            .limitar()
            .construir()
    })
}

pub fn sql_existe_por_id(tabla: &'static Tabla) -> Result<String, ErrorConsulta> {
    let clave = clave_primaria_i64(tabla)?;
    let mut sql = String::from("SELECT EXISTS (SELECT 1 FROM ");

    escribir_identificador(&mut sql, tabla.nombre());
    sql.push_str(" WHERE ");
    escribir_identificador(&mut sql, clave.nombre());
    sql.push_str(" = $1)");

    Ok(sql)
}

pub fn sql_eliminar_por_id(
    tabla: &'static Tabla,
    retornando: bool,
) -> Result<String, ErrorConsulta> {
    let clave = clave_primaria_i64(tabla)?;
    let mut sql = String::from("DELETE FROM ");

    escribir_identificador(&mut sql, tabla.nombre());
    sql.push_str(" WHERE ");
    escribir_identificador(&mut sql, clave.nombre());
    sql.push_str(" = $1");

    if retornando {
        sql.push_str(" RETURNING ");
        escribir_columnas(&mut sql, tabla.columnas());
    }

    Ok(sql)
}

pub fn sql_bloquear_tabla(tabla: &'static Tabla) -> String {
    let mut sql = String::from("LOCK TABLE ");
    escribir_identificador(&mut sql, tabla.nombre());
    sql.push_str(" IN EXCLUSIVE MODE");
    sql
}

pub fn sql_contar(tabla: &'static Tabla) -> String {
    let mut sql = String::from("SELECT COUNT(*) FROM ");
    escribir_identificador(&mut sql, tabla.nombre());
    sql
}

pub fn sql_orden_maximo(tabla: &'static Tabla) -> Result<String, ErrorConsulta> {
    let orden = resolver_columna_tipada(tabla, COLUMNA_ORDEN, TipoColumna::I64)?;
    let mut sql = String::from("SELECT COALESCE(MAX(");

    escribir_identificador(&mut sql, orden.nombre());
    sql.push_str("), $1) + $2 FROM ");
    escribir_identificador(&mut sql, tabla.nombre());

    Ok(sql)
}

pub fn sql_asignar_orden(tabla: &'static Tabla) -> Result<String, ErrorConsulta> {
    let clave = clave_primaria_i64(tabla)?;
    let orden = resolver_columna_tipada(tabla, COLUMNA_ORDEN, TipoColumna::I64)?;
    let mut sql = String::from("UPDATE ");

    escribir_identificador(&mut sql, tabla.nombre());
    sql.push_str(" SET ");
    escribir_identificador(&mut sql, orden.nombre());
    sql.push_str(" = $1 WHERE ");
    escribir_identificador(&mut sql, clave.nombre());
    sql.push_str(" = $2");

    Ok(sql)
}

fn consulta_ordenes(tabla: &'static Tabla) -> ConsultaSelect {
    ConsultaSelect::de(tabla).columnas([tabla.clave_primaria().nombre(), COLUMNA_ORDEN])
}

pub fn sql_ordenes_para_actualizar(tabla: &'static Tabla) -> Result<String, ErrorConsulta> {
    consulta_ordenes(tabla)
        .donde_en::<i64>(tabla.clave_primaria().nombre())
        .para_actualizar()
        .construir()
}

pub fn sql_ordenes_posteriores_para_actualizar(
    tabla: &'static Tabla,
) -> Result<String, ErrorConsulta> {
    consulta_ordenes(tabla)
        .donde_mayor::<i64>(COLUMNA_ORDEN)
        .ordenar(&[Ordenamiento::asc(COLUMNA_ORDEN)])
        .para_actualizar()
        .construir()
}

/* ==========================================================
   LECTURA GENÉRICA
========================================================== */

/// `SELECT <columnas> FROM <tabla> [ORDER BY ...]` → `fetch_all`.
pub async fn obtener_todos<'c, T: Entidad>(
    ejecutor: impl PgExecutor<'c>,
    orden: impl CriteriosOrden,
) -> Result<Vec<T>, sqlx::Error> {
    let sql = sql_obtener_todos(T::TABLA, orden)?;

    sqlx::query_as::<_, T>(AssertSqlSafe(sql))
        .fetch_all(ejecutor)
        .await
}

/// `... WHERE <pk> = $1` → `fetch_optional` (`None` si no existe).
pub async fn obtener_por_id<'c, T: Entidad>(
    ejecutor: impl PgExecutor<'c>,
    id: i64,
) -> Result<Option<T>, sqlx::Error> {
    let sql = sql_obtener_por_id(T::TABLA, false)?;

    sqlx::query_as::<_, T>(AssertSqlSafe(sql))
        .bind(id)
        .fetch_optional(ejecutor)
        .await
}

/// Igual que [`obtener_por_id`] pero bloquea la fila (`FOR UPDATE`).
/// Debe ejecutarse dentro de una transacción.
pub async fn obtener_por_id_para_actualizar<'c, T: Entidad>(
    ejecutor: impl PgExecutor<'c>,
    id: i64,
) -> Result<Option<T>, sqlx::Error> {
    let sql = sql_obtener_por_id(T::TABLA, true)?;

    sqlx::query_as::<_, T>(AssertSqlSafe(sql))
        .bind(id)
        .fetch_optional(ejecutor)
        .await
}

/// `... WHERE <columna> = $1 [ORDER BY ...]` → `fetch_all`.
///
/// El tipo de `valor` debe coincidir con el declarado para la columna.
pub async fn obtener_donde<'c, T, V>(
    ejecutor: impl PgExecutor<'c>,
    columna: &'static str,
    valor: V,
    orden: impl CriteriosOrden,
) -> Result<Vec<T>, sqlx::Error>
where
    T: Entidad,
    V: ValorColumna + for<'q> Encode<'q, Postgres> + Type<Postgres> + Send,
{
    let sql = sql_obtener_donde::<V>(T::TABLA, columna, orden)?;

    sqlx::query_as::<_, T>(AssertSqlSafe(sql))
        .bind(valor)
        .fetch_all(ejecutor)
        .await
}

/// `SELECT ... ORDER BY ... LIMIT $1` → `fetch_all`.
pub async fn obtener_con_limite<'c, T: Entidad>(
    ejecutor: impl PgExecutor<'c>,
    orden: impl CriteriosOrden,
    limite: i64,
) -> Result<Vec<T>, sqlx::Error> {
    let sql = sql_obtener_con_limite(T::TABLA, orden)?;

    sqlx::query_as::<_, T>(AssertSqlSafe(sql))
        .bind(limite)
        .fetch_all(ejecutor)
        .await
}

/// `SELECT EXISTS (SELECT 1 FROM <tabla> WHERE <pk> = $1)`.
pub async fn existe_por_id<'c>(
    ejecutor: impl PgExecutor<'c>,
    tabla: &'static Tabla,
    id: i64,
) -> Result<bool, sqlx::Error> {
    let sql = sql_existe_por_id(tabla)?;

    sqlx::query_scalar::<_, bool>(AssertSqlSafe(sql))
        .bind(id)
        .fetch_one(ejecutor)
        .await
}

/* ==========================================================
   ELIMINACIÓN GENÉRICA
========================================================== */

/// `DELETE FROM <tabla> WHERE <pk> = $1`. Devuelve las filas afectadas.
pub async fn eliminar_por_id<'c>(
    ejecutor: impl PgExecutor<'c>,
    tabla: &'static Tabla,
    id: i64,
) -> Result<u64, sqlx::Error> {
    let sql = sql_eliminar_por_id(tabla, false)?;

    Ok(sqlx::query(AssertSqlSafe(sql))
        .bind(id)
        .execute(ejecutor)
        .await?
        .rows_affected())
}

/// `DELETE ... RETURNING <columnas>` → `None` si la fila no existía.
pub async fn eliminar_por_id_retornando<'c, T: Entidad>(
    ejecutor: impl PgExecutor<'c>,
    id: i64,
) -> Result<Option<T>, sqlx::Error> {
    let sql = sql_eliminar_por_id(T::TABLA, true)?;

    sqlx::query_as::<_, T>(AssertSqlSafe(sql))
        .bind(id)
        .fetch_optional(ejecutor)
        .await
}

/* ==========================================================
   TABLAS CON COLUMNA `orden`
   Sólo sentencias puntuales: las reglas de reordenamiento,
   validaciones y bloqueos siguen en cada repositorio.
========================================================== */

/// `LOCK TABLE <tabla> IN EXCLUSIVE MODE` (dentro de una transacción).
pub async fn bloquear_tabla<'c>(
    ejecutor: impl PgExecutor<'c>,
    tabla: &'static Tabla,
) -> Result<(), sqlx::Error> {
    sqlx::query(AssertSqlSafe(sql_bloquear_tabla(tabla)))
        .execute(ejecutor)
        .await?;

    Ok(())
}

/// `SELECT COUNT(*) FROM <tabla>`.
pub async fn contar<'c>(
    ejecutor: impl PgExecutor<'c>,
    tabla: &'static Tabla,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar::<_, i64>(AssertSqlSafe(sql_contar(tabla)))
        .fetch_one(ejecutor)
        .await
}

/// `SELECT COALESCE(MAX(orden), si_vacia) + incremento FROM <tabla>`.
///
/// El cálculo se mantiene en PostgreSQL, igual que en las consultas
/// originales; cada repositorio conserva sus propios valores.
pub async fn orden_maximo<'c>(
    ejecutor: impl PgExecutor<'c>,
    tabla: &'static Tabla,
    si_vacia: i64,
    incremento: i64,
) -> Result<i64, sqlx::Error> {
    let sql = sql_orden_maximo(tabla)?;

    sqlx::query_scalar::<_, i64>(AssertSqlSafe(sql))
        .bind(si_vacia)
        .bind(incremento)
        .fetch_one(ejecutor)
        .await
}

/// `SELECT id, orden FROM <tabla> WHERE id = ANY($1) FOR UPDATE`.
pub async fn obtener_ordenes_para_actualizar<'c>(
    ejecutor: impl PgExecutor<'c>,
    tabla: &'static Tabla,
    ids: &[i64],
) -> Result<Vec<(i64, i64)>, sqlx::Error> {
    let sql = sql_ordenes_para_actualizar(tabla)?;

    sqlx::query_as::<_, (i64, i64)>(AssertSqlSafe(sql))
        .bind(ids)
        .fetch_all(ejecutor)
        .await
}

/// `SELECT id, orden FROM <tabla> WHERE orden > $1 ORDER BY orden ASC FOR UPDATE`.
pub async fn obtener_ordenes_posteriores_para_actualizar<'c>(
    ejecutor: impl PgExecutor<'c>,
    tabla: &'static Tabla,
    orden: i64,
) -> Result<Vec<(i64, i64)>, sqlx::Error> {
    let sql = sql_ordenes_posteriores_para_actualizar(tabla)?;

    sqlx::query_as::<_, (i64, i64)>(AssertSqlSafe(sql))
        .bind(orden)
        .fetch_all(ejecutor)
        .await
}

/// `UPDATE <tabla> SET orden = $1 WHERE id = $2`. Devuelve las filas
/// afectadas para que cada repositorio aplique su propia política.
pub async fn asignar_orden<'c>(
    ejecutor: impl PgExecutor<'c>,
    tabla: &'static Tabla,
    id: i64,
    orden: i64,
) -> Result<u64, sqlx::Error> {
    let sql = sql_asignar_orden(tabla)?;

    Ok(sqlx::query(AssertSqlSafe(sql))
        .bind(orden)
        .bind(id)
        .execute(ejecutor)
        .await?
        .rows_affected())
}

#[cfg(test)]
#[path = "base_tests.rs"]
mod tests;
