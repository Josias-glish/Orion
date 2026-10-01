import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { proyectarLactancia } from "../../dominio/leche";
import { arete, crearAnimalDePrueba as crear, OPERARIO, PROPIETARIO } from "../ayudas-pruebas";
import { crearBaseDePrueba, type ConexionMemoria } from "../conexion-memoria";
import { ErrorDeRegistro } from "../errores";
import { guardarPesajeLeche, listarLactancias, listarOrdeno, obtenerLactancia, secarLactancia } from "./leche";
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
