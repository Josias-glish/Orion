// Dos (o tres) equipos simulados contra el servidor de pruebas: primera sincronización, CA-26, CA-27, CA-28 y R15 a R17.
// Cada equipo es una base SQLite en memoria con su reloj; el servidor es Postgres en memoria (servidor/pruebas/ayudas.ts).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../servidor/pruebas/ayudas";
import { cargarDatosDeEjemplo } from "../../scripts/datos-de-ejemplo";
import { arete } from "../datos/ayudas-pruebas";
import { guardarAnimal, animalVacio, eliminarAnimal, obtenerAnimal } from "../datos/repositorios/animales";
import { crearLote } from "../datos/repositorios/lotes";
import { listarAnimales } from "../datos/repositorios/animales";
import { anularRegistro, emitirEnLote } from "../datos/repositorios/registros";
import { guardarPesajeLeche } from "../datos/repositorios/leche";
import { registrarEventoSalud, type DatosRegistroSalud } from "../datos/repositorios/salud";
import { registrarParto } from "../datos/repositorios/reproduccion";
import { listarAvisos } from "../datos/sincronizacion/avisos";
import { contarPendientes } from "../datos/sincronizacion/cola";
import { equipoConFinca, crearEquipo, unirYDescargar, vincularYSubir, volcarDatos, type EquipoSimulado } from "./equipos-de-prueba";

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
  return { a, b, cuentaId, luna, lote, informeA, informeB };
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
