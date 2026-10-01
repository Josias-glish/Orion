import { appConfigDir, join } from "@tauri-apps/api/path";
import { URL_BASE_DATOS } from "./conexion-tauri";

/** Ruta completa del archivo de la base. El plugin SQL la guarda en la carpeta de configuración del programa. */
export async function rutaBaseDatos(): Promise<string> {
  return join(await appConfigDir(), URL_BASE_DATOS.replace(/^sqlite:/, ""));
}
