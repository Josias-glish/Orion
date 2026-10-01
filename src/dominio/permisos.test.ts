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
