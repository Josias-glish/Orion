// R31: certificado de registro propio (CA-19), libro genealógico en PDF y Excel (CA-20) y pedigrí imprimible.
// Se prueba la definición de cada documento (lo que pdfmake dibuja), los archivos .xlsx leídos celda por celda y,
// al final, que pdfmake de verdad produce un PDF.
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { filasDelLibro, type RegistroDeLibro } from "../dominio/libro-genealogico";
import { caminosDeGeneracion } from "../dominio/pedigri";
import { ESQUEMA_INSTANTANEA, type AncestroInstantanea, type InstantaneaRegistro } from "../dominio/registros";
import { generarXlsx } from "./excel";
import { definicionLibro, hojaLibro } from "./libro";
import type { DatosPedigri } from "../dominio/pedigri";
import { definicionPedigri, tablaPedigri } from "./pedigri";
import { generarPdfEnNode } from "./pdf-node";
import { AVISO_REGISTRO_PROPIO, definicionRegistroPropio } from "./registro-propio";

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

/** Estrella con cuatro generaciones; el padre es de otra finca y la abuela paterna no se conoce. */
function instantanea(extra: Partial<InstantaneaRegistro> = {}): InstantaneaRegistro {
  const pedigri = [1, 2, 3, 4]
    .flatMap((g) => caminosDeGeneracion(g))
    .filter((c) => !c.startsWith("PM"))
    .map((c) => ancestro(c));
  pedigri[0] = ancestro("P", { nombre: "Titán", externo: true, registroAsociacion: "ASOC-777", propietario: "Ramiro Ejemplo · Hato El Roble" });
  return {
    esquema: ESQUEMA_INSTANTANEA,
    numero: "PPE-0003",
    version: 1,
    fechaRegistro: "2026-10-02",
    fechaEmision: "2026-10-02",
    responsable: "Ana Pérez",
    emitidoPor: "Luis Gómez",
    finca: { nombre: "Aprisco El Paraíso", criadero: "El Paraíso", municipio: "Rionegro" },
    criador: "Ana Pérez",
    propietario: "Familia Pérez",
    observaciones: "Cría de monta dirigida",
    animal: {
      id: "11111111-1111-4111-8111-111111111111",
      nombre: "Estrella",
      sexo: "hembra",
      fechaNacimiento: "2021-02-22",
      colorSenas: "Blanca con estrella en la frente",
      libro: "Pureza por pedigrí",
      formaConcepcion: "monta_natural",
      origen: "nacido_aqui",
      identificadores: [
        { tipo: "arete", valor: "EJ-10", principal: true },
        { tipo: "registro_asociacion", valor: "EJEMPLO-0110", principal: false },
      ],
      composicion: [{ raza: "Saanen", fraccion: 0.75 }, { raza: "Alpina", fraccion: 0.25 }],
      consanguinidad: 0.25,
    },
    pedigri,
    ...extra,
  };
}

describe("CA-19 (R31): certificado de registro propio", () => {
  const def = definicionRegistroPropio(instantanea());
  const texto = textosDe(def.content);

  it("trae el rótulo obligatorio «Registro propio del criadero. No es el certificado oficial de ANCO»", () => {
    expect(AVISO_REGISTRO_PROPIO).toBe("Registro propio del criadero. No es el certificado oficial de ANCO.");
    expect(texto).toContain(AVISO_REGISTRO_PROPIO);
    const pie = (def.footer as (pagina: number, total: number) => unknown)(1, 2);
    expect(textosDe(pie)).toContain(AVISO_REGISTRO_PROPIO);
    expect(def.info?.subject).toBe(AVISO_REGISTRO_PROPIO);
  });

  it("no imita a ANCO: sin su nombre (salvo en el rótulo), sin CRG, sin imágenes, sin QR y sin sellos", () => {
    const todo = `${texto}\n${JSON.stringify(def.info)}\n${textosDe((def.footer as (a: number, b: number) => unknown)(1, 1))}`;
    expect(todo).not.toMatch(/CRG|Registro Gen[eé]al[oó]gico/i);
    // «ANCO» solo aparece dentro del rótulo (en el cuerpo, el pie y los metadatos).
    const sinRotulos = todo.split(AVISO_REGISTRO_PROPIO).join("");
    expect(sinRotulos).not.toMatch(/ANCO/);
    const claves: string[] = [];
    recorrer(def, (k) => k && claves.push(k));
    for (const prohibida of ["qr", "image", "svg", "background", "watermark"]) expect(claves, prohibida).not.toContain(prohibida);
  });

  it("lleva el número, la versión, la fecha de emisión y los datos del animal", () => {
    for (const dato of [
      "PPE-0003",
      "Versión 1",
      "02/10/2026",
      "Estrella",
      "Hembra",
      "22/02/2021",
      "Blanca con estrella en la frente",
      "Pureza por pedigrí",
      "Monta natural",
      "75 % Saanen, 25 % Alpina",
      "25 %",
      "Arete: EJ-10",
      "Registro de asociación: EJEMPLO-0110",
      "Cría de monta dirigida",
    ]) {
      expect(texto, dato).toContain(dato);
    }
  });

  it("lleva el criador, el propietario y el criadero", () => {
    for (const dato of ["Aprisco El Paraíso", "El Paraíso", "Rionegro", "Ana Pérez", "Familia Pérez"]) expect(texto, dato).toContain(dato);
  });

  it("tiene la línea de firma del responsable, con su nombre", () => {
    expect(texto).toContain("Firma del responsable");
    expect(texto).toContain("Ana Pérez");
    const sin = textosDe(definicionRegistroPropio(instantanea({ responsable: null })).content);
    expect(sin).toContain("Firma del responsable");
  });

  it("una versión nueva dice que reemplaza a la anterior", () => {
    expect(texto).not.toMatch(/Reemplaza/);
    expect(textosDe(definicionRegistroPropio(instantanea({ version: 3 })).content)).toMatch(/Versión 3.*Reemplaza a la versión 2/s);
  });

  it("muestra a los ancestros de otras fincas con su propietario y su número de asociación, y a los que faltan como «Desconocido»", () => {
    expect(texto).toContain("Titán");
    expect(texto).toContain("Registro de asociación: ASOC-777");
    expect(texto).toContain("Otra finca: Ramiro Ejemplo · Hato El Roble");
    expect(texto).toContain("Desconocido");
  });

  it("marca los ancestros «sin verificar»", () => {
    const i = instantanea();
    i.pedigri[1] = ancestro("M", { sinVerificar: true });
    expect(textosDe(definicionRegistroPropio(i).content)).toContain("Sin verificar");
  });

  it("no usa la composición ni los datos del animal actual: solo la instantánea (lo emitido no cambia)", () => {
    // La definición es una función de la instantánea: dos instantáneas iguales dan el mismo documento.
    expect(JSON.stringify(definicionRegistroPropio(instantanea()).content)).toBe(JSON.stringify(definicionRegistroPropio(instantanea()).content));
  });
});

describe("CA-19 (R31): pedigrí de tres generaciones (con opción de cuatro)", () => {
  const nombres = (celda: unknown) => textosDe(celda);
  const cuerpo = (generaciones: number) => (tablaPedigri("Estrella", instantanea().pedigri, generaciones) as { table: { body: unknown[][] } }).table.body;

  it("tres generaciones: una fila por bisabuelo (8) y una columna por generación más el animal", () => {
    const body = cuerpo(3);
    expect(body).toHaveLength(8);
    expect(body.every((fila) => fila.length === 4)).toBe(true);
  });

  it("cada ancestro está en su lugar: bisabuelos fila a fila, abuelos y padres con celdas combinadas", () => {
    const body = cuerpo(3);
    expect(nombres(body[0][0])).toContain("Estrella");
    expect((body[0][0] as { rowSpan: number }).rowSpan).toBe(8);
    // Padres
    expect(nombres(body[0][1])).toContain("Titán");
    expect((body[0][1] as { rowSpan: number }).rowSpan).toBe(4);
    expect(nombres(body[4][1])).toContain("Ancestro M");
    // Abuelos (la abuela paterna, PM, no se conoce)
    expect(nombres(body[0][2])).toContain("Ancestro PP");
    expect(nombres(body[2][2])).toContain("Desconocido");
    expect(nombres(body[4][2])).toContain("Ancestro MP");
    expect(nombres(body[6][2])).toContain("Ancestro MM");
    expect((body[2][2] as { rowSpan: number }).rowSpan).toBe(2);
    // Bisabuelos
    const esperados = ["PPP", "PPM", "PMP", "PMM", "MPP", "MPM", "MMP", "MMM"];
    esperados.forEach((camino, fila) => {
      const celda = nombres(body[fila][3]);
      if (camino.startsWith("PM")) expect(celda, camino).toContain("Desconocido");
      else expect(celda, camino).toContain(`Ancestro ${camino}`);
    });
  });

  it("la opción de cuatro generaciones agrega los 16 tatarabuelos", () => {
    const body = cuerpo(4);
    expect(body).toHaveLength(16);
    expect(body.every((fila) => fila.length === 5)).toBe(true);
    expect(nombres(body[0][4])).toContain("Ancestro PPPP");
    expect(nombres(body[15][4])).toContain("Ancestro MMMM");
    // El certificado la usa cuando se le pide.
    const texto4 = textosDe(definicionRegistroPropio(instantanea(), { generaciones: 4 }).content);
    expect(texto4).toContain("Ancestro PPPP");
    expect(textosDe(definicionRegistroPropio(instantanea()).content)).not.toContain("Ancestro PPPP");
  });

  it("con tres generaciones el certificado no muestra tatarabuelos aunque la instantánea los guarde", () => {
    expect(textosDe(definicionRegistroPropio(instantanea(), { generaciones: 3 }).content)).not.toContain("PPPP");
  });
});

describe("pedigrí imprimible de cualquier animal, tenga o no registro", () => {
  const datos = (extra: Partial<DatosPedigri> = {}): DatosPedigri => ({
    fecha: "2026-10-02",
    finca: { nombre: "Aprisco El Paraíso", criadero: "El Paraíso", municipio: "Rionegro" },
    animal: {
      nombre: "Roble",
      sexo: "macho",
      fechaNacimiento: "2024-09-28",
      libro: null,
      identificador: "EJ-17",
      registroAsociacion: null,
      composicion: [{ raza: "Alpina", fraccion: 0.5 }, { raza: "Anglonubiana", fraccion: 0.5 }],
      origen: "nacido_aqui",
      propietario: null,
      registro: null,
    },
    pedigri: instantanea().pedigri,
    ...extra,
  });

  it("muestra el animal sin registro con su pedigrí y dice que es un documento informativo, no un certificado oficial", () => {
    const texto = textosDe(definicionPedigri(datos()).content);
    for (const dato of ["Pedigrí", "Roble", "EJ-17", "Titán", "Registro de asociación: ASOC-777", "Otra finca: Ramiro Ejemplo · Hato El Roble"]) {
      expect(texto, dato).toContain(dato);
    }
    expect(texto).toContain("Documento informativo del criadero. No es el certificado oficial de ANCO.");
    expect(texto).toMatch(/Sin registro propio/);
  });

  it("si el animal tiene registro, anota su número y su estado", () => {
    const texto = textosDe(definicionPedigri(datos({ animal: { ...datos().animal, registro: { numero: "PPE-0003", estado: "emitido" } } })).content);
    expect(texto).toContain("PPE-0003");
    expect(texto).toMatch(/Emitido/);
  });

  it("sirve para un animal de otra finca y muestra a su propietario", () => {
    const texto = textosDe(definicionPedigri(datos({ animal: { ...datos().animal, nombre: "Titán", origen: "externo", propietario: "Ramiro Ejemplo · Hato El Roble" } })).content);
    expect(texto).toContain("Otra finca: Ramiro Ejemplo · Hato El Roble");
  });

  it("acepta tres o cuatro generaciones y un animal sin ancestros conocidos", () => {
    expect(textosDe(definicionPedigri(datos(), 4).content)).toContain("Ancestro PPPP");
    expect(textosDe(definicionPedigri(datos(), 3).content)).not.toContain("Ancestro PPPP");
    const solo = textosDe(definicionPedigri(datos({ pedigri: [] })).content);
    expect(solo).toContain("Desconocido");
  });
});

// ---------------------------------------------------------------- Libro genealógico

function registro(numero: string, libro: string, libroId: string, consecutivo: number, nombre: string, fecha: string, razas: [string, number][], estado: RegistroDeLibro["estado"] = "emitido"): RegistroDeLibro {
  const base = instantanea();
  const i: InstantaneaRegistro = {
    ...base,
    numero,
    fechaRegistro: fecha,
    animal: {
      ...base.animal,
      nombre,
      libro,
      identificadores: [{ tipo: "arete", valor: `A-${numero}`, principal: true }],
      composicion: razas.map(([raza, fraccion]) => ({ raza, fraccion })),
    },
  };
  return { id: `id-${numero}`, numero, consecutivo, libroId, libro, estado, version: 1, fechaRegistro: fecha, instantanea: i };
}

const REGISTROS: RegistroDeLibro[] = [
  registro("MES-0001", "Mestizo", "me", 1, "Cacique", "2026-01-15", [["Saanen", 0.5], ["Alpina", 0.5]]),
  registro("PPE-0001", "Pureza por pedigrí", "pp", 1, "Bruno", "2026-02-01", [["Saanen", 1]]),
  registro("PPE-0002", "Pureza por pedigrí", "pp", 2, "Bella", "2026-03-01", [["Saanen", 1]], "anulado"),
  registro("PPE-0003", "Pureza por pedigrí", "pp", 3, "Estrella", "2026-04-01", [["Saanen", 1]]),
];
const DESCRIPCION = {
  finca: { nombre: "Aprisco El Paraíso", criadero: "El Paraíso", municipio: "Rionegro" },
  fecha: "2026-10-02",
  filtros: { libro: null, raza: null, desde: null, hasta: null, incluirAnulados: false },
};

describe("CA-20 (R31): libro genealógico en PDF", () => {
  const filas = filasDelLibro(REGISTROS, {});
  const def = definicionLibro(filas, DESCRIPCION);
  const texto = textosDe(def.content);

  it("lista exactamente los registros emitidos, con número, nombre, identificador, nacimiento, padre y madre", () => {
    expect(filas.map((f) => f.numero)).toEqual(["MES-0001", "PPE-0001", "PPE-0003"]);
    for (const f of filas) {
      for (const dato of [f.numero, f.nombre, f.identificador, "22/02/2021", "Titán", "Ancestro M"]) expect(texto, `${f.numero}: ${dato}`).toContain(dato);
    }
    expect(texto).not.toContain("PPE-0002"); // el anulado no sale si no se pide
    expect(texto).not.toContain("Bella");
  });

  it("agrupa por libro, dice el total y describe los filtros", () => {
    expect(texto).toContain("Libro genealógico del criadero");
    expect(texto).toContain("Mestizo");
    expect(texto).toContain("Pureza por pedigrí");
    expect(texto).toMatch(/3 registros/);
    const filtrado = filasDelLibro(REGISTROS, { raza: "Alpina", desde: "2026-01-01", hasta: "2026-12-31" });
    const t = textosDe(definicionLibro(filtrado, { ...DESCRIPCION, filtros: { libro: null, raza: "Alpina", desde: "2026-01-01", hasta: "2026-12-31", incluirAnulados: false } }).content);
    expect(t).toContain("Raza: Alpina");
    expect(t).toContain("01/01/2026");
    expect(t).toMatch(/1 registro\b/);
  });

  it("con anulados incluidos, los marca como anulados", () => {
    const con = textosDe(definicionLibro(filasDelLibro(REGISTROS, { incluirAnulados: true }), { ...DESCRIPCION, filtros: { ...DESCRIPCION.filtros, incluirAnulados: true } }).content);
    expect(con).toContain("PPE-0002");
    expect(con).toMatch(/Anulado/);
  });

  it("lleva el rótulo de que no es un documento oficial de ANCO, en el cuerpo y en el pie", () => {
    expect(texto).toContain(AVISO_REGISTRO_PROPIO);
    expect(textosDe((def.footer as (a: number, b: number) => unknown)(1, 1))).toContain(AVISO_REGISTRO_PROPIO);
  });

  it("un libro sin registros lo dice", () => {
    expect(textosDe(definicionLibro([], DESCRIPCION).content)).toContain("No hay registros emitidos");
  });
});

/** Lee las celdas de la primera hoja de un .xlsx: textos (por la tabla de textos compartidos) y números. */
function leerHoja(bytes: Uint8Array, hoja = "sheet1"): (string | number | null)[][] {
  const zip = unzipSync(bytes);
  const compartidos = [...strFromU8(zip["xl/sharedStrings.xml"] ?? new Uint8Array()).matchAll(/<si>(.*?)<\/si>/gs)].map((m) =>
    [...m[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map((t) => t[1]).join("").replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">"),
  );
  const xml = strFromU8(zip[`xl/worksheets/${hoja}.xml`]);
  const columna = (ref: string) => [...ref.replace(/\d+/g, "")].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
  return [...xml.matchAll(/<row [^>]*>(.*?)<\/row>/gs)].map((fila) => {
    const celdas: (string | number | null)[] = [];
    for (const c of fila[1].matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)) {
      const valor = /<v>(.*?)<\/v>/s.exec(c[3] ?? "")?.[1];
      celdas[columna(c[1])] = valor === undefined ? null : /t="s"/.test(c[2]) ? compartidos[Number(valor)] : Number(valor);
    }
    return celdas;
  });
}
const serial = (aaaaMmDd: string) => Date.parse(`${aaaaMmDd}T00:00:00Z`) / 86400000 + 25569;

describe("CA-20 (R31): libro genealógico en Excel", () => {
  it("el archivo .xlsx tiene un encabezado y una fila por registro emitido, igual que el PDF", async () => {
    const filas = filasDelLibro(REGISTROS, {});
    const bytes = await generarXlsx([hojaLibro(filas)]);
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x50, 0x4b]); // un .xlsx es un .zip
    const hoja = leerHoja(bytes);
    expect(hoja[0]).toEqual(["Libro", "Número", "Nombre", "Identificador principal", "Nacimiento", "Raza", "Padre", "Madre", "Fecha de registro", "Versión", "Estado"]);
    expect(hoja).toHaveLength(1 + filas.length);
    filas.forEach((f, i) => {
      expect(hoja[i + 1]).toEqual([
        f.libro,
        f.numero,
        f.nombre,
        f.identificador,
        serial(f.nacimiento),
        f.razas.map((r) => `${r.fraccion * 100} % ${r.raza}`).join(", "),
        f.padre,
        f.madre,
        serial(f.fechaRegistro),
        f.version,
        "Emitido",
      ]);
    });
    expect(hoja.map((f) => f[1]).slice(1)).toEqual(["MES-0001", "PPE-0001", "PPE-0003"]);
  });

  it("las fechas son fechas de Excel (se pueden ordenar y filtrar) y las vacías quedan vacías", async () => {
    const f = filasDelLibro([registro("MES-0009", "Mestizo", "me", 9, "Sin fechas", "2026-01-15", [["Saanen", 1]])], {});
    f[0].nacimiento = "";
    const hoja = leerHoja(await generarXlsx([hojaLibro(f)]));
    expect(hoja[1][4] ?? null).toBeNull();
    expect(hoja[1][8]).toBe(serial("2026-01-15"));
  });

  it("escribe con tildes, eñes y símbolos sin dañar el archivo", async () => {
    const f = filasDelLibro([registro("MES-0010", "Mestizo", "me", 10, "Niña & «Ñandú» <1>", "2026-01-15", [["Saanen", 1]])], {});
    const hoja = leerHoja(await generarXlsx([hojaLibro(f)]));
    expect(hoja[1][2]).toBe("Niña & «Ñandú» <1>");
  });

  it("puede llevar varias hojas (se reutiliza en la hoja de venta de la Etapa 9)", async () => {
    const bytes = await generarXlsx([
      { nombre: "Primera", columnas: [{ titulo: "A", ancho: 10 }], filas: [["uno"]] },
      { nombre: "Segunda", columnas: [{ titulo: "B", ancho: 10 }], filas: [[2]] },
    ]);
    expect(leerHoja(bytes, "sheet1")).toEqual([["A"], ["uno"]]);
    expect(leerHoja(bytes, "sheet2")).toEqual([["B"], [2]]);
  });
});

describe("los PDF salen de verdad (pdfmake en Node, sin red)", () => {
  it("el certificado, el pedigrí y el libro se generan como PDF válidos", async () => {
    const documentos = [
      definicionRegistroPropio(instantanea(), { generaciones: 4 }),
      definicionPedigri({ fecha: "2026-10-02", finca: { nombre: "A", criadero: null, municipio: null }, animal: { nombre: "Roble", sexo: "macho", fechaNacimiento: null, libro: null, identificador: null, registroAsociacion: null, composicion: [], origen: "nacido_aqui", propietario: null, registro: null }, pedigri: [] }),
      definicionLibro(filasDelLibro(REGISTROS, {}), DESCRIPCION),
    ];
    for (const d of documentos) {
      const bytes = await generarPdfEnNode(d);
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
      expect(bytes.length).toBeGreaterThan(1500);
    }
  });
});
