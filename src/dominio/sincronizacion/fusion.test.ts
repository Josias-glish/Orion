import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonizarMarcas, estaEliminado, eliminadoEfectivo, fusionar, fusionarTodas, marcaMaxima, type EstadoRegistro, type OperacionFusion } from "./fusion";

interface Vector {
  nombre: string;
  que: string;
  ordenFijo: boolean;
  operaciones: OperacionFusion[];
  esperado: { valores: Record<string, string | number | null>; marcas: { base: string; campos: Record<string, string> }; eliminado: boolean };
}
const vectores: { casos: Vector[] } = JSON.parse(readFileSync(new URL("../../../servidor/vectores-fusion.json", import.meta.url), "utf8"));

function permutaciones<T>(lista: readonly T[]): T[][] {
  if (lista.length <= 1) return [[...lista]];
  return lista.flatMap((elemento, i) => permutaciones([...lista.slice(0, i), ...lista.slice(i + 1)]).map((resto) => [elemento, ...resto]));
}

describe("mezcla por campo (R16): vectores compartidos con el servidor", () => {
  for (const caso of vectores.casos) {
    it(caso.nombre, () => {
      const estado = fusionarTodas(null, caso.operaciones)!;
      expect(estado.valores).toEqual(caso.esperado.valores);
      expect(estado.marcas).toEqual(caso.esperado.marcas);
      expect(estaEliminado(estado)).toBe(caso.esperado.eliminado);
    });

    if (!caso.ordenFijo) {
      it(`${caso.nombre}: el orden de llegada no cambia el resultado`, () => {
        for (const orden of permutaciones(caso.operaciones)) {
          const estado = fusionarTodas(null, orden)!;
          expect({ valores: estado.valores, marcas: estado.marcas, eliminado: estaEliminado(estado) }).toEqual(caso.esperado);
        }
      });
    }
  }

  it("hay vectores para cada situación que pide CA-27", () => {
    const nombres = vectores.casos.map((c) => c.nombre).join("\n");
    expect(nombres).toMatch(/campos distintos/);
    expect(nombres).toMatch(/mismo campo/);
    expect(nombres).toMatch(/restaura/);
    expect(nombres).toMatch(/editar y luego borrar/);
  });
});

describe("fusionar", () => {
  const t = (hora: string) => `2026-10-02T${hora}.000Z-0000-aaaaaaaa`;

  it("informa qué campos se aplicaron y cuáles perdieron el choque", () => {
    const inicial = fusionar(null, { campos: { nombre: "Luna", peso: 3 }, marca: t("10:00:00") }).estado!;
    const { campos } = fusionar(inicial, { campos: { nombre: "Vieja", color: "negra" }, marca: t("09:00:00") });
    expect(campos).toEqual([
      { campo: "nombre", anterior: "Luna", nuevo: "Vieja", aplicado: false },
      { campo: "color", anterior: undefined, nuevo: "negra", aplicado: true },
    ]);
  });

  it("no modifica el estado que recibe", () => {
    const inicial = fusionar(null, { campos: { nombre: "Luna" }, marca: t("10:00:00") }).estado!;
    const copia = structuredClone(inicial);
    fusionar(inicial, { campos: { nombre: "Otra" }, marca: t("11:00:00") });
    expect(inicial).toEqual(copia);
  });

  it("una operación sin campos no crea el registro", () => {
    expect(fusionar(null, { campos: {}, marca: t("10:00:00") })).toEqual({ estado: null, campos: [] });
  });

  it("el valor de eliminado_en que muestra la fila es vacío cuando el registro se restauró", () => {
    const estado = fusionarTodas(null, [
      { campos: { nombre: "Luna", eliminado_en: null }, marca: t("10:00:00") },
      { campos: { eliminado_en: "2026-10-02T10:05:00.000Z" }, marca: t("10:05:00") },
    ])!;
    expect(eliminadoEfectivo(estado)).toBe("2026-10-02T10:05:00.000Z");
    const restaurado = fusionar(estado, { campos: { nombre: "Luna II" }, marca: t("10:10:00") }).estado!;
    expect(eliminadoEfectivo(restaurado)).toBeNull();
    expect(restaurado.valores.eliminado_en).toBe("2026-10-02T10:05:00.000Z");
  });
});

describe("formas canónicas", () => {
  it("la base es la menor marca y no se repite en la lista de campos", () => {
    expect(canonizarMarcas({ a: "2", b: "1", c: "1" })).toEqual({ base: "1", campos: { a: "2" } });
  });
  it("marcaMaxima es la mayor marca de cualquier campo", () => {
    const estado: EstadoRegistro = { valores: { a: 1, b: 2 }, marcas: { base: "1", campos: { b: "3" } } };
    expect(marcaMaxima(estado)).toBe("3");
  });
});
