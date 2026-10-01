// R3 y CA-07: composición racial.
import { describe, expect, it } from "vitest";
import { composicionDeCria, sumaDeFracciones, validarComposicion } from "./composicion";

describe("R3: las fracciones suman 100 %", () => {
  it("acepta una raza pura", () => {
    expect(validarComposicion([{ razaId: "saanen", fraccion: 1 }])).toEqual([]);
  });

  it("acepta cruces en mitades, cuartos y octavos", () => {
    const cruce = [
      { razaId: "saanen", fraccion: 0.5 },
      { razaId: "alpina", fraccion: 0.25 },
      { razaId: "toggenburg", fraccion: 0.125 },
      { razaId: "boer", fraccion: 0.125 },
    ];
    expect(validarComposicion(cruce)).toEqual([]);
    expect(sumaDeFracciones(cruce)).toBe(1);
  });

  it("acepta tercios redondeados por el usuario", () => {
    const tercios = [
      { razaId: "a", fraccion: 0.3333 },
      { razaId: "b", fraccion: 0.3333 },
      { razaId: "c", fraccion: 0.3334 },
    ];
    expect(validarComposicion(tercios)).toEqual([]);
  });

  it("acepta una composición vacía: raza aún no registrada (SUPOSICION)", () => {
    expect(validarComposicion([])).toEqual([]);
  });
});

describe("CA-07: rechaza composiciones que no suman 100 %", () => {
  it("rechaza 75 %", () => {
    expect(
      validarComposicion([
        { razaId: "saanen", fraccion: 0.5 },
        { razaId: "alpina", fraccion: 0.25 },
      ]),
    ).toEqual([{ codigo: "suma_distinta_de_100", sumaPorcentaje: 75 }]);
  });

  it("rechaza 110 %", () => {
    expect(
      validarComposicion([
        { razaId: "saanen", fraccion: 0.6 },
        { razaId: "alpina", fraccion: 0.5 },
      ]),
    ).toEqual([{ codigo: "suma_distinta_de_100", sumaPorcentaje: 110 }]);
  });

  it("rechaza fracciones de cero, negativas o mayores que 100 %", () => {
    expect(validarComposicion([{ razaId: "a", fraccion: 0 }, { razaId: "b", fraccion: 1 }])).toContainEqual({
      codigo: "fraccion_invalida",
    });
    expect(validarComposicion([{ razaId: "a", fraccion: -0.5 }, { razaId: "b", fraccion: 1.5 }])).toContainEqual({
      codigo: "fraccion_invalida",
    });
  });

  it("rechaza la misma raza dos veces", () => {
    expect(
      validarComposicion([
        { razaId: "saanen", fraccion: 0.5 },
        { razaId: "saanen", fraccion: 0.5 },
      ]),
    ).toEqual([{ codigo: "raza_repetida" }]);
  });
});

describe("composición de una cría (SUPOSICION: promedio de padre y madre)", () => {
  it("promedia las razas de los dos padres", () => {
    const cria = composicionDeCria([{ razaId: "saanen", fraccion: 1 }], [
      { razaId: "saanen", fraccion: 0.5 },
      { razaId: "alpina", fraccion: 0.5 },
    ]);
    expect(cria).toEqual([
      { razaId: "saanen", fraccion: 0.75 },
      { razaId: "alpina", fraccion: 0.25 },
    ]);
  });

  it("si falta la composición de uno de los padres, queda vacía", () => {
    expect(composicionDeCria([], [{ razaId: "saanen", fraccion: 1 }])).toEqual([]);
  });
});
