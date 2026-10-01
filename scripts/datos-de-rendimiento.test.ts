import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBaseDePrueba, type ConexionMemoria } from "../src/datos/conexion-memoria";
import { contarAnimales } from "../src/datos/repositorios/animales";
import { listarLactancias, listarOrdeno } from "../src/datos/repositorios/leche";
import { cargarDatosDeRendimiento, medirOrdeno, TOTAL_RENDIMIENTO } from "./datos-de-rendimiento";

const HOY = "2026-09-15";
const PROPIETARIO = { usuarioId: null, rol: "propietario" as const, marcaTiempo: "2026-09-15T12:00:00.000Z" };
let db: ConexionMemoria;

beforeAll(async () => {
  db = crearBaseDePrueba();
  await cargarDatosDeRendimiento(db, HOY);
});
afterAll(() => db.cerrar());

describe("CA-09: rendimiento con 500 animales", () => {
  it("carga 500 animales, 230 lactancias abiertas y sus pesajes", async () => {
    expect((await contarAnimales(db)).total).toBe(TOTAL_RENDIMIENTO);
    expect(TOTAL_RENDIMIENTO).toBe(500);
    expect(await listarLactancias(db)).toHaveLength(230);
    const [{ n }] = await db.consultar<{ n: number }>("SELECT count(*) AS n FROM pesaje_leche");
    expect(n).toBeGreaterThan(30_000);
    expect(await listarOrdeno(db, HOY, "manana")).toHaveLength(230);
  });

  it("guardar un pesaje de leche tarda menos de un segundo", async () => {
    const medicion = await medirOrdeno(db, HOY, PROPIETARIO);
    console.log(`CA-09 (Node, en memoria): ${JSON.stringify(medicion)}`);
    expect(medicion.guardarNuevoMs).toBeLessThan(1000);
    expect(medicion.corregirMs).toBeLessThan(1000);
    expect(medicion.listarMs).toBeLessThan(1000);
  });

  it("no duplica nada si se ejecuta dos veces", async () => {
    expect((await cargarDatosDeRendimiento(db, HOY)).yaCargados).toBe(true);
  });
});
