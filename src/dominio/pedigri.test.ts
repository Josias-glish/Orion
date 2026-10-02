// R31: pedigrí de tres generaciones (con opción de cuatro) a partir de la instantánea.
import { describe, expect, it } from "vitest";
import { caminosDeGeneracion, columnasDelPedigri } from "./pedigri";
import type { AncestroInstantanea } from "./registros";

const ancestro = (camino: string, extra: Partial<AncestroInstantanea> = {}): AncestroInstantanea => ({
  camino,
  nombre: `Animal ${camino}`,
  sexo: camino.endsWith("P") ? "macho" : "hembra",
  identificador: `ID-${camino}`,
  registroAsociacion: null,
  externo: false,
  propietario: null,
  sinVerificar: false,
  fechaNacimiento: null,
  ...extra,
});

/** Todos los ancestros hasta la generación `n`. */
const completo = (n: number): AncestroInstantanea[] =>
  Array.from({ length: n }, (_, i) => caminosDeGeneracion(i + 1)).flat().map((c) => ancestro(c));

describe("caminos por generación", () => {
  it("la línea paterna va primero y cada generación duplica a la anterior", () => {
    expect(caminosDeGeneracion(1)).toEqual(["P", "M"]);
    expect(caminosDeGeneracion(2)).toEqual(["PP", "PM", "MP", "MM"]);
    expect(caminosDeGeneracion(3)).toEqual(["PPP", "PPM", "PMP", "PMM", "MPP", "MPM", "MMP", "MMM"]);
    expect(caminosDeGeneracion(4)).toHaveLength(16);
  });
});

describe("columnas del pedigrí", () => {
  it("tres generaciones: 2 padres, 4 abuelos y 8 bisabuelos, cada uno en su lugar", () => {
    const columnas = columnasDelPedigri(completo(4), 3);
    expect(columnas.map((c) => c.length)).toEqual([2, 4, 8]);
    expect(columnas[0].map((a) => a?.camino)).toEqual(["P", "M"]);
    expect(columnas[1].map((a) => a?.camino)).toEqual(["PP", "PM", "MP", "MM"]);
    expect(columnas[2].map((a) => a?.camino)).toEqual(["PPP", "PPM", "PMP", "PMM", "MPP", "MPM", "MMP", "MMM"]);
  });

  it("cuatro generaciones agrega los 16 tatarabuelos", () => {
    const columnas = columnasDelPedigri(completo(4), 4);
    expect(columnas.map((c) => c.length)).toEqual([2, 4, 8, 16]);
    expect(columnas[3][0]?.camino).toBe("PPPP");
    expect(columnas[3][15]?.camino).toBe("MMMM");
  });

  it("los ancestros que no se conocen quedan vacíos en su lugar, sin mover a los demás", () => {
    const sinAbuelaPaterna = completo(3).filter((a) => !["PM", "PMP", "PMM"].includes(a.camino));
    const columnas = columnasDelPedigri(sinAbuelaPaterna, 3);
    expect(columnas[1].map((a) => a?.camino ?? null)).toEqual(["PP", null, "MP", "MM"]);
    expect(columnas[2].map((a) => a?.camino ?? null)).toEqual(["PPP", "PPM", null, null, "MPP", "MPM", "MMP", "MMM"]);
  });

  it("tres generaciones ignoran los tatarabuelos guardados en la instantánea", () => {
    const columnas = columnasDelPedigri(completo(4), 3);
    expect(columnas.flat().some((a) => (a?.camino.length ?? 0) > 3)).toBe(false);
  });
});
