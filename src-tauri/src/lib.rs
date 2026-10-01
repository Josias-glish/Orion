use std::path::Path;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut sql = tauri_plugin_sql::Builder::default();
    for base in BASES_DE_DATOS {
        sql = sql.add_migrations(base, migraciones());
    }

    tauri::Builder::default()
        .plugin(sql.build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![copiar_foto])
        .run(tauri::generate_context!())
        .expect("no se pudo iniciar Registro Caprino");
}
