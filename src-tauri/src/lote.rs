//! D-004 (aprobada en la Etapa 10): un lote de sentencias SQL dentro de UNA transacción real.
//!
//! El plugin SQL reparte cada orden entre las conexiones de su *pool*, así que `BEGIN` y `COMMIT` enviados por
//! separado pueden caer en conexiones distintas (issue `tauri-apps/plugins-workspace#886`). Este comando toma
//! UNA conexión del mismo pool que abrió el plugin (`DbInstances`), abre `BEGIN IMMEDIATE` (pide el bloqueo de
//! escritura desde el principio, así no falla a mitad por «database is locked») y ejecuta todas las sentencias:
//! o se aplican todas o no se aplica ninguna.
//!
//! Los parámetros se enlazan como lo hace el plugin (null, texto, número), con dos diferencias a propósito:
//! los enteros se enlazan como entero (el plugin los convierte a decimal) y los booleanos como 0 o 1.

use serde::Deserialize;
use serde_json::Value;
use sqlx::query::Query;
use sqlx::sqlite::SqliteArguments;
use sqlx::{Pool, Sqlite};
use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool};

use crate::BASES_DE_DATOS;

/// Una sentencia del lote: el SQL con parámetros «?» y sus valores en orden.
#[derive(Debug, Deserialize)]
pub struct Sentencia {
    pub sql: String,
    pub parametros: Vec<Value>,
}

/// Solo las bases que declara el programa (la instalada y la de desarrollo).
fn validar_base(base: &str, permitidas: &[&str]) -> Result<(), String> {
    if permitidas.contains(&base) {
        Ok(())
    } else {
        Err("Base de datos no permitida.".to_string())
    }
}

type Consulta<'q> = Query<'q, Sqlite, SqliteArguments<'q>>;

/// Enlaza un valor JSON a la consulta: null, texto, entero, decimal, booleano (0 o 1);
/// una lista o un objeto se guardan como texto JSON.
fn enlazar(consulta: Consulta<'_>, valor: Value) -> Consulta<'_> {
    match valor {
        Value::Null => consulta.bind(None::<String>),
        Value::String(texto) => consulta.bind(texto),
        Value::Bool(si) => consulta.bind(i64::from(si)),
        Value::Number(numero) => match numero.as_i64() {
            Some(entero) => consulta.bind(entero),
            None => consulta.bind(numero.as_f64().unwrap_or_default()),
        },
        otro => consulta.bind(otro.to_string()),
    }
}

/// Texto del error de SQLite sin los valores de los parámetros (pueden ser datos personales):
/// el mensaje del motor dice la tabla y la columna, nunca el dato.
fn mensaje_de(error: &sqlx::Error) -> String {
    match error {
        sqlx::Error::Database(base) => match base.code() {
            Some(codigo) => format!("{} (código {codigo})", base.message()),
            None => base.message().to_string(),
        },
        otro => otro.to_string(),
    }
}

/// Ejecuta todas las sentencias en una transacción de `pool`. Si una falla, deshace todo y
/// devuelve «Falló la sentencia N de M: …». Un lote vacío no hace nada.
pub async fn ejecutar_en_transaccion(
    pool: &Pool<Sqlite>,
    sentencias: Vec<Sentencia>,
) -> Result<(), String> {
    let total = sentencias.len();
    if total == 0 {
        return Ok(());
    }
    let mut transaccion = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|e| format!("No se pudo iniciar la transacción: {}", mensaje_de(&e)))?;
    for (indice, sentencia) in sentencias.into_iter().enumerate() {
        let mut consulta = sqlx::query(&sentencia.sql);
        for valor in sentencia.parametros {
            consulta = enlazar(consulta, valor);
        }
        if let Err(error) = consulta.execute(&mut *transaccion).await {
            // Si SQLite ya deshizo la transacción por su cuenta, este ROLLBACK falla y no importa:
            // lo que se informa es el error original.
            let _ = transaccion.rollback().await;
            return Err(format!(
                "Falló la sentencia {} de {total}: {}",
                indice + 1,
                mensaje_de(&error)
            ));
        }
    }
    // Si el COMMIT falla, al soltar la transacción sqlx la deshace.
    transaccion
        .commit()
        .await
        .map_err(|e| format!("No se pudo confirmar la transacción: {}", mensaje_de(&e)))
}

/// Busca la base `base` entre las que el plugin SQL ya abrió y ejecuta el lote en una transacción de su pool.
pub async fn ejecutar_en_base(
    instancias: &DbInstances,
    base: &str,
    sentencias: Vec<Sentencia>,
) -> Result<(), String> {
    // Se clona el pool (es un contador de referencias) y se suelta el candado de lectura antes de
    // escribir, para no bloquear a `Database.load` mientras dura el lote.
    let pool = {
        let abiertas = instancias.0.read().await;
        match abiertas.get(base) {
            // Con solo la característica `sqlite` del plugin, `DbPool` tiene una única variante.
            // Si alguien activara MySQL o PostgreSQL, esta línea dejaría de compilar: a propósito.
            Some(DbPool::Sqlite(pool)) => pool.clone(),
            None => return Err("La base de datos todavía no está abierta.".to_string()),
        }
    };
    ejecutar_en_transaccion(&pool, sentencias).await
}

/// D-004: ejecuta un lote de sentencias en una sola transacción sobre la base `base`
/// (la misma que abrió el plugin SQL con `Database.load`).
#[tauri::command]
pub async fn ejecutar_lote(
    instancias: State<'_, DbInstances>,
    base: String,
    sentencias: Vec<Sentencia>,
) -> Result<(), String> {
    validar_base(&base, &BASES_DE_DATOS)?;
    ejecutar_en_base(&instancias, &base, sentencias).await
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use serde_json::json;
    use sqlx::sqlite::SqliteConnectOptions;
    use sqlx::{Executor, Row};
    use std::path::PathBuf;
    use std::str::FromStr;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static CONTADOR: AtomicUsize = AtomicUsize::new(0);

    /// Base SQLite temporal en un archivo propio de cada prueba (se borra al terminar).
    struct BaseTemporal {
        carpeta: PathBuf,
        pool: Pool<Sqlite>,
    }

    impl Drop for BaseTemporal {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.carpeta);
        }
    }

    const ESQUEMA: &str = "
        CREATE TABLE padre (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL UNIQUE) STRICT;
        CREATE TABLE hijo (
            id INTEGER PRIMARY KEY,
            padre_id INTEGER NOT NULL REFERENCES padre (id),
            edad INTEGER CHECK (edad IS NULL OR edad >= 0)
        ) STRICT;
        CREATE TABLE tipos (
            id INTEGER PRIMARY KEY,
            nulo TEXT,
            texto TEXT,
            entero INTEGER,
            decimal REAL,
            booleano INTEGER,
            json TEXT
        ) STRICT;
        CREATE TABLE bitacora (id INTEGER PRIMARY KEY, texto TEXT NOT NULL) STRICT;
        CREATE TRIGGER bitacora_sin_prohibido BEFORE INSERT ON bitacora
        WHEN NEW.texto = 'prohibido'
        BEGIN SELECT RAISE(ABORT, 'texto prohibido'); END;
    ";

    fn base_de_prueba() -> BaseTemporal {
        let n = CONTADOR.fetch_add(1, Ordering::SeqCst);
        let carpeta = std::env::temp_dir().join(format!("registro-caprino-lote-{}-{n}", std::process::id()));
        std::fs::create_dir_all(&carpeta).unwrap();
        let archivo = carpeta.join("prueba.db");
        // Mismas opciones que usa el plugin: la URL `sqlite:ruta` con los valores por defecto de sqlx
        // (claves foráneas activas, WAL).
        let opciones = SqliteConnectOptions::from_str(&format!("sqlite:{}", archivo.display()))
            .unwrap()
            .create_if_missing(true);
        let pool = tauri::async_runtime::block_on(async {
            let pool = Pool::<Sqlite>::connect_with(opciones).await.unwrap();
            pool.execute(ESQUEMA).await.unwrap();
            pool
        });
        BaseTemporal { carpeta, pool }
    }

    fn sentencia(sql: &str, parametros: Vec<Value>) -> Sentencia {
        Sentencia { sql: sql.to_string(), parametros }
    }

    fn contar(base: &BaseTemporal, tabla: &str) -> i64 {
        tauri::async_runtime::block_on(async {
            sqlx::query(&format!("SELECT COUNT(*) AS n FROM {tabla}"))
                .fetch_one(&base.pool)
                .await
                .unwrap()
                .get::<i64, _>("n")
        })
    }

    fn ejecutar(base: &BaseTemporal, sentencias: Vec<Sentencia>) -> Result<(), String> {
        tauri::async_runtime::block_on(ejecutar_en_transaccion(&base.pool, sentencias))
    }

    #[test]
    fn un_lote_completo_se_aplica() {
        let base = base_de_prueba();
        ejecutar(
            &base,
            vec![
                sentencia("INSERT INTO padre (id, nombre) VALUES (?, ?)", vec![json!(1), json!("Aurora")]),
                sentencia("INSERT INTO hijo (id, padre_id, edad) VALUES (?, ?, ?)", vec![json!(1), json!(1), json!(3)]),
                sentencia("UPDATE hijo SET edad = edad + ? WHERE id = ?", vec![json!(1), json!(1)]),
            ],
        )
        .unwrap();
        assert_eq!(contar(&base, "padre"), 1);
        let edad: i64 = tauri::async_runtime::block_on(async {
            sqlx::query("SELECT edad FROM hijo WHERE id = 1").fetch_one(&base.pool).await.unwrap().get(0)
        });
        assert_eq!(edad, 4);
    }

    #[test]
    fn un_lote_vacio_no_hace_nada() {
        let base = base_de_prueba();
        ejecutar(&base, vec![]).unwrap();
    }

    #[test]
    fn si_la_ultima_falla_por_unique_no_queda_nada_de_las_anteriores() {
        let base = base_de_prueba();
        ejecutar(&base, vec![sentencia("INSERT INTO padre (id, nombre) VALUES (1, 'Aurora')", vec![])]).unwrap();
        let error = ejecutar(
            &base,
            vec![
                sentencia("INSERT INTO padre (id, nombre) VALUES (?, ?)", vec![json!(2), json!("Luna")]),
                sentencia("INSERT INTO padre (id, nombre) VALUES (?, ?)", vec![json!(3), json!("Estrella")]),
                sentencia("INSERT INTO padre (id, nombre) VALUES (?, ?)", vec![json!(4), json!("Aurora")]),
            ],
        )
        .unwrap_err();
        assert!(error.starts_with("Falló la sentencia 3 de 3: "), "{error}");
        assert!(error.contains("UNIQUE constraint failed: padre.nombre"), "{error}");
        // Los valores de los parámetros no se repiten en el mensaje.
        assert!(!error.contains("Estrella") && !error.contains("Luna"), "{error}");
        assert_eq!(contar(&base, "padre"), 1, "las dos primeras debieron deshacerse");
    }

    #[test]
    fn si_la_ultima_falla_por_check_no_queda_nada_de_las_anteriores() {
        let base = base_de_prueba();
        let error = ejecutar(
            &base,
            vec![
                sentencia("INSERT INTO padre (id, nombre) VALUES (1, 'Aurora')", vec![]),
                sentencia("INSERT INTO hijo (id, padre_id, edad) VALUES (?, ?, ?)", vec![json!(1), json!(1), json!(-5)]),
            ],
        )
        .unwrap_err();
        assert!(error.starts_with("Falló la sentencia 2 de 2: "), "{error}");
        assert!(error.contains("CHECK constraint failed"), "{error}");
        assert_eq!(contar(&base, "padre"), 0);
        assert_eq!(contar(&base, "hijo"), 0);
    }

    #[test]
    fn el_error_de_sintaxis_tambien_deshace_el_lote() {
        let base = base_de_prueba();
        let error = ejecutar(
            &base,
            vec![
                sentencia("INSERT INTO padre (id, nombre) VALUES (1, 'Aurora')", vec![]),
                sentencia("INSERT INTO tabla_que_no_existe VALUES (1)", vec![]),
            ],
        )
        .unwrap_err();
        assert!(error.starts_with("Falló la sentencia 2 de 2: "), "{error}");
        assert_eq!(contar(&base, "padre"), 0);
    }

    #[test]
    fn las_claves_foraneas_estan_activas_y_deshacen_el_lote() {
        let base = base_de_prueba();
        let error = ejecutar(
            &base,
            vec![
                sentencia("INSERT INTO padre (id, nombre) VALUES (1, 'Aurora')", vec![]),
                // padre 99 no existe
                sentencia("INSERT INTO hijo (id, padre_id, edad) VALUES (?, ?, ?)", vec![json!(1), json!(99), json!(1)]),
            ],
        )
        .unwrap_err();
        assert!(error.contains("FOREIGN KEY constraint failed"), "{error}");
        assert_eq!(contar(&base, "padre"), 0);
        let activas: i64 = tauri::async_runtime::block_on(async {
            sqlx::query("PRAGMA foreign_keys").fetch_one(&base.pool).await.unwrap().get(0)
        });
        assert_eq!(activas, 1);
    }

    #[test]
    fn los_tipos_json_se_guardan_bien_en_una_tabla_strict() {
        let base = base_de_prueba();
        ejecutar(
            &base,
            vec![sentencia(
                "INSERT INTO tipos (id, nulo, texto, entero, decimal, booleano, json) VALUES (?, ?, ?, ?, ?, ?, ?)",
                vec![
                    json!(1),
                    Value::Null,
                    json!("cabra ñandú «Luna»"),
                    json!(9_007_199_254_740_991_i64),
                    json!(2.5),
                    json!(true),
                    json!({ "a": [1, 2] }),
                ],
            ),
            sentencia(
                "INSERT INTO tipos (id, booleano, entero, decimal) VALUES (?, ?, ?, ?)",
                vec![json!(2), json!(false), json!(-7), json!(3)],
            )],
        )
        .unwrap();
        tauri::async_runtime::block_on(async {
            let fila = sqlx::query(
                "SELECT typeof(nulo) AS t_nulo, texto, typeof(entero) AS t_entero, entero, \
                 typeof(decimal) AS t_decimal, decimal, booleano, json FROM tipos WHERE id = 1",
            )
            .fetch_one(&base.pool)
            .await
            .unwrap();
            assert_eq!(fila.get::<String, _>("t_nulo"), "null");
            assert_eq!(fila.get::<String, _>("texto"), "cabra ñandú «Luna»");
            assert_eq!(fila.get::<String, _>("t_entero"), "integer");
            assert_eq!(fila.get::<i64, _>("entero"), 9_007_199_254_740_991);
            assert_eq!(fila.get::<String, _>("t_decimal"), "real");
            assert_eq!(fila.get::<f64, _>("decimal"), 2.5);
            assert_eq!(fila.get::<i64, _>("booleano"), 1);
            assert_eq!(fila.get::<String, _>("json"), r#"{"a":[1,2]}"#);

            let fila = sqlx::query("SELECT booleano, entero, decimal, typeof(decimal) AS t FROM tipos WHERE id = 2")
                .fetch_one(&base.pool)
                .await
                .unwrap();
            assert_eq!(fila.get::<i64, _>("booleano"), 0);
            assert_eq!(fila.get::<i64, _>("entero"), -7);
            // Un 3 entero en una columna REAL de una tabla STRICT se guarda como decimal.
            assert_eq!(fila.get::<String, _>("t"), "real");
            assert_eq!(fila.get::<f64, _>("decimal"), 3.0);
        });
    }

    #[test]
    fn un_disparador_con_raise_abort_revierte_todo_el_lote() {
        let base = base_de_prueba();
        let error = ejecutar(
            &base,
            vec![
                sentencia("INSERT INTO bitacora (id, texto) VALUES (1, 'uno')", vec![]),
                sentencia("INSERT INTO padre (id, nombre) VALUES (1, 'Aurora')", vec![]),
                sentencia("INSERT INTO bitacora (id, texto) VALUES (?, ?)", vec![json!(2), json!("prohibido")]),
            ],
        )
        .unwrap_err();
        assert!(error.starts_with("Falló la sentencia 3 de 3: "), "{error}");
        assert!(error.contains("texto prohibido"), "{error}");
        assert_eq!(contar(&base, "bitacora"), 0);
        assert_eq!(contar(&base, "padre"), 0);
    }

    #[test]
    fn despues_de_un_error_el_pool_sigue_sirviendo_y_no_queda_transaccion_abierta() {
        let base = base_de_prueba();
        for _ in 0..5 {
            let _ = ejecutar(&base, vec![sentencia("INSERT INTO tabla_que_no_existe VALUES (1)", vec![])]);
        }
        // Un lote nuevo (BEGIN IMMEDIATE) funciona: ninguna conexión quedó con una transacción abierta.
        ejecutar(&base, vec![sentencia("INSERT INTO padre (id, nombre) VALUES (1, 'Aurora')", vec![])]).unwrap();
        assert_eq!(contar(&base, "padre"), 1);
    }

    #[test]
    fn un_parametro_con_texto_raro_se_guarda_tal_cual_y_no_inyecta_sql() {
        let base = base_de_prueba();
        let raros = [
            "x'); DROP TABLE padre; --",
            "' OR 1=1 --",
            "Robert'); DELETE FROM padre; --",
            "\"; DROP TABLE hijo; --",
            "?, ?, ?",
            "$1 :nombre @nombre ?1",
            "línea uno\nlínea dos\r\n\ttabulada",
            "con NUL \u{0} en medio",
            "emoji 🐐 y «comillas» ñandú",
            "%_\\",
            "",
        ];
        let sentencias = raros
            .iter()
            .enumerate()
            .map(|(i, texto)| {
                sentencia("INSERT INTO padre (id, nombre) VALUES (?, ?)", vec![json!(i as i64 + 1), json!(texto)])
            })
            .collect();
        ejecutar(&base, sentencias).unwrap();
        // Las tablas siguen ahí y hay una fila por cada texto, con el texto exacto.
        assert_eq!(contar(&base, "padre"), raros.len() as i64);
        assert_eq!(contar(&base, "hijo"), 0);
        for (i, texto) in raros.iter().enumerate() {
            let guardado: String = tauri::async_runtime::block_on(async {
                sqlx::query("SELECT nombre FROM padre WHERE id = ?")
                    .bind(i as i64 + 1)
                    .fetch_one(&base.pool)
                    .await
                    .unwrap()
                    .get(0)
            });
            assert_eq!(&guardado, texto);
        }
        // Un texto raro también sirve como condición: se compara, no se ejecuta.
        ejecutar(
            &base,
            vec![sentencia("UPDATE padre SET nombre = nombre || ? WHERE nombre = ?", vec![json!("!"), json!("' OR 1=1 --")])],
        )
        .unwrap();
        let cambiados: i64 = tauri::async_runtime::block_on(async {
            sqlx::query("SELECT COUNT(*) FROM padre WHERE nombre LIKE '%!'").fetch_one(&base.pool).await.unwrap().get(0)
        });
        assert_eq!(cambiados, 1, "solo la fila con ese texto exacto");
    }

    #[test]
    fn el_error_no_repite_el_texto_de_los_parametros_ni_con_sql_malicioso() {
        let base = base_de_prueba();
        let secreto = "dato-personal-que-no-debe-salir";
        let error = ejecutar(
            &base,
            vec![
                sentencia("INSERT INTO padre (id, nombre) VALUES (1, 'Aurora')", vec![]),
                sentencia("INSERT INTO padre (id, nombre) VALUES (?, ?)", vec![json!(2), json!("Aurora")]),
                sentencia("INSERT INTO hijo (id, padre_id, edad) VALUES (?, ?, ?)", vec![json!(1), json!(1), json!(secreto)]),
            ],
        )
        .unwrap_err();
        assert!(error.starts_with("Falló la sentencia 2 de 3: "), "{error}");
        assert!(!error.contains(secreto), "{error}");
        // La tercera nunca se ejecutó, así que el texto no pudo salir por ahí; y con un valor del tipo equivocado:
        let error = ejecutar(
            &base,
            vec![sentencia("INSERT INTO hijo (id, padre_id, edad) VALUES (?, ?, ?)", vec![json!(1), json!(1), json!(secreto)])],
        )
        .unwrap_err();
        assert!(error.starts_with("Falló la sentencia 1 de 1: "), "{error}");
        assert!(!error.contains(secreto), "{error}");
        assert_eq!(contar(&base, "padre"), 0);
    }

    #[test]
    fn la_interfaz_envia_las_sentencias_con_estos_nombres() {
        // Es la forma exacta que arma `ejecutarLote` en src/datos/conexion-tauri.ts: { sql, parametros }.
        let enviado = json!([
            { "sql": "INSERT INTO padre (id, nombre) VALUES (?, ?)", "parametros": [1, "Aurora"] },
            { "sql": "DELETE FROM padre WHERE id = 99", "parametros": [] }
        ]);
        let sentencias: Vec<Sentencia> = serde_json::from_value(enviado).unwrap();
        assert_eq!(sentencias.len(), 2);
        assert_eq!(sentencias[0].parametros, vec![json!(1), json!("Aurora")]);
        assert!(sentencias[1].parametros.is_empty());
        // Un campo mal escrito no se acepta en silencio.
        assert!(serde_json::from_value::<Vec<Sentencia>>(json!([{ "sql": "SELECT 1", "parametro": [] }])).is_err());
    }

    #[test]
    fn varios_lotes_a_la_vez_se_turnan_sin_database_is_locked() {
        let base = base_de_prueba();
        let tareas: Vec<_> = (1..=20_i64)
            .map(|i| {
                let pool = base.pool.clone();
                tauri::async_runtime::spawn(async move {
                    ejecutar_en_transaccion(
                        &pool,
                        vec![
                            sentencia("INSERT INTO padre (id, nombre) VALUES (?, ?)", vec![json!(i), json!(format!("cabra {i}"))]),
                            sentencia("INSERT INTO hijo (id, padre_id, edad) VALUES (?, ?, ?)", vec![json!(i), json!(i), json!(1)]),
                        ],
                    )
                    .await
                })
            })
            .collect();
        for tarea in tareas {
            tauri::async_runtime::block_on(tarea).unwrap().unwrap();
        }
        assert_eq!(contar(&base, "padre"), 20);
        assert_eq!(contar(&base, "hijo"), 20);
    }

    #[test]
    fn el_lote_se_ejecuta_sobre_el_pool_que_abrio_el_plugin_y_solo_si_esta_abierto() {
        let base = base_de_prueba();
        let instancias = DbInstances::default();
        let nombre = "sqlite:registro-caprino-desarrollo.db";
        let lote = || vec![sentencia("INSERT INTO padre (id, nombre) VALUES (1, 'Aurora')", vec![])];

        // Todavía no se llamó a `Database.load`: no hay base abierta con ese nombre.
        let error = tauri::async_runtime::block_on(ejecutar_en_base(&instancias, nombre, lote())).unwrap_err();
        assert!(error.contains("todavía no está abierta"), "{error}");
        assert_eq!(contar(&base, "padre"), 0);

        // Ya abierta (el plugin guarda su pool en `DbInstances`): el lote se aplica en ese pool.
        tauri::async_runtime::block_on(async {
            instancias.0.write().await.insert(nombre.to_string(), DbPool::Sqlite(base.pool.clone()));
        });
        tauri::async_runtime::block_on(ejecutar_en_base(&instancias, nombre, lote())).unwrap();
        assert_eq!(contar(&base, "padre"), 1);

        // Otra base que no está abierta sigue sin servir, aunque la primera sí lo esté.
        let error = tauri::async_runtime::block_on(ejecutar_en_base(&instancias, "sqlite:registro-caprino.db", lote())).unwrap_err();
        assert!(error.contains("todavía no está abierta"), "{error}");

        // Un fallo a mitad se deshace también por este camino.
        let error = tauri::async_runtime::block_on(ejecutar_en_base(
            &instancias,
            nombre,
            vec![
                sentencia("INSERT INTO padre (id, nombre) VALUES (2, 'Luna')", vec![]),
                sentencia("INSERT INTO padre (id, nombre) VALUES (3, 'Aurora')", vec![]),
            ],
        ))
        .unwrap_err();
        assert!(error.starts_with("Falló la sentencia 2 de 2: "), "{error}");
        assert_eq!(contar(&base, "padre"), 1);
    }

    #[test]
    fn una_base_fuera_de_la_lista_se_rechaza() {
        assert!(validar_base("sqlite:registro-caprino.db", &BASES_DE_DATOS).is_ok());
        assert!(validar_base("sqlite:registro-caprino-desarrollo.db", &BASES_DE_DATOS).is_ok());
        for otra in ["sqlite:otra.db", "sqlite:../registro-caprino.db", "postgres://servidor/base", "", "registro-caprino.db"] {
            assert!(validar_base(otra, &BASES_DE_DATOS).is_err(), "{otra}");
        }
    }
}
