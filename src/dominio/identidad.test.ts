import { describe, expect, it } from "vitest";
import { esUuidV4, nuevoId } from "./identidad";

describe("nuevoId (RF-42)", () => {
  it("genera UUID versión 4 válidos", () => {
    for (let i = 0; i < 200; i++) expect(esUuidV4(nuevoId())).toBe(true);
  });

  it("no repite valores", () => {
    const ids = new Set(Array.from({ length: 5000 }, nuevoId));
    expect(ids.size).toBe(5000);
  });

  it("reconoce textos que no son UUID v4", () => {
    expect(esUuidV4("no-es-un-uuid")).toBe(false);
    expect(esUuidV4("11111111-1111-1111-8111-111111111111")).toBe(false); // versión 1
  });
});
