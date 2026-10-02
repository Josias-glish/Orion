import { describe, expect, it } from "vitest";
import { textos } from "./es";

describe("nombres de parentesco", () => {
  it("nombra padres, abuelos, bisabuelos y tatarabuelos", () => {
    expect(textos.parentesco("P")).toBe("Padre");
    expect(textos.parentesco("M")).toBe("Madre");
    expect(textos.parentesco("PP")).toBe("Abuelo paterno");
    expect(textos.parentesco("PM")).toBe("Abuela paterna");
    expect(textos.parentesco("MP")).toBe("Abuelo materno");
    expect(textos.parentesco("MM")).toBe("Abuela materna");
    expect(textos.parentesco("MPM")).toBe("Bisabuela materna");
    expect(textos.parentesco("PPPP")).toBe("Tatarabuelo paterno");
  });

  it("usa un nombre genérico desde la quinta generación", () => {
    expect(textos.parentesco("MPPMP")).toBe("Ancestro de la 5.ª generación, línea materna");
  });
});

describe("formato de pesos y números (Etapa 8)", () => {
  const NBSP = " ";

  it("los pesos llevan separador de miles, sin centavos, y un espacio que no se parte tras el «$»", () => {
    expect(textos.comun.pesos(150000)).toBe(`$${NBSP}150.000`);
    expect(textos.comun.pesos(1250000)).toBe(`$${NBSP}1.250.000`);
    expect(textos.comun.pesos(0)).toBe(`$${NBSP}0`);
    expect(textos.comun.pesos(99.6)).toBe(`$${NBSP}100`);
  });

  it("un valor negativo se escribe con el signo menos (el color no es lo único que lo dice)", () => {
    expect(textos.comun.pesos(-60000)).toBe(`−$${NBSP}60.000`);
    expect(textos.comun.pesos(-0.4)).toBe(`$${NBSP}0`);
  });

  it("los números sin ceros de relleno: 3,8 · 3,85 · 450.000", () => {
    expect(textos.comun.numero(3.8)).toBe("3,8");
    expect(textos.comun.numero(3.85)).toBe("3,85");
    expect(textos.comun.numero(3.8567)).toBe("3,86");
    expect(textos.comun.numero(450000, 0)).toBe("450.000");
    expect(textos.comun.numero(828333.33, 0)).toBe("828.333");
  });
});
