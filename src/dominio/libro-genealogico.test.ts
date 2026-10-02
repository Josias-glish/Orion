// R31: libro genealógico del criadero. Lo exportado sale de las instantáneas de los registros emitidos (CA-20).
import { describe, expect, it } from "vitest";
import { filasDelLibro, type RegistroDeLibro } from "./libro-genealogico";
import { ESQUEMA_INSTANTANEA, type AncestroInstantanea, type InstantaneaRegistro } from "./registros";

const padre = (nombre: string | null, identificador: string | null = null): AncestroInstantanea => ({
  camino: "P",
  nombre,
  sexo: "macho",
  identificador,
  registroAsociacion: null,
  externo: false,
  propietario: null,
  sinVerificar: false,
  fechaNacimiento: null,
});

function registro(
  numero: string,
  libro: string,
  libroId: string,
  consecutivo: number,
  extra: { nombre?: string; razas?: [string, number][]; fecha?: string; estado?: RegistroDeLibro["estado"]; pedigri?: AncestroInstantanea[]; version?: number } = {},
): RegistroDeLibro {
  const instantanea: InstantaneaRegistro = {
    esquema: ESQUEMA_INSTANTANEA,
    numero,
    version: extra.version ?? 1,
    fechaRegistro: extra.fecha ?? "2026-10-02",
    fechaEmision: extra.fecha ?? "2026-10-02",
    responsable: null,
    emitidoPor: null,
    finca: { nombre: "Aprisco", criadero: null, municipio: null },
    criador: "Ana",
    propietario: "Ana",
    observaciones: null,
    animal: {
      id: `animal-${numero}`,
      nombre: extra.nombre ?? `Cabra ${numero}`,
      sexo: "hembra",
      fechaNacimiento: "2021-02-22",
      colorSenas: null,
      libro,
      formaConcepcion: null,
      origen: "nacido_aqui",
      identificadores: [
        { tipo: "tatuaje", valor: "T-9", principal: false },
        { tipo: "arete", valor: `A-${numero}`, principal: true },
      ],
      composicion: (extra.razas ?? [["Saanen", 1]]).map(([raza, fraccion]) => ({ raza, fraccion })),
      consanguinidad: null,
    },
    pedigri: extra.pedigri ?? [padre("Bruno", "EJ-06"), { ...padre("Bella"), camino: "M", sexo: "hembra" }],
  };
  return {
    id: `id-${numero}`,
    numero,
    consecutivo,
    libroId,
    libro,
    estado: extra.estado ?? "emitido",
    version: extra.version ?? 1,
    fechaRegistro: extra.fecha ?? "2026-10-02",
    instantanea,
  };
}

const REGISTROS: RegistroDeLibro[] = [
  registro("MES-0001", "Mestizo", "me", 1, { razas: [["Saanen", 0.5], ["Alpina", 0.5]], fecha: "2026-01-15" }),
  registro("PPE-0002", "Pureza por pedigrí", "pp", 2, { fecha: "2026-03-01" }),
  registro("PPE-0001", "Pureza por pedigrí", "pp", 1, { fecha: "2026-02-01", razas: [["Alpina", 1]] }),
  registro("PPE-0003", "Pureza por pedigrí", "pp", 3, { fecha: "2026-04-10", estado: "anulado" }),
  registro("PPE-0004", "Pureza por pedigrí", "pp", 4, { fecha: "2026-05-20", estado: "borrador" }),
];

describe("CA-20 (R31): el libro genealógico coincide con los registros emitidos", () => {
  it("lista solo los emitidos, ordenados por libro y por número, con los datos de la instantánea", () => {
    const filas = filasDelLibro(REGISTROS, {});
    expect(filas.map((f) => f.numero)).toEqual(["MES-0001", "PPE-0001", "PPE-0002"]);
    expect(filas[0]).toMatchObject({
      libro: "Mestizo",
      nombre: "Cabra MES-0001",
      identificador: "A-MES-0001",
      nacimiento: "2021-02-22",
      padre: "Bruno",
      madre: "Bella",
      razas: [
        { raza: "Saanen", fraccion: 0.5 },
        { raza: "Alpina", fraccion: 0.5 },
      ],
      fechaRegistro: "2026-01-15",
      estado: "emitido",
    });
  });

  it("incluye el identificador principal (no el tatuaje) y deja vacío al padre o la madre que no se conocen", () => {
    const sinPadres = registro("FUN-0001", "Fundadores", "fu", 1, { pedigri: [] });
    const [fila] = filasDelLibro([sinPadres], {});
    expect(fila.identificador).toBe("A-FUN-0001");
    expect(fila.padre).toBe("");
    expect(fila.madre).toBe("");
  });

  it("el padre sin nombre se identifica por su identificador", () => {
    const r = registro("PPE-0009", "Pureza por pedigrí", "pp", 9, { pedigri: [padre(null, "EJ-77")] });
    expect(filasDelLibro([r], {})[0].padre).toBe("EJ-77");
  });

  it("los anulados solo salen si se piden, marcados como tales; los borradores nunca", () => {
    const todos = filasDelLibro(REGISTROS, { incluirAnulados: true });
    expect(todos.map((f) => `${f.numero}:${f.estado}`)).toEqual(["MES-0001:emitido", "PPE-0001:emitido", "PPE-0002:emitido", "PPE-0003:anulado"]);
  });

  it("filtra por libro", () => {
    expect(filasDelLibro(REGISTROS, { libroId: "me" }).map((f) => f.numero)).toEqual(["MES-0001"]);
  });

  it("filtra por raza: cualquier raza de la composición, también en un mestizo", () => {
    expect(filasDelLibro(REGISTROS, { raza: "Alpina" }).map((f) => f.numero)).toEqual(["MES-0001", "PPE-0001"]);
    expect(filasDelLibro(REGISTROS, { raza: "Saanen" }).map((f) => f.numero)).toEqual(["MES-0001", "PPE-0002"]);
    expect(filasDelLibro(REGISTROS, { raza: "Boer" })).toEqual([]);
  });

  it("filtra por periodo de la fecha de registro, con los dos extremos incluidos", () => {
    expect(filasDelLibro(REGISTROS, { desde: "2026-02-01", hasta: "2026-03-01" }).map((f) => f.numero)).toEqual(["PPE-0001", "PPE-0002"]);
    expect(filasDelLibro(REGISTROS, { desde: "2026-03-02" })).toEqual([]);
    expect(filasDelLibro(REGISTROS, { hasta: "2026-01-31" }).map((f) => f.numero)).toEqual(["MES-0001"]);
  });

  it("combina los filtros", () => {
    expect(filasDelLibro(REGISTROS, { libroId: "pp", raza: "Alpina", desde: "2026-01-01", hasta: "2026-12-31" }).map((f) => f.numero)).toEqual(["PPE-0001"]);
  });

  it("muestra la versión vigente de cada registro (una reemisión no duplica la fila)", () => {
    const reemitido = registro("PPE-0001", "Pureza por pedigrí", "pp", 1, { version: 3 });
    const filas = filasDelLibro([reemitido], {});
    expect(filas).toHaveLength(1);
    expect(filas[0].version).toBe(3);
  });
});
