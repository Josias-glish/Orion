import { ErrorDeRegistro } from "../datos/errores";
import { textos } from "../textos/es";

/** Textos para el usuario a partir de un error; el detalle técnico se muestra aparte. */
export function mensajesDeError(error: unknown): { mensajes: string[]; detalle: string | null } {
  if (error instanceof ErrorDeRegistro) {
    return { mensajes: error.motivos.map(textos.errores.motivo), detalle: null };
  }
  return { mensajes: [textos.errores.operacion], detalle: String(error) };
}
