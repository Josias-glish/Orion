// R10 y metas por edad (RF-31).
import { describe, expect, it } from "vitest";
import { DIAS_POR_MES, gananciaDiaria, gananciasSucesivas, metaParaEdad, type MetaPeso } from "./pesos";

describe("R10: ganancia diaria de peso", () => {
  it("divide la diferencia de kilos por los días entre pesajes", () => {
    expect(gananciaDiaria({ fecha: "2026-01-01", kilos: 3.5 }, { fecha: "2026-03-02", kilos: 15.5 })).toBeCloseTo(0.2, 10);
  });

  it("puede ser negativa", () => {
    expect(gananciaDiaria({ fecha: "2026-01-01", kilos: 40 }, { fecha: "2026-01-11", kilos: 39 })).toBeCloseTo(-0.1, 10);
  });

  it("dos pesajes del mismo día no dan ganancia", () => {
    expect(gananciaDiaria({ fecha: "2026-01-01", kilos: 3 }, { fecha: "2026-01-01", kilos: 4 })).toBeNull();
  });

  it("calcula la ganancia de cada pesaje respecto al anterior, en orden de fecha", () => {
    const pesajes = [
      { fecha: "2026-01-11", kilos: 6 },
      { fecha: "2026-01-01", kilos: 4 },
      { fecha: "2026-01-21", kilos: 7 },
    ];
    const g = gananciasSucesivas(pesajes);
    expect(g[0]).toBeNull();
    expect(g[1]).toBeCloseTo(0.2, 10);
    expect(g[2]).toBeCloseTo(0.1, 10);
  });
});

describe("metas de peso por edad (SUPOSICION)", () => {
  const metas: MetaPeso[] = [
    { sexo: "hembra", edadMeses: 0, kilos: 3.5 },
    { sexo: "hembra", edadMeses: 3, kilos: 15 },
    { sexo: "hembra", edadMeses: 6, kilos: 24 },
    { sexo: "macho", edadMeses: 3, kilos: 18 },
  ];

  it("usa la meta exacta de esa edad", () => {
    expect(metaParaEdad(metas, "hembra", 3 * DIAS_POR_MES)).toBeCloseTo(15, 10);
  });

  it("interpola en línea recta entre dos metas", () => {
    expect(metaParaEdad(metas, "hembra", 4.5 * DIAS_POR_MES)).toBeCloseTo(19.5, 10);
  });

  it("no compara fuera del rango de metas ni con metas de otro sexo", () => {
    expect(metaParaEdad(metas, "hembra", 7 * DIAS_POR_MES)).toBeNull();
    expect(metaParaEdad(metas, "macho", 2 * DIAS_POR_MES)).toBeNull();
    expect(metaParaEdad([], "hembra", 30)).toBeNull();
  });
});
