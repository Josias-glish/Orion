import { describe, expect, it } from "vitest";
import { crearHashPin, esPinValido, ITERACIONES_PIN, verificarPin } from "./pin";

describe("PIN", () => {
  it("acepta de 4 a 6 dígitos", () => {
    expect(esPinValido("1234")).toBe(true);
    expect(esPinValido("123456")).toBe(true);
    expect(esPinValido("123")).toBe(false);
    expect(esPinValido("1234567")).toBe(false);
    expect(esPinValido("12a4")).toBe(false);
    expect(esPinValido(" 1234")).toBe(false);
  });

  it("no guarda el PIN en el texto del hash", async () => {
    const hash = await crearHashPin("482915", 1000);
    expect(hash).not.toContain("482915");
    expect(hash.startsWith("pbkdf2-sha256$1000$")).toBe(true);
  });

  it("verifica el PIN correcto y rechaza uno incorrecto", async () => {
    const hash = await crearHashPin("2468", 1000);
    expect(await verificarPin("2468", hash)).toBe(true);
    expect(await verificarPin("2469", hash)).toBe(false);
  });

  it("usa una sal distinta cada vez", async () => {
    expect(await crearHashPin("2468", 1000)).not.toBe(await crearHashPin("2468", 1000));
  });

  it("rechaza un hash con formato desconocido", async () => {
    expect(await verificarPin("2468", "texto-raro")).toBe(false);
  });

  it("por defecto usa las iteraciones recomendadas", async () => {
    const hash = await crearHashPin("1357");
    expect(hash.startsWith(`pbkdf2-sha256$${ITERACIONES_PIN}$`)).toBe(true);
    expect(await verificarPin("1357", hash)).toBe(true);
  });
});
