// R13 y CA-05: el expediente para ANCO trae todos los campos y la ascendencia hasta abuelos, y avisa qué falta.
import { describe, expect, it } from "vitest";
import { armarExpediente, CAMPOS_EXPEDIENTE, type EntradaExpediente } from "./expediente";

const ancestro = (nombre: string, crg: string | null = null) => ({ nombre, crg, sinVerificar: false });

const completa = (): EntradaExpediente => ({
  animal: {
    nombre: "Estrella",
    crg: "EJEMPLO-0110",
    sexo: "hembra",
    fechaNacimiento: "2021-02-22",
    colorSenas: "Blanca con estrella en la frente",
    libro: "Pureza por pedigrí",
    formaConcepcion: "monta_natural",
    marcas: [
      { tipo: "arete", valor: "EJ-10" },
      { tipo: "tatuaje", valor: "T-2102" },
    ],
    composicion: [{ raza: "Saanen", fraccion: 1 }],
  },
  criador: "Ana Pérez",
  propietario: "Ana Pérez",
  criadero: "Aprisco El Paraíso",
  ascendencia: {
    padre: ancestro("Bruno", "EJEMPLO-0106"),
    madre: ancestro("Bella", "EJEMPLO-0107"),
    abueloPaterno: ancestro("Zeus", "EJEMPLO-0001"),
    abuelaPaterna: ancestro("Abril", "EJEMPLO-0002"),
    abueloMaterno: ancestro("Zeus", "EJEMPLO-0001"),
    abuelaMaterna: ancestro("Abril", "EJEMPLO-0002"),
  },
});

describe("CA-05 (R13): el expediente trae todos los campos y la ascendencia hasta abuelos", () => {
  it("la lista de campos es la de R13, en ese orden", () => {
    expect(CAMPOS_EXPEDIENTE).toEqual([
      "nombre",
      "crg",
      "criador",
      "propietario",
      "criadero",
      "sexo",
      "composicion",
      "libro",
      "formaConcepcion",
      "marcas",
      "color",
      "nacimiento",
      "padre",
      "madre",
      "abueloPaterno",
      "abuelaPaterna",
      "abueloMaterno",
      "abuelaMaterna",
    ]);
  });

  it("con todos los datos, cada campo tiene su valor y no falta nada", () => {
    const e = armarExpediente(completa());
    expect(e.faltantes).toEqual([]);
    expect(e.avisos).toEqual([]);
    expect(e.datos).toMatchObject({
      nombre: "Estrella",
      crg: "EJEMPLO-0110",
      criador: "Ana Pérez",
      propietario: "Ana Pérez",
      criadero: "Aprisco El Paraíso",
      sexo: "hembra",
      composicion: [{ raza: "Saanen", fraccion: 1 }],
      libro: "Pureza por pedigrí",
      formaConcepcion: "monta_natural",
      color: "Blanca con estrella en la frente",
      nacimiento: "2021-02-22",
    });
    // Las marcas son los identificadores visibles; el CRG va en su propio campo.
    expect(e.datos.marcas).toEqual([
      { tipo: "arete", valor: "EJ-10" },
      { tipo: "tatuaje", valor: "T-2102" },
    ]);
    for (const campo of CAMPOS_EXPEDIENTE) expect(e.datos[campo], campo).not.toBeNull();
  });

  it("la ascendencia llega hasta los cuatro abuelos, cada uno con su CRG", () => {
    const { datos } = armarExpediente(completa());
    expect([datos.padre, datos.madre, datos.abueloPaterno, datos.abuelaPaterna, datos.abueloMaterno, datos.abuelaMaterna]).toEqual([
      ancestro("Bruno", "EJEMPLO-0106"),
      ancestro("Bella", "EJEMPLO-0107"),
      ancestro("Zeus", "EJEMPLO-0001"),
      ancestro("Abril", "EJEMPLO-0002"),
      ancestro("Zeus", "EJEMPLO-0001"),
      ancestro("Abril", "EJEMPLO-0002"),
    ]);
  });
});

describe("R13: avisa qué campos faltan", () => {
  it("lista los datos vacíos y los ancestros desconocidos", () => {
    const entrada = completa();
    entrada.animal.libro = null;
    entrada.animal.colorSenas = "  ";
    entrada.animal.marcas = [];
    entrada.animal.composicion = [];
    entrada.ascendencia.abueloMaterno = null;
    entrada.ascendencia.abuelaMaterna = null;
    expect(armarExpediente(entrada).faltantes).toEqual(["composicion", "libro", "marcas", "color", "abueloMaterno", "abuelaMaterna"]);
  });

  it("el CRG del animal y el de sus ancestros no son obligatorios («si existe»)", () => {
    const entrada = completa();
    entrada.animal.crg = null;
    entrada.ascendencia.padre = ancestro("Bruno");
    expect(armarExpediente(entrada).faltantes).toEqual([]);
  });

  it("un fundador sin padres conocidos tiene faltante toda la ascendencia", () => {
    const entrada = completa();
    entrada.ascendencia = { padre: null, madre: null, abueloPaterno: null, abuelaPaterna: null, abueloMaterno: null, abuelaMaterna: null };
    expect(armarExpediente(entrada).faltantes).toEqual(["padre", "madre", "abueloPaterno", "abuelaPaterna", "abueloMaterno", "abuelaMaterna"]);
  });

  it("avisa cuando un ancestro está marcado «sin verificar»", () => {
    const entrada = completa();
    entrada.ascendencia.padre = { ...ancestro("Bruno"), sinVerificar: true };
    expect(armarExpediente(entrada).avisos).toEqual([{ codigo: "ancestro_sin_verificar", campo: "padre" }]);
  });
});
