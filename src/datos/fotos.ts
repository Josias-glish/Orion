import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { appConfigDir, join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { nuevoId } from "../dominio/identidad";

const EXTENSIONES = ["jpg", "jpeg", "png", "webp"];

/**
 * Abre el diálogo del sistema para elegir una foto y la copia a la carpeta «fotos» de los datos del programa
 * (comando Rust `copiar_foto`). Devuelve la ruta relativa que se guarda en animal.foto, o null si se canceló.
 */
export async function elegirYCopiarFoto(nombreFiltro: string): Promise<string | null> {
  const origen = await open({ multiple: false, directory: false, filters: [{ name: nombreFiltro, extensions: EXTENSIONES }] });
  if (typeof origen !== "string") return null;
  return copiarFoto(origen);
}

export function copiarFoto(origen: string): Promise<string> {
  return invoke<string>("copiar_foto", { origen, nombre: nuevoId() });
}

/** Dirección para mostrar una foto guardada en una etiqueta <img> (protocolo asset de Tauri). */
export async function direccionDeFoto(rutaRelativa: string): Promise<string> {
  return convertFileSrc(await join(await appConfigDir(), rutaRelativa));
}
