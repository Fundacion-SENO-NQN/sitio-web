use super::*;
use crate::models::tabla::{Columna, Tabla, TipoColumna};

static PRUEBA_TABLA: Tabla = Tabla::nueva(
    "usuarios_test",
    "id",
    &[
        Columna::requerida("id", TipoColumna::I64),
        Columna::requerida("nombre", TipoColumna::String),
        Columna::requerida("activo", TipoColumna::Bool),
        Columna::opcional("telefono", TipoColumna::String),
        Columna::requerida("orden", TipoColumna::I64),
        Columna::requerida("created_at", TipoColumna::TimestampTz),
    ],
);

static TABLA_PALABRA_RESERVADA: Tabla = Tabla::nueva(
    "user",
    "id",
    &[
        Columna::requerida("id", TipoColumna::I64),
        Columna::requerida("order", TipoColumna::I64),
        Columna::requerida("all", TipoColumna::String),
    ],
);

#[test]
fn select_sin_order_by() {
    let sql = sql_obtener_todos(&PRUEBA_TABLA, ()).unwrap();
    assert_eq!(
        sql,
        "SELECT id, nombre, activo, telefono, orden, created_at FROM usuarios_test"
    );

    let sql_none = sql_obtener_todos(&PRUEBA_TABLA, None::<Ordenamiento>).unwrap();
    assert_eq!(sql_none, sql);
}

#[test]
fn select_con_order_by_ascendente() {
    let sql = sql_obtener_todos(&PRUEBA_TABLA, Some(Ordenamiento::asc("nombre"))).unwrap();

    assert_eq!(
        sql,
        "SELECT id, nombre, activo, telefono, orden, created_at FROM usuarios_test ORDER BY nombre ASC"
    );
}

#[test]
fn select_con_order_by_descendente() {
    let sql = sql_obtener_todos(&PRUEBA_TABLA, Ordenamiento::desc("created_at")).unwrap();

    assert_eq!(
        sql,
        "SELECT id, nombre, activo, telefono, orden, created_at FROM usuarios_test ORDER BY created_at DESC"
    );
}

#[test]
fn select_con_multiples_columnas_de_orden() {
    let sql = sql_obtener_todos(
        &PRUEBA_TABLA,
        [Ordenamiento::asc("orden"), Ordenamiento::desc("id")],
    )
    .unwrap();

    assert_eq!(
        sql,
        "SELECT id, nombre, activo, telefono, orden, created_at FROM usuarios_test ORDER BY orden ASC, id DESC"
    );
}

#[test]
fn lista_columnas_es_explicita() {
    let columnas = lista_columnas(&PRUEBA_TABLA);
    assert_eq!(columnas, "id, nombre, activo, telefono, orden, created_at");
    assert!(!columnas.contains('*'));
}

#[test]
fn cita_palabras_reservadas_en_sql() {
    let sql =
        sql_obtener_todos(&TABLA_PALABRA_RESERVADA, Some(Ordenamiento::asc("order"))).unwrap();

    assert_eq!(
        sql,
        "SELECT id, \"order\", \"all\" FROM \"user\" ORDER BY \"order\" ASC"
    );
}

#[test]
fn select_por_id_generado() {
    let sql = sql_obtener_por_id(&PRUEBA_TABLA, false).unwrap();
    assert_eq!(
        sql,
        "SELECT id, nombre, activo, telefono, orden, created_at FROM usuarios_test WHERE id = $1"
    );

    let sql_lock = sql_obtener_por_id(&PRUEBA_TABLA, true).unwrap();
    assert_eq!(
        sql_lock,
        "SELECT id, nombre, activo, telefono, orden, created_at FROM usuarios_test WHERE id = $1 FOR UPDATE"
    );
}

#[test]
fn select_con_condicion_where_tipada() {
    let sql = sql_obtener_donde::<bool>(&PRUEBA_TABLA, "activo", Some(Ordenamiento::asc("nombre")))
        .unwrap();

    assert_eq!(
        sql,
        "SELECT id, nombre, activo, telefono, orden, created_at FROM usuarios_test WHERE activo = $1 ORDER BY nombre ASC"
    );
}

#[test]
fn select_con_columna_nullable_usa_is_not_distinct_from() {
    let sql = ConsultaSelect::de(&PRUEBA_TABLA)
        .donde_igual::<Option<String>>("telefono")
        .construir()
        .unwrap();

    assert_eq!(
        sql,
        "SELECT id, nombre, activo, telefono, orden, created_at FROM usuarios_test WHERE telefono IS NOT DISTINCT FROM $1"
    );
}

#[test]
fn rechaza_comparacion_nula_en_columna_no_nullable() {
    let err = ConsultaSelect::de(&PRUEBA_TABLA)
        .donde_igual::<Option<String>>("nombre")
        .construir()
        .unwrap_err();

    assert!(matches!(err, ErrorConsulta::NuloNoPermitido { .. }));
}

#[test]
fn rechaza_columna_inexistente_en_where_y_order() {
    let err_where = sql_obtener_donde::<i64>(&PRUEBA_TABLA, "inexistente", ()).unwrap_err();
    assert!(matches!(
        err_where,
        ErrorConsulta::ColumnaDesconocida {
            columna: "inexistente",
            ..
        }
    ));

    let err_order =
        sql_obtener_todos(&PRUEBA_TABLA, Some(Ordenamiento::asc("columna_falsa"))).unwrap_err();
    assert!(matches!(
        err_order,
        ErrorConsulta::ColumnaDesconocida {
            columna: "columna_falsa",
            ..
        }
    ));
}

#[test]
fn rechaza_tipo_incompatible_en_where() {
    // "activo" es Bool, pasar i64 debe fallar
    let err = sql_obtener_donde::<i64>(&PRUEBA_TABLA, "activo", ()).unwrap_err();
    assert!(matches!(
        err,
        ErrorConsulta::TipoIncompatible {
            declarado: TipoColumna::Bool,
            recibido: TipoColumna::I64,
            ..
        }
    ));
}

#[test]
fn select_con_limite() {
    let sql =
        sql_obtener_con_limite(&PRUEBA_TABLA, Some(Ordenamiento::desc("created_at"))).unwrap();

    assert_eq!(
        sql,
        "SELECT id, nombre, activo, telefono, orden, created_at FROM usuarios_test ORDER BY created_at DESC LIMIT $1"
    );
}

#[test]
fn delete_por_id_con_y_sin_returning() {
    let sql_simple = sql_eliminar_por_id(&PRUEBA_TABLA, false).unwrap();
    assert_eq!(sql_simple, "DELETE FROM usuarios_test WHERE id = $1");

    let sql_returning = sql_eliminar_por_id(&PRUEBA_TABLA, true).unwrap();
    assert_eq!(
        sql_returning,
        "DELETE FROM usuarios_test WHERE id = $1 RETURNING id, nombre, activo, telefono, orden, created_at"
    );
}

#[test]
fn existe_por_id_generado() {
    let sql = sql_existe_por_id(&PRUEBA_TABLA).unwrap();
    assert_eq!(
        sql,
        "SELECT EXISTS (SELECT 1 FROM usuarios_test WHERE id = $1)"
    );
}

#[test]
fn operaciones_de_orden_generadas() {
    let sql_lock = sql_bloquear_tabla(&PRUEBA_TABLA);
    assert_eq!(sql_lock, "LOCK TABLE usuarios_test IN EXCLUSIVE MODE");

    let sql_count = sql_contar(&PRUEBA_TABLA);
    assert_eq!(sql_count, "SELECT COUNT(*) FROM usuarios_test");

    let sql_max = sql_orden_maximo(&PRUEBA_TABLA).unwrap();
    assert_eq!(
        sql_max,
        "SELECT COALESCE(MAX(orden), $1) + $2 FROM usuarios_test"
    );

    let sql_assign = sql_asignar_orden(&PRUEBA_TABLA).unwrap();
    assert_eq!(
        sql_assign,
        "UPDATE usuarios_test SET orden = $1 WHERE id = $2"
    );

    let sql_pending = sql_ordenes_para_actualizar(&PRUEBA_TABLA).unwrap();
    assert_eq!(
        sql_pending,
        "SELECT id, orden FROM usuarios_test WHERE id = ANY($1) FOR UPDATE"
    );

    let sql_after = sql_ordenes_posteriores_para_actualizar(&PRUEBA_TABLA).unwrap();
    assert_eq!(
        sql_after,
        "SELECT id, orden FROM usuarios_test WHERE orden > $1 ORDER BY orden ASC FOR UPDATE"
    );
}
