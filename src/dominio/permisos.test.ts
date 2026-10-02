// R14: roles.
import { describe, expect, it } from "vitest";
import { puede, type Accion } from "./permisos";

const TODAS: Accion[] = [
  "ver_fichas",
  "crear_animal",
  "editar_animal",
  "editar_genealogia",
  "ver_ajustes",
  "exportar_respaldo",
  "registrar_leche",
  "registrar_parto",
  "registrar_peso",
  "registrar_tratamiento",
  "registrar_servicio",
  "editar_metas_peso",
];

describe("R14: permisos por rol", () => {
  it("el propietario puede todo", () => {
    for (const accion of TODAS) expect(puede("propietario", accion), accion).toBe(true);
  });

  it("el operario ve fichas y registra leche, partos, pesos y tratamientos", () => {
    for (const accion of ["ver_fichas", "registrar_leche", "registrar_parto", "registrar_peso", "registrar_tratamiento"] as const) {
      expect(puede("operario", accion), accion).toBe(true);
    }
  });

  it("el operario no edita la genealogía, no ve los ajustes ni exporta la copia completa", () => {
    for (const accion of ["editar_genealogia", "ver_ajustes", "exportar_respaldo"] as const) {
      expect(puede("operario", accion), accion).toBe(false);
    }
  });

  it("SUPOSICION: el operario tampoco crea ni edita fichas de animales", () => {
    expect(puede("operario", "crear_animal")).toBe(false);
    expect(puede("operario", "editar_animal")).toBe(false);
  });
});

describe("R14: reproducción, leche y pesos (Etapa 3)", () => {
  it("SUPOSICION: los servicios, diagnósticos y metas de peso los registra solo el propietario", () => {
    expect(puede("operario", "registrar_servicio")).toBe(false);
    expect(puede("operario", "editar_metas_peso")).toBe(false);
    expect(puede("propietario", "registrar_servicio")).toBe(true);
  });
});

describe("R23 (especificación 2): animales de otras fincas y contactos (Etapa 6)", () => {
  it("el operario ve las fichas de los externos, pero no crea ni edita externos ni contactos", () => {
    expect(puede("operario", "ver_fichas")).toBe(true);
    for (const accion of ["crear_animal", "editar_animal", "editar_contactos", "ver_contactos"] as const) {
      expect(puede("operario", accion), accion).toBe(false);
    }
  });

  it("SUPOSICION (R28, datos mínimos): solo el propietario ve la lista de contactos con teléfonos y correos", () => {
    expect(puede("propietario", "ver_contactos")).toBe(true);
    expect(puede("propietario", "editar_contactos")).toBe(true);
  });
});

describe("R23 y R31: registros genealógicos (Etapa 7)", () => {
  it("solo el propietario ve la pantalla Registros y crea, emite o anula registros", () => {
    for (const accion of ["ver_registros", "gestionar_registros"] as const) {
      expect(puede("propietario", accion), accion).toBe(true);
      expect(puede("operario", accion), accion).toBe(false);
    }
  });
});

describe("R23: finanzas (Etapa 8)", () => {
  it("solo el propietario ve Finanzas y registra, corrige o retira ingresos y gastos", () => {
    for (const accion of ["ver_finanzas", "gestionar_finanzas"] as const) {
      expect(puede("propietario", accion), accion).toBe(true);
      expect(puede("operario", accion), accion).toBe(false);
    }
  });

  it("el operario sí puede anotar la calidad de la leche junto al ordeño (es parte de registrar leche)", () => {
    expect(puede("operario", "registrar_leche")).toBe(true);
  });
});
