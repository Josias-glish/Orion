// Al abrir la base, el plugin SQL aplica las migraciones y rechaza la base si ya aplicó una que este programa no trae:
// los datos los guardó una versión más nueva (por ejemplo, la 0.1.0 abriendo datos de la 0.5.0). La interfaz explica qué hacer.
import { describe, expect, it } from "vitest";
import { causaDelErrorAlAbrir } from "./error-al-abrir";
import { textos } from "../textos/es";

describe("causa del error al abrir la base", () => {
  it("reconoce el texto exacto de sqlx cuando la base es de una versión más nueva", () => {
    // Es el texto de la captura del usuario: el programa 0.1.0 (migraciones 1 a 4) abriendo una base con la migración 5.
    expect(causaDelErrorAlAbrir("migration 5 was previously applied but is missing in the resolved migrations")).toBe("version_mas_nueva");
  });

  it("no importa el número de la migración ni lo que lo rodee", () => {
    expect(causaDelErrorAlAbrir("migration 8 was previously applied but is missing in the resolved migrations")).toBe("version_mas_nueva");
    expect(causaDelErrorAlAbrir("Error: migration 12 was previously applied but is missing in the resolved migrations\n")).toBe("version_mas_nueva");
  });

  it("cualquier otro error queda como desconocido y se sigue mostrando su detalle técnico", () => {
    expect(causaDelErrorAlAbrir("unable to open database file")).toBe("desconocida");
    expect(causaDelErrorAlAbrir("migration 3 was previously applied but has been modified")).toBe("desconocida");
    expect(causaDelErrorAlAbrir("")).toBe("desconocida");
  });

  it("el texto de ayuda dice qué pasó, que no se perdió nada y qué hacer, sin jerga", () => {
    const { explicacion, queHacer } = textos.errores.baseDeVersionMasNueva;
    expect(explicacion).toMatch(/versión más nueva/);
    expect(explicacion).toMatch(/no se perdió nada/i);
    expect(queHacer).toMatch(/versión más reciente/);
    expect(queHacer).toMatch(/desinstale/i);
    expect(queHacer).toMatch(/Eliminar los datos de aplicación/);
    for (const texto of [explicacion, queHacer]) expect(texto).not.toMatch(/migraci[oó]n|sqlx|SQL\b|hash|null|undefined/i);
  });
});
