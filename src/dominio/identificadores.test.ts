// R2 y CA-06: identificadores.
import { describe, expect, it } from "vitest";
import { normalizarValor, validarIdentificadores, type IdentificadorEditable } from "./identificadores";

const arete = (valor: string, extra: Partial<IdentificadorEditable> = {}): IdentificadorEditable => ({
  tipo: "arete",
  valor,
  fecha: null,
  vigente: true,
  principal: false,
  ...extra,
});

describe("R2: un principal entre los vigentes", () => {
  it("acepta un animal sin identificadores (por ejemplo, una cría recién nacida)", () => {
    expect(validarIdentificadores([], [])).toEqual([]);
  });

  it("acepta varios identificadores con uno principal", () => {
    const lista = [arete("A-1", { principal: true }), { ...arete("T-9"), tipo: "tatuaje" as const }];
    expect(validarIdentificadores(lista, [])).toEqual([]);
  });

  it("exige un principal si hay identificadores vigentes", () => {
    expect(validarIdentificadores([arete("A-1")], [])).toEqual([{ codigo: "sin_principal" }]);
  });

  it("no admite dos principales", () => {
    const lista = [arete("A-1", { principal: true }), arete("A-2", { principal: true })];
    expect(validarIdentificadores(lista, [])).toEqual([{ codigo: "varios_principales" }]);
  });

  it("el principal debe estar vigente", () => {
    const lista = [arete("A-1", { principal: true, vigente: false }), arete("A-2")];
    expect(validarIdentificadores(lista, [])).toEqual([{ codigo: "principal_no_vigente" }]);
  });

  it("acepta identificadores antiguos no vigentes sin principal si no queda ninguno vigente", () => {
    expect(validarIdentificadores([arete("A-1", { vigente: false })], [])).toEqual([]);
  });

  it("no admite valores vacíos", () => {
    expect(validarIdentificadores([arete("   ", { principal: true })], [])).toEqual([{ codigo: "identificador_vacio" }]);
  });

  it("no admite el mismo identificador vigente dos veces en el mismo animal", () => {
    const lista = [arete("A-1", { principal: true }), arete(" a-1 ")];
    expect(validarIdentificadores(lista, [])).toEqual([
      { codigo: "identificador_repetido_en_animal", tipo: "arete", valor: "a-1" },
    ]);
  });

  it("quita los espacios del principio y del final", () => {
    expect(normalizarValor("  AR-7 ")).toBe("AR-7");
  });
});

describe("CA-06: identificador vigente repetido en la finca", () => {
  it("rechaza un arete vigente que ya usa otro animal, sin importar mayúsculas", () => {
    const enUso = [{ tipo: "arete" as const, valor: "AR-100", animal: "Luna" }];
    expect(validarIdentificadores([arete("ar-100", { principal: true })], enUso)).toEqual([
      { codigo: "identificador_duplicado", tipo: "arete", valor: "ar-100", otro: "Luna" },
    ]);
  });

  it("acepta el mismo valor con otro tipo", () => {
    const enUso = [{ tipo: "tatuaje" as const, valor: "AR-100", animal: "Luna" }];
    expect(validarIdentificadores([arete("AR-100", { principal: true })], enUso)).toEqual([]);
  });

  it("acepta repetir un valor que el otro animal ya no tiene vigente", () => {
    // Quien llama solo pasa los identificadores vigentes de otros animales.
    expect(validarIdentificadores([arete("AR-100", { principal: true })], [])).toEqual([]);
  });

  it("no compara contra otros animales los identificadores que no están vigentes", () => {
    const enUso = [{ tipo: "arete" as const, valor: "AR-100", animal: "Luna" }];
    const lista = [arete("AR-100", { vigente: false }), arete("AR-5", { principal: true })];
    expect(validarIdentificadores(lista, enUso)).toEqual([]);
  });
});
