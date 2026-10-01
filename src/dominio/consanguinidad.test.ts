// R6 y CA-02: coeficiente de consanguinidad de Wright.
import { describe, expect, it } from "vitest";
import { coeficienteConsanguinidad, type NodoPedigri } from "./consanguinidad";

/** Pedigrí a partir de una lista «hijo: padre × madre». */
function pedigri(filas: Record<string, [string | null, string | null]>): Map<string, NodoPedigri> {
  return new Map(Object.entries(filas).map(([id, [padreId, madreId]]) => [id, { padreId, madreId }]));
}

describe("CA-02: valores de referencia", () => {
  it("hijo de dos hermanos completos = 25 %", () => {
    const p = pedigri({
      Abuelo: [null, null],
      Abuela: [null, null],
      Hermano: ["Abuelo", "Abuela"],
      Hermana: ["Abuelo", "Abuela"],
      Cria: ["Hermano", "Hermana"],
    });
    expect(coeficienteConsanguinidad("Cria", p)).toBeCloseTo(0.25, 10);
  });

  it("hijo de medios hermanos = 12,5 %", () => {
    const p = pedigri({
      Padre: [null, null],
      MadreA: [null, null],
      MadreB: [null, null],
      MedioHermano: ["Padre", "MadreA"],
      MediaHermana: ["Padre", "MadreB"],
      Cria: ["MedioHermano", "MediaHermana"],
    });
    expect(coeficienteConsanguinidad("Cria", p)).toBeCloseTo(0.125, 10);
  });
});

describe("R6: otros casos", () => {
  it("un fundador o un animal de padres no emparentados tiene 0 %", () => {
    const p = pedigri({ A: [null, null], B: [null, null], C: ["A", "B"] });
    expect(coeficienteConsanguinidad("A", p)).toBe(0);
    expect(coeficienteConsanguinidad("C", p)).toBe(0);
  });

  it("un animal desconocido tiene 0 %", () => {
    expect(coeficienteConsanguinidad("Nadie", new Map())).toBe(0);
  });

  it("un ancestro desconocido se trata como no emparentado", () => {
    // Las dos madres de los medios hermanos no están registradas.
    const p = pedigri({
      Padre: [null, null],
      MedioHermano: ["Padre", "Desconocida1"],
      MediaHermana: ["Padre", "Desconocida2"],
      Cria: ["MedioHermano", "MediaHermana"],
    });
    expect(coeficienteConsanguinidad("Cria", p)).toBeCloseTo(0.125, 10);
  });

  it("padre × hija = 25 %", () => {
    const p = pedigri({ Padre: [null, null], Madre: [null, null], Hija: ["Padre", "Madre"], Cria: ["Padre", "Hija"] });
    expect(coeficienteConsanguinidad("Cria", p)).toBeCloseTo(0.25, 10);
  });

  it("hijo de primos hermanos = 6,25 %", () => {
    const p = pedigri({
      AbueloComun: [null, null],
      AbuelaComun: [null, null],
      Tio1: ["AbueloComun", "AbuelaComun"],
      Tio2: ["AbueloComun", "AbuelaComun"],
      Primo: ["Tio1", "X1"],
      Prima: ["X2", "Tio2"],
      Cria: ["Primo", "Prima"],
    });
    expect(coeficienteConsanguinidad("Cria", p)).toBeCloseTo(0.0625, 10);
  });

  it("suma la consanguinidad del ancestro común: (1/2)^3 · (1 + 0,25)", () => {
    // El padre común de los medios hermanos es hijo de hermanos completos (F = 25 %).
    const p = pedigri({
      A: [null, null],
      B: [null, null],
      Hermano: ["A", "B"],
      Hermana: ["A", "B"],
      PadreComun: ["Hermano", "Hermana"],
      MedioHermano: ["PadreComun", "M1"],
      MediaHermana: ["PadreComun", "M2"],
      Cria: ["MedioHermano", "MediaHermana"],
    });
    expect(coeficienteConsanguinidad("PadreComun", p)).toBeCloseTo(0.25, 10);
    expect(coeficienteConsanguinidad("Cria", p)).toBeCloseTo(0.15625, 10);
  });

  it("respeta el máximo de generaciones", () => {
    const p = pedigri({
      Abuelo: [null, null],
      Abuela: [null, null],
      Hermano: ["Abuelo", "Abuela"],
      Hermana: ["Abuelo", "Abuela"],
      Cria: ["Hermano", "Hermana"],
    });
    // Con una sola generación solo se ven los padres: el parentesco entre ellos queda oculto.
    expect(coeficienteConsanguinidad("Cria", p, 1)).toBe(0);
    expect(coeficienteConsanguinidad("Cria", p, 2)).toBeCloseTo(0.25, 10);
  });
});
