import { describe, expect, it } from "vitest";
import {
  diasEntre,
  edadEnMeses,
  esFechaValida,
  fechaLocal,
  formatearFecha,
  formatearMarcaDeTiempo,
  marcaDeTiempo,
  sumarDias,
} from "./fechas";

describe("fechas", () => {
  it("la marca de tiempo tiene el formato que exige la base", () => {
    expect(marcaDeTiempo(new Date(Date.UTC(2026, 9, 1, 18, 49, 0, 123)))).toBe("2026-10-01T18:49:00.123Z");
  });

  it("la fecha local usa el calendario del equipo", () => {
    expect(fechaLocal(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });

  it("muestra las fechas como dd/mm/aaaa", () => {
    expect(formatearFecha("2026-10-01")).toBe("01/10/2026");
    expect(formatearFecha("texto raro")).toBe("texto raro");
  });

  it("muestra la marca de tiempo en hora local", () => {
    const local = new Date(2026, 9, 1, 8, 5);
    expect(formatearMarcaDeTiempo(local.toISOString())).toBe("01/10/2026 08:05");
  });
});

describe("validación de fechas", () => {
  it("acepta fechas reales y rechaza las imposibles", () => {
    expect(esFechaValida("2024-02-29")).toBe(true);
    expect(esFechaValida("2023-02-29")).toBe(false);
    expect(esFechaValida("2024-13-01")).toBe(false);
    expect(esFechaValida("01/10/2026")).toBe(false);
  });

  it("calcula la edad en meses cumplidos", () => {
    expect(edadEnMeses("2024-03-15", "2026-03-14")).toBe(23);
    expect(edadEnMeses("2024-03-15", "2026-03-15")).toBe(24);
  });
});

describe("aritmética de fechas", () => {
  it("suma y resta días cruzando meses, años y bisiestos", () => {
    expect(sumarDias("2026-01-31", 1)).toBe("2026-02-01");
    expect(sumarDias("2028-02-28", 1)).toBe("2028-02-29");
    expect(sumarDias("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("cuenta los días entre dos fechas", () => {
    expect(diasEntre("2026-01-01", "2026-03-01")).toBe(59);
    expect(diasEntre("2026-03-01", "2026-01-01")).toBe(-59);
  });
});
