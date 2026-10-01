use tauri_plugin_sql::{Migration, MigrationKind};

/// Bases de datos que puede abrir la interfaz: la del programa instalado y la de
/// desarrollo (`npm run tauri dev`), para que las pruebas no toquen datos reales.
/// Deben coincidir con `src/datos/conexion-tauri.ts`.
const BASES_DE_DATOS: [&str; 2] = [
    "sqlite:registro-caprino.db",
    "sqlite:registro-caprino-desarrollo.db",
];

/// Migraciones en orden. Nunca edites una que ya se aplicó: agrega una nueva al final.
/// La prueba `src/datos/migraciones.test.ts` comprueba que esta lista y la carpeta coincidan.
fn migraciones() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "esquema_inicial",
        sql: include_str!("../../src/datos/migraciones/0001_esquema_inicial.sql"),
        kind: MigrationKind::Up,
    }]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut sql = tauri_plugin_sql::Builder::default();
    for base in BASES_DE_DATOS {
        sql = sql.add_migrations(base, migraciones());
    }

    tauri::Builder::default()
        .plugin(sql.build())
        .run(tauri::generate_context!())
        .expect("no se pudo iniciar Registro Caprino");
}
