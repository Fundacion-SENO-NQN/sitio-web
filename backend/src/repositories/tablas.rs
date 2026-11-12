/* ==========================================================
   DEFINICIONES DE TABLAS
   ----------------------------------------------------------
   Único lugar donde se declaran las tablas usadas por las
   operaciones genéricas de `repositories::base`.

   Las columnas, su orden, su tipo y su nulabilidad reflejan
   el esquema existente tal como lo leen los modelos y las
   consultas originales de cada repositorio. Al agregar una
   columna a un modelo `Entidad`, hay que agregarla aquí.

   Al ser `static`, cada `Tabla::nueva` se evalúa al
   compilar: un identificador inválido, una columna repetida
   o una clave primaria inexistente no compilan.
========================================================== */

use super::base::Entidad;
use crate::models::{
    bingo::Bingo,
    equipo::Equipo,
    logro::Logro,
    metodo_donacion::MetodoDonacion,
    noticia::Noticia,
    role::Role,
    service::Service,
    tabla::{Columna, Tabla, TipoColumna as Tipo},
};

/* ==========================================================
   CONTENIDO INSTITUCIONAL
========================================================== */

pub static EQUIPO: Tabla = Tabla::nueva(
    "equipo",
    "id",
    &[
        Columna::requerida("id", Tipo::I64),
        Columna::requerida("orden", Tipo::I64),
        Columna::requerida("nombre", Tipo::String),
        Columna::requerida("apellido", Tipo::String),
        Columna::requerida("puesto", Tipo::String),
        Columna::requerida("descripcion", Tipo::String),
        Columna::requerida("created_at", Tipo::TimestampTz),
    ],
);

/// Sin `Entidad`: `Evento` incluye columnas de `url_eventos` (LEFT JOIN).
pub static EVENTOS: Tabla = Tabla::nueva(
    "eventos",
    "id",
    &[
        Columna::requerida("id", Tipo::I64),
        Columna::requerida("created_at", Tipo::TimestampTz),
        Columna::requerida("titulo", Tipo::String),
        Columna::requerida("descripcion", Tipo::String),
        Columna::requerida("orden", Tipo::I64),
        Columna::opcional("lugar", Tipo::String),
        Columna::opcional("fecha", Tipo::String),
        Columna::opcional("horario", Tipo::String),
        Columna::requerida("cant_img", Tipo::I64),
        Columna::opcional("url_id", Tipo::I64),
    ],
);

pub static LOGROS: Tabla = Tabla::nueva(
    "logros",
    "id",
    &[
        Columna::requerida("id", Tipo::I64),
        Columna::requerida("orden", Tipo::I64),
        Columna::requerida("titulo", Tipo::String),
        Columna::requerida("contenido", Tipo::String),
        Columna::requerida("image_count", Tipo::I16),
        Columna::requerida("created_at", Tipo::TimestampTz),
    ],
);

/// Sin `Entidad`: los destacados se exponen como `Logro` mediante JOIN.
pub static LOGROS_FAV: Tabla = Tabla::nueva(
    "logros_fav",
    "id",
    &[
        Columna::requerida("id", Tipo::I64),
        Columna::requerida("logro_id", Tipo::I64),
        Columna::requerida("orden", Tipo::I64),
        Columna::requerida("created_at", Tipo::TimestampTz),
    ],
);

pub static NOTICIAS: Tabla = Tabla::nueva(
    "noticias",
    "id",
    &[
        Columna::requerida("id", Tipo::I64),
        Columna::requerida("created_at", Tipo::TimestampTz),
        Columna::requerida("fecha", Tipo::String),
        Columna::requerida("titulo", Tipo::String),
        Columna::requerida("orden", Tipo::I64),
        Columna::requerida("contenido", Tipo::String),
        Columna::requerida("cant_img", Tipo::I64),
    ],
);

/* ==========================================================
   DONACIONES
========================================================== */

pub static METODO_DONACION: Tabla = Tabla::nueva(
    "metodo_donacion",
    "id",
    &[
        Columna::requerida("id", Tipo::I64),
        Columna::requerida("nombre", Tipo::String),
        Columna::requerida("descripcion", Tipo::String),
        Columna::requerida("created_at", Tipo::TimestampTz),
        Columna::requerida("updated_at", Tipo::TimestampTz),
    ],
);

/// Su `Entidad` es la fila privada de `repositories::metodo_donacion`, que
/// incluye `metodo_donacion_id` para agrupar.
pub static INFORMACION_DONACION: Tabla = Tabla::nueva(
    "informacion_donacion",
    "id",
    &[
        Columna::requerida("id", Tipo::I64),
        Columna::requerida("titulo", Tipo::String),
        Columna::requerida("valor", Tipo::String),
        Columna::requerida("created_at", Tipo::TimestampTz),
        Columna::requerida("updated_at", Tipo::TimestampTz),
        Columna::requerida("metodo_donacion_id", Tipo::I64),
    ],
);

/* ==========================================================
   BINGO
========================================================== */

pub static BINGOS: Tabla = Tabla::nueva(
    "bingos",
    "id",
    &[
        Columna::requerida("id", Tipo::I64),
        Columna::requerida("name", Tipo::String),
        Columna::requerida("last_name", Tipo::String),
        Columna::requerida("phone", Tipo::String),
        Columna::requerida("neighborhood", Tipo::String),
        Columna::requerida("collection_date", Tipo::String),
        Columna::requerida("collection_locate", Tipo::String),
        Columna::requerida("start_month", Tipo::I16),
        Columna::requerida("locality", Tipo::String),
        Columna::requerida("quote", Tipo::I16),
        Columna::requerida("nro_bingo", Tipo::I16),
        Columna::requerida("late_payment_notice", Tipo::I16),
        Columna::requerida("address", Tipo::String),
        Columna::requerida("created_at", Tipo::TimestampTz),
    ],
);

/* ==========================================================
   ROLES Y SERVICIOS
========================================================== */

pub static ROLES: Tabla = Tabla::nueva(
    "roles",
    "id",
    &[
        Columna::requerida("id", Tipo::I64),
        Columna::requerida("name", Tipo::String),
        Columna::requerida("created_at", Tipo::TimestampTz),
    ],
);

pub static SERVICES: Tabla = Tabla::nueva(
    "services",
    "id",
    &[
        Columna::requerida("id", Tipo::I64),
        Columna::requerida("name", Tipo::String),
        Columna::requerida("titulo", Tipo::String),
        Columna::requerida("url", Tipo::String),
        Columna::requerida("created_at", Tipo::TimestampTz),
    ],
);

pub static USERS: Tabla = Tabla::nueva(
    "users",
    "id",
    &[
        Columna::requerida("id", Tipo::I64),
        Columna::requerida("username", Tipo::String),
        Columna::requerida("email", Tipo::String),
        Columna::requerida("name", Tipo::String),
        Columna::requerida("last_name", Tipo::String),
        Columna::requerida("password_hash", Tipo::String),
        Columna::requerida("role_id", Tipo::I64),
        Columna::requerida("auth_version", Tipo::I64),
        Columna::requerida("active", Tipo::Bool),
        Columna::requerida("created_at", Tipo::TimestampTz),
    ],
);

/* ==========================================================
   MODELOS ASOCIADOS
========================================================== */

impl Entidad for Equipo {
    const TABLA: &'static Tabla = &EQUIPO;
}

impl Entidad for Logro {
    const TABLA: &'static Tabla = &LOGROS;
}

impl Entidad for Noticia {
    const TABLA: &'static Tabla = &NOTICIAS;
}

impl Entidad for MetodoDonacion {
    const TABLA: &'static Tabla = &METODO_DONACION;
}

impl Entidad for Bingo {
    const TABLA: &'static Tabla = &BINGOS;
}

impl Entidad for Role {
    const TABLA: &'static Tabla = &ROLES;
}

impl Entidad for Service {
    const TABLA: &'static Tabla = &SERVICES;
}
