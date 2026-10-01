import { Cambios, exigirPermiso } from "../cambios";
import type { Conexion, ContextoCambio } from "../conexion";
import { ErrorDeRegistro, rechazarSi, type Motivo } from "../errores";

/** Catálogos editables (RF-04): razas y libros genealógicos. */
export type Catalogo = "raza" | "libro";

export interface ElementoCatalogo {
  id: string;
  nombre: string;
  activo: boolean;
}

export async function listarCatalogo(
  conexion: Conexion,
  catalogo: Catalogo,
  { soloActivos = false } = {},
): Promise<ElementoCatalogo[]> {
  const filas = await conexion.consultar<{ id: string; nombre: string; activo: number }>(
    `SELECT id, nombre, activo FROM ${catalogo}
     WHERE eliminado_en IS NULL ${soloActivos ? "AND activo = 1" : ""}
     ORDER BY nombre COLLATE NOCASE`,
  );
  return filas.map((f) => ({ ...f, activo: f.activo === 1 }));
}

async function validarNombre(conexion: Conexion, catalogo: Catalogo, nombre: string, idActual: string | null) {
  const motivos: Motivo[] = [];
  if (!nombre) motivos.push({ codigo: "dato_obligatorio", campo: "nombre" });
  const [repetido] = await conexion.consultar<{ n: number }>(
    `SELECT count(*) AS n FROM ${catalogo} WHERE nombre = ? COLLATE NOCASE AND eliminado_en IS NULL AND id IS NOT ?`,
    [nombre, idActual],
  );
  if (nombre && repetido.n > 0) motivos.push({ codigo: "nombre_duplicado", nombre });
  rechazarSi(motivos);
}

export async function crearElemento(
  conexion: Conexion,
  catalogo: Catalogo,
  nombre: string,
  contexto: ContextoCambio,
): Promise<string> {
  exigirPermiso(contexto, "ver_ajustes");
  await validarNombre(conexion, catalogo, nombre.trim(), null);
  const cambios = new Cambios(contexto);
  const id = cambios.insertar(catalogo, { nombre: nombre.trim(), activo: 1 });
  await cambios.aplicar(conexion);
  return id;
}

/** Cambia el nombre o el estado activo. Los elementos no se borran: se desactivan (RF-04). */
export async function actualizarElemento(
  conexion: Conexion,
  catalogo: Catalogo,
  id: string,
  datos: { nombre: string; activo: boolean },
  contexto: ContextoCambio,
): Promise<void> {
  exigirPermiso(contexto, "ver_ajustes");
  const actual = (await listarCatalogo(conexion, catalogo)).find((e) => e.id === id);
  if (!actual) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  await validarNombre(conexion, catalogo, datos.nombre.trim(), id);
  const cambios = new Cambios(contexto);
  cambios.actualizar(
    catalogo,
    id,
    { nombre: actual.nombre, activo: actual.activo ? 1 : 0 },
    { nombre: datos.nombre.trim(), activo: datos.activo ? 1 : 0 },
  );
  await cambios.aplicar(conexion);
}
