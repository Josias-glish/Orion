/**
 * Nombres de las bases de datos: la del programa instalado y la de desarrollo (`npm run tauri dev`).
 * Deben coincidir con BASES_DE_DATOS en src-tauri/src/lib.rs (lo comprueba una prueba).
 * Este módulo no depende de Vite, para que también lo usen los scripts (npm run semillas).
 */
export const URL_BASE_DATOS_INSTALADA = "sqlite:registro-caprino.db";
export const URL_BASE_DATOS_DESARROLLO = "sqlite:registro-caprino-desarrollo.db";
