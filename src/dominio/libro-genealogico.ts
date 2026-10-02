// R31: libro genealógico del criadero. Listado por libro, raza y periodo, que se exporta a PDF y Excel.
// Sale de las instantáneas de los registros emitidos (no de las fichas actuales): lo exportado coincide con lo
// emitido aunque el animal haya cambiado después (CA-20).
import type { EstadoRegistro, InstantaneaRegistro } from "./registros";

export interface RegistroDeLibro {
  id: string;
  numero: string;
  consecutivo: number;
  libroId: string;
  libro: string;
  estado: EstadoRegistro;
  version: number;
  fechaRegistro: string;
  instantanea: InstantaneaRegistro;
}

export interface FiltroLibro {
  libroId?: string | null;
  /** Nombre de una raza: entran los animales cuya composición la incluye. */
  raza?: string | null;
  /** Fecha de registro, extremos incluidos. */
  desde?: string | null;
  hasta?: string | null;
  /** Por defecto solo los emitidos. Los anulados salen marcados; los borradores nunca. */
  incluirAnulados?: boolean;
}

export interface FilaLibro {
  numero: string;
  version: number;
  libro: string;
  nombre: string;
  identificador: string;
  nacimiento: string;
  razas: { raza: string; fraccion: number }[];
  padre: string;
  madre: string;
  fechaRegistro: string;
  estado: EstadoRegistro;
}

const nombreDelAncestro = (instantanea: InstantaneaRegistro, camino: "P" | "M"): string => {
  const a = instantanea.pedigri.find((x) => x.camino === camino);
  return a ? (a.nombre ?? a.identificador ?? "") : "";
};

/** Filas del libro, ordenadas por libro y por número. */
export function filasDelLibro(registros: readonly RegistroDeLibro[], filtro: FiltroLibro): FilaLibro[] {
  return registros
    .filter((r) => r.estado === "emitido" || (filtro.incluirAnulados === true && r.estado === "anulado"))
    .filter((r) => !filtro.libroId || r.libroId === filtro.libroId)
    .filter((r) => !filtro.raza || r.instantanea.animal.composicion.some((c) => c.raza === filtro.raza && c.fraccion > 0))
    .filter((r) => !filtro.desde || r.fechaRegistro >= filtro.desde)
    .filter((r) => !filtro.hasta || r.fechaRegistro <= filtro.hasta)
    .sort((a, b) => a.libro.localeCompare(b.libro, "es") || a.consecutivo - b.consecutivo)
    .map((r) => {
      const { animal } = r.instantanea;
      return {
        numero: r.numero,
        version: r.version,
        libro: r.libro,
        nombre: animal.nombre ?? "",
        identificador: animal.identificadores.find((i) => i.principal)?.valor ?? "",
        nacimiento: animal.fechaNacimiento ?? "",
        razas: animal.composicion.map((c) => ({ raza: c.raza, fraccion: c.fraccion })),
        padre: nombreDelAncestro(r.instantanea, "P"),
        madre: nombreDelAncestro(r.instantanea, "M"),
        fechaRegistro: r.fechaRegistro,
        estado: r.estado,
      };
    });
}
