import { crearHashPin, esPinValido, verificarPin } from "../../dominio/pin";
import type { Rol } from "../../dominio/tipos";
import { quedaAlgunPropietario } from "../../dominio/usuarios";
import { Cambios, exigirPermiso } from "../cambios";
import type { Conexion, ContextoCambio } from "../conexion";
import { ErrorDeRegistro, rechazarSi, type Motivo } from "../errores";

export interface Usuario {
  id: string;
  nombre: string;
  rol: Rol;
  contacto: string | null;
  tienePin: boolean;
}

export interface DatosUsuario {
  nombre: string;
  rol: Rol;
  contacto: string | null;
}

/** Usuarios activos, sin el hash del PIN. */
export async function listarUsuarios(conexion: Conexion): Promise<Usuario[]> {
  const filas = await conexion.consultar<Omit<Usuario, "tienePin"> & { tienePin: number }>(
    `SELECT id, nombre, rol, contacto, pin_hash IS NOT NULL AS tienePin
     FROM usuario WHERE eliminado_en IS NULL ORDER BY rol DESC, nombre COLLATE NOCASE`,
  );
  return filas.map((u) => ({ ...u, tienePin: u.tienePin === 1 }));
}

/** ¿El PIN escrito es el del usuario? Un usuario sin PIN entra sin escribir nada. */
export async function comprobarPin(conexion: Conexion, usuarioId: string, pin: string): Promise<boolean> {
  const [fila] = await conexion.consultar<{ pin_hash: string | null }>(
    "SELECT pin_hash FROM usuario WHERE id = ? AND eliminado_en IS NULL",
    [usuarioId],
  );
  if (!fila) return false;
  return fila.pin_hash === null ? true : verificarPin(pin, fila.pin_hash);
}

async function validarDatos(conexion: Conexion, datos: DatosUsuario, idActual: string | null): Promise<Motivo[]> {
  const motivos: Motivo[] = [];
  const nombre = datos.nombre.trim();
  if (!nombre) motivos.push({ codigo: "dato_obligatorio", campo: "nombre" });
  const [repetido] = await conexion.consultar<{ n: number }>(
    "SELECT count(*) AS n FROM usuario WHERE nombre = ? COLLATE NOCASE AND eliminado_en IS NULL AND id IS NOT ?",
    [nombre, idActual],
  );
  if (nombre && repetido.n > 0) motivos.push({ codigo: "nombre_duplicado", nombre });
  return motivos;
}

/** Prepara un usuario nuevo dentro de un lote de cambios. El PIN es opcional; si viene, se guarda su hash. */
export async function prepararUsuario(
  conexion: Conexion,
  cambios: Cambios,
  datos: DatosUsuario,
  pin: string | null,
  id?: string,
): Promise<string> {
  const motivos = await validarDatos(conexion, datos, null);
  if (pin !== null && !esPinValido(pin)) motivos.push({ codigo: "pin_invalido" });
  rechazarSi(motivos);
  return cambios.insertar("usuario", {
    ...(id ? { id } : {}),
    nombre: datos.nombre.trim(),
    rol: datos.rol,
    contacto: datos.contacto?.trim() || null,
    pin_hash: pin === null ? null : await crearHashPin(pin),
  });
}

export async function crearUsuario(
  conexion: Conexion,
  datos: DatosUsuario,
  pin: string | null,
  contexto: ContextoCambio,
): Promise<string> {
  exigirPermiso(contexto, "ver_ajustes");
  const cambios = new Cambios(contexto);
  const id = await prepararUsuario(conexion, cambios, datos, pin);
  await cambios.aplicar(conexion);
  return id;
}

export async function actualizarUsuario(
  conexion: Conexion,
  id: string,
  datos: DatosUsuario,
  contexto: ContextoCambio,
): Promise<void> {
  exigirPermiso(contexto, "ver_ajustes");
  const usuarios = await listarUsuarios(conexion);
  const actual = usuarios.find((u) => u.id === id);
  if (!actual) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  const motivos = await validarDatos(conexion, datos, id);
  if (!quedaAlgunPropietario(usuarios, id, datos.rol)) motivos.push({ codigo: "ultimo_propietario" });
  rechazarSi(motivos);
  const cambios = new Cambios(contexto);
  cambios.actualizar(
    "usuario",
    id,
    { nombre: actual.nombre, rol: actual.rol, contacto: actual.contacto },
    { nombre: datos.nombre.trim(), rol: datos.rol, contacto: datos.contacto?.trim() || null },
  );
  await cambios.aplicar(conexion);
}

/** Pone, cambia o quita (con null) el PIN de un usuario. */
export async function cambiarPin(
  conexion: Conexion,
  id: string,
  pin: string | null,
  contexto: ContextoCambio,
): Promise<void> {
  exigirPermiso(contexto, "ver_ajustes");
  if (pin !== null && !esPinValido(pin)) throw new ErrorDeRegistro([{ codigo: "pin_invalido" }]);
  const [fila] = await conexion.consultar<{ pin_hash: string | null }>(
    "SELECT pin_hash FROM usuario WHERE id = ? AND eliminado_en IS NULL",
    [id],
  );
  if (!fila) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  const cambios = new Cambios(contexto);
  cambios.actualizar("usuario", id, fila, { pin_hash: pin === null ? null : await crearHashPin(pin) });
  await cambios.aplicar(conexion);
}

/** Borrado lógico. Siempre queda un propietario y nadie se retira a sí mismo. */
export async function retirarUsuario(conexion: Conexion, id: string, contexto: ContextoCambio): Promise<void> {
  exigirPermiso(contexto, "ver_ajustes");
  if (id === contexto.usuarioId) throw new ErrorDeRegistro([{ codigo: "no_puede_retirarse_a_si_mismo" }]);
  const usuarios = await listarUsuarios(conexion);
  if (!usuarios.some((u) => u.id === id)) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  if (!quedaAlgunPropietario(usuarios, id, null)) throw new ErrorDeRegistro([{ codigo: "ultimo_propietario" }]);
  const cambios = new Cambios(contexto);
  cambios.eliminar("usuario", id);
  await cambios.aplicar(conexion);
}
