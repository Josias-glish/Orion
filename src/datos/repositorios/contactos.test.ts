// Contactos (especificación 2, sección 6 y R28): propietarios de animales de otras fincas. Escritas antes del código.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PROPIETARIO } from "../ayudas-pruebas";
import { crearBaseDePrueba, type ConexionMemoria } from "../conexion-memoria";
import { ErrorDeRegistro } from "../errores";
import { animalExternoVacio, guardarAnimal } from "./animales";
import { contactoVacio, guardarContacto, listarContactos, obtenerContacto, retirarContacto } from "./contactos";
import { listarHistorialEntidad } from "./historial";

let db: ConexionMemoria;
beforeEach(() => {
  db = crearBaseDePrueba();
});
afterEach(() => db.cerrar());

const codigos = (p: Promise<unknown>) =>
  p.then(
    () => [],
    (e: unknown) => (e instanceof ErrorDeRegistro ? e.motivos.map((m) => m.codigo) : [String(e)]),
  );

describe("contactos (R28: solo los datos mínimos)", () => {
  it("solo el nombre es obligatorio", async () => {
    expect(await codigos(guardarContacto(db, contactoVacio(), PROPIETARIO))).toEqual(["dato_obligatorio"]);
    const id = await guardarContacto(db, { ...contactoVacio(), nombre: "  Ramiro Ejemplo " }, PROPIETARIO);
    expect(await obtenerContacto(db, id)).toMatchObject({
      nombre: "Ramiro Ejemplo",
      criadero: null,
      municipio: null,
      telefono: null,
      correo: null,
      notas: null,
    });
  });

  it("revisa que el correo tenga forma de correo", async () => {
    expect(await codigos(guardarContacto(db, { ...contactoVacio(), nombre: "Ana", correo: "ana-sin-arroba" }, PROPIETARIO))).toEqual([
      "correo_invalido",
    ]);
    expect(await codigos(guardarContacto(db, { ...contactoVacio(), nombre: "Ana", correo: "ana@ejemplo.co" }, PROPIETARIO))).toEqual([]);
  });

  it("edita los datos y deja cada cambio en el historial", async () => {
    const id = await guardarContacto(db, { ...contactoVacio(), nombre: "Ramiro" }, PROPIETARIO);
    await guardarContacto(db, { ...contactoVacio(), nombre: "Ramiro", criadero: "Hato El Roble", telefono: "300 000 0000" }, PROPIETARIO, id);
    expect(await obtenerContacto(db, id)).toMatchObject({ criadero: "Hato El Roble", telefono: "300 000 0000" });
    const historial = await listarHistorialEntidad(db, "contacto", id);
    expect(historial.map((h) => h.campo).sort()).toEqual(expect.arrayContaining(["criadero", "telefono"]));
  });

  it("lista los contactos con cuántos animales tienen", async () => {
    const roble = await guardarContacto(db, { ...contactoVacio(), nombre: "Ramiro", criadero: "Hato El Roble" }, PROPIETARIO);
    await guardarContacto(db, { ...contactoVacio(), nombre: "Ana" }, PROPIETARIO);
    await guardarAnimal(db, { ...animalExternoVacio(), nombre: "Titán", sexo: "macho", contactoId: roble }, PROPIETARIO);
    expect((await listarContactos(db)).map((c) => [c.nombre, c.animales])).toEqual([
      ["Ana", 0],
      ["Ramiro", 1],
    ]);
  });

  it("no retira un contacto que es propietario de algún animal; uno sin animales sí (borrado lógico)", async () => {
    const roble = await guardarContacto(db, { ...contactoVacio(), nombre: "Ramiro" }, PROPIETARIO);
    const ana = await guardarContacto(db, { ...contactoVacio(), nombre: "Ana" }, PROPIETARIO);
    await guardarAnimal(db, { ...animalExternoVacio(), nombre: "Titán", sexo: "macho", contactoId: roble }, PROPIETARIO);
    expect(await codigos(retirarContacto(db, roble, PROPIETARIO))).toEqual(["contacto_en_uso"]);
    await retirarContacto(db, ana, PROPIETARIO);
    expect((await listarContactos(db)).map((c) => c.nombre)).toEqual(["Ramiro"]);
    const [fila] = await db.consultar<{ eliminado_en: string | null }>("SELECT eliminado_en FROM contacto WHERE id = ?", [ana]);
    expect(fila.eliminado_en).not.toBeNull();
  });
});
