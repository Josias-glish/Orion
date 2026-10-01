import { ErrorDeRegistro } from "../datos/conexion";
import { textos } from "../textos/es";

/** Texto para el usuario a partir de un error; los errores técnicos se muestran aparte. */
export function mensajeDeError(error: unknown): { mensaje: string; detalle: string | null } {
  if (error instanceof ErrorDeRegistro) {
    return { mensaje: textos.errores[error.codigo], detalle: error.detalle ?? null };
  }
  return { mensaje: textos.errores.operacion, detalle: String(error) };
}
