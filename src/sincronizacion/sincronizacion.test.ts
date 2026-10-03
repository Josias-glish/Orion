// Dos (o tres) equipos simulados contra el servidor de pruebas: primera sincronización, CA-26, CA-27, CA-28 y R15 a R17.
// Cada equipo es una base SQLite en memoria con su reloj; el servidor es Postgres en memoria (servidor/pruebas/ayudas.ts).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../servidor/pruebas/ayudas";
import { cargarDatosDeEjemplo } from "../../scripts/datos-de-ejemplo";
import { arete } from "../datos/ayudas-pruebas";
import { guardarAnimal, animalVacio, eliminarAnimal, obtenerAnimal } from "../datos/repositorios/animales";
import { crearLote } from "../datos/repositorios/lotes";
import { listarAnimales } from "../datos/repositorios/animales";
import { ErrorDeRegistro } from "../datos/errores";
import { anularRegistro, crearBorrador, emitirEnLote, emitirRegistro, reemitirRegistro } from "../datos/repositorios/registros";
import { guardarPesajeLeche } from "../datos/repositorios/leche";
import { registrarEventoSalud, type DatosRegistroSalud } from "../datos/repositorios/salud";
import { registrarParto } from "../datos/repositorios/reproduccion";
import { listarAvisos } from "../datos/sincronizacion/avisos";
import { contarPendientes } from "../datos/sincronizacion/cola";
import { leerVinculo } from "../datos/sincronizacion/estado";
import { equipoConFinca, crearEquipo, unirYDescargar, vincularYSubir, volcarDatos, type EquipoSimulado } from "./equipos-de-prueba";
import { descargarDatosIniciales, subirDatosIniciales, verificarContraElServidor } from "./primera";
import { ErrorDeRed, ErrorDelServidor } from "./red";
import { RedSimulada } from "./red-simulada";
import { fincasDeLaCuenta, vincularPrimerEquipo, vincularSegundoEquipo } from "./vinculacion";
import { nuevoId } from "../dominio/identidad";

let servidor: ServidorDePrueba;
let abiertos: EquipoSimulado[] = [];
const archivos = new Map<string, Uint8Array>();

beforeAll(async () => {
  servidor = await crearServidorDePrueba();
});
afterAll(async () => {
  await servidor.cerrar();
});
beforeEach(async () => {
  await servidor.reiniciar();
  archivos.clear();
});
afterEach(() => {
  abiertos.forEach((e) => e.cerrar());
  abiertos = [];
});

const registrar = <T extends EquipoSimulado>(e: T): T => {
  abiertos.push(e);
  return e;
};

/** Una cuenta autorizada con un equipo A (con datos de ejemplo, vinculado y subido) y un equipo B (vacío, unido y descargado). */
async function dosEquipos(opciones: { limiteEnvio?: number; limitePagina?: number } = {}) {
  const correo = "josias@ejemplo.com";
  const cuentaId = await servidor.crearCuenta(correo);
  await servidor.autorizarCorreo(correo);
  const a = registrar(await equipoConFinca({ servidor, cuentaId, correo, nombre: "A", archivos, ...opciones }));
  const luna = await guardarAnimal(a.conexion, { ...animalVacio(), nombre: "Luna", fechaNacimiento: "2021-01-01", identificadores: [arete("A-10")] }, a.contexto());
  const lote = await crearLote(a.conexion, { nombre: "Ordeño", descripcion: null }, a.contexto());
  const informeA = await vincularYSubir(a);
  const b = registrar(crearEquipo({ servidor, cuentaId, correo, nombre: "B", archivos, ...opciones }));
  const informeB = await unirYDescargar(b);
  return { a, b, cuentaId, correo, luna, lote, informeA, informeB };
}

const tratamiento = (animalId: string, cambios: Partial<DatosRegistroSalud> = {}): DatosRegistroSalud => ({
  destino: { animalId },
  tipo: "tratamiento",
  producto: "Oxitetraciclina",
  numeroRegistroIca: "ICA-EJEMPLO-1",
  loteProducto: "L-77",
  dosis: "10 ml",
  via: "intramuscular",
  fechaInicio: "2026-09-10",
  fechaFin: null,
  retiroLecheDias: 5,
  retiroCarneDias: 28,
  aplicador: "Luis",
  veterinario: "Dra. Gómez",
  condicionCorporal: null,
  proximaFecha: null,
  observaciones: null,
  ...cambios,
});

describe("primera sincronización (RF-40)", () => {
  it("el equipo con datos sube todo, el segundo equipo vacío los descarga y la verificación coincide", async () => {
    const { a, b, luna, informeA, informeB } = await dosEquipos();
    expect(informeA.filas.filter((f) => !f.coincide)).toEqual([]);
    expect(informeA.coincide).toBe(true);
    expect(informeB.coincide).toBe(true);
    expect(await volcarDatos(b.conexion)).toEqual(await volcarDatos(a.conexion));
    expect((await obtenerAnimal(b.conexion, luna))?.nombre).toBe("Luna");
    expect(await contarPendientes(a.conexion)).toBe(0);
    expect(await contarPendientes(b.conexion)).toBe(0);
  });
});

describe("CA-26 (R15): un ordeño, un tratamiento y un parto hechos sin red llegan al otro equipo", () => {
  it("sin duplicados ni pérdidas al volver la red", async () => {
    const { a, b, luna } = await dosEquipos();
    a.red.enLinea = false;
    const parto = await registrarParto(
      a.conexion,
      { hembraId: luna, fecha: "2026-09-01", crias: [{ sexo: "hembra", nombre: "Estrella", arete: null, pesoNacimiento: 3, nacioMuerta: false }], observaciones: null },
      a.contexto(),
    );
    await guardarPesajeLeche(a.conexion, { lactanciaId: parto.lactanciaId, fecha: "2026-09-05", jornada: "manana", kilos: 2.5 }, a.contexto());
    await registrarEventoSalud(a.conexion, tratamiento(luna), a.contexto());
    expect(await contarPendientes(a.conexion)).toBeGreaterThan(0);

    expect((await a.cliente.sincronizar()).estado).toBe("sin_conexion");
    expect(await contarPendientes(a.conexion)).toBeGreaterThan(0);

    a.red.enLinea = true;
    expect((await a.cliente.sincronizar()).estado).toBe("al_dia");
    expect(await contarPendientes(a.conexion)).toBe(0);
    await b.cliente.sincronizar();
    expect(await volcarDatos(b.conexion)).toEqual(await volcarDatos(a.conexion));
    const cuenta = async (t: string) => (await b.conexion.consultar<{ n: number }>(`SELECT count(*) AS n FROM ${t}`))[0].n;
    expect([await cuenta("parto"), await cuenta("pesaje_leche"), await cuenta("evento_salud")]).toEqual([1, 1, 1]);
    // Otra vuelta no cambia nada.
    const otra = await b.cliente.sincronizar();
    expect([otra.enviados, otra.recibidos]).toEqual([0, 0]);
  });
});

const cuentaEnServidor = async (tabla: string): Promise<number> => Number((await servidor.sql<{ n: string }>(`select count(*) as n from ${tabla}`))[0].n);
const nombres = async (e: EquipoSimulado): Promise<string[]> =>
  (await e.conexion.consultar<{ nombre: string }>("SELECT nombre FROM animal ORDER BY nombre")).map((f) => f.nombre);

async function crearAnimales(e: EquipoSimulado, cantidad: number, prefijo = "Cabra"): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 1; i <= cantidad; i++) ids.push(await guardarAnimal(e.conexion, { ...animalVacio(), nombre: `${prefijo} ${i}`, fechaNacimiento: "2022-01-01" }, e.contexto()));
  return ids;
}

describe("CA-28 (R15): un corte de red a mitad del envío no duplica ni pierde cambios al reintentar", () => {
  it("la respuesta se pierde después de que el servidor aplicó el envío: al reintentar no se duplica", async () => {
    const { a, b } = await dosEquipos();
    await crearAnimales(a, 5);
    a.red.provocar("sincronizar", "cortar_despues");
    expect((await a.cliente.sincronizar()).estado).toBe("sin_conexion");
    expect(await contarPendientes(a.conexion)).toBeGreaterThan(0);
    const antes = await cuentaEnServidor("public.cambio");
    expect((await a.cliente.sincronizar()).estado).toBe("al_dia");
    expect(await cuentaEnServidor("public.cambio")).toBe(antes);
    expect(await contarPendientes(a.conexion)).toBe(0);
    await b.cliente.sincronizar();
    expect(await nombres(b)).toEqual(["Cabra 1", "Cabra 2", "Cabra 3", "Cabra 4", "Cabra 5", "Luna"]);
    expect(await volcarDatos(b.conexion)).toEqual(await volcarDatos(a.conexion));
  });

  it("el corte llega a mitad de varios envíos pequeños: nada se pierde ni se repite", async () => {
    const { a, b } = await dosEquipos({ limiteEnvio: 3 });
    await crearAnimales(a, 6);
    a.red.provocar("sincronizar", "cortar_antes", { saltar: 1 });
    expect((await a.cliente.sincronizar()).estado).toBe("sin_conexion");
    const pendientes = await contarPendientes(a.conexion);
    expect(pendientes).toBeGreaterThan(0);
    a.red.provocar("sincronizar", "cortar_despues");
    expect((await a.cliente.sincronizar()).estado).toBe("sin_conexion");
    expect((await a.cliente.sincronizar()).estado).toBe("al_dia");
    expect(await contarPendientes(a.conexion)).toBe(0);
    await b.cliente.sincronizar();
    expect(await volcarDatos(b.conexion)).toEqual(await volcarDatos(a.conexion));
    expect((await b.conexion.consultar<{ n: number }>("SELECT count(*) AS n FROM animal"))[0].n).toBe(7);
  });

  it("una entrega repetida de la misma petición se aplica una sola vez", async () => {
    const { a, b } = await dosEquipos();
    await crearAnimales(a, 3);
    a.red.provocar("sincronizar", "duplicar");
    expect((await a.cliente.sincronizar()).estado).toBe("al_dia");
    await b.cliente.sincronizar();
    expect(await nombres(b)).toEqual(["Cabra 1", "Cabra 2", "Cabra 3", "Luna"]);
    expect(await volcarDatos(b.conexion)).toEqual(await volcarDatos(a.conexion));
  });

  it("el equipo que recibe también puede cortarse a mitad: al reintentar queda igual", async () => {
    const { a, b } = await dosEquipos({ limitePagina: 4 });
    await crearAnimales(a, 6);
    await a.cliente.sincronizar();
    b.red.provocar("sincronizar", "cortar_despues");
    expect((await b.cliente.sincronizar()).estado).toBe("sin_conexion");
    expect((await b.cliente.sincronizar()).estado).toBe("al_dia");
    expect(await volcarDatos(b.conexion)).toEqual(await volcarDatos(a.conexion));
  });
});

describe("CA-27 (R16): conflictos entre dos equipos", () => {
  const editar = async (e: EquipoSimulado, id: string, cambios: Record<string, unknown>) => {
    const actual = (await obtenerAnimal(e.conexion, id))!;
    await guardarAnimal(e.conexion, { ...actual, ...cambios } as never, e.contexto(), id);
  };

  it("dos cambios en campos distintos del mismo animal se conservan ambos", async () => {
    const { a, b, luna } = await dosEquipos();
    a.red.enLinea = false;
    b.red.enLinea = false;
    await editar(a, luna, { nombre: "Luna II" });
    b.reloj.avanzar(1000);
    await editar(b, luna, { colorSenas: "negra con mancha blanca" });
    a.red.enLinea = true;
    b.red.enLinea = true;
    await a.cliente.sincronizar();
    await b.cliente.sincronizar();
    await a.cliente.sincronizar();
    for (const e of [a, b]) {
      const animal = (await obtenerAnimal(e.conexion, luna))!;
      expect([animal.nombre, animal.colorSenas]).toEqual(["Luna II", "negra con mancha blanca"]);
    }
    expect(await volcarDatos(b.conexion)).toEqual(await volcarDatos(a.conexion));
  });

  it("en el mismo campo gana la marca más reciente (aunque llegue antes al servidor) y el valor anterior queda en el historial", async () => {
    const { a, b, luna } = await dosEquipos();
    a.red.enLinea = false;
    b.red.enLinea = false;
    await editar(a, luna, { nombre: "Luna de A" });
    b.reloj.avanzar(60_000);
    await editar(b, luna, { nombre: "Luna de B" });
    // B envía primero: A (con la marca más vieja) llega después y pierde.
    b.red.enLinea = true;
    await b.cliente.sincronizar();
    a.red.enLinea = true;
    await a.cliente.sincronizar();
    await b.cliente.sincronizar();
    for (const e of [a, b]) expect((await obtenerAnimal(e.conexion, luna))!.nombre).toBe("Luna de B");
    const historial = await a.conexion.consultar<{ valor_anterior: string | null; valor_nuevo: string | null }>(
      "SELECT valor_anterior, valor_nuevo FROM historial_cambios WHERE entidad = 'animal' AND registro_id = ? AND campo = 'nombre' ORDER BY creado_en, rowid",
      [luna],
    );
    expect(historial.some((h) => h.valor_nuevo === "Luna de A")).toBe(true);
    expect(historial.some((h) => h.valor_anterior === "Luna de A" && h.valor_nuevo === "Luna de B")).toBe(true);
    expect(await volcarDatos(b.conexion)).toEqual(await volcarDatos(a.conexion));
  });

  it("una edición posterior a un borrado restaura el registro y avisa", async () => {
    const { a, b, luna } = await dosEquipos();
    a.red.enLinea = false;
    b.red.enLinea = false;
    await eliminarAnimal(a.conexion, luna, a.contexto());
    b.reloj.avanzar(60_000);
    await editar(b, luna, { colorSenas: "blanca" });
    a.red.enLinea = true;
    b.red.enLinea = true;
    await a.cliente.sincronizar();
    await b.cliente.sincronizar();
    await a.cliente.sincronizar();
    for (const e of [a, b]) {
      const [fila] = await e.conexion.consultar<{ eliminado_en: string | null; color_senas: string | null }>("SELECT eliminado_en, color_senas FROM animal WHERE id = ?", [luna]);
      expect(fila).toEqual({ eliminado_en: null, color_senas: "blanca" });
    }
    expect((await listarAvisos(a.conexion)).map((x) => x.tipo)).toContain("restaurado");
    expect(await volcarDatos(b.conexion)).toEqual(await volcarDatos(a.conexion));
  });

  it("un borrado posterior a la última edición se conserva", async () => {
    const { a, b, luna } = await dosEquipos();
    a.red.enLinea = false;
    b.red.enLinea = false;
    await editar(a, luna, { colorSenas: "gris" });
    b.reloj.avanzar(60_000);
    await eliminarAnimal(b.conexion, luna, b.contexto());
    a.red.enLinea = true;
    b.red.enLinea = true;
    await b.cliente.sincronizar();
    await a.cliente.sincronizar();
    await b.cliente.sincronizar();
    for (const e of [a, b]) expect((await e.conexion.consultar<{ eliminado_en: string | null }>("SELECT eliminado_en FROM animal WHERE id = ?", [luna]))[0].eliminado_en).not.toBeNull();
  });

  it("dos lotes con el mismo nombre creados sin red: uno queda con « (2)» y se avisa", async () => {
    const { a, b } = await dosEquipos();
    a.red.enLinea = false;
    b.red.enLinea = false;
    await crearLote(a.conexion, { nombre: "Cría", descripcion: null }, a.contexto());
    b.reloj.avanzar(1000);
    await crearLote(b.conexion, { nombre: "Cría", descripcion: null }, b.contexto());
    a.red.enLinea = true;
    b.red.enLinea = true;
    await a.cliente.sincronizar();
    await b.cliente.sincronizar();
    await a.cliente.sincronizar();
    const lotesDe = async (e: EquipoSimulado) => (await e.conexion.consultar<{ nombre: string }>("SELECT nombre FROM lote ORDER BY nombre")).map((l) => l.nombre);
    expect(await lotesDe(a)).toEqual(await lotesDe(b));
    expect(await lotesDe(a)).toEqual(["Cría", "Cría (2)", "Ordeño"]);
    expect(await volcarDatos(b.conexion)).toEqual(await volcarDatos(a.conexion));
  });
});

describe("primera sincronización con los datos de ejemplo completos", () => {
  it("sube genealogía, reproducción, leche, salud, registros emitidos y finanzas; el segundo equipo queda igual (R28: sin datos de contactos)", async () => {
    const correo = "josias@ejemplo.com";
    const cuentaId = await servidor.crearCuenta(correo);
    await servidor.autorizarCorreo(correo);
    const a = registrar(crearEquipo({ servidor, cuentaId, correo, nombre: "A", archivos }));
    await cargarDatosDeEjemplo(a.conexion, "2026-09-15");
    const idDe = async (arete: string) => (await listarAnimales(a.conexion, { texto: arete, incluirSoloGenealogia: true }))[0].id;
    await emitirEnLote(a.conexion, [await idDe("EJ-06"), await idDe("EJ-07"), await idDe("EJ-10")], a.contexto(), { hoy: "2026-10-02" });
    const [diez] = await a.conexion.consultar<{ id: string }>("SELECT r.id FROM registro_genealogico r JOIN animal a ON a.id = r.animal_id WHERE a.id = ?", [await idDe("EJ-10")]);
    await anularRegistro(a.conexion, diez.id, "Error de captura", a.contexto());
    const emitidosAntes = (await a.conexion.consultar<{ n: number }>("SELECT count(*) AS n FROM registro_genealogico WHERE estado = 'emitido'"))[0].n;
    expect(emitidosAntes).toBeGreaterThan(0);
    const informeA = await vincularYSubir(a);
    expect(informeA.filas.filter((f) => !f.coincide)).toEqual([]);

    const b = registrar(crearEquipo({ servidor, cuentaId, correo, nombre: "B", archivos }));
    const informeB = await unirYDescargar(b);
    expect(informeB.filas.filter((f) => !f.coincide)).toEqual([]);
    expect(await volcarDatos(b.conexion)).toEqual(await volcarDatos(a.conexion));

    // Los números de registro y los contadores de los libros son los mismos en los dos equipos.
    const numeros = async (e: EquipoSimulado) => e.conexion.consultar("SELECT libro_id, consecutivo, numero, version, estado FROM registro_genealogico ORDER BY libro_id, consecutivo");
    expect(await numeros(b)).toEqual(await numeros(a));
    const libros = async (e: EquipoSimulado) => e.conexion.consultar("SELECT id, siguiente_numero FROM libro ORDER BY id");
    expect(await libros(b)).toEqual(await libros(a));

    // R28: los contactos no viajan; el otro equipo solo tiene marcadores sin datos personales.
    const nombresReales = (await a.conexion.consultar<{ nombre: string }>("SELECT nombre FROM contacto")).map((c) => c.nombre);
    if (nombresReales.length > 0) {
      const enB = (await b.conexion.consultar<{ nombre: string | null }>("SELECT nombre FROM contacto")).map((c) => c.nombre);
      for (const nombre of nombresReales) expect(enB).not.toContain(nombre);
    }
  });
});

/** Dos equipos de la misma finca con los datos de ejemplo (sin registros emitidos), ya sincronizados. */
async function dosEquiposConEjemplo() {
  const correo = "josias@ejemplo.com";
  const cuentaId = await servidor.crearCuenta(correo);
  await servidor.autorizarCorreo(correo);
  const a = registrar(crearEquipo({ servidor, cuentaId, correo, nombre: "A", archivos }));
  await cargarDatosDeEjemplo(a.conexion, "2026-09-15");
  await vincularYSubir(a);
  const b = registrar(crearEquipo({ servidor, cuentaId, correo, nombre: "B", archivos }));
  await unirYDescargar(b);
  const idDe = async (e: EquipoSimulado, arete: string) => (await listarAnimales(e.conexion, { texto: arete, incluirSoloGenealogia: true }))[0].id;
  return { a, b, idDe, cuentaId, correo };
}
const numerosDe = (e: EquipoSimulado) =>
  e.conexion.consultar<{ numero: string; consecutivo: number; estado: string; version: number }>(
    "SELECT numero, consecutivo, estado, version FROM registro_genealogico WHERE consecutivo IS NOT NULL ORDER BY libro_id, consecutivo",
  );

describe("R31: los números de registro los asigna el servidor", () => {
  it("dos equipos emiten al mismo tiempo en el mismo libro: números distintos, consecutivos y sin repetir", async () => {
    const { a, b, idDe } = await dosEquiposConEjemplo();
    const hoy = { hoy: "2026-10-02" };
    const [ra, rb] = await Promise.all([
      emitirRegistro(a.conexion, await idDe(a, "EJ-06"), a.contexto(), hoy),
      emitirRegistro(b.conexion, await idDe(b, "EJ-07"), b.contexto(), hoy),
    ]);
    expect([ra.numero, rb.numero].sort()).toEqual(["PPE-0001", "PPE-0002"]);
    await a.cliente.sincronizar();
    await b.cliente.sincronizar();
    expect(await numerosDe(a)).toEqual(await numerosDe(b));
    expect((await numerosDe(a)).map((n) => n.numero)).toEqual(["PPE-0001", "PPE-0002"]);
    const libros = (e: EquipoSimulado) => e.conexion.consultar("SELECT id, siguiente_numero FROM libro ORDER BY id");
    expect(await libros(a)).toEqual(await libros(b));
    expect(await volcarDatos(b.conexion)).toEqual(await volcarDatos(a.conexion));
  });

  it("emitir, reemitir y anular necesitan conexión; los borradores se hacen sin red", async () => {
    const { a, b, idDe } = await dosEquiposConEjemplo();
    const animal = await idDe(a, "EJ-06");
    a.red.enLinea = false;
    const motivos = async (p: Promise<unknown>) => p.then(() => [], (e: unknown) => (e instanceof ErrorDeRegistro ? e.motivos.map((m) => m.codigo) : [String(e)]));
    expect(await motivos(emitirRegistro(a.conexion, animal, a.contexto(), { hoy: "2026-10-02" }))).toEqual(["requiere_servidor"]);
    await crearBorrador(a.conexion, animal, {}, a.contexto(), "2026-10-02");
    a.red.enLinea = true;
    await a.cliente.sincronizar();
    await b.cliente.sincronizar();
    expect((await obtenerRegistroDeAnimal(b, animal))?.estado).toBe("borrador");
    const emitido = await emitirRegistro(b.conexion, animal, b.contexto(), { hoy: "2026-10-02" });
    expect(emitido.numero).toBe("PPE-0001");
    b.red.enLinea = false;
    expect(await motivos(reemitirRegistro(b.conexion, emitido.registroId, b.contexto(), { hoy: "2026-10-02" }))).toEqual(["requiere_servidor"]);
    expect(await motivos(anularRegistro(b.conexion, emitido.registroId, "Prueba", b.contexto()))).toEqual(["requiere_servidor"]);
    expect((await numerosDe(b)).map((n) => `${n.numero}:${n.estado}:${n.version}`)).toEqual(["PPE-0001:emitido:1"]);
  });

  it("si la respuesta de la emisión se pierde, el número no se repite ni se salta: llega con la siguiente sincronización", async () => {
    const { a, b, idDe } = await dosEquiposConEjemplo();
    a.red.provocar("emitir_registros", "cortar_despues");
    await expect(emitirRegistro(a.conexion, await idDe(a, "EJ-06"), a.contexto(), { hoy: "2026-10-02" })).rejects.toBeInstanceOf(ErrorDeRegistro);
    expect(await numerosDe(a)).toEqual([]);
    await a.cliente.sincronizar();
    await b.cliente.sincronizar();
    expect((await numerosDe(a)).map((n) => n.numero)).toEqual(["PPE-0001"]);
    const siguiente = await emitirRegistro(b.conexion, await idDe(b, "EJ-07"), b.contexto(), { hoy: "2026-10-02" });
    expect(siguiente.numero).toBe("PPE-0002");
    await a.cliente.sincronizar();
    expect(await numerosDe(a)).toEqual(await numerosDe(b));
  });

  it("reemitir sube la versión y conserva el número; anular no libera el número", async () => {
    const { a, b, idDe } = await dosEquiposConEjemplo();
    const uno = await emitirRegistro(a.conexion, await idDe(a, "EJ-06"), a.contexto(), { hoy: "2026-10-02" });
    const dos = await emitirRegistro(a.conexion, await idDe(a, "EJ-07"), a.contexto(), { hoy: "2026-10-02" });
    await b.cliente.sincronizar();
    const re = await reemitirRegistro(b.conexion, uno.registroId, b.contexto(), { hoy: "2026-10-02" });
    expect([re.numero, re.version]).toEqual(["PPE-0001", 2]);
    await anularRegistro(b.conexion, dos.registroId, "Error de captura", b.contexto());
    await a.cliente.sincronizar();
    await b.cliente.sincronizar();
    expect((await numerosDe(a)).map((n) => `${n.numero}:${n.estado}:${n.version}`)).toEqual(["PPE-0001:emitido:2", "PPE-0002:anulado:1"]);
    expect(await numerosDe(b)).toEqual(await numerosDe(a));
    const tercero = await emitirRegistro(a.conexion, await idDe(a, "EJ-10"), a.contexto(), { hoy: "2026-10-02" });
    expect(tercero.numero).toBe("PPE-0003");
  });
});

async function obtenerRegistroDeAnimal(e: EquipoSimulado, animalId: string) {
  const [fila] = await e.conexion.consultar<{ estado: string }>("SELECT estado FROM registro_genealogico WHERE animal_id = ? AND estado <> 'anulado'", [animalId]);
  return fila ?? null;
}

/** Generador pseudoaleatorio con semilla (mulberry32): las pruebas de convergencia se repiten igual. */
function generador(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("R15 a R17: tres equipos con cambios al azar (con y sin red) terminan idénticos", () => {
  const SEMILLAS = [1, 7, 42, 2026];
  for (const semilla of SEMILLAS) {
    it(`semilla ${semilla}`, async () => {
      const { a, b, cuentaId, correo } = await dosEquipos({ limiteEnvio: 5, limitePagina: 8 });
      const c = registrar(crearEquipo({ servidor, cuentaId, correo, nombre: "C", archivos, limiteEnvio: 5, limitePagina: 8 }));
      await unirYDescargar(c);
      const equipos = [a, b, c];
      const azar = generador(semilla);
      const elegir = <T,>(lista: readonly T[]): T => lista[Math.floor(azar() * lista.length)];
      const COLORES = ["blanca", "negra", "café", "gris", "crema", null];
      const NOMBRES_LOTE = ["Ordeño", "Cría", "Levante", "Secas"];

      const idsVivos = async (e: EquipoSimulado) => (await e.conexion.consultar<{ id: string }>("SELECT id FROM animal WHERE eliminado_en IS NULL ORDER BY id")).map((f) => f.id);
      for (let paso = 0; paso < 120; paso++) {
        const e = elegir(equipos);
        e.reloj.avanzar(Math.floor(azar() * 5000));
        const accion = azar();
        try {
          if (accion < 0.12) {
            e.red.enLinea = !e.red.enLinea;
          } else if (accion < 0.3) {
            await guardarAnimal(e.conexion, { ...animalVacio(), nombre: `Cabra ${paso}-${e.nombre}`, fechaNacimiento: "2023-01-01", colorSenas: elegir(COLORES) }, e.contexto());
          } else if (accion < 0.5) {
            const ids = await idsVivos(e);
            if (ids.length > 0) {
              const id = elegir(ids);
              const actual = (await obtenerAnimal(e.conexion, id))!;
              await guardarAnimal(e.conexion, { ...actual, nombre: `Renombrada ${paso}`, } as never, e.contexto(), id);
            }
          } else if (accion < 0.65) {
            const ids = await idsVivos(e);
            if (ids.length > 0) {
              const id = elegir(ids);
              const actual = (await obtenerAnimal(e.conexion, id))!;
              await guardarAnimal(e.conexion, { ...actual, colorSenas: elegir(COLORES) } as never, e.contexto(), id);
            }
          } else if (accion < 0.72) {
            const ids = await idsVivos(e);
            if (ids.length > 2) await eliminarAnimal(e.conexion, elegir(ids), e.contexto());
          } else if (accion < 0.82) {
            await crearLote(e.conexion, { nombre: elegir(NOMBRES_LOTE), descripcion: null }, e.contexto());
          } else {
            await e.cliente.sincronizar();
          }
        } catch (error) {
          // Una regla de la base (por ejemplo, un nombre de lote repetido en este equipo) rechaza el cambio: es lo esperado.
          if (!(error instanceof ErrorDeRegistro)) throw error;
        }
      }
      for (const e of equipos) e.red.enLinea = true;
      for (let ronda = 0; ronda < 3; ronda++) for (const e of equipos) await e.cliente.sincronizar();
      for (const e of equipos) expect(await contarPendientes(e.conexion)).toBe(0);
      const base = await volcarDatos(a.conexion);
      expect(await volcarDatos(b.conexion)).toEqual(base);
      expect(await volcarDatos(c.conexion)).toEqual(base);
      // La verificación contra el servidor también coincide en los tres.
      for (const e of equipos) {
        const informe = await verificarContraElServidor(e.conexion, e.red);
        expect(informe.filas.filter((f) => !f.coincide)).toEqual([]);
      }
    }, 120_000);
  }
});

describe("aislamiento entre cuentas y fincas", () => {
  it("una cuenta ajena no ve ni toca la finca de otra: ni sincronizar, ni descargar, ni verificar, ni invitar", async () => {
    const { a, b, luna } = await dosEquipos();
    const vinculoDeA = (await leerVinculo(a.conexion))!.fincaId;
    const dispositivoDeA = (await leerVinculo(a.conexion))!.dispositivoId;

    const intrusaId = await servidor.crearCuenta("intrusa@ejemplo.com");
    await servidor.autorizarCorreo("intrusa@ejemplo.com");
    const intrusa = new RedSimulada({ servidor, cuentaId: intrusaId, correo: "intrusa@ejemplo.com" });
    await intrusa.rpc("registrar_cuenta", {});
    const propia = await intrusa.rpc<unknown[]>("mis_fincas", {});
    expect(propia).toEqual([]);

    const parametros = { p_finca_id: vinculoDeA, p_dispositivo_id: dispositivoDeA };
    const intentos: [string, Record<string, unknown>][] = [
      ["sincronizar", { ...parametros, p_version_esquema: 9, p_desde: 0, p_cambios: [], p_limite: 500 }],
      ["resumen_finca", parametros],
      ["iniciar_descarga", parametros],
      ["descargar_pagina", { ...parametros, p_entidad: "animal", p_despues_de: null, p_limite: 10 }],
      ["crear_invitacion", { p_finca_id: vinculoDeA }],
      ["listar_dispositivos", { p_finca_id: vinculoDeA }],
      ["revocar_dispositivo", { p_finca_id: vinculoDeA, p_dispositivo_id: dispositivoDeA }],
    ];
    for (const [funcion, p] of intentos) await expect(intrusa.rpc(funcion, p), funcion).rejects.toBeInstanceOf(ErrorDelServidor);
    // Tampoco puede entrar a la finca con su propia cuenta sin invitación.
    await expect(intrusa.rpc("unirse_a_finca", { p_finca_id: vinculoDeA, p_codigo: null, p_dispositivo: { id: nuevoId(), nombre: "X", plataforma: "p" }, p_version_esquema: 9 })).rejects.toBeInstanceOf(
      ErrorDelServidor,
    );

    // Los datos de la finca siguen intactos y los equipos legítimos siguen sincronizando.
    await a.cliente.sincronizar();
    await b.cliente.sincronizar();
    expect((await obtenerAnimal(b.conexion, luna))?.nombre).toBe("Luna");
    expect(await volcarDatos(b.conexion)).toEqual(await volcarDatos(a.conexion));
  });

  it("dos fincas de cuentas distintas, cada una con sus datos: no se mezclan", async () => {
    const uno = await dosEquipos();
    const correo2 = "otra@ejemplo.com";
    const cuenta2 = await servidor.crearCuenta(correo2);
    await servidor.autorizarCorreo(correo2);
    const archivos2 = new Map<string, Uint8Array>();
    const x = registrar(await equipoConFinca({ servidor, cuentaId: cuenta2, correo: correo2, nombre: "X", archivos: archivos2 }));
    await guardarAnimal(x.conexion, { ...animalVacio(), nombre: "Solo de la otra finca", fechaNacimiento: "2020-01-01" }, x.contexto());
    await vincularYSubir(x);
    await uno.a.cliente.sincronizar();
    await x.cliente.sincronizar();
    expect(await nombres(uno.a)).toEqual(["Luna"]);
    expect(await nombres(x)).toEqual(["Solo de la otra finca"]);
  });
});

describe("unirse con la misma cuenta, con un código y revocar un equipo", () => {
  it("un equipo con otra cuenta se une con el código de invitación; un código malo da un error con texto y se bloquea al quinto intento", async () => {
    const { a, luna, cuentaId } = await dosEquipos();
    const finca = (await fincasDeLaCuenta(a.red))[0];
    const { codigo } = await a.red.rpc<{ codigo: string }>("crear_invitacion", { p_finca_id: finca.finca_id });
    const correo2 = "operario@ejemplo.com";
    const cuenta2 = await servidor.crearCuenta(correo2);
    const c = registrar(crearEquipo({ servidor, cuentaId: cuenta2, correo: correo2, nombre: "C", archivos }));
    for (let i = 0; i < 2; i++) {
      await expect(unirYDescargar(c, { codigo: "AAAAA-AAAAA" })).rejects.toMatchObject({ codigo: "codigo_invalido" });
    }
    const informe = await unirYDescargar(c, { codigo });
    expect(informe.coincide).toBe(true);
    expect((await obtenerAnimal(c.conexion, luna))?.nombre).toBe("Luna");
    // El código sirve una sola vez.
    const d = registrar(crearEquipo({ servidor, cuentaId: await servidor.crearCuenta("tercero@ejemplo.com"), correo: "tercero@ejemplo.com", nombre: "D", archivos }));
    await expect(unirYDescargar(d, { codigo })).rejects.toMatchObject({ codigo: "codigo_invalido" });
    expect(cuentaId).not.toBe(cuenta2);
  });

  it("un equipo con datos no puede unirse (debe estar vacío)", async () => {
    const { a, cuentaId, correo } = await dosEquipos();
    const finca = (await fincasDeLaCuenta(a.red))[0];
    const conDatos = registrar(await equipoConFinca({ servidor, cuentaId, correo, nombre: "Lleno", archivos }));
    await expect(vincularSegundoEquipo(conDatos.conexion, conDatos.red, { nombre: "Lleno", plataforma: "pruebas" }, 9, { fincaId: finca.finca_id })).rejects.toMatchObject({ motivos: [{ codigo: "equipo_con_datos" }] });
  });

  it("un equipo revocado deja de sincronizar y conserva sus datos", async () => {
    const { a, b, luna } = await dosEquipos();
    const finca = (await fincasDeLaCuenta(a.red))[0];
    const equipos = await a.red.rpc<{ id: string; codigo_equipo: string; revocado: boolean }[]>("listar_dispositivos", { p_finca_id: finca.finca_id });
    expect(equipos).toHaveLength(2);
    const dispositivoB = (await leerVinculo(b.conexion))!.dispositivoId;
    await a.red.rpc("revocar_dispositivo", { p_finca_id: finca.finca_id, p_dispositivo_id: dispositivoB });
    await guardarAnimal(b.conexion, { ...animalVacio(), nombre: "Hecha por el equipo retirado", fechaNacimiento: "2024-01-01" }, b.contexto());
    expect((await b.cliente.sincronizar()).estado).toBe("revocado");
    expect((await obtenerAnimal(b.conexion, luna))?.nombre).toBe("Luna");
    expect(await nombres(b)).toContain("Hecha por el equipo retirado");
    await a.cliente.sincronizar();
    expect(await nombres(a)).toEqual(["Luna"]);
  });
});

describe("relojes distintos (R16, S-84)", () => {
  it("un equipo con el reloj adelantado: el servidor acorta sus marcas y las marcas locales quedan iguales a las del servidor", async () => {
    const { a, b, luna } = await dosEquipos();
    a.reloj.avanzar(3 * 24 * 3600 * 1000);
    const actual = (await obtenerAnimal(a.conexion, luna))!;
    await guardarAnimal(a.conexion, { ...actual, nombre: "Luna de A" } as never, a.contexto(), luna);
    expect((await a.cliente.sincronizar()).estado).toBe("al_dia");
    const informe = await verificarContraElServidor(a.conexion, a.red);
    expect(informe.filas.filter((f) => !f.coincide)).toEqual([]);
    // Un cambio posterior de otro equipo con el reloj correcto gana: la marca de A ya no está en el futuro.
    await b.cliente.sincronizar();
    b.reloj.avanzar(3 * 3600 * 1000);
    await servidor.avanzarHora(3 * 3600 * 1000);
    const deB = (await obtenerAnimal(b.conexion, luna))!;
    await guardarAnimal(b.conexion, { ...deB, nombre: "Luna de B" } as never, b.contexto(), luna);
    await b.cliente.sincronizar();
    await a.cliente.sincronizar();
    for (const e of [a, b]) expect((await obtenerAnimal(e.conexion, luna))!.nombre).toBe("Luna de B");
  });
});

describe("relojes distintos: la respuesta con la marca corregida se pierde", () => {
  it("al reintentar el servidor vuelve a mandar la corrección y las marcas locales quedan iguales", async () => {
    const { a, luna } = await dosEquipos();
    a.reloj.avanzar(3 * 24 * 3600 * 1000);
    const actual = (await obtenerAnimal(a.conexion, luna))!;
    await guardarAnimal(a.conexion, { ...actual, nombre: "Luna de A" } as never, a.contexto(), luna);
    a.red.provocar("sincronizar", "cortar_despues");
    expect((await a.cliente.sincronizar()).estado).toBe("sin_conexion");
    expect((await a.cliente.sincronizar()).estado).toBe("al_dia");
    expect((await verificarContraElServidor(a.conexion, a.red)).filas.filter((f) => !f.coincide)).toEqual([]);
  });
});

describe("primera sincronización interrumpida (RF-40)", () => {
  async function equipoConEjemplo() {
    const correo = "josias@ejemplo.com";
    const cuentaId = await servidor.crearCuenta(correo);
    await servidor.autorizarCorreo(correo);
    const a = registrar(crearEquipo({ servidor, cuentaId, correo, nombre: "A", archivos }));
    await cargarDatosDeEjemplo(a.conexion, "2026-09-15");
    return { a, cuentaId, correo };
  }
  const reanudar = async (accion: () => Promise<unknown>, intentos = 20) => {
    let ultimo: unknown;
    for (let i = 0; i < intentos; i++) {
      try {
        return await accion();
      } catch (error) {
        ultimo = error;
        if (!(error instanceof ErrorDeRed)) throw error;
      }
    }
    throw ultimo;
  };

  it("la subida se corta varias veces (antes y después de que el servidor responda) y al reanudar todo coincide", async () => {
    const { a } = await equipoConEjemplo();
    await vincularPrimerEquipo(a.conexion, a.red, { nombre: "A", plataforma: "pruebas" }, 9);
    a.red.provocar("sincronizar", "cortar_antes", { saltar: 1 });
    a.red.provocar("sincronizar", "cortar_despues", { saltar: 2 });
    a.red.provocar("sincronizar", "cortar_antes", { saltar: 3 });
    await reanudar(() => subirDatosIniciales(a.conexion, a.red, a.cliente, { versionEsquema: 9, filasPorPaso: 7 }));
    const informe = await verificarContraElServidor(a.conexion, a.red);
    expect(informe.filas.filter((f) => !f.coincide)).toEqual([]);
    expect(informe.coincide).toBe(true);
  });

  it("la descarga se corta varias veces y al reanudar el segundo equipo queda igual al primero", async () => {
    const { a, cuentaId, correo } = await equipoConEjemplo();
    await vincularYSubir(a);
    const b = registrar(crearEquipo({ servidor, cuentaId, correo, nombre: "B", archivos }));
    await vincularSegundoEquipo(b.conexion, b.red, { nombre: "B", plataforma: "pruebas" }, 9, { fincaId: (await fincasDeLaCuenta(b.red))[0].finca_id });
    b.red.provocar("descargar_pagina", "cortar_despues", { saltar: 2 });
    b.red.provocar("descargar_pagina", "cortar_antes", { saltar: 5 });
    await reanudar(() => descargarDatosIniciales(b.conexion, b.red, b.cliente, { versionEsquema: 9 }));
    const informe = await verificarContraElServidor(b.conexion, b.red);
    expect(informe.filas.filter((f) => !f.coincide)).toEqual([]);
    expect(await volcarDatos(b.conexion)).toEqual(await volcarDatos(a.conexion));
  });
});
