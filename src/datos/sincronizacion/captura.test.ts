import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AHORA, arete, crearAnimalDePrueba, PROPIETARIO } from "../ayudas-pruebas";
import { Cambios } from "../cambios";
import { crearBaseDePrueba, type ConexionMemoria } from "../conexion-memoria";
import { ErrorDeRegistro } from "../errores";
import { guardarAnimal, animalVacio } from "../repositorios/animales";
import { fijarReloj } from "./contexto";
import { leerEstado, CLAVES } from "./estado";
import { leerCola, vincularParaPruebas, type EquipoDePrueba } from "./ayudas-pruebas";
import { leerMarcas } from "./marcas";
import { compararMarcas, leerMarca, codigoDeDispositivo } from "../../dominio/sincronizacion/hlc";

let db: ConexionMemoria;
beforeEach(() => {
  db = crearBaseDePrueba();
  fijarReloj(db, { ahoraMs: () => Date.parse("2026-10-02T12:00:00.000Z") });
});
afterEach(() => db.cerrar());

const contar = async (tabla: string): Promise<number> => (await db.consultar<{ n: number }>(`SELECT count(*) AS n FROM ${tabla}`))[0].n;

describe("captura de cambios (R15)", () => {
  it("un equipo sin vincular no escribe nada en la cola ni en las marcas", async () => {
    await crearAnimalDePrueba(db, { nombre: "Luna", identificadores: [arete("A1")] });
    expect(await contar("cola_cambios")).toBe(0);
    expect(await contar("marca_registro")).toBe(0);
    const [h] = await db.consultar<{ marca: string | null; dispositivo_id: string | null }>("SELECT marca, dispositivo_id FROM historial_cambios LIMIT 1");
    expect(h).toEqual({ marca: null, dispositivo_id: null });
  });

  it("un equipo vinculado deja cada operación en la cola, con un grupo y una marca por guardado", async () => {
    const equipo = await vincularParaPruebas(db);
    const id = await crearAnimalDePrueba(db, { nombre: "Luna", identificadores: [arete("A1")] });
    const cola = await leerCola(db);
    expect(cola.map((c) => `${c.entidad}:${c.operacion}`)).toEqual(["animal:crear", "identificador:crear"]);
    expect(new Set(cola.map((c) => c.grupo_id)).size).toBe(1);
    expect(new Set(cola.map((c) => c.marca)).size).toBe(1);
    expect(cola.map((c) => c.orden)).toEqual([0, 1]);
    expect(cola.every((c) => c.dispositivo_id === equipo.dispositivoId && c.enviado === 0)).toBe(true);
    expect(cola[0].registro_id).toBe(id);
    expect(leerMarca(cola[0].marca)?.dispositivo).toBe(codigoDeDispositivo(equipo.dispositivoId));
  });

  it("un `crear` lleva todos los valores de la fila, con los valores por defecto, y nunca el PIN ni modificado_en", async () => {
    await vincularParaPruebas(db);
    await crearAnimalDePrueba(db, { nombre: "Luna" });
    const [animal] = (await leerCola(db)).filter((c) => c.entidad === "animal");
    const campos = JSON.parse(animal.campos!) as Record<string, unknown>;
    expect(campos).toMatchObject({ nombre: "Luna", sexo: "hembra", en_hato: 1, estado: "activo", eliminado_en: null });
    expect(campos).not.toHaveProperty("modificado_en");
    expect(campos).not.toHaveProperty("id");

    const cambios = new Cambios(PROPIETARIO);
    cambios.insertar("usuario", { nombre: "Ana", rol: "operario", pin_hash: "pbkdf2-sha256$1$a$b", contacto: null, eliminado_en: null });
    await cambios.aplicar(db);
    const usuario = (await leerCola(db)).find((c) => c.entidad === "usuario")!;
    expect(JSON.parse(usuario.campos!)).not.toHaveProperty("pin_hash");
    expect(JSON.parse(usuario.campos!)).not.toHaveProperty("pin_pendiente");
    expect(usuario.campos).not.toContain("pbkdf2");
  });

  it("un `modificar` lleva solo los campos que cambiaron y no se vuelve a pasar el PIN", async () => {
    const id = await crearAnimalDePrueba(db, { nombre: "Luna", colorSenas: "negra" });
    await vincularParaPruebas(db);
    const cambios = new Cambios(PROPIETARIO);
    cambios.actualizar("animal", id, { nombre: "Luna", color_senas: "negra" }, { nombre: "Luna II", color_senas: "negra" });
    await cambios.aplicar(db);
    const [fila] = await leerCola(db);
    expect(fila).toMatchObject({ entidad: "animal", operacion: "modificar", registro_id: id });
    expect(JSON.parse(fila.campos!)).toEqual({ nombre: "Luna II" });

    const solo = new Cambios(PROPIETARIO);
    solo.actualizar("usuario", "x", { pin_hash: null }, { pin_hash: "pbkdf2-sha256$1$a$b" });
    await solo.aplicar(db).catch(() => undefined); // la fila no existe: lo que importa es que no entre nada a la cola
    expect((await leerCola(db)).length).toBe(1);
  });

  it("un borrado lógico entra como `eliminar` con la hora del borrado", async () => {
    const id = await crearAnimalDePrueba(db, { nombre: "Luna" });
    await vincularParaPruebas(db);
    const cambios = new Cambios(PROPIETARIO);
    cambios.eliminar("animal", id);
    await cambios.aplicar(db);
    const [fila] = await leerCola(db);
    expect(fila.operacion).toBe("eliminar");
    expect(JSON.parse(fila.campos!)).toEqual({ eliminado_en: AHORA });
  });

  it("si el lote falla, no queda nada en la cola ni en las marcas (misma transacción)", async () => {
    await vincularParaPruebas(db);
    const cambios = new Cambios(PROPIETARIO);
    cambios.insertar("lote", { nombre: "Ordeño", descripcion: null, eliminado_en: null });
    cambios.insertar("lote", { nombre: "ordeño", descripcion: null, eliminado_en: null });
    await expect(cambios.aplicar(db)).rejects.toThrow(/UNIQUE/);
    expect(await contar("cola_cambios")).toBe(0);
    expect(await contar("marca_registro")).toBe(0);
    expect((await leerEstado(db, [CLAVES.marcaUltima]))[CLAVES.marcaUltima] ?? null).toBeNull();
  });

  it("las marcas nunca retroceden, aunque el reloj del sistema esté detenido o atrasado", async () => {
    await vincularParaPruebas(db);
    for (const nombre of ["A", "B", "C"]) await crearAnimalDePrueba(db, { nombre });
    fijarReloj(db, { ahoraMs: () => Date.parse("2020-01-01T00:00:00.000Z") });
    await crearAnimalDePrueba(db, { nombre: "D" });
    const marcas = (await leerCola(db)).map((c) => c.marca);
    expect(marcas).toHaveLength(4);
    for (let i = 1; i < marcas.length; i++) expect(compararMarcas(marcas[i - 1], marcas[i])).toBe(-1);
    const estado = await leerEstado(db, [CLAVES.marcaUltima]);
    expect(estado[CLAVES.marcaUltima]).toBe(marcas[3]);
  });

  it("la hora de la marca usa el desfase medido contra el servidor", async () => {
    await vincularParaPruebas(db, { desfaseMs: 2 * 24 * 3600 * 1000 });
    await crearAnimalDePrueba(db, { nombre: "Luna" });
    const [fila] = await leerCola(db);
    expect(fila.marca.startsWith("2026-10-04T12:00:00.000Z")).toBe(true);
  });

  it("guarda las marcas de cada campo: un campo corregido después tiene una marca posterior a la base", async () => {
    const id = await crearAnimalDePrueba(db, { nombre: "Luna", colorSenas: "negra" });
    await vincularParaPruebas(db);
    // El animal existía antes de vincular: sin marcas, el primer cambio las crea para todos los campos.
    const cambios = new Cambios(PROPIETARIO);
    cambios.actualizar("animal", id, { nombre: "Luna" }, { nombre: "Luna II" });
    await cambios.aplicar(db);
    const cambios2 = new Cambios(PROPIETARIO);
    cambios2.actualizar("animal", id, { color_senas: "negra" }, { color_senas: "blanca" });
    await cambios2.aplicar(db);
    const [registro] = (await leerMarcas(db, "animal", [id])).values();
    expect(Object.keys(registro.marcas.campos).sort()).toEqual(["color_senas", "nombre"]);
    expect(compararMarcas(registro.marcas.campos.nombre, registro.marcas.campos.color_senas)).toBe(-1);
    expect(compararMarcas(registro.marcas.base, registro.marcas.campos.nombre)).toBe(-1);
  });

  it("el historial de un equipo vinculado lleva la marca y el equipo de cada cambio", async () => {
    const equipo = await vincularParaPruebas(db);
    await crearAnimalDePrueba(db, { nombre: "Luna" });
    const filas = await db.consultar<{ marca: string | null; dispositivo_id: string | null; aplicado: number }>(
      "SELECT marca, dispositivo_id, aplicado FROM historial_cambios",
    );
    expect(filas.length).toBeGreaterThan(0);
    expect(filas.every((f) => f.marca !== null && f.dispositivo_id === equipo.dispositivoId && f.aplicado === 1)).toBe(true);
  });

  it("contacto (R28) no entra en la cola", async () => {
    await vincularParaPruebas(db);
    const cambios = new Cambios(PROPIETARIO);
    cambios.insertar("contacto", { nombre: "Vecino", telefono: null, correo: null, rol: "comprador", eliminado_en: null });
    await cambios.aplicar(db).catch(() => undefined);
    expect((await leerCola(db)).filter((c) => c.entidad === "contacto")).toEqual([]);
  });

  it("R31: un cambio que toca el número, la versión o el contador de un libro no se puede hacer sin servidor", async () => {
    await vincularParaPruebas(db);
    const animal = await crearAnimalDePrueba(db, { nombre: "Luna" });
    const emitido = new Cambios(PROPIETARIO);
    emitido.insertar("registro_genealogico", { animal_id: animal, fecha_registro: "2026-10-01", estado: "emitido", eliminado_en: null });
    await expect(emitido.aplicar(db)).rejects.toBeInstanceOf(ErrorDeRegistro);

    const contador = new Cambios(PROPIETARIO);
    contador.actualizar("libro", "0f42cb9a-2ddf-4c82-840b-547defbf17cd", { siguiente_numero: 1 }, { siguiente_numero: 9 });
    await expect(contador.aplicar(db)).rejects.toMatchObject({ motivos: [{ codigo: "requiere_servidor" }] });

    // Un borrador sí: no tiene número.
    const borrador = new Cambios(PROPIETARIO);
    borrador.insertar("registro_genealogico", { animal_id: animal, fecha_registro: "2026-10-01", eliminado_en: null });
    await borrador.aplicar(db);
    const campos = JSON.parse((await leerCola(db)).find((c) => c.entidad === "registro_genealogico")!.campos!);
    expect(campos).not.toHaveProperty("numero");
    expect(campos).not.toHaveProperty("consecutivo");
  });

  it("un guardado grande se parte en grupos que el servidor acepta", async () => {
    await vincularParaPruebas(db);
    const cambios = new Cambios(PROPIETARIO);
    for (let i = 0; i < 900; i++) cambios.insertar("lote", { nombre: `Lote ${i}`, descripcion: null, eliminado_en: null });
    await cambios.aplicar(db);
    const cola = await leerCola(db);
    const porGrupo = new Map<string, number>();
    for (const c of cola) porGrupo.set(c.grupo_id, (porGrupo.get(c.grupo_id) ?? 0) + 1);
    expect([...porGrupo.values()].sort((a, b) => b - a)).toEqual([400, 400, 100]);
  });

  it("dos guardados que se piden a la vez no se reparten la misma marca", async () => {
    await vincularParaPruebas(db);
    await Promise.all([crearAnimalDePrueba(db, { nombre: "A" }), crearAnimalDePrueba(db, { nombre: "B" })]);
    const marcas = (await leerCola(db)).map((c) => c.marca);
    expect(new Set(marcas).size).toBe(marcas.length);
  });

  it("guardarAnimal sigue funcionando igual en un equipo vinculado (varias filas, un solo grupo)", async () => {
    await vincularParaPruebas(db);
    await guardarAnimal(db, { ...animalVacio(), nombre: "Luna", identificadores: [arete("X1")] }, PROPIETARIO);
    expect(await contar("animal")).toBe(1);
    expect((await leerCola(db)).length).toBe(2);
  });
});

export type { EquipoDePrueba };
