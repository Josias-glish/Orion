// R17: reloj lógico híbrido (HLC). Funciones puras, sin red ni base de datos. Diseño: docs/SINCRONIZACION.md, sección 5.
//
// Una marca es un texto que se compara byte a byte (en Postgres, con COLLATE "C"):
//   «2026-10-02T19:23:27.123Z-0001-a1b2c3d4»  = hora UTC con milisegundos, contador (4 hex) y equipo (8 hex).
// El orden alfabético es el orden total: primero la hora, luego el contador, luego el equipo.

export interface Hlc {
  /** Milisegundos desde 1970 (UTC). */
  fisico: number;
  contador: number;
  /** Los primeros 8 caracteres hexadecimales del id del equipo. */
  dispositivo: string;
}

/** SUPOSICION (S-84): una marca con más de 10 minutos de adelanto respecto del servidor se acorta. */
export const TOLERANCIA_FUTURO_MS = 10 * 60 * 1000;
/** SUPOSICION (S-84): el programa avisa si el reloj del equipo difiere más de 2 minutos del servidor. */
export const UMBRAL_AVISO_RELOJ_MS = 2 * 60 * 1000;

/**
 * Marca anterior a cualquier otra: la de un campo del que no se sabe nada (un registro que este equipo tenía antes de
 * vincularse y del que no hay marcas). Solo se guarda en este equipo; nunca viaja.
 */
export const MARCA_CERO = "0000-01-01T00:00:00.000Z-0000-00000000";

const MAX_CONTADOR = 0xffff;
const FORMATO_MARCA = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)-([0-9a-f]{4})-([0-9a-f]{8})$/;

/** Los 8 caracteres hexadecimales que identifican a un equipo dentro de una marca. */
export function codigoDeDispositivo(dispositivoId: string): string {
  const hex = dispositivoId.replace(/-/g, "").toLowerCase().slice(0, 8);
  return hex.padEnd(8, "0");
}

export function formatearMarca(hlc: Hlc): string {
  const iso = new Date(hlc.fisico).toISOString();
  return `${iso}-${hlc.contador.toString(16).padStart(4, "0")}-${hlc.dispositivo}`;
}

export function leerMarca(marca: string): Hlc | null {
  const partes = FORMATO_MARCA.exec(marca);
  if (!partes) return null;
  const fisico = Date.parse(partes[1]);
  if (Number.isNaN(fisico)) return null;
  return { fisico, contador: parseInt(partes[2], 16), dispositivo: partes[3] };
}

export function esMarcaValida(marca: string): boolean {
  return leerMarca(marca) !== null;
}

/** -1, 0 o 1. Compara como texto: es el orden que usa también el servidor. */
export function compararMarcas(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** La mayor de dos marcas (la vacía, «», es menor que cualquiera). */
export function marcaMayor(a: string, b: string): string {
  return compararMarcas(a, b) >= 0 ? a : b;
}

/** Fecha y hora UTC (ISO) de una marca, o null si no tiene el formato. */
export function fechaDeMarca(marca: string): string | null {
  const hlc = leerMarca(marca);
  return hlc ? new Date(hlc.fisico).toISOString() : null;
}

/** Marca de un hecho que ocurre ahora en este equipo. Nunca retrocede respecto de la última (aunque el reloj se atrase). */
export function nuevaMarca(ultima: string | null, ahoraMs: number, dispositivo: string): string {
  const anterior = ultima ? leerMarca(ultima) : null;
  let fisico = ahoraMs;
  let contador = 0;
  if (anterior && anterior.fisico >= ahoraMs) {
    fisico = anterior.fisico;
    contador = anterior.contador + 1;
    if (contador > MAX_CONTADOR) {
      fisico += 1;
      contador = 0;
    }
  }
  return formatearMarca({ fisico, contador, dispositivo });
}

/**
 * Reloj guardado después de recibir una marca ajena: la mayor entre la propia y la recibida, así lo que ya vio otro
 * equipo queda «antes» de lo que se haga después. Una marca ajena demasiado adelantada no se adopta (un reloj mal puesto
 * arrastraría el de los demás); el servidor ya acorta esas marcas, esto es la segunda barrera.
 */
export function recibirMarca(ultima: string | null, remota: string, ahoraMs: number): string | null {
  const recibida = leerMarca(remota);
  if (!recibida || recibida.fisico > ahoraMs + TOLERANCIA_FUTURO_MS) return ultima;
  return ultima === null ? remota : marcaMayor(ultima, remota);
}

/** Desfase del reloj de este equipo respecto del servidor, medido con el punto medio de la petición. */
export function calcularDesfase(inicioMs: number, finMs: number, servidorMs: number): number {
  return Math.round(servidorMs - (inicioMs + finMs) / 2);
}

/** Hora corregida del equipo (en milisegundos): el reloj local más el desfase conocido. */
export function ahoraCorregida(relojLocalMs: number, desfaseMs: number): number {
  return relojLocalMs + desfaseMs;
}

/** ¿El desfase es lo bastante grande para avisarle al usuario? */
export function relojDesajustado(desfaseMs: number): boolean {
  return Math.abs(desfaseMs) > UMBRAL_AVISO_RELOJ_MS;
}

/**
 * Lo que hace el servidor con la marca de un cambio que llega: si su hora está más de TOLERANCIA_FUTURO_MS adelantada,
 * la acorta a la hora del servidor (conserva contador y equipo). Devuelve la marca final y si la corrigió.
 */
export function acortarMarcaFutura(marca: string, servidorMs: number): { marca: string; corregida: boolean } {
  const hlc = leerMarca(marca);
  if (!hlc || hlc.fisico <= servidorMs + TOLERANCIA_FUTURO_MS) return { marca, corregida: false };
  return { marca: formatearMarca({ ...hlc, fisico: servidorMs }), corregida: true };
}
