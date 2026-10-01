import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { crearBaseDePrueba, type ConexionMemoria } from "../conexion-memoria";
import { ErrorDeRegistro, type ContextoCambio } from "../conexion";
import {
  consultarAncestros,
  contarAnimales,
  crearAnimal,
  eliminarAnimal,
  listarAnimales,
  type NuevoAnimal,
} from "./animales";

const contexto: ContextoCambio = { usuarioId: null, marcaTiempo: "2026-10-01T12:00:00.000Z" };

let db: ConexionMemoria;
beforeEach(() => {
  db = crearBaseDePrueba();
});
afterEach(() => db.cerrar());

const crear = (datos: Partial<NuevoAnimal> & Pick<NuevoAnimal, "nombre" | "sexo">) =>
  crearAnimal(db, { fechaNacimiento: null, ...datos }, contexto);

describe("crearAnimal", () => {
  it("crea el animal con su identificador principal", async () => {
    const id = await crear({ nombre: "Luna", sexo: "hembra", identificador: { tipo: "arete", valor: " AR-7 " } });
    const [animal] = await listarAnimales(db);
    expect(animal).toMatchObject({
      id,
      nombre: "Luna",
      sexo: "hembra",
      estado: "activo",
      tipoIdentificador: "arete",
      identificador: "AR-7",
    });
  });

  it("anota cada campo creado en el historial", async () => {
    const id = await crear({ nombre: "Luna", sexo: "hembra", identificador: { tipo: "arete", valor: "AR-7" } });
    const historial = await db.consultar<{ entidad: string; campo: string; valor_nuevo: string }>(
      "SELECT entidad, campo, valor_nuevo FROM historial_cambios WHERE registro_id = ? ORDER BY campo",
      [id],
    );
    expect(historial).toEqual([
      { entidad: "animal", campo: "nombre", valor_nuevo: "Luna" },
      { entidad: "animal", campo: "sexo", valor_nuevo: "hembra" },
    ]);
    const deIdentificador = await db.consultar<{ campo: string }>(
      "SELECT campo FROM historial_cambios WHERE entidad = 'identificador'",
    );
    expect(deIdentificador.map((h) => h.campo).sort()).toEqual(["animal_id", "principal", "tipo", "valor", "vigente"]);
  });

  it("rechaza un identificador repetido sin dejar el animal a medias (CA-06)", async () => {
    await crear({ nombre: "Luna", sexo: "hembra", identificador: { tipo: "arete", valor: "AR-7" } });
    await expect(
      crear({ nombre: "Sol", sexo: "hembra", identificador: { tipo: "arete", valor: "ar-7" } }),
    ).rejects.toBeInstanceOf(ErrorDeRegistro);
    expect(await contarAnimales(db)).toBe(1);
  });
});

describe("consultarAncestros (consulta recursiva)", () => {
  /** Tres generaciones completas: devuelve los ids por parentesco. */
  async function tresGeneraciones() {
    const pp = await crear({ nombre: "Abuelo paterno", sexo: "macho", identificador: { tipo: "arete", valor: "PP" } });
    const pm = await crear({ nombre: "Abuela paterna", sexo: "hembra" });
    const mp = await crear({ nombre: "Abuelo materno", sexo: "macho" });
    const mm = await crear({ nombre: "Abuela materna", sexo: "hembra" });
    const p = await crear({ nombre: "Padre", sexo: "macho", padreId: pp, madreId: pm });
    const m = await crear({ nombre: "Madre", sexo: "hembra", padreId: mp, madreId: mm });
    const cria = await crear({ nombre: "Cría", sexo: "hembra", padreId: p, madreId: m });
    return { pp, pm, mp, mm, p, m, cria };
  }

  it("devuelve padres y abuelos con su parentesco, en orden", async () => {
    const ids = await tresGeneraciones();
    const ancestros = await consultarAncestros(db, ids.cria);
    expect(ancestros.map((a) => [a.camino, a.generacion, a.nombre])).toEqual([
      ["P", 1, "Padre"],
      ["M", 1, "Madre"],
      ["PP", 2, "Abuelo paterno"],
      ["PM", 2, "Abuela paterna"],
      ["MP", 2, "Abuelo materno"],
      ["MM", 2, "Abuela materna"],
    ]);
    expect(ancestros.find((a) => a.camino === "PP")?.identificador).toBe("PP");
  });

  it("un fundador no tiene ancestros", async () => {
    const ids = await tresGeneraciones();
    expect(await consultarAncestros(db, ids.pp)).toEqual([]);
  });

  it("respeta el límite de generaciones", async () => {
    const ids = await tresGeneraciones();
    const soloPadres = await consultarAncestros(db, ids.cria, 1);
    expect(soloPadres.map((a) => a.camino)).toEqual(["P", "M"]);
  });

  it("recorre más de tres generaciones", async () => {
    const ids = await tresGeneraciones();
    const nieta = await crear({ nombre: "Nieta", sexo: "hembra", madreId: ids.cria });
    const ancestros = await consultarAncestros(db, nieta);
    expect(ancestros).toHaveLength(7);
    expect(ancestros.at(-1)?.camino).toBe("MMM");
  });

  it("con un padre desconocido devuelve solo la línea conocida", async () => {
    const madre = await crear({ nombre: "Madre", sexo: "hembra" });
    const cria = await crear({ nombre: "Cría", sexo: "macho", madreId: madre });
    expect((await consultarAncestros(db, cria)).map((a) => a.camino)).toEqual(["M"]);
  });

  it("un ancestro eliminado corta su rama", async () => {
    const ids = await tresGeneraciones();
    await eliminarAnimal(db, ids.p, contexto);
    const caminos = (await consultarAncestros(db, ids.cria)).map((a) => a.camino);
    expect(caminos).toEqual(["M", "MP", "MM"]);
  });

  it("termina aunque los datos tengan un ciclo", async () => {
    const a = await crear({ nombre: "A", sexo: "macho" });
    const b = await crear({ nombre: "B", sexo: "macho", padreId: a });
    // Ciclo forzado directamente en la base; el dominio lo impedirá en la Etapa 3 (R1).
    await db.ejecutar("UPDATE animal SET padre_id = ? WHERE id = ?", [b, a]);
    const ancestros = await consultarAncestros(db, b, 6);
    expect(ancestros).toHaveLength(6);
  });
});

describe("eliminarAnimal", () => {
  it("es un borrado lógico que libera el identificador y queda en el historial", async () => {
    const id = await crear({ nombre: "Luna", sexo: "hembra", identificador: { tipo: "arete", valor: "AR-7" } });
    await eliminarAnimal(db, id, contexto);
    expect(await contarAnimales(db)).toBe(0);
    const [fila] = await db.consultar<{ n: number }>("SELECT count(*) AS n FROM animal WHERE id = ?", [id]);
    expect(fila.n).toBe(1);
    await crear({ nombre: "Sol", sexo: "hembra", identificador: { tipo: "arete", valor: "AR-7" } });
    const eliminaciones = await db.consultar<{ entidad: string }>(
      "SELECT entidad FROM historial_cambios WHERE campo = 'eliminado_en' ORDER BY entidad",
    );
    expect(eliminaciones.map((e) => e.entidad)).toEqual(["animal", "identificador"]);
  });
});
