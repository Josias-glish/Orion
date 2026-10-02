import { describe, expect, it } from "vitest";
import { fusionarTodas } from "./fusion";
import { operacionesDeInstantanea } from "./instantanea";

const t = (n: number) => `2026-10-02T10:00:0${n}.000Z-0000-aaaaaaaa`;

describe("instantánea de un registro", () => {
  it("las operaciones reconstruyen exactamente el registro, con sus marcas", () => {
    const valores = { nombre: "Luna", color: "negra", peso: 3, eliminado_en: null };
    const marcas = { base: t(1), campos: { color: t(3), peso: t(2) } };
    const ops = operacionesDeInstantanea(valores, marcas);
    expect(ops[0].marca).toBe(t(1));
    expect(Object.keys(ops[0].campos).sort()).toEqual(["color", "eliminado_en", "nombre", "peso"]);
    const estado = fusionarTodas(null, ops)!;
    expect(estado.valores).toEqual(valores);
    expect(estado.marcas).toEqual(marcas);
    // En cualquier orden: el resultado es el mismo.
    expect(fusionarTodas(null, [...ops].reverse())!.marcas).toEqual(marcas);
  });

  it("un registro con una sola marca es una sola operación", () => {
    expect(operacionesDeInstantanea({ a: 1, b: null }, { base: t(1), campos: {} })).toHaveLength(1);
  });

  it("en dos pasadas (campos que apuntan a la misma tabla) también reconstruye el registro", () => {
    const valores = { nombre: "Cría", padre_id: "p", madre_id: null };
    const marcas = { base: t(1), campos: { padre_id: t(2) } };
    const autorref = new Set(["padre_id", "madre_id"]);
    const primera = operacionesDeInstantanea(valores, marcas, { omitir: autorref });
    expect(primera.flatMap((o) => Object.keys(o.campos))).toEqual(["nombre"]);
    const segunda = operacionesDeInstantanea(valores, marcas, { solo: autorref });
    const estado = fusionarTodas(fusionarTodas(null, primera), segunda)!;
    expect(estado.valores).toEqual(valores);
    expect(estado.marcas).toEqual(marcas);
  });

  it("sin campos no hay operaciones", () => {
    expect(operacionesDeInstantanea({}, { base: t(1), campos: {} })).toEqual([]);
  });
});
