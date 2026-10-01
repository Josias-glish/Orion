import { Cambios, exigirPermiso } from "../cambios";
import type { Conexion, ContextoCambio } from "../conexion";
import { ErrorDeRegistro, rechazarSi, type Motivo } from "../errores";

export interface Lote {
  id: string;
  nombre: string;
  descripcion: string | null;
  animales: number;
}

export interface DatosLote {
  nombre: string;
  descripcion: string | null;
}

/** Lotes activos con la cantidad de animales activos de cada uno. */
export async function listarLotes(conexion: Conexion): Promise<Lote[]> {
  return conexion.consultar<Lote>(
    `SELECT l.id, l.nombre, l.descripcion,
            (SELECT count(*) FROM animal a WHERE a.lote_id = l.id AND a.eliminado_en IS NULL) AS animales
     FROM lote AS l WHERE l.eliminado_en IS NULL ORDER BY l.nombre COLLATE NOCASE`,
  );
}

async function validar(conexion: Conexion, datos: DatosLote, idActual: string | null): Promise<void> {
  const motivos: Motivo[] = [];
  const nombre = datos.nombre.trim();
  if (!nombre) motivos.push({ codigo: "dato_obligatorio", campo: "nombre" });
  const [repetido] = await conexion.consultar<{ n: number }>(
    "SELECT count(*) AS n FROM lote WHERE nombre = ? COLLATE NOCASE AND eliminado_en IS NULL AND id IS NOT ?",
    [nombre, idActual],
  );
  if (nombre && repetido.n > 0) motivos.push({ codigo: "nombre_duplicado", nombre });
  rechazarSi(motivos);
}

const aFila = (d: DatosLote) => ({ nombre: d.nombre.trim(), descripcion: d.descripcion?.trim() || null });

export async function crearLote(conexion: Conexion, datos: DatosLote, contexto: ContextoCambio): Promise<string> {
  exigirPermiso(contexto, "ver_ajustes");
  await validar(conexion, datos, null);
  const cambios = new Cambios(contexto);
  const id = cambios.insertar("lote", aFila(datos));
  await cambios.aplicar(conexion);
  return id;
}

export async function actualizarLote(
  conexion: Conexion,
  id: string,
  datos: DatosLote,
  contexto: ContextoCambio,
): Promise<void> {
  exigirPermiso(contexto, "ver_ajustes");
  const actual = (await listarLotes(conexion)).find((l) => l.id === id);
  if (!actual) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  await validar(conexion, datos, id);
  const cambios = new Cambios(contexto);
  cambios.actualizar("lote", id, { nombre: actual.nombre, descripcion: actual.descripcion }, aFila(datos));
  await cambios.aplicar(conexion);
}

/** SUPOSICION: solo se retira un lote vacío, para no cambiar muchos animales sin querer. */
export async function retirarLote(conexion: Conexion, id: string, contexto: ContextoCambio): Promise<void> {
  exigirPermiso(contexto, "ver_ajustes");
  const actual = (await listarLotes(conexion)).find((l) => l.id === id);
  if (!actual) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  if (actual.animales > 0) throw new ErrorDeRegistro([{ codigo: "lote_con_animales", cantidad: actual.animales }]);
  const cambios = new Cambios(contexto);
  cambios.eliminar("lote", id);
  await cambios.aplicar(conexion);
}
