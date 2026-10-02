export type Direccion = "asc" | "desc";

/**
 * Ordena una copia de la lista por un valor (número o texto), de menor a mayor o al revés. Los vacíos van siempre al
 * final, sea cual sea el sentido, y los empates conservan el orden original. El texto se compara como en español:
 * sin distinguir mayúsculas ni tildes.
 */
export function ordenarFilas<T>(filas: readonly T[], valor: (fila: T) => number | string | null | undefined, direccion: Direccion): T[] {
  const signo = direccion === "asc" ? 1 : -1;
  const comparar = (a: number | string, b: number | string): number =>
    typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "es", { sensitivity: "base" });
  return [...filas].sort((x, y) => {
    const a = valor(x);
    const b = valor(y);
    const sinA = a === null || a === undefined;
    const sinB = b === null || b === undefined;
    if (sinA || sinB) return sinA === sinB ? 0 : sinA ? 1 : -1;
    return signo * comparar(a, b);
  });
}
