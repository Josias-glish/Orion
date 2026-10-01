import { MAX_GENERACIONES_POR_DEFECTO } from "./genealogia";

export interface NodoPedigri {
  padreId: string | null;
  madreId: string | null;
}

/** Padre y madre de cada animal conocido. Un animal que no está en el mapa es desconocido. */
export type Pedigri = ReadonlyMap<string, NodoPedigri>;

/**
 * R6. Coeficiente de consanguinidad de Wright (de 0 a 1) del animal, sobre su pedigrí,
 * mirando hasta `maxGeneraciones` hacia atrás. Un ancestro desconocido cuenta como no emparentado.
 *
 * Se calcula con el coeficiente de parentesco φ (método tabular, equivalente a sumar los caminos de Wright):
 *   F(animal) = φ(padre, madre)
 *   φ(A, A)   = ½ · (1 + F(A))
 *   φ(A, B)   = ½ · (φ(padre de A, B) + φ(madre de A, B)), donde A es el más joven de los dos
 * «Más joven» = más generaciones por encima en el pedigrí recortado, así nunca se abre a un ancestro del otro.
 */
export function coeficienteConsanguinidad(
  animalId: string,
  pedigri: Pedigri,
  maxGeneraciones: number = MAX_GENERACIONES_POR_DEFECTO,
): number {
  const recortado = recortarPedigri(animalId, pedigri, maxGeneraciones);
  const nodo = recortado.get(animalId);
  if (!nodo) return 0;

  const rango = new Map<string, number>();
  const rangoDe = (id: string): number => {
    const guardado = rango.get(id);
    if (guardado !== undefined) return guardado;
    const n = recortado.get(id);
    const padres = [n?.padreId, n?.madreId].filter((p): p is string => !!p);
    const valor = padres.length === 0 ? 0 : 1 + Math.max(...padres.map(rangoDe));
    rango.set(id, valor);
    return valor;
  };

  const memoria = new Map<string, number>();
  const parentesco = (a: string | null, b: string | null): number => {
    if (!a || !b || !recortado.has(a) || !recortado.has(b)) return 0;
    const clave = a < b ? `${a}|${b}` : `${b}|${a}`;
    const guardado = memoria.get(clave);
    if (guardado !== undefined) return guardado;

    let valor: number;
    if (a === b) {
      const n = recortado.get(a)!;
      valor = 0.5 * (1 + parentesco(n.padreId, n.madreId));
    } else {
      const [joven, otro] = rangoDe(a) >= rangoDe(b) ? [a, b] : [b, a];
      const n = recortado.get(joven)!;
      valor = 0.5 * (parentesco(n.padreId, otro) + parentesco(n.madreId, otro));
    }
    memoria.set(clave, valor);
    return valor;
  };

  return parentesco(nodo.padreId, nodo.madreId);
}

/**
 * Pedigrí con solo los ancestros a `maxGeneraciones` o menos del animal. Los padres de los que están en el
 * límite se vuelven desconocidos. Si un ancestro aparece por varios caminos, cuenta el más corto.
 */
function recortarPedigri(animalId: string, pedigri: Pedigri, maxGeneraciones: number): Map<string, NodoPedigri> {
  const profundidad = new Map<string, number>([[animalId, 0]]);
  const cola = [animalId];
  while (cola.length > 0) {
    const id = cola.shift()!;
    const n = pedigri.get(id);
    const d = profundidad.get(id)!;
    if (!n || d >= maxGeneraciones) continue;
    for (const progenitor of [n.padreId, n.madreId]) {
      if (progenitor && !profundidad.has(progenitor)) {
        profundidad.set(progenitor, d + 1);
        cola.push(progenitor);
      }
    }
  }

  const recortado = new Map<string, NodoPedigri>();
  for (const [id, d] of profundidad) {
    const n = pedigri.get(id);
    const conPadres = n && d < maxGeneraciones;
    recortado.set(id, {
      padreId: conPadres && n.padreId && profundidad.has(n.padreId) ? n.padreId : null,
      madreId: conPadres && n.madreId && profundidad.has(n.madreId) ? n.madreId : null,
    });
  }
  return recortado;
}
