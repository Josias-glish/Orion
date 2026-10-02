// R21 (CA-25): la hoja de venta en PDF y en Excel trae los identificadores, la composición racial, el libro y el árbol
// correctos, y los mismos datos en los dos formatos. También el inventario del hato en PDF y Excel (RF-36).
// Se prueba la definición del documento (lo que pdfmake dibuja), el .xlsx leído celda por celda y, al final, que
// pdfmake de verdad produce un PDF.
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { armarHojaVenta, type EntradaHojaVenta } from "../dominio/hoja-venta";
import { armarInventario, type AnimalDeInventario } from "../dominio/inventario";
import { caminosDeGeneracion } from "../dominio/pedigri";
import type { AncestroInstantanea } from "../dominio/registros";
import { generarXlsx } from "./excel";
import { AVISO_HOJA_VENTA, definicionHojaVenta, hojasExcelHojaVenta } from "./hoja-venta";
import { AVISO_INVENTARIO, definicionInventario, hojasExcelInventario } from "./inventario";
import { generarPdfEnNode } from "./pdf-node";

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

/** Lee las celdas de una hoja de un .xlsx: textos (por la tabla de textos compartidos) y números. */
function leerHoja(bytes: Uint8Array, hoja = 1): (string | number | null)[][] {
  const zip = unzipSync(bytes);
  const compartidos = [...strFromU8(zip["xl/sharedStrings.xml"] ?? new Uint8Array()).matchAll(/<si>(.*?)<\/si>/gs)].map((m) =>
    [...m[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map((t) => t[1]).join("").replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">"),
  );
  const xml = strFromU8(zip[`xl/worksheets/sheet${hoja}.xml`]);
  const columna = (ref: string) => [...ref.replace(/\d+/g, "")].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
  const filas = [...xml.matchAll(/<row [^>]*>(.*?)<\/row>/gs)].map((fila) => {
    const celdas: (string | number | null)[] = [];
    for (const c of fila[1].matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)) {
      const valor = /<v>(.*?)<\/v>/s.exec(c[3] ?? "")?.[1];
      celdas[columna(c[1])] = valor === undefined ? null : /t="s"/.test(c[2]) ? compartidos[Number(valor)] : Number(valor);
    }
    return celdas;
  });
  // Una celda vacía no existe en el XML: se lee como null, igual que una celda sin valor, y las filas se igualan en ancho.
  const ancho = Math.max(0, ...filas.map((f) => f.length));
  return filas.map((f) => Array.from({ length: ancho }, (_, i) => f[i] ?? null));
}
const serial = (aaaaMmDd: string) => Date.parse(`${aaaaMmDd}T00:00:00Z`) / 86400000 + 25569;
const nombresDeHojas = (bytes: Uint8Array) => [...strFromU8(unzipSync(bytes)["xl/workbook.xml"]).matchAll(/<sheet [^>]*name="([^"]+)"/g)].map((m) => m[1]);

const ancestro = (camino: string, extra: Partial<AncestroInstantanea> = {}): AncestroInstantanea => ({
  camino,
  nombre: `Ancestro ${camino}`,
  sexo: camino.endsWith("P") ? "macho" : "hembra",
  identificador: `ID-${camino}`,
  registroAsociacion: null,
  externo: false,
  propietario: null,
  sinVerificar: false,
  fechaNacimiento: null,
  ...extra,
});

/** Estrella: el padre es de otra finca (con su registro), la abuela paterna no se conoce y un bisabuelo está sin verificar. */
function entrada(extra: Partial<EntradaHojaVenta> = {}): EntradaHojaVenta {
  const pedigri = [1, 2, 3]
    .flatMap((g) => caminosDeGeneracion(g))
    .filter((c) => !c.startsWith("PM"))
    .map((c) => ancestro(c));
  pedigri[0] = ancestro("P", { nombre: "Titán", externo: true, registroAsociacion: "ASOC-777", propietario: "Ramiro Ejemplo · Hato El Roble" });
  pedigri.find((a) => a.camino === "MMP")!.sinVerificar = true;
  return {
    fecha: "2026-10-02",
    finca: { nombre: "Aprisco El Paraíso", criadero: "El Paraíso", municipio: "Rionegro" },
    animal: {
      nombre: "Estrella",
      sexo: "hembra",
      fechaNacimiento: "2021-02-22",
      colorSenas: "Blanca con estrella en la frente",
      libro: "Pureza por pedigrí",
      estado: "activo",
      identificadores: [
        { tipo: "arete", valor: "EJ-10", principal: true, vigente: true },
        { tipo: "registro_asociacion", valor: "EJEMPLO-0110", principal: false, vigente: true },
      ],
      composicion: [
        { raza: "Saanen", fraccion: 0.75 },
        { raza: "Alpina", fraccion: 0.25 },
      ],
      registroPropio: "PPE-0003",
    },
    pedigri,
    lactancias: [
      { fechaInicio: "2025-03-01", fechaSecado: "2026-01-10", acumuladoKg: 812.5, promedioDiarioKg: 2.7 },
      { fechaInicio: "2026-08-01", fechaSecado: null, acumuladoKg: 120, promedioDiarioKg: 3.1 },
    ],
    ...extra,
  };
}

describe("CA-25 (R21): hoja de venta en PDF", () => {
  const hoja = armarHojaVenta(entrada(), { incluirProduccion: false });
  const def = definicionHojaVenta(hoja);
  const texto = textosDe(def.content);

  it("dice que es un documento informativo del criadero y no un certificado oficial, arriba y en el pie", () => {
    expect(AVISO_HOJA_VENTA).toBe("Documento informativo del criadero. No es un certificado oficial.");
    expect(texto).toContain(AVISO_HOJA_VENTA);
    const pie = (def.footer as (a: number, b: number) => unknown)(1, 1);
    expect(textosDe(pie)).toContain(AVISO_HOJA_VENTA);
  });

  it("trae la finca, el nombre, el sexo, el nacimiento y los identificadores", () => {
    expect(texto).toContain("Aprisco El Paraíso");
    expect(texto).toContain("Estrella");
    expect(texto).toContain("Hembra");
    expect(texto).toContain("22/02/2021");
    expect(texto).toContain("Arete EJ-10");
    expect(texto).toContain("EJEMPLO-0110");
    expect(texto).toContain("Blanca con estrella en la frente");
  });

  it("trae la raza, la composición racial y el libro", () => {
    expect(texto).toContain("75 % Saanen, 25 % Alpina");
    expect(texto).toContain("Pureza por pedigrí");
  });

  it("trae el árbol de tres generaciones: ancestros conocidos, desconocidos, de otra finca y sin verificar", () => {
    expect(texto).toContain("Pedigrí de tres generaciones");
    for (const camino of ["M", "PP", "MP", "MM", "PPP", "MMP"]) expect(texto, camino).toContain(`Ancestro ${camino}`);
    expect(texto).toContain("Titán");
    expect(texto).toContain("Registro de asociación: ASOC-777");
    expect(texto).toContain("Otra finca: Ramiro Ejemplo · Hato El Roble");
    expect(texto).toContain("Sin verificar");
    expect(texto).toContain("Desconocido"); // la abuela paterna y sus padres
    expect(texto).not.toContain("Ancestro PM");
    // La cuarta generación no entra.
    expect(texto).not.toMatch(/Ancestro [PM]{4}/);
  });

  it("lleva el número del registro propio si el animal lo tiene", () => {
    expect(texto).toContain("PPE-0003");
    const sin = armarHojaVenta(entrada({ animal: { ...entrada().animal, registroPropio: null } }), { incluirProduccion: false });
    expect(textosDe(definicionHojaVenta(sin).content)).not.toContain("PPE-0003");
  });

  it("la producción de leche solo aparece si el vendedor la elige", () => {
    expect(texto).not.toContain("Producción de leche");
    const con = textosDe(definicionHojaVenta(armarHojaVenta(entrada(), { incluirProduccion: true })).content);
    expect(con).toContain("Producción de leche");
    expect(con).toContain("01/03/2025");
    expect(con).toContain("812,5");
    expect(con).toContain("En curso");
  });

  it("no lleva precios ni datos de contactos (datos mínimos)", () => {
    expect(texto).not.toMatch(/\$|precio|comprador|vendedor|teléfono|correo/i);
  });

  it("avisa si la composición racial no suma 100 %", () => {
    const incompleta = armarHojaVenta(entrada({ animal: { ...entrada().animal, composicion: [{ raza: "Saanen", fraccion: 0.5 }] } }), { incluirProduccion: false });
    expect(textosDe(definicionHojaVenta(incompleta).content)).toContain("no suma 100 %");
  });

  it("pdfmake de verdad produce un PDF", async () => {
    const bytes = await generarPdfEnNode(definicionHojaVenta(armarHojaVenta(entrada(), { incluirProduccion: true })));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});

describe("CA-25 (R21): hoja de venta en Excel, con los mismos datos que el PDF", () => {
  const hoja = armarHojaVenta(entrada(), { incluirProduccion: true });

  it("tiene la hoja del animal con los datos, los identificadores, la composición y el libro", async () => {
    const bytes = await generarXlsx(hojasExcelHojaVenta(hoja));
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x50, 0x4b]); // un .xlsx es un .zip
    expect(nombresDeHojas(bytes)).toEqual(["Hoja de venta", "Pedigrí", "Producción"]);
    const filas = leerHoja(bytes, 1);
    expect(filas[0]).toEqual(["Dato", "Valor"]);
    const dato = (nombre: string) => filas.find((f) => f[0] === nombre)?.[1];
    expect(filas.some((f) => f[1] === AVISO_HOJA_VENTA || f[0] === AVISO_HOJA_VENTA)).toBe(true);
    expect(dato("Nombre")).toBe("Estrella");
    expect(dato("Sexo")).toBe("Hembra");
    expect(dato("Nacimiento")).toBe(serial("2021-02-22"));
    expect(dato("Identificadores")).toBe("Arete EJ-10, Registro de asociación (CRG) EJEMPLO-0110");
    expect(dato("Libro")).toBe("Pureza por pedigrí");
    expect(dato("Raza y composición")).toBe("75 % Saanen, 25 % Alpina");
    expect(dato("Registro propio")).toBe("PPE-0003");
    expect(dato("Color y señas")).toBe("Blanca con estrella en la frente");
  });

  it("el pedigrí tiene una fila por lugar del árbol de tres generaciones (14), igual que el PDF", async () => {
    const filas = leerHoja(await generarXlsx(hojasExcelHojaVenta(hoja)), 2);
    expect(filas[0]).toEqual(["Generación", "Parentesco", "Nombre", "Identificador", "Registro de asociación", "Propietario (otra finca)", "Sin verificar"]);
    expect(filas).toHaveLength(1 + 2 + 4 + 8);
    const por = (parentesco: string) => filas.find((f) => f[1] === parentesco)!;
    expect(por("Padre").slice(0, 6)).toEqual([1, "Padre", "Titán", "ID-P", "ASOC-777", "Ramiro Ejemplo · Hato El Roble"]);
    expect(por("Madre").slice(2, 4)).toEqual(["Ancestro M", "ID-M"]);
    expect(por("Abuela paterna")[2]).toBeNull(); // no se conoce
    expect(por("Abuelo materno")[2]).toBe("Ancestro MP");
    expect(filas.filter((f) => f[0] === 3)).toHaveLength(8);
    // El bisabuelo sin verificar lo dice.
    expect(filas.filter((f) => f[6] === "Sí")).toHaveLength(1);
  });

  it("la producción de leche solo es una hoja si se eligió", async () => {
    const bytes = await generarXlsx(hojasExcelHojaVenta(hoja));
    const produccion = leerHoja(bytes, 3);
    expect(produccion[0]).toEqual(["Inicio", "Secado", "Estado", "Leche acumulada (kg)", "Promedio diario (kg)"]);
    expect(produccion[1]).toEqual([serial("2025-03-01"), serial("2026-01-10"), "Secada", 812.5, 2.7]);
    expect(produccion[2]).toEqual([serial("2026-08-01"), null, "En curso", 120, 3.1]);
    const sin = await generarXlsx(hojasExcelHojaVenta(armarHojaVenta(entrada(), { incluirProduccion: false })));
    expect(nombresDeHojas(sin)).toEqual(["Hoja de venta", "Pedigrí"]);
  });
});

const animal = (id: string, extra: Partial<AnimalDeInventario> = {}): AnimalDeInventario => ({
  id,
  nombre: id,
  identificador: `ID-${id}`,
  registroAsociacion: null,
  sexo: "hembra",
  fechaNacimiento: "2024-01-15",
  estado: "activo",
  origen: "nacido_aqui",
  enHato: true,
  fechaIngreso: null,
  lote: "Ordeño",
  libro: "Mestizo",
  razas: [{ raza: "Saanen", fraccion: 0.5 }, { raza: "Alpina", fraccion: 0.5 }],
  ...extra,
});

describe("RF-36: inventario del hato en PDF y Excel", () => {
  const inventario = armarInventario(
    [animal("Ana", { registroAsociacion: "ASOC-1" }), animal("Beto", { sexo: "macho", lote: "Machos" }), animal("Luna", { origen: "comprado", fechaIngreso: "2026-06-01", lote: null }), animal("Vendida", { estado: "vendido" })],
    "2026-10-02",
  );
  const finca = { nombre: "Aprisco El Paraíso", criadero: "El Paraíso", municipio: "Rionegro" };

  it("el PDF trae los totales y una fila por animal activo, con el aviso de documento informativo", () => {
    const def = definicionInventario(inventario, { finca, generado: "2026-10-02" });
    const texto = textosDe(def.content);
    expect(AVISO_INVENTARIO).toBe("Documento informativo del criadero. No es un certificado oficial.");
    expect(texto).toContain("Inventario del hato");
    expect(texto).toContain("Al 02/10/2026");
    expect(texto).toContain("3 animales");
    expect(texto).toContain("2 hembras");
    expect(texto).toContain("1 macho");
    expect(texto).toContain("1 comprado");
    for (const nombre of ["Ana", "Beto", "Luna"]) expect(texto).toContain(nombre);
    expect(texto).not.toContain("Vendida");
    expect(texto).toContain("ASOC-1");
    expect(texto).toContain("50 % Saanen, 50 % Alpina");
    expect(textosDe((def.footer as (a: number, b: number) => unknown)(1, 1))).toContain(AVISO_INVENTARIO);
  });

  it("el Excel tiene una fila por animal y una hoja de resumen con los mismos totales", async () => {
    const bytes = await generarXlsx(hojasExcelInventario(inventario));
    expect(nombresDeHojas(bytes)).toEqual(["Inventario", "Resumen"]);
    const filas = leerHoja(bytes, 1);
    expect(filas[0]).toEqual(["Nombre", "Identificador", "Registro de asociación", "Sexo", "Nacimiento", "Edad (meses)", "Raza", "Libro", "Lote", "Origen"]);
    expect(filas).toHaveLength(1 + 3);
    expect(filas[1]).toEqual(["Ana", "ID-Ana", "ASOC-1", "Hembra", serial("2024-01-15"), 32, "50 % Saanen, 50 % Alpina", "Mestizo", "Ordeño", "Nacido en la finca"]);
    expect(filas[3]).toEqual(["Luna", "ID-Luna", null, "Hembra", serial("2024-01-15"), 32, "50 % Saanen, 50 % Alpina", "Mestizo", null, "Comprado"]);
    const resumen = leerHoja(bytes, 2);
    expect(resumen[0]).toEqual(["Concepto", "Cantidad"]);
    expect(resumen.find((f) => f[0] === "Total de animales")?.[1]).toBe(3);
    expect(resumen.find((f) => f[0] === "Hembras")?.[1]).toBe(2);
    expect(resumen.find((f) => f[0] === "Machos")?.[1]).toBe(1);
    expect(resumen.find((f) => f[0] === "Comprados")?.[1]).toBe(1);
    expect(resumen.find((f) => f[0] === "Lote: Ordeño")?.[1]).toBe(1);
    expect(resumen.find((f) => f[0] === "Sin lote")?.[1]).toBe(1);
  });

  it("un inventario vacío lo dice y pdfmake de verdad produce un PDF", async () => {
    const vacio = armarInventario([], "2026-10-02");
    expect(textosDe(definicionInventario(vacio, { finca, generado: "2026-10-02" }).content)).toContain("No hay animales activos en el hato");
    const bytes = await generarPdfEnNode(definicionInventario(inventario, { finca, generado: "2026-10-02" }));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});
