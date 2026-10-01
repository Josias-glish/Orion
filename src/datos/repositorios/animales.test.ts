import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AHORA, arete, crearAnimalDePrueba as crear, OPERARIO, PROPIETARIO } from "../ayudas-pruebas";
import { crearBaseDePrueba, type ConexionMemoria } from "../conexion-memoria";
import { ErrorDeRegistro, type Motivo } from "../errores";
import { listarCatalogo } from "./catalogos";
import { contarAnimales, eliminarAnimal, guardarAnimal, listarAnimales, obtenerAnimal } from "./animales";
import { listarHistorialAnimal } from "./historial";
import { crearLote } from "./lotes";

let db: ConexionMemoria;
beforeEach(() => {
  db = crearBaseDePrueba();
});
afterEach(() => db.cerrar());

/** Espera que la promesa falle con exactamente estos motivos. */
async function rechazaCon(promesa: Promise<unknown>, motivos: Motivo[]) {
  const error = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ErrorDeRegistro);
  expect((error as ErrorDeRegistro).motivos).toEqual(motivos);
}

async function razaId(nombre: string) {
  return (await listarCatalogo(db, "raza")).find((r) => r.nombre === nombre)!.id;
}

describe("guardarAnimal: crear", () => {
  it("crea el animal con identificadores, composición, libro y lote", async () => {
    const saanen = await razaId("Saanen");
    const alpina = await razaId("Alpina");
    const libro = (await listarCatalogo(db, "libro"))[0];
    const lote = await crearLote(db, { nombre: "Ordeño", descripcion: null }, PROPIETARIO);
    const id = await crear(db, {
      nombre: "Luna",
      fechaNacimiento: "2022-04-10",
      colorSenas: "Blanca, oreja izquierda con mancha",
      libroId: libro.id,
      loteId: lote,
      formaConcepcion: "monta_natural",
      identificadores: [arete(" AR-7 "), { tipo: "tatuaje", valor: "T-22", fecha: "2022-05-01", vigente: true, principal: false }],
      composicion: [
        { razaId: saanen, fraccion: 0.75 },
        { razaId: alpina, fraccion: 0.25 },
      ],
    });
    const animal = (await obtenerAnimal(db, id))!;
    expect(animal).toMatchObject({
      nombre: "Luna",
      sexo: "hembra",
      estado: "activo",
      enHato: true,
      libro: libro.nombre,
      lote: "Ordeño",
      formaConcepcion: "monta_natural",
    });
    expect(animal.identificadores.map((i) => [i.tipo, i.valor, i.principal])).toEqual([
      ["arete", "AR-7", true],
      ["tatuaje", "T-22", false],
    ]);
    expect(animal.composicion.map((c) => [c.raza, c.fraccion])).toEqual([
      ["Saanen", 0.75],
      ["Alpina", 0.25],
    ]);
  });

  it("CA-06: rechaza un identificador vigente que ya tiene otro animal y no guarda nada", async () => {
    await crear(db, { nombre: "Luna", identificadores: [arete("AR-7")] });
    await rechazaCon(crear(db, { nombre: "Sol", identificadores: [arete("ar-7")] }), [
      { codigo: "identificador_duplicado", tipo: "arete", valor: "ar-7", otro: "Luna" },
    ]);
    expect((await contarAnimales(db)).total).toBe(1);
  });

  it("CA-07: rechaza una composición que no suma 100 %", async () => {
    const saanen = await razaId("Saanen");
    await rechazaCon(crear(db, { nombre: "Luna", composicion: [{ razaId: saanen, fraccion: 0.5 }] }), [
      { codigo: "suma_distinta_de_100", sumaPorcentaje: 50 },
    ]);
  });

  it("CA-01: rechaza una hembra como padre y un padre nacido después, con todos los motivos", async () => {
    const brisa = await crear(db, { nombre: "Brisa", sexo: "hembra", fechaNacimiento: "2024-01-01" });
    await rechazaCon(crear(db, { nombre: "Cría", fechaNacimiento: "2023-03-01", padreId: brisa }), [
      { codigo: "padre_no_es_macho", otro: "Brisa" },
      { codigo: "padre_nacio_despues", otro: "Brisa" },
    ]);
  });

  it("exige nombre o identificador y rechaza fechas futuras o imposibles", async () => {
    await rechazaCon(crear(db, {}), [{ codigo: "sin_nombre_ni_identificador" }]);
    await rechazaCon(crear(db, { nombre: "X", fechaNacimiento: "2999-01-01" }), [
      { codigo: "fecha_futura", campo: "fechaNacimiento" },
    ]);
    await rechazaCon(crear(db, { nombre: "X", fechaNacimiento: "2023-02-30" }), [
      { codigo: "fecha_invalida", campo: "fechaNacimiento" },
    ]);
  });

  it("R14: el operario no crea animales", async () => {
    await rechazaCon(crear(db, { nombre: "Luna" }, OPERARIO), [{ codigo: "sin_permiso" }]);
  });

  it("anota en el historial cada campo creado", async () => {
    const id = await crear(db, { nombre: "Luna", identificadores: [arete("AR-7")] });
    const historial = await listarHistorialAnimal(db, id);
    expect(historial.filter((h) => h.entidad === "animal").map((h) => h.campo)).toEqual(
      expect.arrayContaining(["nombre", "sexo", "estado", "en_hato"]),
    );
    expect(historial.filter((h) => h.entidad === "identificador").map((h) => h.campo).sort()).toEqual([
      "animal_id",
      "principal",
      "tipo",
      "valor",
      "vigente",
    ]);
    expect(historial.every((h) => h.marcaTiempo === AHORA && h.valorAnterior === null)).toBe(true);
  });
});

describe("guardarAnimal: modificar", () => {
  it("CA-01: rechaza como padre a un descendiente del animal (ciclo de varias generaciones)", async () => {
    const abuelo = await crear(db, { nombre: "Abuelo", sexo: "macho" });
    const padre = await crear(db, { nombre: "Padre", sexo: "macho", padreId: abuelo });
    const nieto = await crear(db, { nombre: "Nieto", sexo: "macho", padreId: padre });
    const datos = (await obtenerAnimal(db, abuelo))!;
    await rechazaCon(guardarAnimal(db, { ...datos, padreId: nieto }, PROPIETARIO, abuelo), [
      { codigo: "padre_es_descendiente", otro: "Nieto" },
    ]);
  });

  it("rechaza cambiar el sexo de un macho que ya es padre", async () => {
    const padre = await crear(db, { nombre: "Zeus", sexo: "macho" });
    await crear(db, { nombre: "Cría", padreId: padre });
    const datos = (await obtenerAnimal(db, padre))!;
    await rechazaCon(guardarAnimal(db, { ...datos, sexo: "hembra" }, PROPIETARIO, padre), [
      { codigo: "sexo_no_coincide_con_hijos", otro: "Cría" },
    ]);
  });

  it("guarda solo lo que cambió y lo anota con el valor anterior", async () => {
    const id = await crear(db, { nombre: "Luna", identificadores: [arete("AR-7")] });
    const datos = (await obtenerAnimal(db, id))!;
    const despues = { ...PROPIETARIO, marcaTiempo: "2026-10-02T08:00:00.000Z" };
    await guardarAnimal(db, { ...datos, nombre: "Luna Blanca", estado: "vendido" }, despues, id);
    const cambios = (await listarHistorialAnimal(db, id)).filter((h) => h.marcaTiempo === despues.marcaTiempo);
    expect(cambios.map((h) => [h.campo, h.valorAnterior, h.valorNuevo]).sort()).toEqual([
      ["estado", "activo", "vendido"],
      ["nombre", "Luna", "Luna Blanca"],
    ]);
  });

  it("cambia el identificador principal sin chocar con el índice único", async () => {
    const id = await crear(db, {
      nombre: "Luna",
      identificadores: [arete("AR-7", true), { ...arete("AR-8", false), tipo: "tatuaje" }],
    });
    const datos = (await obtenerAnimal(db, id))!;
    const invertidos = datos.identificadores.map((i) => ({ ...i, principal: !i.principal }));
    await guardarAnimal(db, { ...datos, identificadores: invertidos }, PROPIETARIO, id);
    const [principal] = (await obtenerAnimal(db, id))!.identificadores;
    expect([principal.valor, principal.principal]).toEqual(["AR-8", true]);
  });

  it("retira un arete y deja libre su valor para otro animal", async () => {
    const id = await crear(db, { nombre: "Luna", identificadores: [arete("AR-7")] });
    const datos = (await obtenerAnimal(db, id))!;
    await guardarAnimal(db, { ...datos, identificadores: [{ ...datos.identificadores[0], vigente: false, principal: false }] }, PROPIETARIO, id);
    await expect(crear(db, { nombre: "Sol", identificadores: [arete("AR-7")] })).resolves.toBeTypeOf("string");
  });

  it("actualiza la composición raza por raza", async () => {
    const saanen = await razaId("Saanen");
    const alpina = await razaId("Alpina");
    const boer = await razaId("Boer");
    const id = await crear(db, { nombre: "Luna", composicion: [{ razaId: saanen, fraccion: 1 }] });
    const datos = (await obtenerAnimal(db, id))!;
    await guardarAnimal(
      db,
      { ...datos, composicion: [{ razaId: alpina, fraccion: 0.5 }, { razaId: boer, fraccion: 0.5 }] },
      PROPIETARIO,
      id,
    );
    expect((await obtenerAnimal(db, id))!.composicion.map((c) => c.raza).sort()).toEqual(["Alpina", "Boer"]);
  });

  it("R14: el operario no edita la genealogía", async () => {
    const padre = await crear(db, { nombre: "Zeus", sexo: "macho" });
    const id = await crear(db, { nombre: "Luna" });
    const datos = (await obtenerAnimal(db, id))!;
    await rechazaCon(guardarAnimal(db, { ...datos, padreId: padre }, OPERARIO, id), [{ codigo: "sin_permiso" }]);
  });
});

describe("listarAnimales (RF-07)", () => {
  beforeEach(async () => {
    const lote = await crearLote(db, { nombre: "Machos", descripcion: null }, PROPIETARIO);
    await crear(db, { nombre: "Luna", identificadores: [arete("AR-7")] });
    await crear(db, { nombre: "Zeus", sexo: "macho", loteId: lote, identificadores: [arete("AR-100")] });
    await crear(db, { nombre: "Canela", estado: "vendido" });
    await crear(db, { nombre: "Abuelo externo", sexo: "macho", enHato: false });
  });

  const nombres = async (filtro: Parameters<typeof listarAnimales>[1]) =>
    (await listarAnimales(db, filtro)).map((a) => a.nombre);

  it("lista el hato en orden alfabético y oculta los animales solo de genealogía", async () => {
    expect(await nombres({})).toEqual(["Canela", "Luna", "Zeus"]);
    expect(await nombres({ incluirSoloGenealogia: true })).toContain("Abuelo externo");
  });

  it("busca por nombre o identificador, sin distinguir mayúsculas", async () => {
    expect(await nombres({ texto: "lu" })).toEqual(["Luna"]);
    expect(await nombres({ texto: "ar-10" })).toEqual(["Zeus"]);
    expect(await nombres({ texto: "%" })).toEqual([]);
  });

  it("filtra por sexo, estado y lote", async () => {
    expect(await nombres({ sexo: "macho" })).toEqual(["Zeus"]);
    expect(await nombres({ estado: "vendido" })).toEqual(["Canela"]);
    const [lote] = await db.consultar<{ id: string }>("SELECT id FROM lote");
    expect(await nombres({ loteId: lote.id })).toEqual(["Zeus"]);
  });

  it("cuenta solo los animales activos del hato", async () => {
    expect(await contarAnimales(db)).toEqual({ total: 2, hembras: 1, machos: 1 });
  });
});

describe("eliminarAnimal", () => {
  it("es un borrado lógico que libera el identificador y queda en el historial", async () => {
    const id = await crear(db, { nombre: "Luna", identificadores: [arete("AR-7")] });
    await eliminarAnimal(db, id, PROPIETARIO);
    expect(await obtenerAnimal(db, id)).toBeNull();
    const [fila] = await db.consultar<{ n: number }>("SELECT count(*) AS n FROM animal WHERE id = ?", [id]);
    expect(fila.n).toBe(1);
    await crear(db, { nombre: "Sol", identificadores: [arete("AR-7")] });
    const eliminaciones = (await listarHistorialAnimal(db, id)).filter((h) => h.campo === "eliminado_en");
    expect(eliminaciones.map((e) => e.entidad).sort()).toEqual(["animal", "identificador"]);
  });
});

describe("historial", () => {
  it("muestra el nombre del padre en lugar de su id", async () => {
    const zeus = await crear(db, { nombre: "Zeus", sexo: "macho" });
    const id = await crear(db, { nombre: "Luna", padreId: zeus, padreSinVerificar: true });
    const padre = (await listarHistorialAnimal(db, id)).find((h) => h.campo === "padre_id");
    expect(padre?.valorNuevo).toBe("Zeus");
  });
});
