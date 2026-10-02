// R21 (especificación 2): hoja de venta con pedigrí. Reglas puras: qué datos lleva, y los mismos para el PDF y el Excel
// (CA-25). Es un documento informativo del criadero, no un certificado oficial.
// SUPOSICION (S-80): contenido de la hoja de venta (sin precios ni datos de contactos; el certificado va aparte).
import type { FraccionConRaza, Marca } from "./expediente";
import { edadEnMeses } from "./fechas";
import { columnasDelPedigri } from "./pedigri";
import type { AncestroInstantanea } from "./registros";
import type { EstadoAnimal, Sexo, TipoIdentificador } from "./tipos";

/** Generaciones del árbol de la hoja (R21: tres). */
export const GENERACIONES_HOJA_VENTA = 3;

/** Una lactancia tal como se resume para el comprador. */
export interface LactanciaParaVenta {
  fechaInicio: string;
  fechaSecado: string | null;
  /** Leche acumulada de la lactancia, en kilos (vacío si no hay pesajes). */
  acumuladoKg: number | null;
  /** Promedio diario de los últimos 7 días con registro, en kilos. */
  promedioDiarioKg: number | null;
}

export interface EntradaHojaVenta {
  fecha: string;
  finca: { nombre: string; criadero: string | null; municipio: string | null };
  animal: {
    nombre: string | null;
    sexo: Sexo;
    fechaNacimiento: string | null;
    colorSenas: string | null;
    libro: string | null;
    estado: EstadoAnimal;
    identificadores: { tipo: TipoIdentificador; valor: string; principal: boolean; vigente: boolean }[];
    composicion: FraccionConRaza[];
    /** Número de su registro propio emitido (R31), si lo tiene. */
    registroPropio: string | null;
  };
  /** Ancestros guardados (hasta cuatro generaciones): la hoja usa tres. */
  pedigri: AncestroInstantanea[];
  lactancias: LactanciaParaVenta[];
}

export interface HojaVenta {
  fecha: string;
  finca: EntradaHojaVenta["finca"];
  animal: {
    nombre: string | null;
    sexo: Sexo;
    fechaNacimiento: string | null;
    edadMeses: number | null;
    colorSenas: string | null;
    libro: string | null;
    estado: EstadoAnimal;
    /** Los vigentes, con el principal primero. */
    identificadores: Marca[];
    composicion: FraccionConRaza[];
    /** false si la composición racial no suma 100 %: la hoja lo avisa en lugar de callarlo. */
    composicionCompleta: boolean;
    registroPropio: string | null;
  };
  /** Una columna por generación (padres, abuelos, bisabuelos); null = ancestro que no se conoce. */
  arbol: (AncestroInstantanea | null)[][];
  /** null = el vendedor no la eligió (o es un macho). */
  produccion: LactanciaParaVenta[] | null;
}

const TOLERANCIA = 1e-6;

/**
 * R21: arma lo que lleva la hoja de venta. La producción de leche solo va si el vendedor la elige y el animal es una
 * hembra; el comprador no recibe datos de contactos ni precios (R28: datos mínimos).
 */
export function armarHojaVenta(e: EntradaHojaVenta, opciones: { incluirProduccion: boolean }): HojaVenta {
  const identificadores = e.animal.identificadores
    .filter((i) => i.vigente)
    .sort((a, b) => Number(b.principal) - Number(a.principal))
    .map<Marca>((i) => ({ tipo: i.tipo, valor: i.valor }));
  const suma = e.animal.composicion.reduce((s, c) => s + c.fraccion, 0);
  return {
    fecha: e.fecha,
    finca: e.finca,
    animal: {
      nombre: e.animal.nombre,
      sexo: e.animal.sexo,
      fechaNacimiento: e.animal.fechaNacimiento,
      edadMeses: e.animal.fechaNacimiento ? edadEnMeses(e.animal.fechaNacimiento, e.fecha) : null,
      colorSenas: e.animal.colorSenas,
      libro: e.animal.libro,
      estado: e.animal.estado,
      identificadores,
      composicion: e.animal.composicion,
      composicionCompleta: Math.abs(suma - 1) < TOLERANCIA,
      registroPropio: e.animal.registroPropio,
    },
    arbol: columnasDelPedigri(e.pedigri, GENERACIONES_HOJA_VENTA),
    produccion: opciones.incluirProduccion && e.animal.sexo === "hembra" ? e.lactancias : null,
  };
}
