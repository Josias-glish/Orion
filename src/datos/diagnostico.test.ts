import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { crearBaseDePrueba, type ConexionMemoria } from "./conexion-memoria";
import type { ContextoCambio } from "./conexion";
import {
  consultarEstado,
  crearAnimalDePrueba,
  crearTresGeneraciones,
  listarAnimalesDePrueba,
  retirarDatosDePrueba,
} from "./diagnostico";
import { consultarAncestros } from "./repositorios/animales";

const contexto: ContextoCambio = { usuarioId: null, marcaTiempo: "2026-10-01T12:00:00.000Z" };

let db: ConexionMemoria;
beforeEach(() => {
  db = crearBaseDePrueba();
});
afterEach(() => db.cerrar());

describe("pantalla de diagnóstico (Etapa 1)", () => {
  it("informa el estado de la base", async () => {
    const estado = await consultarEstado(db);
    expect(estado).toMatchObject({ clavesForaneasActivas: true, razas: 7, libros: 5, animales: 0 });
    expect(estado.versionSqlite).toMatch(/^3\.\d+\.\d+$/);
  });

  it("a) crea un animal con su identificador", async () => {
    await crearAnimalDePrueba(db, contexto);
    const [animal] = await listarAnimalesDePrueba(db);
    expect(animal.nombre).toBe("Prueba 1");
    expect(animal.identificador).toMatch(/^DIAG-[0-9A-F]{8}$/);
  });

  it("b) y c) crea tres generaciones y encuentra los seis ancestros de la cría", async () => {
    const cria = await crearTresGeneraciones(db, contexto);
    expect(await listarAnimalesDePrueba(db)).toHaveLength(7);
    const ancestros = await consultarAncestros(db, cria);
    expect(ancestros.map((a) => a.nombre)).toEqual([
      "Padre 1",
      "Madre 1",
      "Abuelo paterno 1",
      "Abuela paterna 1",
      "Abuelo materno 1",
      "Abuela materna 1",
    ]);
  });

  it("numera cada serie de tres generaciones", async () => {
    await crearTresGeneraciones(db, contexto);
    const segunda = await crearTresGeneraciones(db, contexto);
    const ancestros = await consultarAncestros(db, segunda);
    expect(ancestros[0].nombre).toBe("Padre 2");
  });

  it("retira los datos de prueba con borrado lógico", async () => {
    await crearAnimalDePrueba(db, contexto);
    await crearTresGeneraciones(db, contexto);
    expect(await retirarDatosDePrueba(db, contexto)).toBe(8);
    expect(await listarAnimalesDePrueba(db)).toHaveLength(0);
    const [fila] = await db.consultar<{ n: number }>("SELECT count(*) AS n FROM animal");
    expect(fila.n).toBe(8);
  });
});
