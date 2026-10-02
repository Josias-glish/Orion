// Archivos fuera de la base de datos (comandos Rust en src-tauri/src/archivos.rs): documentos emitidos y respaldo.
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { nuevoId } from "../dominio/identidad";

/** Guarda un documento emitido en la carpeta «documentos» de los datos; devuelve la ruta relativa. */
export function guardarDocumento(nombre: string, contenido: Uint8Array): Promise<string> {
  return invoke<string>("guardar_documento", { nombre, contenido: Array.from(contenido) });
}

/** Abre el diálogo «Guardar» del sistema y escribe una copia. Devuelve la ruta elegida, o null si se canceló. */
export async function guardarCopiaConDialogo(
  nombreSugerido: string,
  filtro: { nombre: string; extension: string },
  contenido: Uint8Array,
): Promise<string | null> {
  const destino = await save({ defaultPath: nombreSugerido, filters: [{ name: filtro.nombre, extensions: [filtro.extension] }] });
  if (!destino) return null;
  await invoke("guardar_copia", { destino, contenido: Array.from(contenido) });
  return destino;
}

/** RF-43: pregunta dónde guardar y crea el .zip. Devuelve la ruta y el tamaño, o null si se canceló. */
export async function crearRespaldoConDialogo(
  nombreSugerido: string,
  nombreFiltro: string,
  datos: string,
): Promise<{ ruta: string; bytes: number } | null> {
  const destino = await save({ defaultPath: nombreSugerido, filters: [{ name: nombreFiltro, extensions: ["zip"] }] });
  if (!destino) return null;
  const bytes = await invoke<number>("crear_respaldo", { destino, datos });
  return { ruta: destino, bytes };
}

/** Pregunta qué copia restaurar y devuelve su ruta y su datos.json, o null si se canceló. */
export async function elegirRespaldo(nombreFiltro: string): Promise<{ ruta: string; datos: string } | null> {
  const origen = await open({ multiple: false, directory: false, filters: [{ name: nombreFiltro, extensions: ["zip"] }] });
  if (typeof origen !== "string") return null;
  return { ruta: origen, datos: await invoke<string>("leer_respaldo", { origen }) };
}

/** Copia las fotos y los documentos de la copia a la carpeta de datos (después de restaurar la base). */
export function extraerArchivosRespaldo(origen: string): Promise<number> {
  return invoke<number>("extraer_archivos_respaldo", { origen });
}

const EXTENSIONES_ADJUNTO = ["pdf", "jpg", "jpeg", "png", "webp"];

/**
 * R32: abre el diálogo del sistema para elegir un PDF o una imagen y la copia a la carpeta «documentos» de los datos
 * (comando Rust `copiar_adjunto`). Devuelve la ruta relativa que se anota en el traspaso, o null si se canceló.
 */
export async function elegirYCopiarAdjunto(nombreFiltro: string): Promise<string | null> {
  const origen = await open({ multiple: false, directory: false, filters: [{ name: nombreFiltro, extensions: EXTENSIONES_ADJUNTO }] });
  if (typeof origen !== "string") return null;
  return invoke<string>("copiar_adjunto", { origen, nombre: nuevoId() });
}

/** Guarda una copia de un adjunto donde elija el usuario. Devuelve la ruta elegida, o null si se canceló. */
export async function guardarCopiaDeAdjunto(ruta: string, nombreFiltro: string): Promise<string | null> {
  const extension = ruta.slice(ruta.lastIndexOf(".") + 1).toLowerCase();
  const nombre = ruta.slice(ruta.lastIndexOf("/") + 1);
  const destino = await save({ defaultPath: nombre, filters: [{ name: nombreFiltro, extensions: [extension] }] });
  if (!destino) return null;
  await invoke("guardar_copia_de_adjunto", { ruta, destino });
  return destino;
}
