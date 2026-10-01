// R12 (certificado interno) y R13 (expediente para ANCO en PDF y CSV). Se prueba la definición del documento
// (lo que pdfmake dibuja) y, al final, que pdfmake de verdad produce un PDF con ella.
import { describe, expect, it } from "vitest";
import { armarExpediente, type EntradaExpediente } from "../dominio/expediente";
import { AVISO_CERTIFICADO, definicionCertificado, type DatosCertificado } from "./certificado";
import { definicionExpediente, expedienteCsv } from "./expediente";
import { generarPdfEnNode } from "./pdf-node";

const ancestro = (nombre: string, crg: string | null = null, sinVerificar = false) => ({ nombre, crg, sinVerificar });

const certificado = (): DatosCertificado => ({
  numero: "CI-2026-0001",
  fechaEmision: "2026-10-01",
  emitidoPor: "Ana Pérez",
  finca: { nombre: "Aprisco El Paraíso", criadero: "El Paraíso", municipio: "Rionegro" },
  animal: {
    nombre: "Estrella",
    sexo: "hembra",
    fechaNacimiento: "2021-02-22",
    colorSenas: "Blanca",
    libro: "Pureza por pedigrí",
    formaConcepcion: "monta_natural",
    identificadores: [
      { tipo: "arete", valor: "EJ-10" },
      { tipo: "registro_asociacion", valor: "EJEMPLO-0110" },
    ],
    composicion: [{ raza: "Saanen", fraccion: 1 }],
    consanguinidad: 0.25,
  },
  ascendencia: {
    padre: ancestro("Bruno", "EJEMPLO-0106"),
    madre: ancestro("Bella"),
    abueloPaterno: ancestro("Zeus"),
    abuelaPaterna: ancestro("Abril"),
    abueloMaterno: null,
    abuelaMaterna: ancestro("Abril", null, true),
  },
});

/** Todos los textos y claves de una definición de pdfmake, para buscar en ella. */
function recorrer(nodo: unknown, visitar: (clave: string | null, valor: unknown) => void, clave: string | null = null) {
  visitar(clave, nodo);
  if (Array.isArray(nodo)) nodo.forEach((n) => recorrer(n, visitar));
  else if (nodo && typeof nodo === "object") for (const [k, v] of Object.entries(nodo)) recorrer(v, visitar, k);
}
function textosDe(nodo: unknown): string {
  const partes: string[] = [];
  recorrer(nodo, (_, v) => typeof v === "string" && partes.push(v));
  return partes.join("\n");
}

describe("R12: certificado interno", () => {
  const def = definicionCertificado(certificado());

  it("dice «Registro interno del criadero. No es el certificado oficial de ANCO»", () => {
    expect(AVISO_CERTIFICADO).toBe("Registro interno del criadero. No es el certificado oficial de ANCO.");
    expect(textosDe(def.content)).toContain(AVISO_CERTIFICADO);
  });

  it("repite el aviso en el pie de cada página", () => {
    const pie = (def.footer as (pagina: number, total: number) => unknown)(2, 3);
    expect(textosDe(pie)).toContain(AVISO_CERTIFICADO);
  });

  it("no lleva código QR", () => {
    const claves: string[] = [];
    recorrer(def, (k) => k && claves.push(k));
    expect(claves).not.toContain("qr");
  });

  it("no usa el nombre del certificado de ANCO (CRG)", () => {
    const todo = `${textosDe(def)}\n${JSON.stringify(def.info)}`;
    expect(todo).not.toMatch(/CRG|certificado de registro/i);
  });

  it("trae los datos del animal, padres y abuelos, y marca los «sin verificar» y los desconocidos", () => {
    const texto = textosDe(def.content);
    for (const dato of ["CI-2026-0001", "Estrella", "EJ-10", "EJEMPLO-0110", "Bruno", "EJEMPLO-0106", "Bella", "Zeus", "Abril", "Aprisco El Paraíso", "25 %"]) {
      expect(texto, dato).toContain(dato);
    }
    expect(texto).toContain("Sin verificar");
    expect(texto).toContain("Desconocido");
  });
});

const expediente = (): EntradaExpediente => ({
  animal: {
    nombre: "Estrella",
    crg: null,
    sexo: "hembra",
    fechaNacimiento: "2021-02-22",
    colorSenas: 'Blanca; "estrella" en la frente',
    libro: "Pureza por pedigrí",
    formaConcepcion: "monta_natural",
    marcas: [{ tipo: "arete", valor: "EJ-10" }],
    composicion: [
      { raza: "Saanen", fraccion: 0.75 },
      { raza: "Alpina", fraccion: 0.25 },
    ],
  },
  criador: "Ana Pérez",
  propietario: "Ana Pérez",
  criadero: "El Paraíso",
  ascendencia: {
    padre: ancestro("Bruno", "EJEMPLO-0106"),
    madre: ancestro("Bella"),
    abueloPaterno: ancestro("Zeus"),
    abuelaPaterna: ancestro("Abril"),
    abueloMaterno: null,
    abuelaMaterna: null,
  },
});

describe("R13: expediente en CSV", () => {
  const csv = expedienteCsv(armarExpediente(expediente()));
  const [encabezado, fila, ...resto] = csv.replace(/^﻿/, "").split("\r\n");
  const columnas = encabezado.split(";");

  it("es UTF-8 con BOM, separado por punto y coma, con un encabezado y una fila (SUPOSICION)", () => {
    expect(csv.startsWith("﻿")).toBe(true);
    expect(resto).toEqual([""]);
    expect(fila).toBeDefined();
  });

  it("CA-05: tiene una columna por cada campo de R13 y por el CRG de cada ancestro hasta abuelos", () => {
    expect(columnas).toEqual([
      "Nombre",
      "Número de registro de asociación (CRG)",
      "Criador",
      "Propietario",
      "Criadero",
      "Sexo",
      "Composición racial",
      "Libro genealógico",
      "Forma de concepción",
      "Marcas",
      "Color y señas",
      "Fecha de nacimiento",
      "Padre",
      "Registro del padre",
      "Madre",
      "Registro de la madre",
      "Abuelo paterno",
      "Registro del abuelo paterno",
      "Abuela paterna",
      "Registro de la abuela paterna",
      "Abuelo materno",
      "Registro del abuelo materno",
      "Abuela materna",
      "Registro de la abuela materna",
      "Campos que faltan",
    ]);
  });

  it("escribe los valores en español y entre comillas cuando hace falta", () => {
    expect(fila).toBe(
      [
        "Estrella",
        "",
        "Ana Pérez",
        "Ana Pérez",
        "El Paraíso",
        "Hembra",
        "75 % Saanen, 25 % Alpina",
        "Pureza por pedigrí",
        "Monta natural",
        "Arete EJ-10",
        '"Blanca; ""estrella"" en la frente"',
        "22/02/2021",
        "Bruno",
        "EJEMPLO-0106",
        "Bella",
        "",
        "Zeus",
        "",
        "Abril",
        "",
        "",
        "",
        "",
        "",
        "Abuelo materno, Abuela materna",
      ].join(";"),
    );
  });
});

describe("R13: expediente en PDF", () => {
  const def = definicionExpediente(armarExpediente(expediente()), { numero: "EX-2026-0001", fechaEmision: "2026-10-01", finca: "Aprisco El Paraíso" });

  it("lista los campos que faltan, con su nombre", () => {
    const texto = textosDe(def.content);
    expect(texto).toContain("Campos que faltan");
    expect(texto).toContain("Abuelo materno");
    expect(texto).toContain("Abuela materna");
  });

  it("aclara que el formato es provisional y no es un formato oficial de ANCO (SUPOSICION)", () => {
    expect(textosDe(def.content)).toMatch(/no es un formato oficial de ANCO/);
  });

  it("no lleva código QR", () => {
    const claves: string[] = [];
    recorrer(def, (k) => k && claves.push(k));
    expect(claves).not.toContain("qr");
  });
});

describe("pdfmake produce los PDF sin red", () => {
  it("genera el certificado y el expediente como archivos PDF", async () => {
    for (const def of [
      definicionCertificado(certificado()),
      definicionExpediente(armarExpediente(expediente()), { numero: "EX-2026-0001", fechaEmision: "2026-10-01", finca: "Aprisco" }),
    ]) {
      const bytes = await generarPdfEnNode(def);
      expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
      expect(bytes.length).toBeGreaterThan(5000);
    }
  });
});
