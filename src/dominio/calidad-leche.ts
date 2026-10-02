import { ordenarFilas, type Direccion } from "./orden";

// RF-32 y R18: calidad de la leche. Grasa, proteína y células somáticas son opcionales y van en el pesaje.
// SUPOSICION (S-67): grasa y proteína en porcentaje de la leche (0 a 100); células somáticas en células por mililitro,
// como número entero (la especificación 2 deja la unidad como suposición).

export interface MuestraCalidad {
  grasaPct: number | null;
  proteinaPct: number | null;
  celulasSomaticas: number | null;
}

export const MUESTRA_VACIA: MuestraCalidad = { grasaPct: null, proteinaPct: null, celulasSomaticas: null };

export type ErrorCalidad =
  | { codigo: "grasa_invalida" }
  | { codigo: "proteina_invalida" }
  | { codigo: "celulas_invalidas" }
  | { codigo: "calidad_sin_kilos" };

const esPorcentaje = (v: number) => Number.isFinite(v) && v >= 0 && v <= 100;
const esEnteroNoNegativo = (v: number) => Number.isSafeInteger(v) && v >= 0;

/** Un valor vacío es válido (la calidad es opcional); uno escrito debe estar en su rango. */
export function validarMuestra(m: MuestraCalidad): ErrorCalidad[] {
  const errores: ErrorCalidad[] = [];
  if (m.grasaPct !== null && !esPorcentaje(m.grasaPct)) errores.push({ codigo: "grasa_invalida" });
  if (m.proteinaPct !== null && !esPorcentaje(m.proteinaPct)) errores.push({ codigo: "proteina_invalida" });
  if (m.celulasSomaticas !== null && !esEnteroNoNegativo(m.celulasSomaticas)) errores.push({ codigo: "celulas_invalidas" });
  return errores;
}

/** ¿La muestra trae algún valor? */
export function tieneCalidad(m: MuestraCalidad): boolean {
  return m.grasaPct !== null || m.proteinaPct !== null || m.celulasSomaticas !== null;
}

export interface TextosMuestra {
  grasa: string;
  proteina: string;
  celulas: string;
}

/** «3,8» o «3.8» → 3,8. Vacío → null. Lo que no es un número da NaN (lo rechaza `validarMuestra`). */
function leerDecimal(texto: string): number | null {
  const limpio = texto.trim().replace(",", ".");
  if (limpio === "") return null;
  return /^\d+(\.\d+)?$/.test(limpio) ? Number(limpio) : Number.NaN;
}

/** «450000» o «450.000» → 450000: el punto separa miles, como en los pesos. Vacío → null; otra cosa → NaN. */
function leerEntero(texto: string): number | null {
  const limpio = texto.replace(/[\s.]/g, "");
  if (limpio === "") return null;
  return /^\d+$/.test(limpio) ? Number(limpio) : Number.NaN;
}

/**
 * Lee lo que se escribió en las tres casillas de calidad. Lo que no se pudo leer o está fuera de rango queda vacío
 * en la muestra y se avisa en `errores`: nunca se guarda un número a medias.
 */
export function leerMuestra(textos: TextosMuestra): { muestra: MuestraCalidad; errores: ErrorCalidad[] } {
  const leida: MuestraCalidad = {
    grasaPct: leerDecimal(textos.grasa),
    proteinaPct: leerDecimal(textos.proteina),
    celulasSomaticas: leerEntero(textos.celulas),
  };
  const errores = validarMuestra(leida);
  const malo = new Set(errores.map((e) => e.codigo));
  return {
    muestra: {
      grasaPct: malo.has("grasa_invalida") ? null : leida.grasaPct,
      proteinaPct: malo.has("proteina_invalida") ? null : leida.proteinaPct,
      celulasSomaticas: malo.has("celulas_invalidas") ? null : leida.celulasSomaticas,
    },
    errores,
  };
}

export interface PromedioCalidad {
  /** null si ninguna muestra trae ese dato (no cero). */
  promedio: number | null;
  /** Cuántas muestras traen el dato. */
  muestras: number;
}

/** R18: promedio de los valores que sí existen; los vacíos no cuentan (ni como cero) ni bajan el promedio. */
export function promediarIgnorandoVacios(valores: readonly (number | null | undefined)[]): PromedioCalidad {
  const presentes = valores.filter((v): v is number => v !== null && v !== undefined);
  if (presentes.length === 0) return { promedio: null, muestras: 0 };
  return { promedio: presentes.reduce((s, v) => s + v, 0) / presentes.length, muestras: presentes.length };
}

export interface ResumenCalidad {
  grasa: PromedioCalidad;
  proteina: PromedioCalidad;
  celulas: PromedioCalidad;
}

/**
 * R18 (SUPOSICION S-68): promedio simple de cada dato en la lactancia, sin ponderar por los kilos de cada pesaje y sin
 * contar los pesajes donde ese dato está vacío.
 */
export function resumirCalidad(pesajes: readonly MuestraCalidad[]): ResumenCalidad {
  return {
    grasa: promediarIgnorandoVacios(pesajes.map((p) => p.grasaPct)),
    proteina: promediarIgnorandoVacios(pesajes.map((p) => p.proteinaPct)),
    celulas: promediarIgnorandoVacios(pesajes.map((p) => p.celulasSomaticas)),
  };
}

export type ColumnaCalidad = keyof ResumenCalidad;
export const COLUMNAS_CALIDAD: readonly ColumnaCalidad[] = ["grasa", "proteina", "celulas"];

/** Una fila de la comparación entre cabras: una lactancia con sus promedios. */
export interface FilaComparacion {
  /** Id de la lactancia. */
  id: string;
  hembra: string;
  fechaInicio: string;
  enCurso: boolean;
  resumen: ResumenCalidad;
}

export type ClaveComparacion = "hembra" | "inicio" | ColumnaCalidad;

/** Ordena la tabla de comparación por una columna; las cabras sin ese dato van al final. */
export function ordenarComparacion(filas: readonly FilaComparacion[], clave: ClaveComparacion, direccion: Direccion): FilaComparacion[] {
  return ordenarFilas(
    filas,
    (f) => (clave === "hembra" ? f.hembra : clave === "inicio" ? f.fechaInicio : f.resumen[clave].promedio),
    direccion,
  );
}

export interface BarraComparacion {
  id: string;
  hembra: string;
  fechaInicio: string;
  valor: number;
}

/** Datos del gráfico: solo las cabras con ese dato, de mayor a menor. */
export function barrasDeComparacion(filas: readonly FilaComparacion[], columna: ColumnaCalidad): BarraComparacion[] {
  const barras: BarraComparacion[] = [];
  for (const f of filas) {
    const valor = f.resumen[columna].promedio;
    if (valor !== null) barras.push({ id: f.id, hembra: f.hembra, fechaInicio: f.fechaInicio, valor });
  }
  return ordenarFilas(barras, (b) => b.valor, "desc");
}
