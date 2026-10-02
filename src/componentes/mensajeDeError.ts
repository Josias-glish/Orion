import { ErrorDeRegistro } from "../datos/errores";
import { ErrorDeRed, ErrorDelServidor } from "../sincronizacion/red";
import { textos } from "../textos/es";

/** Textos para el usuario a partir de un error; el detalle técnico se muestra aparte. */
export function mensajesDeError(error: unknown): { mensajes: string[]; detalle: string | null } {
  if (error instanceof ErrorDeRegistro) {
    return { mensajes: error.motivos.map(textos.errores.motivo), detalle: null };
  }
  if (error instanceof ErrorDeRed) {
    return { mensajes: [textos.sincronizacion.errores[error.tipo]], detalle: error.estado ? `${error.tipo} ${error.estado}` : null };
  }
  if (error instanceof ErrorDelServidor) {
    const conocidos = textos.sincronizacion.errores as unknown as Record<string, unknown>;
    const texto = conocidos[error.codigo];
    return { mensajes: [typeof texto === "string" ? texto : textos.sincronizacion.errores.otro(error.codigo)], detalle: null };
  }
  return { mensajes: [textos.errores.operacion], detalle: String(error) };
}
