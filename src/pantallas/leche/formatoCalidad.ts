import type { ColumnaCalidad } from "../../dominio/calidad-leche";
import { textos } from "../../textos/es";

/** Cómo se escribe cada dato de calidad: porcentajes con hasta dos decimales y células con separador de miles. */
export const formatoCalidad: Record<ColumnaCalidad, (valor: number) => string> = {
  grasa: (v) => `${textos.comun.numero(v, 2)} %`,
  proteina: (v) => `${textos.comun.numero(v, 2)} %`,
  celulas: (v) => textos.comun.numero(v, 0),
};
