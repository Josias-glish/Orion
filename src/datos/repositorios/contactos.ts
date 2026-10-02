// Contactos (especificación 2, sección 6): propietarios de animales de otras fincas.
// R28: datos personales de terceros. Solo el nombre es obligatorio y nunca se publican.
import { validarContacto, type DatosContacto } from "../../dominio/contactos";
import { Cambios, exigirPermiso } from "../cambios";
import type { Conexion, ContextoCambio, ValorSql } from "../conexion";
import { ErrorDeRegistro, rechazarSi } from "../errores";

export type { DatosContacto } from "../../dominio/contactos";

export interface Contacto extends DatosContacto {
  id: string;
  /** Animales activos de los que es propietario o vendedor. */
  animales: number;
}

export function contactoVacio(): DatosContacto {
  return { nombre: "", criadero: null, municipio: null, telefono: null, correo: null, notas: null };
}

const SELECT_CONTACTO = `
  SELECT c.id, c.nombre, c.criadero, c.municipio, c.telefono, c.correo, c.notas,
         (SELECT count(*) FROM animal AS a WHERE a.contacto_id = c.id AND a.eliminado_en IS NULL) AS animales
  FROM contacto AS c
  WHERE c.eliminado_en IS NULL`;

export function listarContactos(conexion: Conexion): Promise<Contacto[]> {
  return conexion.consultar<Contacto>(`${SELECT_CONTACTO} ORDER BY c.nombre COLLATE NOCASE, c.criadero COLLATE NOCASE`);
}

export async function obtenerContacto(conexion: Conexion, id: string): Promise<Contacto | null> {
  const [fila] = await conexion.consultar<Contacto>(`${SELECT_CONTACTO} AND c.id = ?`, [id]);
  return fila ?? null;
}

function aFila(datos: DatosContacto): Record<string, ValorSql> {
  const texto = (v: string | null) => v?.trim() || null;
  return {
    nombre: datos.nombre.trim(),
    criadero: texto(datos.criadero),
    municipio: texto(datos.municipio),
    telefono: texto(datos.telefono),
    correo: texto(datos.correo),
    notas: texto(datos.notas),
  };
}

/** Crea (sin `id`) o modifica un contacto. R23: solo el propietario. Devuelve el id. */
export async function guardarContacto(conexion: Conexion, datos: DatosContacto, contexto: ContextoCambio, id?: string): Promise<string> {
  exigirPermiso(contexto, "editar_contactos");
  rechazarSi(validarContacto(datos));
  const cambios = new Cambios(contexto);
  if (!id) {
    const nuevo = cambios.insertar("contacto", aFila(datos));
    await cambios.aplicar(conexion);
    return nuevo;
  }
  const actual = await obtenerContacto(conexion, id);
  if (!actual) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  cambios.actualizar("contacto", id, aFila(actual), aFila(datos));
  await cambios.aplicar(conexion);
  return id;
}

/** Retira (borrado lógico) un contacto registrado por error. No se puede si es propietario de algún animal. */
export async function retirarContacto(conexion: Conexion, id: string, contexto: ContextoCambio): Promise<void> {
  exigirPermiso(contexto, "editar_contactos");
  const actual = await obtenerContacto(conexion, id);
  if (!actual) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  if (actual.animales > 0) throw new ErrorDeRegistro([{ codigo: "contacto_en_uso", cantidad: actual.animales }]);
  // Etapa 9: tampoco si figura como vendedor o comprador en el historial de compras y ventas.
  const [{ traspasos }] = await conexion.consultar<{ traspasos: number }>(
    "SELECT count(*) AS traspasos FROM traspaso WHERE contacto_id = ? AND eliminado_en IS NULL",
    [id],
  );
  if (traspasos > 0) throw new ErrorDeRegistro([{ codigo: "contacto_con_traspasos", cantidad: traspasos }]);
  const cambios = new Cambios(contexto);
  cambios.eliminar("contacto", id);
  await cambios.aplicar(conexion);
}
