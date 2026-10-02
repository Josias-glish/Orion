// Lee y escribe los archivos de la carpeta de datos (fotos, documentos, adjuntos) con los comandos de src-tauri/src/archivos.rs.
import { invoke } from "@tauri-apps/api/core";
import type { AlmacenDeArchivos } from "./archivos";

export const almacenDeArchivosDelSistema: AlmacenDeArchivos = {
  async leer(ruta) {
    try {
      const bytes = await invoke<ArrayBuffer>("leer_archivo_de_datos", { ruta });
      return new Uint8Array(bytes);
    } catch (error) {
      if (String(error) === "no_existe") return null;
      throw error;
    }
  },
  async escribir(ruta, contenido) {
    return invoke<boolean>("escribir_archivo_de_datos", { ruta, contenido: Array.from(contenido) });
  },
};
