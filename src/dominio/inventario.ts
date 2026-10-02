// RF-36 (especificación 2): inventario del hato. Reglas puras: quién cuenta y cómo se suma.
// SUPOSICION (S-81): columnas y totales del inventario; es el de hoy y no se guarda como documento emitido.
import { esDelHato } from "./externos";
import type { FraccionConRaza } from "./expediente";
import { edadEnMeses } from "./fechas";
import { ordenarFilas } from "./orden";
import type { EstadoAnimal, OrigenAnimal, Sexo } from "./tipos";

export interface AnimalDeInventario {
  id: string;
  nombre: string | null;
  /** Identificador principal (arete, tatuaje…). */
  identificador: string | null;
  registroAsociacion: string | null;
  sexo: Sexo;
  fechaNacimiento: string | null;
  estado: EstadoAnimal;
  origen: OrigenAnimal;
  enHato: boolean;
  /** Fecha en que llegó un animal comprado (R32). */
  fechaIngreso: string | null;
  lote: string | null;
  libro: string | null;
  razas: FraccionConRaza[];
}

export interface FilaInventario extends AnimalDeInventario {
  edadMeses: number | null;
}

export interface TotalesInventario {
  total: number;
  hembras: number;
  machos: number;
  nacidosAqui: number;
  comprados: number;
  /** Por lote, en orden alfabético; los animales sin lote van al final con `lote: null`. */
  porLote: { lote: string | null; cantidad: number }[];
}

export interface Inventario {
  fecha: string;
  filas: FilaInventario[];
  totales: TotalesInventario;
}

/**
 * Un animal está en el inventario si es del hato (R29: no los de otras fincas ni los solo genealogía), sigue activo
 * (R11: vendidos y muertos no cuentan) y, si fue comprado, ya llegó: cuenta desde su fecha de ingreso (R32).
 */
export function cuentaEnInventario(a: Pick<AnimalDeInventario, "origen" | "enHato" | "estado" | "fechaIngreso">, fecha: string): boolean {
  if (!esDelHato(a) || a.estado !== "activo") return false;
  return !(a.origen === "comprado" && a.fechaIngreso !== null && a.fechaIngreso > fecha);
}

/** Arma el inventario a una fecha: las filas por nombre (sin distinguir mayúsculas ni tildes) y los totales. */
export function armarInventario(animales: readonly AnimalDeInventario[], fecha: string): Inventario {
  const dentro = animales.filter((a) => cuentaEnInventario(a, fecha));
  const filas = ordenarFilas(
    dentro.map<FilaInventario>((a) => ({ ...a, edadMeses: a.fechaNacimiento ? edadEnMeses(a.fechaNacimiento, fecha) : null })),
    (f) => f.nombre ?? f.identificador,
    "asc",
  );
  const porLote = new Map<string | null, number>();
  for (const f of filas) porLote.set(f.lote, (porLote.get(f.lote) ?? 0) + 1);
  const lotes = ordenarFilas([...porLote.entries()], ([lote]) => lote, "asc").map(([lote, cantidad]) => ({ lote, cantidad }));
  return {
    fecha,
    filas,
    totales: {
      total: filas.length,
      hembras: filas.filter((f) => f.sexo === "hembra").length,
      machos: filas.filter((f) => f.sexo === "macho").length,
      nacidosAqui: filas.filter((f) => f.origen === "nacido_aqui").length,
      comprados: filas.filter((f) => f.origen === "comprado").length,
      porLote: lotes,
    },
  };
}
