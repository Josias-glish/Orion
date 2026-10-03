import { describe, expect, it } from "vitest";
// @ts-expect-error módulo .mjs sin tipos
import { prepararConfiguracion } from "./configurar-servidor.mjs";

const CLAVE = "sb_publishable_ejemplo_de_clave_publica_1234567890";
const jwt = (rol: string) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: rol })).toString("base64url")}.firma`;

describe("scripts/configurar-servidor.mjs", () => {
  it("acepta una dirección https y deja un permiso con solo ese servidor", () => {
    const r = prepararConfiguracion({ url: "https://abcdef.supabase.co/rest/v1/", clave: CLAVE });
    expect(r.servidor).toEqual({ url: "https://abcdef.supabase.co", claveAnonima: CLAVE });
    expect(r.permiso).toBe("https://abcdef.supabase.co/*");
  });

  it("rechaza http, direcciones de ejemplo, puertos y credenciales en la dirección", () => {
    for (const url of ["http://abcdef.supabase.co", "https://servidor-no-configurado.invalid", "https://localhost", "https://abcdef.supabase.co:8443", "https://u:p@abcdef.supabase.co", "no-es-url"]) {
      expect(() => prepararConfiguracion({ url, clave: CLAVE }), url).toThrow();
    }
  });

  it("rechaza una clave vacía o secreta (sb_secret_ o JWT con rol service_role) sin repetirla en el mensaje", () => {
    expect(() => prepararConfiguracion({ url: "https://abcdef.supabase.co", clave: "" })).toThrow(/clave pública/);
    for (const secreta of ["sb_secret_abcdefghijklmnopqrstuvwxyz", jwt("service_role")]) {
      try {
        prepararConfiguracion({ url: "https://abcdef.supabase.co", clave: secreta });
        throw new Error("debía fallar");
      } catch (e) {
        expect((e as Error).message).toMatch(/SECRETA/);
        expect((e as Error).message).not.toContain(secreta);
      }
    }
    expect(() => prepararConfiguracion({ url: "https://abcdef.supabase.co", clave: jwt("anon") })).not.toThrow();
  });
});
