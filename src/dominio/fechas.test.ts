import { describe, expect, it } from "vitest";
import { fechaLocal, formatearFecha, formatearMarcaDeTiempo, marcaDeTiempo } from "./fechas";

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
