import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { crearAnimalDePrueba as crear, OPERARIO, PROPIETARIO } from "../ayudas-pruebas";
import { crearBaseDePrueba, type ConexionMemoria } from "../conexion-memoria";
import { ErrorDeRegistro } from "../errores";
import { guardarMeta, listarMetas, listarPesajesRecientes, pesajesDeAnimal, registrarPesaje, retirarMeta } from "./pesos";

let db: ConexionMemoria;
let cabrita: string;
beforeEach(async () => {
  db = crearBaseDePrueba();
  cabrita = await crear(db, { nombre: "Cabrita", fechaNacimiento: "2025-01-01" });
});
afterEach(() => db.cerrar());

describe("pesos (RF-30, RF-31)", () => {
  it("registra pesajes y calcula la ganancia diaria (R10) y la meta por edad", async () => {
    await guardarMeta(db, { sexo: "hembra", edadMeses: 0, kilos: 3.5 }, PROPIETARIO);
    await guardarMeta(db, { sexo: "hembra", edadMeses: 3, kilos: 15 }, PROPIETARIO);
    await registrarPesaje(db, { animalId: cabrita, fecha: "2025-01-01", kilos: 3.5, tipo: "nacimiento" }, OPERARIO);
    await registrarPesaje(db, { animalId: cabrita, fecha: "2025-03-02", kilos: 15.5, tipo: "destete" }, OPERARIO);
    const pesajes = await pesajesDeAnimal(db, cabrita);
    expect(pesajes.map((p) => [p.fecha, p.edadDias])).toEqual([
      ["2025-01-01", 0],
      ["2025-03-02", 60],
    ]);
    expect(pesajes[1].gananciaDiaria).toBeCloseTo(0.2, 10);
    expect(pesajes[0].meta).toBeCloseTo(3.5, 10);
    expect(pesajes[1].meta).toBeCloseTo(3.5 + (11.5 * 60) / (3 * 30.4375), 10);
    expect((await listarPesajesRecientes(db)).map((p) => p.animal)).toEqual(["Cabrita", "Cabrita"]);
  });

  it("rechaza kilos no positivos y fechas antes del nacimiento", async () => {
    const motivos = (p: Promise<unknown>) => p.then(() => [], (e: ErrorDeRegistro) => e.motivos.map((m) => m.codigo));
    expect(await motivos(registrarPesaje(db, { animalId: cabrita, fecha: "2025-02-01", kilos: 0, tipo: "control" }, OPERARIO))).toEqual(["kilos_invalidos"]);
    expect(await motivos(registrarPesaje(db, { animalId: cabrita, fecha: "2024-12-31", kilos: 3, tipo: "control" }, OPERARIO))).toEqual([
      "fecha_anterior_al_nacimiento",
    ]);
  });

  it("las metas se crean, se corrigen y se retiran; el operario no las cambia", async () => {
    await guardarMeta(db, { sexo: "macho", edadMeses: 6, kilos: 25 }, PROPIETARIO);
    await guardarMeta(db, { sexo: "macho", edadMeses: 6, kilos: 27 }, PROPIETARIO);
    const [meta] = await listarMetas(db);
    expect(meta).toMatchObject({ sexo: "macho", edadMeses: 6, kilos: 27 });
    await expect(guardarMeta(db, { sexo: "macho", edadMeses: 6, kilos: 30 }, OPERARIO)).rejects.toThrow(/sin_permiso/);
    await expect(guardarMeta(db, { sexo: "macho", edadMeses: -1, kilos: 30 }, PROPIETARIO)).rejects.toThrow(/meta_invalida/);
    await retirarMeta(db, meta.id, PROPIETARIO);
    expect(await listarMetas(db)).toEqual([]);
  });
});
