// La sesión de la cuenta vive en el llavero del sistema (Windows: Administrador de credenciales; macOS: llavero),
// nunca en la base de datos ni en un archivo. Los comandos son de src-tauri/src/secretos.rs.
import { invoke } from "@tauri-apps/api/core";
import type { AlmacenDeSesion } from "./red";

const CLAVE = "sesion-cuenta";

export const almacenDeSesionDelSistema: AlmacenDeSesion = {
  async leer() {
    const valor = await invoke<string | null>("leer_secreto", { clave: CLAVE });
    return valor ?? null;
  },
  async guardar(valor) {
    await invoke("guardar_secreto", { clave: CLAVE, valor });
  },
  async borrar() {
    await invoke("borrar_secreto", { clave: CLAVE });
  },
};
