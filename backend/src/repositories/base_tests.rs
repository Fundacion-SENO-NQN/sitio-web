use super::*;
use crate::models::tabla::{Columna, Tabla, TipoColumna};

static PRUEBA_TABLA: Tabla = Tabla::nueva(
    "usuarios_test",
    "id",
    &[
        Columna::inmutable("id", TipoColumna::I64),
        Columna::requerida("nombre", TipoColumna::String),
        Columna::requerida("activo", TipoColumna::Bool),
        Columna::opcional("telefono", TipoColumna::String),
        Columna::requerida("orden", TipoColumna::I64),
        Columna::inmutable("created_at", TipoColumna::TimestampTz),
    ],
);

static TABLA_PALABRA_RESERVADA: Tabla = Tabla::nueva(
    "user",
    "id",
    &[
        Columna::inmutable("id", TipoColumna::I64),
        Columna::requerida("order", TipoColumna::I64),
        Columna::requerida("all", TipoColumna::String),
    ],
);

static PRUEBA_MUTABILIDAD: Tabla = Tabla::nueva(
    "mutabilidad_test",
    "id",
    &[
        Columna::inmutable("id", TipoColumna::I64),
        Columna::requerida("nombre", TipoColumna::String),
        Columna::solo_insercion("codigo_fijo", TipoColumna::String),
        Columna::opcional("observaciones", TipoColumna::String),
        Columna::inmutable("created_at", TipoColumna::TimestampTz),
        Columna::inmutable("updated_at", TipoColumna::TimestampTz),
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

/* ==========================================================
   PRUEBAS DE INSERT Y REGLAS DE MUTABILIDAD
========================================================== */

#[test]
fn insert_generado_con_y_sin_returning() {
    let sql_todo = sql_insertar(
        &PRUEBA_MUTABILIDAD,
        &["nombre", "codigo_fijo", "observaciones"],
        true,
    )
    .unwrap();
    assert_eq!(
        sql_todo,
        "INSERT INTO mutabilidad_test (nombre, codigo_fijo, observaciones) VALUES ($1, $2, $3) RETURNING id, nombre, codigo_fijo, observaciones, created_at, updated_at"
    );

    let sql_simple = sql_insertar(&PRUEBA_MUTABILIDAD, &["nombre", "codigo_fijo"], false).unwrap();
    assert_eq!(
        sql_simple,
        "INSERT INTO mutabilidad_test (nombre, codigo_fijo) VALUES ($1, $2)"
    );

    let sql_ret_custom =
        sql_insertar_retornando(&PRUEBA_MUTABILIDAD, &["nombre"], &["id", "created_at"]).unwrap();
    assert_eq!(
        sql_ret_custom,
        "INSERT INTO mutabilidad_test (nombre) VALUES ($1) RETURNING id, created_at"
    );
}

#[test]
fn insert_rechaza_columna_inmutable() {
    let err_id = sql_insertar(&PRUEBA_MUTABILIDAD, &["id", "nombre"], false).unwrap_err();
    assert_eq!(
        err_id,
        ErrorConsulta::ColumnaNoInsertable {
            tabla: "mutabilidad_test",
            columna: "id",
        }
    );

    let err_created_at = sql_insertar(&PRUEBA_MUTABILIDAD, &["created_at"], false).unwrap_err();
    assert_eq!(
        err_created_at,
        ErrorConsulta::ColumnaNoInsertable {
            tabla: "mutabilidad_test",
            columna: "created_at",
        }
    );
}

#[test]
fn insert_rechaza_lista_vacia_o_columna_inexistente() {
    let err_vacio = sql_insertar(&PRUEBA_MUTABILIDAD, &[], false).unwrap_err();
    assert!(matches!(err_vacio, ErrorConsulta::SinColumnas { .. }));

    let err_col = sql_insertar(&PRUEBA_MUTABILIDAD, &["no_existe"], false).unwrap_err();
    assert!(matches!(
        err_col,
        ErrorConsulta::ColumnaDesconocida {
            columna: "no_existe",
            ..
        }
    ));
}

#[test]
fn insert_builder_con_metodo_columna() {
    let sql = ConsultaInsert::en(&PRUEBA_MUTABILIDAD)
        .columna("nombre")
        .columna("codigo_fijo")
        .construir()
        .unwrap();
    assert_eq!(
        sql,
        "INSERT INTO mutabilidad_test (nombre, codigo_fijo) VALUES ($1, $2)"
    );
}

/* ==========================================================
   PRUEBAS DE UPDATE Y CONTROL DE CAMBIOS
========================================================== */

#[test]
fn update_coalesce_por_id_generado() {
    let sql =
        sql_actualizar_coalesce_por_id(&PRUEBA_MUTABILIDAD, &["nombre", "observaciones"], true)
            .unwrap();
    assert_eq!(
        sql,
        "UPDATE mutabilidad_test SET nombre = COALESCE($1, nombre), observaciones = COALESCE($2, observaciones) WHERE id = $3 RETURNING id, nombre, codigo_fijo, observaciones, created_at, updated_at"
    );
}

#[test]
fn update_coalesce_con_timestamp_generado() {
    let sql = sql_actualizar_coalesce_con_timestamp_por_id(
        &PRUEBA_MUTABILIDAD,
        &["nombre"],
        "updated_at",
        false,
    )
    .unwrap();
    assert_eq!(
        sql,
        "UPDATE mutabilidad_test SET nombre = COALESCE($1, nombre), updated_at = NOW() WHERE id = $2"
    );
}

#[test]
fn update_rechaza_columna_inmutable_o_solo_insercion() {
    let err_id = sql_actualizar_coalesce_por_id(&PRUEBA_MUTABILIDAD, &["id"], false).unwrap_err();
    assert_eq!(
        err_id,
        ErrorConsulta::ColumnaNoActualizable {
            tabla: "mutabilidad_test",
            columna: "id",
        }
    );

    let err_created_at =
        sql_actualizar_coalesce_por_id(&PRUEBA_MUTABILIDAD, &["created_at"], false).unwrap_err();
    assert_eq!(
        err_created_at,
        ErrorConsulta::ColumnaNoActualizable {
            tabla: "mutabilidad_test",
            columna: "created_at",
        }
    );

    // `codigo_fijo` sólo se asigna al insertar
    let err_solo_ins =
        sql_actualizar_coalesce_por_id(&PRUEBA_MUTABILIDAD, &["codigo_fijo"], false).unwrap_err();
    assert_eq!(
        err_solo_ins,
        ErrorConsulta::ColumnaNoActualizable {
            tabla: "mutabilidad_test",
            columna: "codigo_fijo",
        }
    );

    // `updated_at` es inmutable ante valores directos; sólo se actualiza con NOW()
    let err_updated_at =
        sql_actualizar_coalesce_por_id(&PRUEBA_MUTABILIDAD, &["updated_at"], false).unwrap_err();
    assert_eq!(
        err_updated_at,
        ErrorConsulta::ColumnaNoActualizable {
            tabla: "mutabilidad_test",
            columna: "updated_at",
        }
    );
}

#[test]
fn update_rechaza_nulo_en_columna_no_nullable() {
    let err = ConsultaUpdate::en(&PRUEBA_MUTABILIDAD)
        .asignar_nulo("nombre")
        .donde_clave_primaria()
        .construir()
        .unwrap_err();

    assert_eq!(
        err,
        ErrorConsulta::NuloNoPermitido {
            tabla: "mutabilidad_test",
            columna: "nombre",
        }
    );

    // En cambio, en columna opcional sí es válido
    let sql_ok = ConsultaUpdate::en(&PRUEBA_MUTABILIDAD)
        .asignar_nulo("observaciones")
        .donde_clave_primaria()
        .construir()
        .unwrap();

    assert_eq!(
        sql_ok,
        "UPDATE mutabilidad_test SET observaciones = NULL WHERE id = $1"
    );
}

#[test]
fn update_directo_y_condiciones_compuestas() {
    let sql = ConsultaUpdate::en(&PRUEBA_MUTABILIDAD)
        .asignar("nombre")
        .asignar_ahora("updated_at")
        .donde_clave_primaria()
        .donde_igual("codigo_fijo")
        .construir()
        .unwrap();

    assert_eq!(
        sql,
        "UPDATE mutabilidad_test SET nombre = $1, updated_at = NOW() WHERE id = $2 AND codigo_fijo = $3"
    );
}

#[test]
fn update_rechaza_sentencia_sin_asignaciones() {
    let err = ConsultaUpdate::en(&PRUEBA_MUTABILIDAD)
        .donde_clave_primaria()
        .construir()
        .unwrap_err();

    assert_eq!(
        err,
        ErrorConsulta::SinAsignaciones {
            tabla: "mutabilidad_test"
        }
    );
}

#[test]
fn update_directo_helper_y_retornando_especifico() {
    let sql = sql_actualizar_directo_por_id(&PRUEBA_MUTABILIDAD, &["nombre"], true).unwrap();
    assert_eq!(
        sql,
        "UPDATE mutabilidad_test SET nombre = $1 WHERE id = $2 RETURNING id, nombre, codigo_fijo, observaciones, created_at, updated_at"
    );

    let sql_custom_ret = ConsultaUpdate::en(&PRUEBA_MUTABILIDAD)
        .asignar("nombre")
        .donde_clave_primaria()
        .retornando(["id", "nombre"])
        .construir()
        .unwrap();
    assert_eq!(
        sql_custom_ret,
        "UPDATE mutabilidad_test SET nombre = $1 WHERE id = $2 RETURNING id, nombre"
    );
}

#[test]
fn tablas_reales_protegen_mutabilidad_estricta() {
    use crate::repositories::tablas::{BINGOS, EQUIPO, NOTICIAS};

    // NOTICIAS: `orden` es solo_insercion; actualizarlo debe ser rechazado
    let err_noticia = sql_actualizar_coalesce_por_id(&NOTICIAS, &["orden"], false).unwrap_err();
    assert_eq!(
        err_noticia,
        ErrorConsulta::ColumnaNoActualizable {
            tabla: "noticias",
            columna: "orden"
        }
    );

    // EQUIPO: `id` y `created_at` son inmutables
    let err_equipo_id = sql_actualizar_coalesce_por_id(&EQUIPO, &["id"], false).unwrap_err();
    assert_eq!(
        err_equipo_id,
        ErrorConsulta::ColumnaNoActualizable {
            tabla: "equipo",
            columna: "id"
        }
    );

    // BINGOS: `created_at` no admite inserciones directas
    let err_bingo_ins = sql_insertar(&BINGOS, &["created_at"], false).unwrap_err();
    assert_eq!(
        err_bingo_ins,
        ErrorConsulta::ColumnaNoInsertable {
            tabla: "bingos",
            columna: "created_at"
        }
    );
}
