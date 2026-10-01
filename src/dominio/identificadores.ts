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
  return valor.trim();
}

/** Clave para comparar sin distinguir mayúsculas: «arete|AR-7». */
function clave(tipo: TipoIdentificador, valor: string): string {
  return `${tipo}|${normalizarValor(valor).toUpperCase()}`;
}

/**
 * R2. Un animal puede tener varios identificadores; si tiene alguno vigente, exactamente uno es el principal;
 * y el valor es único por tipo entre los vigentes de la finca (sin distinguir mayúsculas).
 * `enUsoPorOtros` son los identificadores vigentes de los demás animales.
 */
export function validarIdentificadores(
  lista: readonly IdentificadorEditable[],
  enUsoPorOtros: readonly IdentificadorEnUso[],
): ErrorIdentificador[] {
  const errores: ErrorIdentificador[] = [];

  if (lista.some((i) => normalizarValor(i.valor) === "")) {
    return [{ codigo: "identificador_vacio" }];
  }

  const vigentes = lista.filter((i) => i.vigente);
  const principales = lista.filter((i) => i.principal);
  if (principales.some((i) => !i.vigente)) errores.push({ codigo: "principal_no_vigente" });
  else if (principales.length > 1) errores.push({ codigo: "varios_principales" });
  else if (vigentes.length > 0 && principales.length === 0) errores.push({ codigo: "sin_principal" });

  const vistos = new Set<string>();
  for (const i of vigentes) {
    const k = clave(i.tipo, i.valor);
    if (vistos.has(k)) {
      errores.push({ codigo: "identificador_repetido_en_animal", tipo: i.tipo, valor: normalizarValor(i.valor) });
    }
    vistos.add(k);
  }

  const usados = new Map(enUsoPorOtros.map((u) => [clave(u.tipo, u.valor), u.animal]));
  for (const i of vigentes) {
    const otro = usados.get(clave(i.tipo, i.valor));
    if (otro !== undefined) {
      errores.push({ codigo: "identificador_duplicado", tipo: i.tipo, valor: normalizarValor(i.valor), otro });
    }
  }
  return errores;
}
