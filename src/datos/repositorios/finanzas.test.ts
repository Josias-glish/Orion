// Etapa 8 (especificación 2): RF-33, RF-34, R19, R23 y CA-22 con la base de datos.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CATEGORIA_MONTAS_ID } from "../../dominio/finanzas";
import { arete, crearAnimalDePrueba as crear, OPERARIO, PROPIETARIO } from "../ayudas-pruebas";
import { crearBaseDePrueba, type ConexionMemoria } from "../conexion-memoria";
import { ErrorDeRegistro } from "../errores";
import { animalExternoVacio, guardarAnimal } from "./animales";
import { guardarContacto } from "./contactos";
import {
  actualizarCategoria,
  actualizarMovimiento,
  crearCategoria,
  crearGastoDeServicio,
  listarCategorias,
  listarMovimientos,
  registrarMovimiento,
  resumenFinanciero,
  retirarMovimiento,
  serviciosConGasto,
  type DatosMovimientoNuevo,
} from "./finanzas";
import { crearLote } from "./lotes";
import { registrarServicio } from "./reproduccion";

let db: ConexionMemoria;
let ana: string;
let beto: string;
let cora: string;
let titan: string;
let ordeno: string;
let crias: string;
const categorias: Record<string, string> = {};

beforeEach(async () => {
  db = crearBaseDePrueba();
  ordeno = await crearLote(db, { nombre: "Ordeño", descripcion: null }, PROPIETARIO);
  crias = await crearLote(db, { nombre: "Crías", descripcion: null }, PROPIETARIO);
  ana = await crear(db, { nombre: "Ana", fechaNacimiento: "2021-01-01", identificadores: [arete("A-1")], loteId: ordeno });
  beto = await crear(db, { nombre: "Beto", fechaNacimiento: "2021-01-01", identificadores: [arete("B-1")], loteId: ordeno });
  cora = await crear(db, { nombre: "Cora", fechaNacimiento: "2021-01-01", identificadores: [arete("C-1")] });
  const duenio = await guardarContacto(
    db,
    { nombre: "Ramiro Ejemplo", criadero: "Hato El Roble", municipio: "San Gil", telefono: null, correo: null, notas: null },
    PROPIETARIO,
  );
  titan = await guardarAnimal(
    db,
    { ...animalExternoVacio(), nombre: "Titán", sexo: "macho", fechaNacimiento: "2019-05-10", contactoId: duenio },
    PROPIETARIO,
  );
  for (const c of await listarCategorias(db)) categorias[c.nombre] = c.id;
});
afterEach(() => db.cerrar());

const codigos = (p: Promise<unknown>) =>
  p.then(
    () => [],
    (e: unknown) => (e instanceof ErrorDeRegistro ? e.motivos.map((m) => m.codigo) : [String(e)]),
  );

const gasto = (datos: Partial<DatosMovimientoNuevo> = {}): DatosMovimientoNuevo => ({
  fecha: "2026-02-01",
  tipo: "gasto",
  categoriaId: categorias["Alimento"],
  valor: 100_000,
  animalId: null,
  loteId: null,
  descripcion: null,
  ...datos,
});
const ingreso = (datos: Partial<DatosMovimientoNuevo> = {}): DatosMovimientoNuevo =>
  gasto({ tipo: "ingreso", categoriaId: categorias["Venta de leche"], ...datos });

describe("categorías (RF-33: catálogo editable)", () => {
  it("la migración precarga las cinco categorías pedidas y «Montas y pajillas»", async () => {
    expect((await listarCategorias(db)).map((c) => [c.nombre, c.tipo, c.activo])).toEqual([
      ["Alimento", "gasto", true],
      ["Mano de obra", "gasto", true],
      ["Medicamentos", "gasto", true],
      ["Montas y pajillas", "gasto", true],
      ["Venta de animales", "ingreso", true],
      ["Venta de leche", "ingreso", true],
    ]);
    expect(categorias["Montas y pajillas"]).toBe(CATEGORIA_MONTAS_ID);
  });

  it("se pueden filtrar por tipo y solo activas", async () => {
    expect((await listarCategorias(db, { tipo: "ingreso" })).map((c) => c.nombre)).toEqual(["Venta de animales", "Venta de leche"]);
    await actualizarCategoria(db, categorias["Alimento"], { nombre: "Alimento", activo: false }, PROPIETARIO);
    expect((await listarCategorias(db, { tipo: "gasto", soloActivas: true })).map((c) => c.nombre)).not.toContain("Alimento");
  });

  it("crea categorías nuevas; el mismo nombre se permite en otro tipo, pero no dos veces en el mismo", async () => {
    await crearCategoria(db, { nombre: "Otros", tipo: "gasto" }, PROPIETARIO);
    await crearCategoria(db, { nombre: "Otros", tipo: "ingreso" }, PROPIETARIO);
    expect(await codigos(crearCategoria(db, { nombre: " otros ", tipo: "gasto" }, PROPIETARIO))).toEqual(["nombre_duplicado"]);
    expect(await codigos(crearCategoria(db, { nombre: "  ", tipo: "gasto" }, PROPIETARIO))).toEqual(["dato_obligatorio"]);
  });

  it("renombra y desactiva, y el tipo no cambia; queda en el historial", async () => {
    await actualizarCategoria(db, categorias["Alimento"], { nombre: "Concentrado y forraje", activo: true }, PROPIETARIO);
    expect((await listarCategorias(db)).find((c) => c.id === categorias["Alimento"])).toMatchObject({ nombre: "Concentrado y forraje", tipo: "gasto" });
    const historial = await db.consultar("SELECT campo, valor_anterior, valor_nuevo FROM historial_cambios WHERE registro_id = ?", [categorias["Alimento"]]);
    expect(historial).toEqual([{ campo: "nombre", valor_anterior: "Alimento", valor_nuevo: "Concentrado y forraje" }]);
    expect(await codigos(actualizarCategoria(db, categorias["Medicamentos"], { nombre: "mano de obra", activo: true }, PROPIETARIO))).toEqual(["nombre_duplicado"]);
  });

  it("R23: el operario no crea ni edita categorías", async () => {
    await expect(crearCategoria(db, { nombre: "Otros", tipo: "gasto" }, OPERARIO)).rejects.toThrow(/sin_permiso/);
    await expect(actualizarCategoria(db, categorias["Alimento"], { nombre: "X", activo: true }, OPERARIO)).rejects.toThrow(/sin_permiso/);
  });
});

describe("movimientos (RF-33)", () => {
  it("registra un gasto general, uno de un lote, uno de un animal y un ingreso", async () => {
    await registrarMovimiento(db, gasto({ descripcion: "Sal mineral" }), PROPIETARIO);
    await registrarMovimiento(db, gasto({ loteId: ordeno, valor: 1_000_000 }), PROPIETARIO);
    await registrarMovimiento(db, gasto({ animalId: ana, categoriaId: categorias["Medicamentos"], valor: 60_000 }), PROPIETARIO);
    await registrarMovimiento(db, ingreso({ valor: 2_500_000 }), PROPIETARIO);
    const lista = await listarMovimientos(db);
    expect(lista).toHaveLength(4);
    expect(lista.find((m) => m.animalId === ana)).toMatchObject({ tipo: "gasto", categoria: "Medicamentos", animal: "Ana", lote: null, valor: 60_000 });
    expect(lista.find((m) => m.loteId === ordeno)).toMatchObject({ lote: "Ordeño", animal: null });
    expect(lista.find((m) => m.descripcion === "Sal mineral")).toMatchObject({ animal: null, lote: null, categoria: "Alimento" });
  });

  it("rechaza lo que no cumple las reglas, con todos los motivos juntos", async () => {
    expect(await codigos(registrarMovimiento(db, gasto({ valor: 0 }), PROPIETARIO))).toEqual(["valor_invalido"]);
    expect(await codigos(registrarMovimiento(db, gasto({ valor: 10.5 }), PROPIETARIO))).toEqual(["valor_invalido"]);
    expect(await codigos(registrarMovimiento(db, gasto({ animalId: ana, loteId: ordeno }), PROPIETARIO))).toEqual(["animal_y_lote"]);
    expect(await codigos(registrarMovimiento(db, gasto({ categoriaId: categorias["Venta de leche"] }), PROPIETARIO))).toEqual(["categoria_otro_tipo"]);
    expect(await codigos(registrarMovimiento(db, gasto({ fecha: "2999-01-01" }), PROPIETARIO))).toEqual(["fecha_futura"]);
    expect(await codigos(registrarMovimiento(db, gasto({ fecha: "2026-02-30" }), PROPIETARIO))).toEqual(["fecha_invalida"]);
    expect(await codigos(registrarMovimiento(db, gasto({ loteId: "00000000-0000-4000-8000-000000000000" }), PROPIETARIO))).toEqual(["no_encontrado"]);
    expect(await codigos(registrarMovimiento(db, gasto({ valor: -1, animalId: ana, loteId: ordeno }), PROPIETARIO))).toEqual(["valor_invalido", "animal_y_lote"]);
  });

  it("un animal de otra finca no recibe movimientos (R29)", async () => {
    expect(await codigos(registrarMovimiento(db, gasto({ animalId: titan }), PROPIETARIO))).toEqual(["movimiento_animal_no_elegible"]);
  });

  it("una categoría desactivada no se puede elegir en un movimiento nuevo, pero el ya guardado se puede corregir", async () => {
    const id = await registrarMovimiento(db, gasto(), PROPIETARIO);
    await actualizarCategoria(db, categorias["Alimento"], { nombre: "Alimento", activo: false }, PROPIETARIO);
    expect(await codigos(registrarMovimiento(db, gasto(), PROPIETARIO))).toEqual(["categoria_inactiva"]);
    await actualizarMovimiento(db, id, gasto({ valor: 120_000 }), PROPIETARIO);
    expect((await listarMovimientos(db))[0].valor).toBe(120_000);
    expect(await codigos(actualizarMovimiento(db, id, gasto({ categoriaId: categorias["Mano de obra"], valor: 5 }), PROPIETARIO))).toEqual([]);
  });

  it("corrige un movimiento y deja el valor anterior en el historial", async () => {
    const id = await registrarMovimiento(db, gasto({ valor: 100_000 }), PROPIETARIO);
    await actualizarMovimiento(db, id, gasto({ valor: 150_000, animalId: ana, descripcion: "Con nota" }), PROPIETARIO);
    expect((await listarMovimientos(db))[0]).toMatchObject({ valor: 150_000, animal: "Ana", descripcion: "Con nota" });
    const cambios = await db.consultar<{ campo: string; valor_anterior: string | null; valor_nuevo: string }>(
      "SELECT campo, valor_anterior, valor_nuevo FROM historial_cambios WHERE registro_id = ? AND valor_anterior IS NOT NULL ORDER BY campo",
      [id],
    );
    expect(cambios).toEqual([{ campo: "valor", valor_anterior: "100000", valor_nuevo: "150000" }]);
    expect(await codigos(actualizarMovimiento(db, "00000000-0000-4000-8000-000000000000", gasto(), PROPIETARIO))).toEqual(["no_encontrado"]);
  });

  it("retirar es un borrado lógico: deja de contar, queda en el historial y la base no deja borrar la fila", async () => {
    const id = await registrarMovimiento(db, gasto(), PROPIETARIO);
    await retirarMovimiento(db, id, PROPIETARIO);
    expect(await listarMovimientos(db)).toEqual([]);
    expect((await resumenFinanciero(db)).finca.gastos).toBe(0);
    const [{ n }] = await db.consultar<{ n: number }>("SELECT count(*) AS n FROM movimiento_economico");
    expect(n).toBe(1);
    expect(await codigos(retirarMovimiento(db, id, PROPIETARIO))).toEqual(["no_encontrado"]);
    await expect(db.ejecutar("DELETE FROM movimiento_economico")).rejects.toThrow(/No se permite borrar filas/);
    await expect(db.ejecutar("DELETE FROM categoria_economica")).rejects.toThrow(/No se permite borrar filas/);
  });

  it("filtra por periodo (extremos incluidos), por tipo y por categoría", async () => {
    await registrarMovimiento(db, gasto({ fecha: "2026-01-31" }), PROPIETARIO);
    await registrarMovimiento(db, gasto({ fecha: "2026-02-01", categoriaId: categorias["Mano de obra"] }), PROPIETARIO);
    await registrarMovimiento(db, ingreso({ fecha: "2026-02-15" }), PROPIETARIO);
    await registrarMovimiento(db, gasto({ fecha: "2026-03-01" }), PROPIETARIO);
    const fechas = async (f: Parameters<typeof listarMovimientos>[1]) => (await listarMovimientos(db, f)).map((m) => m.fecha);
    expect(await fechas({})).toEqual(["2026-03-01", "2026-02-15", "2026-02-01", "2026-01-31"]);
    expect(await fechas({ desde: "2026-02-01", hasta: "2026-02-28" })).toEqual(["2026-02-15", "2026-02-01"]);
    expect(await fechas({ desde: "2026-02-15" })).toEqual(["2026-03-01", "2026-02-15"]);
    expect(await fechas({ hasta: "2026-01-31" })).toEqual(["2026-01-31"]);
    expect(await fechas({ tipo: "ingreso" })).toEqual(["2026-02-15"]);
    expect(await fechas({ categoriaId: categorias["Mano de obra"] })).toEqual(["2026-02-01"]);
    await expect(listarMovimientos(db, { desde: "2026-03-01", hasta: "2026-01-01" })).rejects.toThrow(/periodo_invalido/);
  });

  it("R23: el operario no registra, corrige ni retira movimientos", async () => {
    const id = await registrarMovimiento(db, gasto(), PROPIETARIO);
    await expect(registrarMovimiento(db, gasto(), OPERARIO)).rejects.toThrow(/sin_permiso/);
    await expect(actualizarMovimiento(db, id, gasto(), OPERARIO)).rejects.toThrow(/sin_permiso/);
    await expect(retirarMovimiento(db, id, OPERARIO)).rejects.toThrow(/sin_permiso/);
  });

  it("la base también vigila: el tipo debe ser el de la categoría y un movimiento no va a un animal y a un lote", async () => {
    const ahora = "2026-10-01T12:00:00.000Z";
    const insertar = (extra: Record<string, string | number>) => {
      const fila = { id: "11111111-1111-4111-8111-111111111111", fecha: "2026-02-01", creado_en: ahora, modificado_en: ahora, valor: 5, ...extra };
      return db.ejecutar(`INSERT INTO movimiento_economico (${Object.keys(fila).join(", ")}) VALUES (${Object.keys(fila).map(() => "?").join(", ")})`, Object.values(fila));
    };
    await expect(insertar({ tipo: "ingreso", categoria_id: categorias["Alimento"] })).rejects.toThrow(/tipo del movimiento/);
    await expect(insertar({ tipo: "gasto", categoria_id: categorias["Alimento"], animal_id: ana, lote_id: ordeno })).rejects.toThrow(/CHECK/);
    await expect(insertar({ tipo: "gasto", categoria_id: categorias["Alimento"], valor: 0 })).rejects.toThrow(/CHECK/);
    await insertar({ tipo: "gasto", categoria_id: categorias["Alimento"] });
    // Una categoría con movimientos no cambia de tipo.
    await expect(db.ejecutar("UPDATE categoria_economica SET tipo = 'ingreso' WHERE id = ?", [categorias["Alimento"]])).rejects.toThrow(/no cambia de tipo/);
  });
});

describe("CA-22 / R19: costo por cabra, costo por lote y rentabilidad con datos guardados", () => {
  // El mismo cálculo manual de las pruebas del dominio: lote «Ordeño» = {Ana, Beto}; Cora sin lote; Dora vendida.
  let dora: string;
  beforeEach(async () => {
    dora = await crear(db, { nombre: "Dora", fechaNacimiento: "2021-01-01", identificadores: [arete("D-1")] });
    await db.ejecutar("UPDATE animal SET estado = 'vendido' WHERE id = ?", [dora]);
    await registrarMovimiento(db, gasto({ fecha: "2026-02-01", valor: 1_000_000, loteId: ordeno }), PROPIETARIO);
    await registrarMovimiento(db, gasto({ fecha: "2026-02-10", valor: 60_000, animalId: ana, categoriaId: categorias["Medicamentos"] }), PROPIETARIO);
    await registrarMovimiento(db, gasto({ fecha: "2026-03-05", valor: 40_000, animalId: beto, categoriaId: categorias["Medicamentos"] }), PROPIETARIO);
    await registrarMovimiento(db, gasto({ fecha: "2026-03-31", valor: 900_000, categoriaId: categorias["Mano de obra"] }), PROPIETARIO);
    await registrarMovimiento(db, ingreso({ fecha: "2026-03-31", valor: 2_500_000 }), PROPIETARIO);
    await registrarMovimiento(db, ingreso({ fecha: "2026-04-15", valor: 700_000, animalId: dora, categoriaId: categorias["Venta de animales"] }), PROPIETARIO);
    await registrarMovimiento(db, gasto({ fecha: "2025-12-31", valor: 5_000_000 }), PROPIETARIO);
  });
  const periodo = { desde: "2026-01-01", hasta: "2026-12-31" };

  it("finca: ingresos, gastos y rentabilidad del periodo, con los gastos generales aparte", async () => {
    const { finca } = await resumenFinanciero(db, { periodo });
    expect(finca).toMatchObject({
      ingresos: 3_200_000,
      gastos: 2_000_000,
      rentabilidad: 1_200_000,
      gastosGenerales: 900_000,
      gastosDeLotes: 1_000_000,
      gastosDeAnimales: 100_000,
      ingresosGenerales: 2_500_000,
    });
    // Sin periodo entra también el gasto de 2025.
    expect((await resumenFinanciero(db)).finca.gastos).toBe(7_000_000);
  });

  it("lote y animal: costo = gastos asignados; rentabilidad = ingresos − gastos", async () => {
    const r = await resumenFinanciero(db, { periodo });
    expect(r.lotes).toEqual([{ loteId: ordeno, nombre: "Ordeño", ingresos: 0, gastos: 1_000_000, rentabilidad: -1_000_000 }]);
    const de = (id: string) => r.animales.find((f) => f.animalId === id)!;
    expect(de(ana)).toMatchObject({ nombre: "Ana", costo: 60_000, rentabilidad: -60_000 });
    expect(de(beto)).toMatchObject({ costo: 40_000, rentabilidad: -40_000 });
    expect(de(dora)).toMatchObject({ ingresos: 700_000, costo: 0, rentabilidad: 700_000 });
    expect(r.animales.map((f) => f.animalId)).not.toContain(cora);
    expect(r.animales.map((f) => f.animalId)).not.toContain(titan);
  });

  it("prorrateo (opcional): reparte entre los animales activos del hato; el de otra finca no recibe nada", async () => {
    const r = await resumenFinanciero(db, { periodo, prorratear: true });
    const de = (id: string) => r.animales.find((f) => f.animalId === id)!;
    expect(r.animalesParaRepartir).toBe(3); // Ana, Beto y Cora (Dora está vendida; Titán es de otra finca)
    expect(de(ana)).toMatchObject({ gastosDirectos: 60_000, gastosDeLote: 500_000, gastosGenerales: 300_000, costo: 860_000 });
    expect(de(beto)).toMatchObject({ costo: 840_000 });
    expect(de(cora)).toMatchObject({ gastosDirectos: 0, costo: 300_000, rentabilidad: -300_000 });
    expect(de(dora)).toMatchObject({ costo: 0, rentabilidad: 700_000 });
    expect(r.animales.reduce((s, f) => s + f.costo, 0)).toBeCloseTo(r.finca.gastos, 6);
    expect(r.finca.gastosSinRepartir).toBe(0);
  });

  it("un movimiento retirado no cuenta, y el lote retirado conserva su nombre en el resumen", async () => {
    const [grande] = (await listarMovimientos(db)).filter((m) => m.valor === 5_000_000);
    await retirarMovimiento(db, grande.id, PROPIETARIO);
    expect((await resumenFinanciero(db)).finca.gastos).toBe(2_000_000);
    await db.ejecutar("UPDATE animal SET lote_id = NULL");
    await db.ejecutar("UPDATE lote SET eliminado_en = '2026-10-01T12:00:00.000Z' WHERE id = ?", [ordeno]);
    expect((await resumenFinanciero(db, { periodo })).lotes[0].nombre).toBe("Ordeño");
  });

  it("un lote sin movimientos no aparece en el resumen", async () => {
    expect((await resumenFinanciero(db, { periodo })).lotes.map((l) => l.loteId)).not.toContain(crias);
  });
});

describe("R30: el gasto de una monta con costo", () => {
  const monta = (datos: Partial<Parameters<typeof registrarServicio>[1]> = {}) =>
    registrarServicio(
      db,
      { hembraId: ana, tipo: "monta", machoId: titan, pajilla: null, fecha: "2026-03-10", observaciones: null, costo: 150_000, condiciones: "Pago al contado", ...datos },
      PROPIETARIO,
    );

  it("crea el gasto con la fecha y el costo de la monta, asignado a la hembra servida, y deja el enlace", async () => {
    const servicioId = await monta();
    expect((await serviciosConGasto(db, [servicioId])).has(servicioId)).toBe(false);
    const id = await crearGastoDeServicio(db, servicioId, CATEGORIA_MONTAS_ID, "Monta con Titán", PROPIETARIO);
    const [m] = await listarMovimientos(db);
    expect(m).toMatchObject({ id, fecha: "2026-03-10", tipo: "gasto", valor: 150_000, animal: "Ana", categoria: "Montas y pajillas", servicioId, descripcion: "Monta con Titán" });
    expect((await serviciosConGasto(db, [servicioId])).has(servicioId)).toBe(true);
    expect((await resumenFinanciero(db)).animales.find((f) => f.animalId === ana)?.costo).toBe(150_000);
  });

  it("no se ofrece dos veces; si se retira el gasto, se puede volver a crear", async () => {
    const servicioId = await monta();
    const id = await crearGastoDeServicio(db, servicioId, CATEGORIA_MONTAS_ID, null, PROPIETARIO);
    expect(await codigos(crearGastoDeServicio(db, servicioId, CATEGORIA_MONTAS_ID, null, PROPIETARIO))).toEqual(["gasto_ya_registrado"]);
    await retirarMovimiento(db, id, PROPIETARIO);
    expect((await serviciosConGasto(db, [servicioId])).size).toBe(0);
    await crearGastoDeServicio(db, servicioId, CATEGORIA_MONTAS_ID, null, PROPIETARIO);
    expect(await listarMovimientos(db)).toHaveLength(1);
  });

  it("solo para una monta con costo, con una categoría de gasto y activa", async () => {
    const sinCosto = await monta({ costo: null, condiciones: null, fecha: "2026-03-11" });
    expect(await codigos(crearGastoDeServicio(db, sinCosto, CATEGORIA_MONTAS_ID, null, PROPIETARIO))).toEqual(["servicio_sin_costo"]);
    const conCosto = await monta({ fecha: "2026-03-12" });
    expect(await codigos(crearGastoDeServicio(db, conCosto, categorias["Venta de leche"], null, PROPIETARIO))).toEqual(["categoria_otro_tipo"]);
    expect(await codigos(crearGastoDeServicio(db, "00000000-0000-4000-8000-000000000000", CATEGORIA_MONTAS_ID, null, PROPIETARIO))).toEqual(["no_encontrado"]);
  });

  it("R23: el operario no crea gastos", async () => {
    const servicioId = await monta();
    await expect(crearGastoDeServicio(db, servicioId, CATEGORIA_MONTAS_ID, null, OPERARIO)).rejects.toThrow(/sin_permiso/);
  });

  it("serviciosConGasto con una lista vacía no consulta nada", async () => {
    expect((await serviciosConGasto(db, [])).size).toBe(0);
  });
});
