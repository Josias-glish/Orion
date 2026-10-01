import { describe, expect, it } from "vitest";
import { compararCaminos, esCaminoValido, generacion, linea, sexoEsperado } from "./genealogia";

describe("caminos genealógicos", () => {
  it("deduce generación, línea y sexo del ancestro", () => {
    expect(generacion("PM")).toBe(2);
    expect(linea("PM")).toBe("paterna");
    expect(linea("MP")).toBe("materna");
    expect(sexoEsperado("PM")).toBe("hembra");
    expect(sexoEsperado("MP")).toBe("macho");
  });

  it("solo acepta P y M", () => {
    expect(esCaminoValido("PMP")).toBe(true);
    expect(esCaminoValido("")).toBe(false);
    expect(esCaminoValido("PX")).toBe(false);
  });

  it("ordena por generación y pone primero la línea paterna", () => {
    const desordenados = ["MM", "P", "PM", "M", "MP", "PP"];
    expect([...desordenados].sort(compararCaminos)).toEqual(["P", "M", "PP", "PM", "MP", "MM"]);
  });
});
