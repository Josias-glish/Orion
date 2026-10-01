import { describe, expect, it } from "vitest";
import { quedaAlgunPropietario } from "./usuarios";

describe("siempre queda un propietario (SUPOSICION)", () => {
  const usuarios = [
    { id: "ana", rol: "propietario" as const },
    { id: "luis", rol: "operario" as const },
  ];

  it("no deja retirar ni volver operario al único propietario", () => {
    expect(quedaAlgunPropietario(usuarios, "ana", null)).toBe(false);
    expect(quedaAlgunPropietario(usuarios, "ana", "operario")).toBe(false);
  });

  it("permite cambios que mantienen un propietario", () => {
    expect(quedaAlgunPropietario(usuarios, "luis", null)).toBe(true);
    expect(quedaAlgunPropietario(usuarios, "luis", "propietario")).toBe(true);
    expect(quedaAlgunPropietario([...usuarios, { id: "eva", rol: "propietario" }], "ana", null)).toBe(true);
  });
});
