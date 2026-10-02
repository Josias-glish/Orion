import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { proyectarLactancia } from "../../dominio/leche";
import { arete, crearAnimalDePrueba as crear, OPERARIO, PROPIETARIO } from "../ayudas-pruebas";
import { crearBaseDePrueba, type ConexionMemoria } from "../conexion-memoria";
import { ErrorDeRegistro } from "../errores";
import { guardarPesajeLeche, listarComparacionCalidad, listarLactancias, listarOrdeno, obtenerLactancia, secarLactancia } from "./leche";
import { registrarParto } from "./reproduccion";

let db: ConexionMemoria;
let luna: string;
let lactanciaLuna: string;
beforeEach(async () => {
  db = crearBaseDePrueba();
  luna = await crear(db, { nombre: "Luna", fechaNacimiento: "2021-01-01", identificadores: [arete("A-10")] });
  const sol = await crear(db, { nombre: "Sol", fechaNacimiento: "2021-01-01", identificadores: [arete("A-20")] });
  const parto = (hembraId: string, fecha: string) =>
    registrarParto(db, { hembraId, fecha, crias: [{ sexo: "hembra", nombre: `Cría de ${fecha}`, arete: null, pesoNacimiento: null, nacioMuerta: false }], observaciones: null }, PROPIETARIO);
  lactanciaLuna = (await parto(luna, "2025-08-01")).lactanciaId;
  await parto(sol, "2025-08-03");
});
afterEach(() => db.cerrar());

const motivos = (p: Promise<unknown>) =>
  p.then(
    () => [],
    (e: unknown) => (e instanceof ErrorDeRegistro ? e.motivos.map((m) => m.codigo) : [String(e)]),
  );

describe("ordeño en lote (RF-26, RF-29)", () => {
  it("lista las hembras en lactancia ese día, con su día de lactancia", async () => {
    const filas = await listarOrdeno(db, "2025-08-02", "manana");
    expect(filas.map((f) => [f.identificador, f.diaLactancia])).toEqual([["A-10", 2]]);
    expect((await listarOrdeno(db, "2025-08-05", "manana")).map((f) => f.identificador)).toEqual(["A-10", "A-20"]);
  });

  it("guarda y, si se vuelve a anotar, corrige el mismo pesaje (sin duplicar)", async () => {
    const id = await guardarPesajeLeche(db, { lactanciaId: lactanciaLuna, fecha: "2025-08-05", jornada: "manana", kilos: 2.5 }, OPERARIO);
    const otra = await guardarPesajeLeche(db, { lactanciaId: lactanciaLuna, fecha: "2025-08-05", jornada: "manana", kilos: 2.75 }, OPERARIO);
    expect(otra).toBe(id);
    const [fila] = await listarOrdeno(db, "2025-08-05", "manana");
    expect([fila.pesajeId, fila.kilos]).toEqual([id, 2.75]);
    const historial = await db.consultar<{ valor_anterior: string; valor_nuevo: string }>(
      "SELECT valor_anterior, valor_nuevo FROM historial_cambios WHERE registro_id = ? AND campo = 'kilos' AND valor_anterior IS NOT NULL",
      [id],
    );
    expect(historial).toEqual([{ valor_anterior: "2.5", valor_nuevo: "2.75" }]);
  });

  it("muestra el último pesaje de la misma jornada como referencia", async () => {
    await guardarPesajeLeche(db, { lactanciaId: lactanciaLuna, fecha: "2025-08-04", jornada: "tarde", kilos: 1.2 }, OPERARIO);
    const [fila] = await listarOrdeno(db, "2025-08-05", "tarde");
    expect(fila.kilosAnteriores).toBe(1.2);
  });

  it("rechaza kilos inválidos y fechas fuera de la lactancia", async () => {
    expect(await motivos(guardarPesajeLeche(db, { lactanciaId: lactanciaLuna, fecha: "2025-08-05", jornada: "manana", kilos: -1 }, OPERARIO))).toEqual(["kilos_invalidos"]);
    expect(await motivos(guardarPesajeLeche(db, { lactanciaId: lactanciaLuna, fecha: "2025-07-30", jornada: "manana", kilos: 1 }, OPERARIO))).toEqual(["fuera_de_la_lactancia"]);
  });

  it("R11: una cabra vendida o muerta deja de aparecer en el ordeño, pero conserva su historial", async () => {
    await guardarPesajeLeche(db, { lactanciaId: lactanciaLuna, fecha: "2025-08-05", jornada: "manana", kilos: 2 }, OPERARIO);
    await db.ejecutar("UPDATE animal SET estado = 'vendido' WHERE id = ?", [luna]);
    expect((await listarOrdeno(db, "2025-08-06", "manana")).map((f) => f.identificador)).toEqual(["A-20"]);
    expect(await motivos(guardarPesajeLeche(db, { lactanciaId: lactanciaLuna, fecha: "2025-08-06", jornada: "manana", kilos: 2 }, OPERARIO))).toEqual(["animal_no_disponible"]);
    expect((await obtenerLactancia(db, lactanciaLuna))!.pesajes).toHaveLength(1);
  });
});

describe("lactancias (RF-27, RF-28) y CA-08 con datos guardados", () => {
  it("la proyección de la lista (calculada en SQLite) es la misma que la del dominio y la del cálculo manual", async () => {
    // Días 2 a 11 de la lactancia, con 3, 4, …, 12 kg diarios en dos jornadas (el ejemplo de CA-08).
    for (let i = 0; i < 10; i++) {
      const fecha = `2025-08-${String(i + 2).padStart(2, "0")}`;
      const total = 3 + i;
      await guardarPesajeLeche(db, { lactanciaId: lactanciaLuna, fecha, jornada: "manana", kilos: (total * 2) / 3 }, OPERARIO);
      await guardarPesajeLeche(db, { lactanciaId: lactanciaLuna, fecha, jornada: "tarde", kilos: total / 3 }, OPERARIO);
    }
    const resumen = (await listarLactancias(db)).find((l) => l.id === lactanciaLuna)!;
    const detalle = (await obtenerLactancia(db, lactanciaLuna))!;
    expect(resumen.proyeccion!.proyeccion).toBeCloseTo(2721, 9);
    expect(detalle.proyeccion!.proyeccion).toBeCloseTo(2721, 9);
    expect(resumen.proyeccion).toEqual(
      expect.objectContaining({ diasPromediados: 7, diaActual: 11, diasRestantes: 294 }),
    );
    expect(detalle.proyeccion!.acumulado).toBeCloseTo(proyectarLactancia("2025-08-01", 305, detalle.pesajes)!.acumulado, 9);
    expect(detalle.curva.map((c) => c.dia)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(resumen.pesajes).toBe(20);
  });

  it("secar: no antes del último pesaje; después la cabra sale del ordeño", async () => {
    await guardarPesajeLeche(db, { lactanciaId: lactanciaLuna, fecha: "2025-08-10", jornada: "manana", kilos: 2 }, OPERARIO);
    expect(await motivos(secarLactancia(db, lactanciaLuna, "2025-08-09", OPERARIO))).toEqual(["pesajes_despues_del_secado"]);
    await secarLactancia(db, lactanciaLuna, "2025-08-10", OPERARIO);
    expect((await listarOrdeno(db, "2025-08-11", "manana")).map((f) => f.identificador)).toEqual(["A-20"]);
    expect(await motivos(secarLactancia(db, lactanciaLuna, "2025-08-12", OPERARIO))).toEqual(["lactancia_secada"]);
  });
});

describe("calidad de la leche (RF-32, R18, CA-21)", () => {
  const pesar = (lactanciaId: string, fecha: string, extra: Partial<Parameters<typeof guardarPesajeLeche>[1]> = {}, contexto = OPERARIO) =>
    guardarPesajeLeche(db, { lactanciaId, fecha, jornada: "manana", kilos: 2, ...extra }, contexto);
  let lactanciaSol: string;
  beforeEach(async () => {
    lactanciaSol = (await listarLactancias(db)).find((l) => l.hembra === "Sol")!.id;
  });

  it("guarda grasa, proteína y células somáticas junto al pesaje, y el ordeño las devuelve", async () => {
    await pesar(lactanciaLuna, "2025-08-05", { grasaPct: 3.8, proteinaPct: 3.2, celulasSomaticas: 450000 });
    const [fila] = await listarOrdeno(db, "2025-08-05", "manana");
    expect(fila).toMatchObject({ kilos: 2, grasaPct: 3.8, proteinaPct: 3.2, celulasSomaticas: 450000 });
  });

  it("la calidad es opcional: un pesaje sin ella queda con los tres datos vacíos", async () => {
    await pesar(lactanciaLuna, "2025-08-05");
    const [fila] = await listarOrdeno(db, "2025-08-05", "manana");
    expect([fila.grasaPct, fila.proteinaPct, fila.celulasSomaticas]).toEqual([null, null, null]);
  });

  it("corregir los kilos sin escribir la calidad no la borra; escribir null sí la deja vacía", async () => {
    const id = await pesar(lactanciaLuna, "2025-08-05", { grasaPct: 3.8, celulasSomaticas: 450000 });
    await pesar(lactanciaLuna, "2025-08-05", { kilos: 2.5 });
    expect((await listarOrdeno(db, "2025-08-05", "manana"))[0]).toMatchObject({ kilos: 2.5, grasaPct: 3.8, celulasSomaticas: 450000 });
    await pesar(lactanciaLuna, "2025-08-05", { kilos: 2.5, celulasSomaticas: null, proteinaPct: 3.1 });
    expect((await listarOrdeno(db, "2025-08-05", "manana"))[0]).toMatchObject({ grasaPct: 3.8, proteinaPct: 3.1, celulasSomaticas: null });
    const historial = await db.consultar<{ campo: string; valor_anterior: string | null; valor_nuevo: string | null }>(
      "SELECT campo, valor_anterior, valor_nuevo FROM historial_cambios WHERE registro_id = ? AND campo = 'celulas_somaticas' AND valor_anterior IS NOT NULL",
      [id],
    );
    expect(historial).toEqual([{ campo: "celulas_somaticas", valor_anterior: "450000", valor_nuevo: null }]);
  });

  it("rechaza valores fuera de rango, sin guardar nada", async () => {
    expect(await motivos(pesar(lactanciaLuna, "2025-08-05", { grasaPct: 120 }))).toEqual(["grasa_invalida"]);
    expect(await motivos(pesar(lactanciaLuna, "2025-08-05", { proteinaPct: -1, celulasSomaticas: 1.5 }))).toEqual(["proteina_invalida", "celulas_invalidas"]);
    expect(await listarOrdeno(db, "2025-08-05", "manana").then((f) => f[0].pesajeId)).toBeNull();
  });

  it("R14: el operario puede anotar la calidad (es parte de registrar leche)", async () => {
    await expect(pesar(lactanciaLuna, "2025-08-06", { celulasSomaticas: 300000 }, OPERARIO)).resolves.toBeTruthy();
  });

  it("CA-21: el promedio de células somáticas por lactancia coincide con el cálculo manual e ignora los vacíos", async () => {
    // Luna: 400 000, vacío, 600 000, vacío, 800 000, 200 000 → (400 000 + 600 000 + 800 000 + 200 000) / 4 = 500 000.
    const celulas: (number | undefined)[] = [400000, undefined, 600000, undefined, 800000, 200000];
    for (const [i, valor] of celulas.entries()) {
      await pesar(lactanciaLuna, `2025-08-0${i + 2}`, valor === undefined ? { grasaPct: 3.5 } : { celulasSomaticas: valor, ...(i === 0 ? { grasaPct: 3.0 } : {}) });
    }
    // Sol: solo kilos, sin ninguna muestra de calidad.
    await pesar(lactanciaSol, "2025-08-05");
    const filas = await listarComparacionCalidad(db);
    const luna = filas.find((f) => f.hembra === "Luna")!;
    expect(luna.resumen.celulas).toEqual({ promedio: 500000, muestras: 4 });
    // Grasa: 3,0 y las dos anotadas con 3,5 (días 3 y 5): (3,0 + 3,5 + 3,5) / 3.
    expect(luna.resumen.grasa.muestras).toBe(3);
    expect(luna.resumen.grasa.promedio).toBeCloseTo(10 / 3, 10);
    expect(luna.resumen.proteina).toEqual({ promedio: null, muestras: 0 });
    // Una cabra sin muestras no tiene promedio (no cero).
    expect(filas.find((f) => f.hembra === "Sol")!.resumen.celulas).toEqual({ promedio: null, muestras: 0 });
    // El detalle de la lactancia da el mismo resultado.
    expect((await obtenerLactancia(db, lactanciaLuna))!.calidad.celulas).toEqual({ promedio: 500000, muestras: 4 });
  });

  it("la comparación respeta «solo en curso» y no cuenta los pesajes retirados", async () => {
    await pesar(lactanciaLuna, "2025-08-05", { celulasSomaticas: 100000 });
    await pesar(lactanciaSol, "2025-08-05", { celulasSomaticas: 300000 });
    await secarLactancia(db, lactanciaSol, "2025-08-06", OPERARIO);
    expect((await listarComparacionCalidad(db)).map((f) => f.hembra)).toEqual(["Luna"]);
    expect((await listarComparacionCalidad(db, { soloAbiertas: false })).map((f) => [f.hembra, f.enCurso])).toEqual([
      ["Luna", true],
      ["Sol", false],
    ]);
    await db.ejecutar("UPDATE pesaje_leche SET eliminado_en = '2026-10-01T12:00:00.000Z' WHERE lactancia_id = ?", [lactanciaLuna]);
    expect((await listarComparacionCalidad(db))[0].resumen.celulas).toEqual({ promedio: null, muestras: 0 });
  });
});
