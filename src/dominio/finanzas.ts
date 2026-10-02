import { esFechaValida } from "./fechas";
import { ordenarFilas } from "./orden";

// RF-33 y RF-34, R19: ingresos y gastos, costo por cabra y por lote, y rentabilidad.
// SUPOSICION (S-70): el valor es un número entero de pesos colombianos, sin centavos.

export type TipoMovimiento = "ingreso" | "gasto";
export const TIPOS_MOVIMIENTO: readonly TipoMovimiento[] = ["ingreso", "gasto"];

/** Categoría «Montas y pajillas» (migración 0007): la que se propone al ofrecer el gasto de una monta (R30). */
export const CATEGORIA_MONTAS_ID = "8ae803cf-8cd7-4181-a23a-b79f76264e9d";

export interface CategoriaEconomica {
  id: string;
  nombre: string;
  tipo: TipoMovimiento;
  activo: boolean;
}

export interface Periodo {
  desde: string | null;
  hasta: string | null;
}

export type ErrorFinanzas =
  | { codigo: "valor_invalido" }
  | { codigo: "categoria_otro_tipo" }
  | { codigo: "categoria_inactiva" }
  | { codigo: "animal_y_lote" }
  | { codigo: "periodo_invalido" }
  | { codigo: "movimiento_animal_no_elegible"; otro: string }
  | { codigo: "servicio_sin_costo" }
  | { codigo: "gasto_ya_registrado" };

/**
 * «150000», «150.000» o «$ 1.250.000» → pesos. Vacío → null. Lo que no es un número entero da NaN, que el dominio
 * rechaza: así un error de tecleo no se guarda como otro valor.
 */
export function leerPesos(texto: string): number | null {
  const limpio = texto.replace(/[\s.$]/g, "");
  if (limpio === "") return null;
  return /^\d+$/.test(limpio) ? Number(limpio) : Number.NaN;
}

export interface DatosMovimiento {
  tipo: TipoMovimiento;
  valor: number;
  animalId: string | null;
  loteId: string | null;
}

/**
 * Reglas de un movimiento: valor entero mayor que cero; categoría del mismo tipo y activa (salvo que el movimiento ya
 * la tuviera: `permitirInactiva`); y a un animal o a un lote, no a los dos. Que el animal o el lote existan y la fecha
 * las comprueba el repositorio.
 */
export function validarMovimiento(
  m: DatosMovimiento,
  categoria: Pick<CategoriaEconomica, "tipo" | "activo">,
  permitirInactiva = false,
): ErrorFinanzas[] {
  const errores: ErrorFinanzas[] = [];
  if (!Number.isSafeInteger(m.valor) || m.valor <= 0) errores.push({ codigo: "valor_invalido" });
  if (categoria.tipo !== m.tipo) errores.push({ codigo: "categoria_otro_tipo" });
  if (!categoria.activo && !permitirInactiva) errores.push({ codigo: "categoria_inactiva" });
  if (m.animalId !== null && m.loteId !== null) errores.push({ codigo: "animal_y_lote" });
  return errores;
}

/** Los dos extremos cuentan; un extremo vacío no limita. */
export function enPeriodo(fecha: string, periodo: Periodo): boolean {
  return (periodo.desde === null || fecha >= periodo.desde) && (periodo.hasta === null || fecha <= periodo.hasta);
}

export function validarPeriodo(periodo: Periodo): ErrorFinanzas[] {
  const { desde, hasta } = periodo;
  const invalido =
    (desde !== null && !esFechaValida(desde)) || (hasta !== null && !esFechaValida(hasta)) || (desde !== null && hasta !== null && desde > hasta);
  return invalido ? [{ codigo: "periodo_invalido" }] : [];
}

export interface Movimiento {
  id: string;
  fecha: string;
  tipo: TipoMovimiento;
  categoriaId: string;
  valor: number;
  animalId: string | null;
  loteId: string | null;
}

export interface AnimalFinanzas {
  id: string;
  nombre: string;
  loteId: string | null;
  /** Activo y del hato: solo estos reciben una parte del prorrateo. */
  activo: boolean;
}

export interface LoteFinanzas {
  id: string;
  nombre: string;
}

export interface EntradaResumen {
  movimientos: readonly Movimiento[];
  animales: readonly AnimalFinanzas[];
  lotes: readonly LoteFinanzas[];
  periodo: Periodo;
  /** R19: opción que activa el propietario (SUPOSICION S-71). */
  prorratear: boolean;
}

export interface ResumenFinca {
  ingresos: number;
  gastos: number;
  rentabilidad: number;
  /** Sin animal ni lote: «gastos generales», siempre aparte (R19). */
  gastosGenerales: number;
  gastosDeLotes: number;
  gastosDeAnimales: number;
  ingresosGenerales: number;
  /** Con prorrateo: gasto que no se pudo repartir porque no había animales activos entre quienes repartirlo. */
  gastosSinRepartir: number;
}

export interface FilaLote {
  loteId: string;
  nombre: string;
  ingresos: number;
  gastos: number;
  rentabilidad: number;
}

export interface FilaAnimal {
  animalId: string;
  nombre: string;
  ingresos: number;
  /** R19: lo asignado a este animal. */
  gastosDirectos: number;
  /** Con prorrateo: su parte de los gastos de su lote. */
  gastosDeLote: number;
  /** Con prorrateo: su parte de los gastos generales. */
  gastosGenerales: number;
  /** Costo por cabra = gastos asignados a ese animal (más su parte, si hay prorrateo). */
  costo: number;
  rentabilidad: number;
}

export interface ResumenFinanzas {
  finca: ResumenFinca;
  lotes: FilaLote[];
  animales: FilaAnimal[];
  prorrateado: boolean;
  /** Animales activos del hato, entre quienes se repartirían los gastos generales. */
  animalesParaRepartir: number;
}

/**
 * R19. Costo por cabra = gastos asignados a ese animal; costo por lote = gastos asignados a ese lote; rentabilidad =
 * ingresos menos gastos, por animal, por lote y por finca, dentro del periodo. Los gastos sin animal ni lote salen
 * aparte como «gastos generales».
 *
 * SUPOSICION (S-71): con el prorrateo activado, el gasto de un lote se reparte en partes iguales entre los animales
 * activos que hoy están en ese lote, y el general entre todos los animales activos del hato. Los ingresos no se reparten.
 * SUPOSICION (S-72): el costo de un lote cuenta solo lo asignado al lote, no lo asignado a sus animales.
 */
export function resumirFinanzas(entrada: EntradaResumen): ResumenFinanzas {
  const { animales, lotes, prorratear } = entrada;
  const movimientos = entrada.movimientos.filter((m) => enPeriodo(m.fecha, entrada.periodo));
  const nombreDeAnimal = new Map(animales.map((a) => [a.id, a.nombre]));
  const nombreDeLote = new Map(lotes.map((l) => [l.id, l.nombre]));

  const finca = { ingresos: 0, gastos: 0, gastosGenerales: 0, gastosDeLotes: 0, gastosDeAnimales: 0, ingresosGenerales: 0 };
  const porLote = new Map<string, { ingresos: number; gastos: number }>();
  const porAnimal = new Map<string, { ingresos: number; directos: number }>();
  let generalesPorRepartir = 0;
  const gastosDeLote = new Map<string, number>();

  for (const m of movimientos) {
    const esIngreso = m.tipo === "ingreso";
    if (esIngreso) finca.ingresos += m.valor;
    else finca.gastos += m.valor;

    if (m.animalId !== null) {
      const fila = porAnimal.get(m.animalId) ?? { ingresos: 0, directos: 0 };
      if (esIngreso) fila.ingresos += m.valor;
      else {
        fila.directos += m.valor;
        finca.gastosDeAnimales += m.valor;
      }
      porAnimal.set(m.animalId, fila);
    } else if (m.loteId !== null) {
      const fila = porLote.get(m.loteId) ?? { ingresos: 0, gastos: 0 };
      if (esIngreso) fila.ingresos += m.valor;
      else {
        fila.gastos += m.valor;
        finca.gastosDeLotes += m.valor;
        gastosDeLote.set(m.loteId, (gastosDeLote.get(m.loteId) ?? 0) + m.valor);
      }
      porLote.set(m.loteId, fila);
    } else if (esIngreso) {
      finca.ingresosGenerales += m.valor;
    } else {
      finca.gastosGenerales += m.valor;
      generalesPorRepartir += m.valor;
    }
  }

  // Prorrateo (opcional): partes iguales entre los animales activos.
  const activos = animales.filter((a) => a.activo);
  const deLote = new Map<string, number>();
  const generales = new Map<string, number>();
  let sinRepartir = 0;
  if (prorratear) {
    for (const [loteId, total] of gastosDeLote) {
      const miembros = activos.filter((a) => a.loteId === loteId);
      if (miembros.length === 0) sinRepartir += total;
      for (const a of miembros) deLote.set(a.id, (deLote.get(a.id) ?? 0) + total / miembros.length);
    }
    if (activos.length === 0) sinRepartir += generalesPorRepartir;
    else for (const a of activos) generales.set(a.id, generalesPorRepartir / activos.length);
  }

  const idsDeAnimales = new Set(porAnimal.keys());
  if (prorratear) for (const a of activos) idsDeAnimales.add(a.id);
  const filasAnimales: FilaAnimal[] = [...idsDeAnimales].map((animalId) => {
    const propio = porAnimal.get(animalId) ?? { ingresos: 0, directos: 0 };
    const parteDeLote = deLote.get(animalId) ?? 0;
    const parteGeneral = generales.get(animalId) ?? 0;
    const costo = propio.directos + parteDeLote + parteGeneral;
    return {
      animalId,
      nombre: nombreDeAnimal.get(animalId) ?? "",
      ingresos: propio.ingresos,
      gastosDirectos: propio.directos,
      gastosDeLote: parteDeLote,
      gastosGenerales: parteGeneral,
      costo,
      rentabilidad: propio.ingresos - costo,
    };
  });

  const filasLotes: FilaLote[] = [...porLote].map(([loteId, f]) => ({
    loteId,
    nombre: nombreDeLote.get(loteId) ?? "",
    ingresos: f.ingresos,
    gastos: f.gastos,
    rentabilidad: f.ingresos - f.gastos,
  }));

  return {
    finca: { ...finca, rentabilidad: finca.ingresos - finca.gastos, gastosSinRepartir: sinRepartir },
    lotes: ordenarFilas(filasLotes, (f) => f.nombre, "asc"),
    animales: ordenarFilas(ordenarFilas(filasAnimales, (f) => f.nombre, "asc"), (f) => f.costo, "desc"),
    prorrateado: prorratear,
    animalesParaRepartir: activos.length,
  };
}
