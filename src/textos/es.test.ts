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
