// Las migraciones del servidor no cambian una vez publicadas: cada una tiene su huella SHA-256 en servidor/migraciones/huellas.json
// (igual que las del programa en src/datos/migraciones/). Si una cambia sin actualizar su huella, esta prueba falla.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { huellaDe, leerMigraciones } from "./ayudas";

const registradas = JSON.parse(readFileSync(new URL("../migraciones/huellas.json", import.meta.url), "utf8")) as Record<string, string>;

const COMO_REGENERAR = `Para actualizar las huellas corre, desde la raíz del repositorio:\n    node servidor/regenerar-huellas.mjs\ny sube el cambio de servidor/migraciones/huellas.json junto con la migración.`;

describe("huellas de las migraciones del servidor", () => {
  it("hay una migración por huella y una huella por migración", () => {
    expect(Object.keys(registradas).sort(), COMO_REGENERAR).toEqual(leerMigraciones().map((m) => m.archivo));
  });

  for (const migracion of leerMigraciones()) {
    it(`${migracion.archivo} no cambió desde que se registró su huella`, () => {
      expect(
        registradas[migracion.archivo],
        `Falta la huella de ${migracion.archivo}. Es una migración nueva. ${COMO_REGENERAR}`,
      ).toBeDefined();
      expect(
        huellaDe(migracion.sql),
        `${migracion.archivo} cambió después de registrar su huella. Si esa migración YA se aplicó en un servidor (el de pruebas o el real), NO la edites: crea una migración nueva con el número siguiente y revierte este cambio. Si todavía no se aplicó en ningún servidor, ${COMO_REGENERAR}`,
      ).toBe(registradas[migracion.archivo]);
    });
  }

  it("las migraciones usan saltos de línea LF (si no, la huella cambiaría de un sistema a otro)", () => {
    for (const migracion of leerMigraciones()) {
      expect(migracion.sql.includes("\r"), `${migracion.archivo} tiene retornos de carro (CRLF); .gitattributes exige LF`).toBe(false);
    }
  });

  it("los números van seguidos desde 0001 sin saltos ni repetidos", () => {
    const numeros = leerMigraciones().map((m) => Number(m.archivo.slice(0, 4)));
    expect(numeros).toEqual(numeros.map((_, i) => i + 1));
  });
});
