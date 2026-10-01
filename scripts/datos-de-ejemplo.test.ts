import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { crearBaseDePrueba, type ConexionMemoria } from "../src/datos/conexion-memoria";
import { listarAnimales, obtenerAnimal } from "../src/datos/repositorios/animales";
import { calcularConsanguinidad } from "../src/datos/repositorios/genealogia";
import { cargarDatosDeEjemplo } from "./datos-de-ejemplo";

let db: ConexionMemoria;
beforeEach(() => {
  db = crearBaseDePrueba();
});
afterEach(() => db.cerrar());

const porArete = async (arete: string) => (await listarAnimales(db, { texto: arete }))[0];

describe("datos de ejemplo (sección 12)", () => {
  it("carga 12 animales en tres generaciones con la consanguinidad esperada", async () => {
    expect(await cargarDatosDeEjemplo(db)).toEqual({ creados: 12, yaCargados: false, creoFinca: true });
    expect(await listarAnimales(db)).toHaveLength(12);
    const consanguinidad = async (arete: string) => (await calcularConsanguinidad(db, (await porArete(arete)).id)).coeficiente;
    expect(await consanguinidad("EJ-10")).toBeCloseTo(0.25, 10); // hijos de hermanos completos
    expect(await consanguinidad("EJ-11")).toBeCloseTo(0.125, 10); // hijos de medios hermanos
    expect(await consanguinidad("EJ-12")).toBe(0);
    const gema = (await obtenerAnimal(db, (await porArete("EJ-12")).id))!;
    expect(gema.padreSinVerificar).toBe(true);
  });

  it("no duplica nada si se ejecuta dos veces", async () => {
    await cargarDatosDeEjemplo(db);
    expect(await cargarDatosDeEjemplo(db)).toEqual({ creados: 0, yaCargados: true, creoFinca: false });
    expect(await listarAnimales(db)).toHaveLength(12);
  });
});
