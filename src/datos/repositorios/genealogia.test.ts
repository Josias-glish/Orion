import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { crearAnimalDePrueba as crear } from "../ayudas-pruebas";
import { crearBaseDePrueba, type ConexionMemoria } from "../conexion-memoria";
import { calcularConsanguinidad, consultarAncestros, consultarArbol, consultarDescendientes } from "./genealogia";

let db: ConexionMemoria;
beforeEach(() => {
  db = crearBaseDePrueba();
});
afterEach(() => db.cerrar());

/** Tres generaciones completas; el padre de la cría está «sin verificar». */
async function tresGeneraciones() {
  const pp = await crear(db, { nombre: "Abuelo paterno", sexo: "macho", fechaNacimiento: "2016-01-01" });
  const pm = await crear(db, { nombre: "Abuela paterna", fechaNacimiento: "2016-02-01" });
  const mp = await crear(db, { nombre: "Abuelo materno", sexo: "macho", fechaNacimiento: "2016-03-01" });
  const mm = await crear(db, { nombre: "Abuela materna", fechaNacimiento: "2016-04-01" });
  const p = await crear(db, { nombre: "Padre", sexo: "macho", fechaNacimiento: "2019-01-01", padreId: pp, madreId: pm });
  const m = await crear(db, { nombre: "Madre", fechaNacimiento: "2019-02-01", padreId: mp, madreId: mm });
  const cria = await crear(db, {
    nombre: "Cría",
    fechaNacimiento: "2022-01-01",
    padreId: p,
    madreId: m,
    padreSinVerificar: true,
  });
  return { pp, pm, mp, mm, p, m, cria };
}

describe("árbol genealógico (RF-09, consulta recursiva)", () => {
  it("devuelve el animal, sus padres y abuelos con su camino, en orden", async () => {
    const ids = await tresGeneraciones();
    const arbol = await consultarArbol(db, ids.cria, 3);
    expect(arbol.map((n) => [n.camino, n.nombre])).toEqual([
      ["", "Cría"],
      ["P", "Padre"],
      ["M", "Madre"],
      ["PP", "Abuelo paterno"],
      ["PM", "Abuela paterna"],
      ["MP", "Abuelo materno"],
      ["MM", "Abuela materna"],
    ]);
  });

  it("marca el vínculo «sin verificar» en el ancestro correspondiente (RF-13)", async () => {
    const ids = await tresGeneraciones();
    const arbol = await consultarArbol(db, ids.cria, 3);
    expect(arbol.filter((n) => n.sinVerificar).map((n) => n.camino)).toEqual(["P"]);
  });

  it("un fundador no tiene ancestros y el límite de generaciones se respeta", async () => {
    const ids = await tresGeneraciones();
    expect(await consultarAncestros(db, ids.pp)).toEqual([]);
    expect((await consultarAncestros(db, ids.cria, 1)).map((n) => n.camino)).toEqual(["P", "M"]);
  });

  it("encuentra todos los descendientes", async () => {
    const ids = await tresGeneraciones();
    expect(await consultarDescendientes(db, ids.pp)).toEqual(new Set([ids.p, ids.cria]));
  });
});

describe("CA-02 con datos guardados", () => {
  async function fundadores() {
    const abuelo = await crear(db, { nombre: "Zeus", sexo: "macho", fechaNacimiento: "2016-01-01" });
    const abuela = await crear(db, { nombre: "Abril", fechaNacimiento: "2016-01-01" });
    const otra = await crear(db, { nombre: "Brisa", fechaNacimiento: "2016-01-01" });
    return { abuelo, abuela, otra };
  }

  it("hijo de hermanos completos: 25 %", async () => {
    const f = await fundadores();
    const hermano = await crear(db, { nombre: "Bruno", sexo: "macho", fechaNacimiento: "2019-01-01", padreId: f.abuelo, madreId: f.abuela });
    const hermana = await crear(db, { nombre: "Bella", fechaNacimiento: "2019-01-01", padreId: f.abuelo, madreId: f.abuela });
    const cria = await crear(db, { nombre: "Estrella", fechaNacimiento: "2021-01-01", padreId: hermano, madreId: hermana });
    const resultado = await calcularConsanguinidad(db, cria);
    expect(resultado.coeficiente).toBeCloseTo(0.25, 10);
    expect(resultado.incluyeSinVerificar).toBe(false);
  });

  it("hijo de medios hermanos: 12,5 %, avisando si hay vínculos sin verificar", async () => {
    const f = await fundadores();
    const medio = await crear(db, { nombre: "Cacique", sexo: "macho", fechaNacimiento: "2019-01-01", padreId: f.abuelo, madreId: f.abuela });
    const media = await crear(db, {
      nombre: "Dalia",
      fechaNacimiento: "2019-01-01",
      padreId: f.abuelo,
      madreId: f.otra,
      madreSinVerificar: true,
    });
    const cria = await crear(db, { nombre: "Faro", sexo: "macho", fechaNacimiento: "2021-01-01", padreId: medio, madreId: media });
    const resultado = await calcularConsanguinidad(db, cria);
    expect(resultado.coeficiente).toBeCloseTo(0.125, 10);
    expect(resultado.incluyeSinVerificar).toBe(true);
  });
});
