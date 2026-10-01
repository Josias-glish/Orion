import { describe, expect, it } from "vitest";
import { crearHashPin, derivarConJavaScript, derivarConWebCrypto, esPinValido, ITERACIONES_PIN, verificarPin } from "./pin";

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

describe("PBKDF2-SHA256: nativo y JavaScript dan lo mismo", () => {
  // Valores de referencia publicados para PBKDF2-HMAC-SHA256 («password», «salt», 32 bytes),
  // comprobados también con node:crypto (OpenSSL).
  const sal = new TextEncoder().encode("salt");
  const vectores = [
    { iteraciones: 1, hex: "120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b" },
    { iteraciones: 4096, hex: "c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a" },
  ];
  const aHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

  it.each(vectores)("$iteraciones iteraciones", async ({ iteraciones, hex }) => {
    expect(aHex(await derivarConWebCrypto("password", sal, iteraciones))).toBe(hex);
    expect(aHex(await derivarConJavaScript("password", sal, iteraciones))).toBe(hex);
  });
});
