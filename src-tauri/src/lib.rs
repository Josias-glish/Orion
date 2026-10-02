mod archivos;
mod lote;
mod secretos;

use std::path::{Path, PathBuf};

use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

/// Bases de datos que puede abrir la interfaz: la del programa instalado y la de
/// desarrollo (`npm run tauri dev`), para que las pruebas no toquen datos reales.
/// Deben coincidir con `src/datos/conexion-tauri.ts`.
const BASES_DE_DATOS: [&str; 2] = [
    "sqlite:registro-caprino.db",
    "sqlite:registro-caprino-desarrollo.db",
];

/// Formatos de foto admitidos.
const EXTENSIONES_FOTO: [&str; 4] = ["jpg", "jpeg", "png", "webp"];

/// Migraciones en orden. Nunca edites una que ya se aplicó: agrega una nueva al final.
/// La prueba `src/datos/migraciones.test.ts` comprueba que esta lista y la carpeta coincidan.
fn migraciones() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "esquema_inicial",
            sql: include_str!("../../src/datos/migraciones/0001_esquema_inicial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "nucleo_y_genealogia",
            sql: include_str!("../../src/datos/migraciones/0002_nucleo_y_genealogia.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "reproduccion_leche_pesos",
            sql: include_str!("../../src/datos/migraciones/0003_reproduccion_leche_pesos.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "salud_y_documentos",
            sql: include_str!("../../src/datos/migraciones/0004_salud_y_documentos.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "sementales_externos",
            sql: include_str!("../../src/datos/migraciones/0005_sementales_externos.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "registro_genealogico",
            sql: include_str!("../../src/datos/migraciones/0006_registro_genealogico.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "calidad_y_finanzas",
            sql: include_str!("../../src/datos/migraciones/0007_calidad_y_finanzas.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "compra_venta",
            sql: include_str!("../../src/datos/migraciones/0008_compra_venta.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "sincronizacion",
            sql: include_str!("../../src/datos/migraciones/0009_sincronizacion.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

/// Copia una foto elegida por el usuario a la carpeta «fotos» de los datos del programa,
/// con el nombre `nombre` (un UUID) y la extensión original. Devuelve la ruta relativa
/// que se guarda en `animal.foto`, por ejemplo «fotos/1b2c….jpg».
#[tauri::command]
fn copiar_foto(app: tauri::AppHandle, origen: String, nombre: String) -> Result<String, String> {
    let nombre_valido = !nombre.is_empty()
        && nombre.len() <= 64
        && nombre
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-');
    if !nombre_valido {
        return Err("nombre de archivo no válido".into());
    }
    let extension = Path::new(&origen)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .filter(|e| EXTENSIONES_FOTO.contains(&e.as_str()))
        .ok_or("formato de foto no admitido")?;
    let carpeta = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("fotos");
    std::fs::create_dir_all(&carpeta).map_err(|e| e.to_string())?;
    let archivo = format!("{nombre}.{extension}");
    std::fs::copy(&origen, carpeta.join(&archivo)).map_err(|e| e.to_string())?;
    Ok(format!("fotos/{archivo}"))
}

fn carpeta_datos(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_config_dir().map_err(|e| e.to_string())
}

/// RF-14 y RF-15: guarda un documento emitido (PDF o CSV) en la carpeta «documentos» de los datos del programa.
/// Devuelve la ruta relativa que se anota en `certificado.archivo`.
#[tauri::command]
fn guardar_documento(app: tauri::AppHandle, nombre: String, contenido: Vec<u8>) -> Result<String, String> {
    archivos::guardar_documento(&carpeta_datos(&app)?, &nombre, &contenido)
}

/// Escribe una copia de un documento donde la eligió el usuario con el diálogo «Guardar» (solo PDF, CSV o ZIP).
#[tauri::command]
fn guardar_copia(destino: String, contenido: Vec<u8>) -> Result<(), String> {
    archivos::guardar_copia(Path::new(&destino), &contenido)
}

/// R32: copia un PDF o una imagen elegidos por el usuario a la carpeta «documentos» como adjunto de una compra.
/// Devuelve la ruta relativa que se anota en `traspaso.adjuntos`.
#[tauri::command]
fn copiar_adjunto(app: tauri::AppHandle, origen: String, nombre: String) -> Result<String, String> {
    archivos::copiar_adjunto(&carpeta_datos(&app)?, Path::new(&origen), &nombre)
}

/// Etapa 10: lee una foto, un documento o un adjunto de la carpeta de datos para subirlo al servidor. Error `no_existe` si no está.
#[tauri::command]
fn leer_archivo_de_datos(app: tauri::AppHandle, ruta: String) -> Result<tauri::ipc::Response, String> {
    match archivos::leer_archivo_de_datos(&carpeta_datos(&app)?, &ruta)? {
        Some(bytes) => Ok(tauri::ipc::Response::new(bytes)),
        None => Err("no_existe".into()),
    }
}

/// Etapa 10: guarda un archivo que llegó de otro equipo. Devuelve `false` si ya existía (no se pisa).
#[tauri::command]
fn escribir_archivo_de_datos(app: tauri::AppHandle, ruta: String, contenido: Vec<u8>) -> Result<bool, String> {
    archivos::escribir_archivo_de_datos(&carpeta_datos(&app)?, &ruta, &contenido)
}

/// Escribe una copia de un adjunto de compra donde la eligió el usuario con el diálogo «Guardar».
#[tauri::command]
fn guardar_copia_de_adjunto(app: tauri::AppHandle, ruta: String, destino: String) -> Result<(), String> {
    archivos::guardar_copia_de_adjunto(&carpeta_datos(&app)?, &ruta, Path::new(&destino))
}

/// RF-43: crea la copia de respaldo (.zip con datos.json, fotos y documentos). Devuelve su tamaño en bytes.
#[tauri::command]
fn crear_respaldo(app: tauri::AppHandle, destino: String, datos: String) -> Result<u64, String> {
    archivos::crear_respaldo(&carpeta_datos(&app)?, Path::new(&destino), &datos)
}

/// Lee datos.json de una copia de respaldo, sin escribir nada.
#[tauri::command]
fn leer_respaldo(origen: String) -> Result<String, String> {
    archivos::leer_respaldo(Path::new(&origen))
}

/// Después de restaurar los datos, copia las fotos y los documentos del respaldo a la carpeta de datos.
#[tauri::command]
fn extraer_archivos_respaldo(app: tauri::AppHandle, origen: String) -> Result<usize, String> {
    archivos::extraer_archivos(&carpeta_datos(&app)?, Path::new(&origen))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut sql = tauri_plugin_sql::Builder::default();
    for base in BASES_DE_DATOS {
        sql = sql.add_migrations(base, migraciones());
    }

    tauri::Builder::default()
        .plugin(sql.build())
        .plugin(tauri_plugin_dialog::init())
        // Etapa 10: la red la hace Rust. Sin la capacidad `sincronizacion.json` ninguna dirección está permitida.
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            copiar_foto,
            guardar_documento,
            guardar_copia,
            copiar_adjunto,
            guardar_copia_de_adjunto,
            leer_archivo_de_datos,
            escribir_archivo_de_datos,
            crear_respaldo,
            leer_respaldo,
            extraer_archivos_respaldo,
            lote::ejecutar_lote,
            secretos::guardar_secreto,
            secretos::leer_secreto,
            secretos::borrar_secreto
        ])
        .run(tauri::generate_context!())
        .expect("no se pudo iniciar Registro Caprino");
}

#[cfg(test)]
mod pruebas {
    use super::*;

    /// Etapa 10 (D-057): el plugin HTTP revisa la lista de direcciones también en cada redirección solo si la
    /// configuración lo pide. El plugin rechaza los campos que no conoce, así que esta prueba lee la configuración
    /// real con el mismo tipo que usa el plugin al arrancar: un error de escritura se ve aquí y no al abrir el programa.
    #[test]
    fn el_plugin_http_revisa_la_lista_de_direcciones_en_cada_redireccion() {
        let configuracion: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).expect("tauri.conf.json no es JSON válido");
        let http = configuracion["plugins"]["http"].clone();
        let http: tauri_plugin_http::Config = serde_json::from_value(http).expect("plugins.http no es válido");
        assert!(http.scope_redirects);
    }

    /// Las bases de la lista deben coincidir con las de la interfaz (src/datos/bases.ts).
    #[test]
    fn las_bases_de_datos_son_las_de_la_interfaz() {
        let bases = include_str!("../../src/datos/bases.ts");
        for base in BASES_DE_DATOS {
            assert!(bases.contains(&format!("\"{base}\"")), "{base} no está en src/datos/bases.ts");
        }
    }

    #[test]
    fn la_migracion_9_esta_registrada_al_final() {
        let lista = migraciones();
        let ultima = lista.last().expect("sin migraciones");
        assert_eq!(ultima.version, 9);
        assert_eq!(ultima.description, "sincronizacion");
        let versiones: Vec<i64> = lista.iter().map(|m| m.version).collect();
        assert_eq!(versiones, (1..=9).collect::<Vec<i64>>());
    }
}
