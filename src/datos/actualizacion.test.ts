// CA-33 (especificación 2): instalar una versión nueva sobre la 0.1.0 conserva todos los datos.
// Se prueba con una copia de datos de ejemplo hecha por el código de la 0.1.0 (src/datos/muestras/LEEME.md), nunca
// con datos reales. Cubre todas las migraciones posteriores a la 4, también las de etapas futuras.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PROPIETARIO } from "./ayudas-pruebas";
import { abrirConexionMemoria, archivosDeMigracion, crearBaseDePrueba, leerMigracion, type ConexionMemoria } from "./conexion-memoria";
import { animalesEnOrden, exportarRespaldo, leerRespaldo, restaurarRespaldo, type Fila, type Respaldo } from "./respaldo";
import { animalExternoVacio, contarAnimales, guardarAnimal, listarAnimales, listarExternos } from "./repositorios/animales";
import { guardarContacto, contactoVacio } from "./repositorios/contactos";
import { calcularConsanguinidad } from "./repositorios/genealogia";
import { listarLactancias } from "./repositorios/leche";
import { listarServicios } from "./repositorios/reproduccion";
import { comprobarPin, listarUsuarios } from "./repositorios/usuarios";

const MUESTRA = new URL("./muestras/respaldo-0.1.0-ejemplo.json", import.meta.url);
const muestra = (): Respaldo => leerRespaldo(readFileSync(MUESTRA, "utf8"));
/** La 0.1.0 tenía las migraciones 0001 a 0004. */
const DE_LA_0_1_0 = (archivo: string) => Number(archivo.slice(0, 4)) <= 4;

/** Valores que una migración nueva da a las columnas que la 0.1.0 no tenía. */
const VALORES_NUEVOS: Record<string, Record<string, unknown>> = {
  animal: { origen: "nacido_aqui", contacto_id: null, fecha_ingreso: null },
  evento_reproductivo: { costo: null, condiciones: null },
  finca: { margen_gestacion: 10 },
};

/** Inserta las filas tal como están (como las dejó la 0.1.0), en el orden de su respaldo. */
async function cargarComoLa010(db: ConexionMemoria, r: Respaldo) {
  for (const [tabla, filas] of Object.entries(r.tablas) as [string, Fila[]][]) {
    for (const fila of tabla === "animal" ? animalesEnOrden(filas) : filas) {
      const columnas = Object.keys(fila);
      const precargada = tabla === "raza" || tabla === "libro";
      await db.ejecutar(
        `INSERT INTO ${tabla} (${columnas.join(", ")}) VALUES (${columnas.map(() => "?").join(", ")})${
          precargada ? ` ON CONFLICT (id) DO UPDATE SET ${columnas.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`).join(", ")}` : ""
        }`,
        columnas.map((c) => fila[c]),
      );
    }
  }
}

const leerTodo = async (db: ConexionMemoria, tablas: string[]) =>
  Object.fromEntries(await Promise.all(tablas.map(async (t) => [t, await db.consultar<Fila>(`SELECT * FROM ${t} ORDER BY id`)] as const)));

describe("CA-33: actualizar desde la versión 0.1.0", () => {
  let db: ConexionMemoria;
  let r: Respaldo;
  beforeEach(async () => {
    r = muestra();
    db = abrirConexionMemoria();
    for (const archivo of archivosDeMigracion().filter(DE_LA_0_1_0)) db.ejecutarScript(leerMigracion(archivo));
    await cargarComoLa010(db, r);
  });
  afterEach(() => db.cerrar());

  it("la muestra es de la 0.1.0 y trae datos en todas sus tablas", () => {
    expect(r.versionEsquema).toBe(4);
    for (const [tabla, filas] of Object.entries(r.tablas)) expect(filas.length, tabla).toBeGreaterThan(0);
  });

  it("las migraciones nuevas no pierden ni cambian ninguna fila ni ningún valor", async () => {
    const tablas = Object.keys(r.tablas);
    const antes = await leerTodo(db, tablas);
    for (const archivo of archivosDeMigracion().filter((a) => !DE_LA_0_1_0(a))) db.ejecutarScript(leerMigracion(archivo));
    const despues = await leerTodo(db, tablas);

    for (const tabla of tablas) {
      expect(despues[tabla].length, tabla).toBe(antes[tabla].length);
      despues[tabla].forEach((fila, i) => {
        const viejas = Object.fromEntries(Object.keys(antes[tabla][i]).map((c) => [c, fila[c]]));
        expect(viejas, `${tabla} ${String(fila.id)}`).toEqual(antes[tabla][i]);
        for (const [columna, valor] of Object.entries(VALORES_NUEVOS[tabla] ?? {})) expect(fila[columna], `${tabla}.${columna}`).toEqual(valor);
      });
    }
  });

  it("después de actualizar, el programa sigue funcionando con esos datos", async () => {
    for (const archivo of archivosDeMigracion().filter((a) => !DE_LA_0_1_0(a))) db.ejecutarScript(leerMigracion(archivo));
    // Inventario: 15 activos del hato (18 animales menos el vendido, el muerto y el ancestro «solo genealogía»,
    // que queda aparte, en «De otras fincas»).
    expect(await contarAnimales(db)).toMatchObject({ total: 15 });
    expect((await listarExternos(db)).map((a) => a.nombre)).toEqual(["Abuelo de pajilla"]);
    expect((await listarAnimales(db, { texto: "EJ-10" }))[0].nombre).toBe("Estrella");
    const estrella = (await listarAnimales(db, { texto: "EJ-10" }))[0];
    expect((await calcularConsanguinidad(db, estrella.id)).coeficiente).toBeCloseTo(0.25, 10);
    expect((await listarLactancias(db)).length).toBeGreaterThan(0);
    expect((await listarServicios(db)).length).toBe(r.tablas.evento_reproductivo.length);
    // El PIN del operario sigue funcionando (solo se guardó su hash).
    const operario = (await listarUsuarios(db)).find((u) => u.rol === "operario")!;
    expect(await comprobarPin(db, operario.id, "1234")).toBe(true);
    expect(await comprobarPin(db, operario.id, "9999")).toBe(false);
    // Y las funciones nuevas se pueden usar.
    const contacto = await guardarContacto(db, { ...contactoVacio(), nombre: "Ramiro Ejemplo" }, PROPIETARIO);
    await guardarAnimal(db, { ...animalExternoVacio(), nombre: "Titán", sexo: "macho", contactoId: contacto }, PROPIETARIO);
    expect((await listarExternos(db)).map((a) => a.nombre)).toEqual(["Abuelo de pajilla", "Titán"]);
  });
});

describe("CA-33: una copia de respaldo de la 0.1.0 se restaura en la versión nueva", () => {
  let db: ConexionMemoria;
  beforeEach(() => {
    db = crearBaseDePrueba();
  });
  afterEach(() => db.cerrar());

  it("restaura todas las filas y los valores nuevos quedan por defecto", async () => {
    const r = muestra();
    await restaurarRespaldo(db, r);
    const copia = await exportarRespaldo(db, PROPIETARIO);
    for (const [tabla, filas] of Object.entries(r.tablas)) {
      const restauradas = copia.tablas[tabla as keyof typeof copia.tablas];
      expect(restauradas.length, tabla).toBe(filas.length);
      const porId = new Map(restauradas.map((f) => [f.id, f]));
      for (const fila of filas) expect(porId.get(fila.id), `${tabla} ${String(fila.id)}`).toMatchObject(fila);
    }
    expect(copia.tablas.contacto).toEqual([]);
    expect(copia.tablas.animal.every((a) => a.origen === "nacido_aqui")).toBe(true);
  });
});
