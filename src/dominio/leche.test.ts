// R8 y CA-08: proyección de la lactancia.
import { describe, expect, it } from "vitest";
import { diaDeLactancia, leerKilos, produccionDiaria, proyectarLactancia, type PesajeLeche } from "./leche";

const p = (fecha: string, jornada: "manana" | "tarde", kilos: number): PesajeLeche => ({ fecha, jornada, kilos });

describe("día de lactancia", () => {
  it("el día del parto es el día 1", () => {
    expect(diaDeLactancia("2026-08-01", "2026-08-01")).toBe(1);
    expect(diaDeLactancia("2026-08-01", "2026-08-10")).toBe(10);
  });
});

describe("producción diaria", () => {
  it("suma mañana y tarde de cada día y ordena por fecha", () => {
    const curva = produccionDiaria("2026-08-01", [p("2026-08-03", "tarde", 1.5), p("2026-08-02", "manana", 2), p("2026-08-03", "manana", 2.25)]);
    expect(curva).toEqual([
      { fecha: "2026-08-02", dia: 2, kilos: 2 },
      { fecha: "2026-08-03", dia: 3, kilos: 3.75 },
    ]);
  });
});

describe("CA-08: la proyección coincide con el cálculo manual de la fórmula documentada", () => {
  it("con más de 7 días con registro usa solo los últimos 7", () => {
    // Lactancia que empezó el 1 de agosto; 10 días con registro (días 2 a 11), con 3, 4, …, 12 kg diarios
    // repartidos en mañana (2/3) y tarde (1/3).
    const pesajes: PesajeLeche[] = [];
    for (let i = 0; i < 10; i++) {
      const fecha = `2026-08-${String(i + 2).padStart(2, "0")}`;
      const total = 3 + i;
      pesajes.push(p(fecha, "manana", (total * 2) / 3), p(fecha, "tarde", total / 3));
    }
    // Cálculo manual:
    //   acumulado = 3 + 4 + … + 12 = 75 kg
    //   últimos 7 días con registro: 6, 7, …, 12 → suma 63 → promedio 9 kg/día
    //   día del último registro = 11 (11 de agosto); días que faltan hasta 305 = 305 − 11 = 294
    //   proyección = 75 + 9 × 294 = 2721 kg
    const r = proyectarLactancia("2026-08-01", 305, pesajes)!;
    expect(r.acumulado).toBeCloseTo(75, 10);
    expect(r.promedioDiario).toBeCloseTo(9, 10);
    expect(r.diasPromediados).toBe(7);
    expect(r.diaActual).toBe(11);
    expect(r.diasRestantes).toBe(294);
    expect(r.proyeccion).toBeCloseTo(2721, 10);
  });

  it("con menos de 7 días promedia los que haya", () => {
    const r = proyectarLactancia("2026-08-01", 10, [p("2026-08-01", "manana", 2), p("2026-08-03", "manana", 4)])!;
    // acumulado 6; promedio (2 + 4) / 2 = 3; último registro día 3; faltan 7 → 6 + 21 = 27
    expect(r).toEqual({ acumulado: 6, promedioDiario: 3, diasPromediados: 2, diaActual: 3, diasRestantes: 7, proyeccion: 27 });
  });

  it("si ya se pasaron los días de lactancia, la proyección es el acumulado", () => {
    const r = proyectarLactancia("2026-01-01", 5, [p("2026-01-10", "manana", 2)])!;
    expect(r.diasRestantes).toBe(0);
    expect(r.proyeccion).toBe(2);
  });

  it("sin pesajes no hay proyección", () => {
    expect(proyectarLactancia("2026-08-01", 305, [])).toBeNull();
  });
});

describe("lectura de los kilos escritos en el ordeño", () => {
  it("acepta coma o punto decimal y rechaza lo que no es número", () => {
    expect(leerKilos("2,5")).toBe(2.5);
    expect(leerKilos(" 3.25 ")).toBe(3.25);
    expect(leerKilos("0")).toBe(0);
    expect(leerKilos("")).toBeNull();
    expect(leerKilos("abc")).toBeNull();
    expect(leerKilos("-1")).toBeNull();
    expect(leerKilos("1,2,3")).toBeNull();
  });
});
