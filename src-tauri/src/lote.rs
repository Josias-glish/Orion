//! D-004 (implementada en D-054): ejecuta un lote de sentencias SQL dentro de una sola transacción, sobre el mismo pool
//! que usa el plugin SQL. El plugin reparte cada orden entre varias conexiones, así que `BEGIN` y `COMMIT` enviados por
//! separado no sirven (tauri-apps/plugins-workspace#886). Aquí el lote viaja entero en un solo comando y toma una sola
//! conexión: o se aplica todo o no se aplica nada.

use serde::Deserialize;
use serde_json::Value;
use sqlx::{Pool, Sqlite};
use tauri_plugin_sql::Error;

/// Una sentencia con sus parámetros, tal como la arma `Cambios` en la interfaz (`Sentencia` de `src/datos/conexion.ts`).
#[derive(Debug, Deserialize)]
pub struct SentenciaLote {
    pub sql: String,
    pub parametros: Vec<Value>,
}

/// Ejecuta todas las sentencias en una transacción. Si una falla (por ejemplo, un CHECK o un disparador de la base),
/// se devuelve su error y no queda nada escrito. Un lote vacío no hace nada.
///
/// Los parámetros se enlazan como lo hace el plugin SQL: texto como texto, null como NULL y todo número como `f64`
/// (las tablas STRICT lo guardan como entero cuando no pierde nada). Cualquier otro tipo se rechaza antes de escribir.
pub async fn ejecutar_en_transaccion(pool: &Pool<Sqlite>, sentencias: &[SentenciaLote]) -> Result<(), Error> {
    if sentencias.is_empty() {
        return Ok(());
    }
    for sentencia in sentencias {
        if let Some(raro) = sentencia.parametros.iter().find(|v| !(v.is_null() || v.is_string() || v.is_number())) {
            return Err(Error::UnsupportedDatatype(format!("parámetro que no es texto, número ni nulo: {raro}")));
        }
    }
    // BEGIN IMMEDIATE toma el bloqueo de escritura al empezar y espera su turno (busy_timeout) en vez de fallar a mitad del lote.
    let mut transaccion = pool.begin_with("BEGIN IMMEDIATE").await?;
    for sentencia in sentencias {
        let mut consulta = sqlx::query(&sentencia.sql);
        for valor in &sentencia.parametros {
            consulta = match valor {
                Value::Null => consulta.bind(None::<String>),
                Value::String(texto) => consulta.bind(texto.clone()),
                numero => consulta.bind(numero.as_f64().unwrap_or_default()),
            };
        }
        // Si falla, `transaccion` se suelta sin confirmar y sqlx deshace todo.
        consulta.execute(&mut *transaccion).await?;
    }
    transaccion.commit().await?;
    Ok(())
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use serde_json::json;
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use std::path::PathBuf;

    /// Base en un archivo temporal con un pool de varias conexiones, como el programa real (en memoria cada
    /// conexión tendría su propia base y no se probaría lo que importa).
    struct BaseDePrueba {
        pool: Pool<Sqlite>,
        carpeta: PathBuf,
    }

    impl BaseDePrueba {
        fn nueva(nombre: &str) -> Self {
            let carpeta = std::env::temp_dir().join(format!("registro-caprino-lote-{nombre}-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&carpeta);
            std::fs::create_dir_all(&carpeta).unwrap();
            let pool = tauri::async_runtime::block_on(async {
                let opciones = SqliteConnectOptions::new().filename(carpeta.join("prueba.db")).create_if_missing(true);
                let pool = SqlitePoolOptions::new().max_connections(4).connect_with(opciones).await.unwrap();
                sqlx::query(
                    "CREATE TABLE prueba (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL CHECK (length(nombre) > 0), valor INTEGER, nota TEXT) STRICT",
                )
                .execute(&pool)
                .await
                .unwrap();
                pool
            });
            Self { pool, carpeta }
        }

        fn filas(&self) -> i64 {
            tauri::async_runtime::block_on(async { sqlx::query_scalar("SELECT count(*) FROM prueba").fetch_one(&self.pool).await.unwrap() })
        }

        fn ejecutar(&self, sentencias: &[SentenciaLote]) -> Result<(), Error> {
            tauri::async_runtime::block_on(ejecutar_en_transaccion(&self.pool, sentencias))
        }
    }

    impl Drop for BaseDePrueba {
        fn drop(&mut self) {
            tauri::async_runtime::block_on(self.pool.close());
            let _ = std::fs::remove_dir_all(&self.carpeta);
        }
    }

    fn insertar(id: i64, nombre: &str) -> SentenciaLote {
        SentenciaLote { sql: "INSERT INTO prueba (id, nombre) VALUES (?, ?)".into(), parametros: vec![json!(id), json!(nombre)] }
    }

    #[test]
    fn un_lote_correcto_confirma_todo() {
        let base = BaseDePrueba::nueva("correcto");
        base.ejecutar(&[insertar(1, "a"), insertar(2, "b"), insertar(3, "c")]).unwrap();
        assert_eq!(base.filas(), 3);
    }

    #[test]
    fn un_lote_con_una_sentencia_que_falla_no_deja_nada() {
        let base = BaseDePrueba::nueva("falla");
        // La tercera viola el CHECK (nombre vacío): las dos primeras deben deshacerse.
        let resultado = base.ejecutar(&[insertar(1, "a"), insertar(2, "b"), insertar(3, "")]);
        let mensaje = resultado.expect_err("debía fallar").to_string();
        assert!(mensaje.contains("CHECK"), "mensaje: {mensaje}");
        assert_eq!(base.filas(), 0);
        // La base sigue aceptando escrituras (no quedó una transacción abierta).
        base.ejecutar(&[insertar(1, "a")]).unwrap();
        assert_eq!(base.filas(), 1);
    }

    #[test]
    fn un_lote_vacio_no_hace_nada() {
        let base = BaseDePrueba::nueva("vacio");
        base.ejecutar(&[]).unwrap();
        assert_eq!(base.filas(), 0);
    }

    #[test]
    fn un_parametro_que_no_es_texto_numero_ni_nulo_se_rechaza_sin_escribir() {
        let base = BaseDePrueba::nueva("raro");
        for raro in [json!(true), json!([1, 2]), json!({ "a": 1 })] {
            let malo = SentenciaLote { sql: "INSERT INTO prueba (id, nombre) VALUES (?, ?)".into(), parametros: vec![json!(9), raro] };
            assert!(base.ejecutar(&[insertar(1, "a"), malo]).is_err());
        }
        assert_eq!(base.filas(), 0, "ni siquiera la primera sentencia se escribe");
    }

    #[test]
    fn enlaza_como_el_plugin_enteros_textos_con_tildes_y_nulos() {
        let base = BaseDePrueba::nueva("enlace");
        let lote = SentenciaLote {
            sql: "INSERT INTO prueba (id, nombre, valor, nota) VALUES (?, ?, ?, ?)".into(),
            parametros: vec![json!(1), json!("Cabra ñandú"), json!(1_500_000), json!(null)],
        };
        base.ejecutar(&[lote]).unwrap();
        let (tipo, valor, nombre, nota): (String, i64, String, Option<String>) = tauri::async_runtime::block_on(async {
            sqlx::query_as("SELECT typeof(valor), valor, nombre, nota FROM prueba WHERE id = 1").fetch_one(&base.pool).await.unwrap()
        });
        assert_eq!((tipo.as_str(), valor, nombre.as_str(), nota), ("integer", 1_500_000, "Cabra ñandú", None));
    }

    /// Regresión de D-004. En el experimento de la Etapa 1 (`BEGIN`/`INSERT`/`ROLLBACK` por separado, con consultas
    /// simultáneas que obligan al pool a abrir varias conexiones) 19 de 20 rondas fallaron. Aquí: 20 rondas, cada una con
    /// 4 consultas simultáneas y un lote que falla; ninguna fila debe quedar y la base debe seguir aceptando escrituras.
    #[test]
    fn veinte_rondas_con_consultas_simultaneas_no_dejan_filas_ni_bloqueos() {
        let base = BaseDePrueba::nueva("rondas");
        for ronda in 1..=20_i64 {
            tauri::async_runtime::block_on(async {
                let tareas: Vec<_> = (0..4)
                    .map(|_| {
                        let pool = base.pool.clone();
                        tauri::async_runtime::spawn(async move { sqlx::query_scalar::<_, i64>("SELECT count(*) FROM prueba").fetch_one(&pool).await.unwrap() })
                    })
                    .collect();
                for tarea in tareas {
                    tarea.await.unwrap();
                }
            });
            assert!(base.ejecutar(&[insertar(ronda, "x"), insertar(1000 + ronda, "")]).is_err(), "ronda {ronda}");
            assert_eq!(base.filas(), 0, "ronda {ronda}: quedó una fila de un lote que falló");
        }
        base.ejecutar(&[insertar(1, "ok")]).unwrap();
        assert_eq!(base.filas(), 1);
    }
}
