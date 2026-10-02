// R29 (especificación 2): animales de otras fincas. Pruebas escritas antes del código (Etapa 6).
import { describe, expect, it } from "vitest";
import { esDelHato, validarExterno, validarRetiroDeExterno } from "./externos";

describe("R29: animales de otras fincas", () => {
  it("un animal externo no es del hato; uno nacido aquí o comprado sí", () => {
    expect(esDelHato({ origen: "externo", enHato: false })).toBe(false);
    expect(esDelHato({ origen: "nacido_aqui", enHato: true })).toBe(true);
    expect(esDelHato({ origen: "comprado", enHato: true })).toBe(true);
    // Los registrados «solo para la genealogía» en la versión 0.1.0 tampoco son del hato.
    expect(esDelHato({ origen: "nacido_aqui", enHato: false })).toBe(false);
  });

  it("datos mínimos: nombre, sexo y propietario (el contacto)", () => {
    expect(validarExterno({ nombre: "Titán", contactoId: "c-1", loteId: null })).toEqual([]);
    expect(validarExterno({ nombre: "Titán", contactoId: null, loteId: null })).toEqual([{ codigo: "externo_sin_propietario" }]);
    expect(validarExterno({ nombre: "  ", contactoId: "c-1", loteId: null })).toEqual([{ codigo: "dato_obligatorio", campo: "nombre" }]);
  });

  it("no pertenece a ningún lote de la finca", () => {
    expect(validarExterno({ nombre: "Titán", contactoId: "c-1", loteId: "lote-ordeno" })).toEqual([{ codigo: "externo_en_lote" }]);
  });

  it("CA-13: no se puede retirar si es ancestro de un animal del hato", () => {
    const externo = { origen: "externo" as const, enHato: false };
    expect(validarRetiroDeExterno(externo, ["Bella", "Luna"])).toEqual([{ codigo: "externo_ancestro_de_propio", otro: "Bella" }]);
    expect(validarRetiroDeExterno(externo, [])).toEqual([]);
  });

  it("la regla de retiro solo aplica a los que no son del hato", () => {
    expect(validarRetiroDeExterno({ origen: "nacido_aqui", enHato: true }, ["Bella"])).toEqual([]);
    expect(validarRetiroDeExterno({ origen: "nacido_aqui", enHato: false }, ["Bella"])).toEqual([
      { codigo: "externo_ancestro_de_propio", otro: "Bella" },
    ]);
  });
});
