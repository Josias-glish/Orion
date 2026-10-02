import type { EstadoRegistro } from "../../dominio/registros";

/** Estilo de la insignia de cada estado (reutiliza los colores de las insignias de siempre). */
export const CLASE_DE_ESTADO: Record<EstadoRegistro, string> = {
  borrador: "insignia--aviso",
  emitido: "insignia--activo",
  anulado: "insignia--muerto",
};
