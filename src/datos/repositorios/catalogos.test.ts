import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { crearAnimalDePrueba, OPERARIO, PROPIETARIO } from "../ayudas-pruebas";
import { crearBaseDePrueba, type ConexionMemoria } from "../conexion-memoria";
import { ErrorDeRegistro } from "../errores";
import { actualizarElemento, crearElemento, listarCatalogo } from "./catalogos";
import { actualizarLote, crearLote, listarLotes, retirarLote } from "./lotes";

let db: ConexionMemoria;
beforeEach(() => {
  db = crearBaseDePrueba();
});
afterEach(() => db.cerrar());

const codigos = (promesa: Promise<unknown>) =>
  promesa.then(
    () => [],
    (e: unknown) => (e instanceof ErrorDeRegistro ? e.motivos.map((m) => m.codigo) : [String(e)]),
  );

describe("catálogos de razas y libros (RF-04)", () => {
  it("agrega, renombra y desactiva sin borrar", async () => {
    const id = await crearElemento(db, "raza", "Murciano-granadina", PROPIETARIO);
    await actualizarElemento(db, "raza", id, { nombre: "Murciano Granadina", activo: false }, PROPIETARIO);
    expect((await listarCatalogo(db, "raza")).find((r) => r.id === id)).toEqual({
      id,
      nombre: "Murciano Granadina",
      activo: false,
    });
    expect((await listarCatalogo(db, "raza", { soloActivos: true })).some((r) => r.id === id)).toBe(false);
    expect(await listarCatalogo(db, "raza", { soloActivos: true })).toHaveLength(7);
  });

  it("no admite nombres repetidos y el operario no puede editarlos", async () => {
    expect(await codigos(crearElemento(db, "libro", "mestizo", PROPIETARIO))).toEqual(["nombre_duplicado"]);
    expect(await codigos(crearElemento(db, "raza", "Nueva", OPERARIO))).toEqual(["sin_permiso"]);
  });
});

describe("lotes (RF-05)", () => {
  it("crea, cuenta animales, renombra y solo retira lotes vacíos", async () => {
    const id = await crearLote(db, { nombre: "Levante", descripcion: "Crías destetadas" }, PROPIETARIO);
    const animal = await crearAnimalDePrueba(db, { nombre: "Luna", loteId: id });
    await actualizarLote(db, id, { nombre: "Levante 2026", descripcion: null }, PROPIETARIO);
    expect(await listarLotes(db)).toEqual([{ id, nombre: "Levante 2026", descripcion: null, animales: 1 }]);
    expect(await codigos(retirarLote(db, id, PROPIETARIO))).toEqual(["lote_con_animales"]);
    await db.ejecutar("UPDATE animal SET lote_id = NULL WHERE id = ?", [animal]);
    await retirarLote(db, id, PROPIETARIO);
    expect(await listarLotes(db)).toEqual([]);
  });
});
