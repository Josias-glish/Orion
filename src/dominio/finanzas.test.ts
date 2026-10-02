import { describe, expect, it } from "vitest";
import {
  enPeriodo,
  leerPesos,
  resumirFinanzas,
  validarMovimiento,
  validarPeriodo,
  type AnimalFinanzas,
  type Movimiento,
  type Periodo,
} from "./finanzas";

describe("leerPesos: lo que se escribe como valor (S-70)", () => {
  it("acepta números enteros, con puntos de miles, espacios o el signo $", () => {
    expect(leerPesos("150000")).toBe(150000);
    expect(leerPesos("150.000")).toBe(150000);
    expect(leerPesos(" $ 1.250.000 ")).toBe(1250000);
  });

  it("vacío es «sin valor» y lo que no es número da NaN (el dominio lo rechaza)", () => {
    expect(leerPesos("")).toBeNull();
    expect(leerPesos("   ")).toBeNull();
    expect(leerPesos("abc")).toBeNaN();
    expect(leerPesos("12,5")).toBeNaN();
  });
});

describe("validarMovimiento (RF-33)", () => {
  const gasto = { tipo: "gasto" as const, valor: 50000, animalId: null, loteId: null };
  const categoriaGasto = { tipo: "gasto" as const, activo: true };

  it("acepta un gasto general, uno de un lote y uno de un animal", () => {
    expect(validarMovimiento(gasto, categoriaGasto)).toEqual([]);
    expect(validarMovimiento({ ...gasto, loteId: "l1" }, categoriaGasto)).toEqual([]);
    expect(validarMovimiento({ ...gasto, animalId: "a1" }, categoriaGasto)).toEqual([]);
  });

  it("el valor es un número entero de pesos mayor que cero", () => {
    for (const valor of [0, -5, 10.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(validarMovimiento({ ...gasto, valor }, categoriaGasto), String(valor)).toEqual([{ codigo: "valor_invalido" }]);
    }
  });

  it("un movimiento va a un animal o a un lote, no a los dos", () => {
    expect(validarMovimiento({ ...gasto, animalId: "a1", loteId: "l1" }, categoriaGasto)).toEqual([{ codigo: "animal_y_lote" }]);
  });

  it("la categoría debe ser del mismo tipo y estar activa", () => {
    expect(validarMovimiento({ ...gasto, tipo: "ingreso" }, categoriaGasto)).toEqual([{ codigo: "categoria_otro_tipo" }]);
    expect(validarMovimiento(gasto, { tipo: "gasto", activo: false })).toEqual([{ codigo: "categoria_inactiva" }]);
    // Un movimiento ya guardado con una categoría que luego se desactivó se puede seguir corrigiendo.
    expect(validarMovimiento(gasto, { tipo: "gasto", activo: false }, true)).toEqual([]);
  });

  it("devuelve todos los motivos juntos", () => {
    expect(validarMovimiento({ ...gasto, valor: 0, animalId: "a", loteId: "l" }, { tipo: "ingreso", activo: false }).map((e) => e.codigo)).toEqual([
      "valor_invalido",
      "categoria_otro_tipo",
      "categoria_inactiva",
      "animal_y_lote",
    ]);
  });
});

describe("periodo", () => {
  it("enPeriodo incluye los dos extremos y acepta uno solo o ninguno", () => {
    expect(enPeriodo("2026-03-10", { desde: "2026-03-10", hasta: "2026-03-10" })).toBe(true);
    expect(enPeriodo("2026-03-09", { desde: "2026-03-10", hasta: null })).toBe(false);
    expect(enPeriodo("2026-03-11", { desde: null, hasta: "2026-03-10" })).toBe(false);
    expect(enPeriodo("1999-01-01", { desde: null, hasta: null })).toBe(true);
  });

  it("validarPeriodo rechaza fechas que no existen o un periodo al revés", () => {
    expect(validarPeriodo({ desde: "2026-01-01", hasta: "2026-12-31" })).toEqual([]);
    expect(validarPeriodo({ desde: null, hasta: null })).toEqual([]);
    expect(validarPeriodo({ desde: "2026-02-30", hasta: null })).toEqual([{ codigo: "periodo_invalido" }]);
    expect(validarPeriodo({ desde: "2026-12-31", hasta: "2026-01-01" })).toEqual([{ codigo: "periodo_invalido" }]);
  });
});

describe("R19: costo por cabra, costo por lote y rentabilidad (CA-22)", () => {
  // Datos del cálculo manual. Lote L1 = {Ana, Beto}. Cora no tiene lote. Dora está vendida.
  const animales: AnimalFinanzas[] = [
    { id: "ana", nombre: "Ana", loteId: "L1", activo: true },
    { id: "beto", nombre: "Beto", loteId: "L1", activo: true },
    { id: "cora", nombre: "Cora", loteId: null, activo: true },
    { id: "dora", nombre: "Dora", loteId: null, activo: false },
  ];
  const lotes = [
    { id: "L1", nombre: "Ordeño" },
    { id: "L2", nombre: "Crías" },
  ];
  const mov = (id: string, tipo: "ingreso" | "gasto", fecha: string, valor: number, animalId: string | null = null, loteId: string | null = null): Movimiento => ({
    id,
    tipo,
    fecha,
    valor,
    categoriaId: tipo === "gasto" ? "alimento" : "venta",
    animalId,
    loteId,
  });
  const movimientos: Movimiento[] = [
    mov("m1", "gasto", "2026-02-01", 1_000_000, null, "L1"), // alimento del lote Ordeño
    mov("m2", "gasto", "2026-02-10", 60_000, "ana"), // medicamento de Ana
    mov("m3", "gasto", "2026-03-05", 40_000, "beto"), // medicamento de Beto
    mov("m4", "gasto", "2026-03-31", 900_000), // mano de obra: gasto general
    mov("m5", "ingreso", "2026-03-31", 2_500_000), // venta de leche: ingreso de la finca
    mov("m6", "ingreso", "2026-04-15", 700_000, "dora"), // venta de Dora
    mov("m7", "gasto", "2025-12-31", 5_000_000), // fuera del periodo
  ];
  const periodo: Periodo = { desde: "2026-01-01", hasta: "2026-12-31" };
  const resumir = (opciones: { prorratear?: boolean; periodo?: Periodo } = {}) =>
    resumirFinanzas({ movimientos, animales, lotes, periodo: opciones.periodo ?? periodo, prorratear: opciones.prorratear ?? false });

  it("finca: ingresos, gastos y rentabilidad del periodo, con los gastos generales aparte", () => {
    const { finca } = resumir();
    // Ingresos: 2 500 000 + 700 000 = 3 200 000. Gastos: 1 000 000 + 60 000 + 40 000 + 900 000 = 2 000 000.
    expect(finca.ingresos).toBe(3_200_000);
    expect(finca.gastos).toBe(2_000_000);
    expect(finca.rentabilidad).toBe(1_200_000);
    // Sin animal ni lote: «gastos generales» (900 000) e ingreso general (2 500 000).
    expect(finca.gastosGenerales).toBe(900_000);
    expect(finca.ingresosGenerales).toBe(2_500_000);
    expect(finca.gastosDeLotes).toBe(1_000_000);
    expect(finca.gastosDeAnimales).toBe(100_000);
    expect(finca.gastosGenerales + finca.gastosDeLotes + finca.gastosDeAnimales).toBe(finca.gastos);
  });

  it("el periodo recorta lo que cuenta: sin periodo entra también el gasto de 2025", () => {
    expect(resumir({ periodo: { desde: null, hasta: null } }).finca.gastos).toBe(7_000_000);
    expect(resumir({ periodo: { desde: "2026-03-01", hasta: "2026-03-31" } }).finca).toMatchObject({
      ingresos: 2_500_000,
      gastos: 940_000,
      rentabilidad: 1_560_000,
    });
  });

  it("lote: costo = gastos asignados al lote; rentabilidad = ingresos − gastos", () => {
    const { lotes: filas } = resumir();
    // Solo aparecen los lotes con movimientos: «Crías» no tiene ninguno.
    expect(filas).toEqual([{ loteId: "L1", nombre: "Ordeño", ingresos: 0, gastos: 1_000_000, rentabilidad: -1_000_000 }]);
  });

  it("animal sin prorrateo: costo = gastos asignados a ese animal", () => {
    const { animales: filas } = resumir();
    const de = (id: string) => filas.find((f) => f.animalId === id)!;
    expect(filas.map((f) => f.animalId).sort()).toEqual(["ana", "beto", "dora"]); // Cora no tiene movimientos
    expect(de("ana")).toMatchObject({ ingresos: 0, gastosDirectos: 60_000, gastosDeLote: 0, gastosGenerales: 0, costo: 60_000, rentabilidad: -60_000 });
    expect(de("beto")).toMatchObject({ costo: 40_000, rentabilidad: -40_000 });
    expect(de("dora")).toMatchObject({ ingresos: 700_000, costo: 0, rentabilidad: 700_000 });
  });

  it("prorrateo (opcional): reparte el gasto del lote entre sus animales activos y el general entre todos los activos", () => {
    const resumen = resumir({ prorratear: true });
    const de = (id: string) => resumen.animales.find((f) => f.animalId === id)!;
    // Lote L1 (1 000 000) entre Ana y Beto: 500 000 cada uno. General (900 000) entre los 3 activos: 300 000 cada uno.
    expect(de("ana")).toMatchObject({ gastosDirectos: 60_000, gastosDeLote: 500_000, gastosGenerales: 300_000, costo: 860_000, rentabilidad: -860_000 });
    expect(de("beto")).toMatchObject({ gastosDirectos: 40_000, gastosDeLote: 500_000, gastosGenerales: 300_000, costo: 840_000 });
    expect(de("cora")).toMatchObject({ gastosDirectos: 0, gastosDeLote: 0, gastosGenerales: 300_000, costo: 300_000, rentabilidad: -300_000 });
    // Dora está vendida: no recibe reparto, pero conserva lo suyo.
    expect(de("dora")).toMatchObject({ gastosDeLote: 0, gastosGenerales: 0, costo: 0, rentabilidad: 700_000 });
    expect(resumen.prorrateado).toBe(true);
    expect(resumen.animalesParaRepartir).toBe(3);
    // Nada se pierde: lo repartido más lo que no se pudo repartir es el total de gastos.
    const repartido = resumen.animales.reduce((s, f) => s + f.costo, 0);
    expect(repartido + resumen.finca.gastosSinRepartir).toBeCloseTo(resumen.finca.gastos, 6);
    expect(resumen.finca.gastosSinRepartir).toBe(0);
  });

  it("el prorrateo no cambia los totales de la finca ni de los lotes", () => {
    const sin = resumir();
    const con = resumir({ prorratear: true });
    expect(con.finca).toEqual({ ...sin.finca, gastosSinRepartir: 0 });
    expect(con.lotes).toEqual(sin.lotes);
    expect(sin.prorrateado).toBe(false);
  });

  it("sin animales activos no hay a quién repartir: el gasto queda «sin repartir» y no se pierde", () => {
    const resumen = resumirFinanzas({
      movimientos: [mov("g", "gasto", "2026-01-10", 300_000), mov("h", "gasto", "2026-01-11", 90_000, null, "L1")],
      animales: [{ id: "x", nombre: "X", loteId: null, activo: false }],
      lotes,
      periodo,
      prorratear: true,
    });
    expect(resumen.finca.gastosSinRepartir).toBe(390_000);
    expect(resumen.animales).toEqual([]);
    expect(resumen.animalesParaRepartir).toBe(0);
  });

  it("un lote sin animales activos no reparte su gasto, pero el general sí", () => {
    const resumen = resumirFinanzas({
      movimientos: [mov("g", "gasto", "2026-01-10", 300_000), mov("h", "gasto", "2026-01-11", 90_000, null, "L2")],
      animales,
      lotes,
      periodo,
      prorratear: true,
    });
    expect(resumen.finca.gastosSinRepartir).toBe(90_000);
    expect(resumen.animales.reduce((s, f) => s + f.costo, 0)).toBeCloseTo(300_000, 6);
  });

  it("un movimiento de un lote o animal que ya no está en las listas sigue contando en los totales", () => {
    const resumen = resumirFinanzas({
      movimientos: [mov("a", "gasto", "2026-01-10", 1_000, "desconocido"), mov("b", "gasto", "2026-01-11", 2_000, null, "otro")],
      animales: [],
      lotes: [],
      periodo,
      prorratear: false,
    });
    expect(resumen.finca.gastos).toBe(3_000);
    expect(resumen.finca.gastosDeAnimales).toBe(1_000);
    expect(resumen.finca.gastosDeLotes).toBe(2_000);
  });

  it("sin movimientos todo da cero", () => {
    const resumen = resumirFinanzas({ movimientos: [], animales, lotes, periodo, prorratear: false });
    expect(resumen.finca).toMatchObject({ ingresos: 0, gastos: 0, rentabilidad: 0, gastosGenerales: 0 });
    expect(resumen.lotes).toEqual([]);
    expect(resumen.animales).toEqual([]);
  });
});
