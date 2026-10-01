// Archivos fuera de la base de datos (comandos Rust en src-tauri/src/archivos.rs): documentos emitidos y respaldo.
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

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
