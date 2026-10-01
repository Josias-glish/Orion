import type { TipoIdentificador } from "./tipos";

export interface IdentificadorEditable {
  id?: string;
  tipo: TipoIdentificador;
  valor: string;
  fecha: string | null;
  vigente: boolean;
  principal: boolean;
}

/** Identificador vigente que ya usa otro animal de la finca. */
export interface IdentificadorEnUso {
  tipo: TipoIdentificador;
  valor: string;
  animal: string;
}

export type ErrorIdentificador =
  | { codigo: "identificador_vacio" }
  | { codigo: "sin_principal" }
  | { codigo: "varios_principales" }
  | { codigo: "principal_no_vigente" }
  | { codigo: "identificador_repetido_en_animal"; tipo: TipoIdentificador; valor: string }
  | { codigo: "identificador_duplicado"; tipo: TipoIdentificador; valor: string; otro: string };

/** Valor tal como se guarda: sin espacios al principio ni al final. */
export function normalizarValor(valor: string): string {
  void valor;
  throw new Error("normalizarValor: no implementado");
}

/**
 * R2. Un animal puede tener varios identificadores; si tiene alguno vigente, exactamente uno es el principal;
 * y el valor es único por tipo entre los vigentes de la finca (sin distinguir mayúsculas).
 */
export function validarIdentificadores(
  lista: readonly IdentificadorEditable[],
  enUsoPorOtros: readonly IdentificadorEnUso[],
): ErrorIdentificador[] {
  void lista;
  void enUsoPorOtros;
  throw new Error("validarIdentificadores: no implementado");
}
