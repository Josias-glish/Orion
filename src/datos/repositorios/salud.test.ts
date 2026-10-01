// Repositorio de salud: Flujo 3 (tratamiento a un animal o a un lote), alertas de retiro (R7, RF-24),
// calendario (RF-22), condición corporal (RF-25), R11 y R14.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { arete, crearAnimalDePrueba as crear, OPERARIO, PROPIETARIO } from "../ayudas-pruebas";
import { crearBaseDePrueba, type ConexionMemoria } from "../conexion-memoria";
import { ErrorDeRegistro } from "../errores";
import { guardarAnimal, obtenerAnimal } from "./animales";
import { listarHistorialAnimal } from "./historial";
import { crearLote } from "./lotes";
import {
  listarAlertasRetiro,
  listarEventosSalud,
  listarProximasAplicaciones,
  registrarEventoSalud,
  retirarEventoSalud,
  retirosDeLechePorAnimal,
  type DatosRegistroSalud,
} from "./salud";

let db: ConexionMemoria;
let bella: string;
let dalia: string;
let zeus: string;
let lote: string;

beforeEach(async () => {
  db = crearBaseDePrueba();
  lote = await crearLote(db, { nombre: "Ordeño", descripcion: null }, PROPIETARIO);
  bella = await crear(db, { nombre: "Bella", sexo: "hembra", fechaNacimiento: "2020-01-01", loteId: lote, identificadores: [arete("B-1")] });
  dalia = await crear(db, { nombre: "Dalia", sexo: "hembra", fechaNacimiento: "2020-02-01", loteId: lote });
  zeus = await crear(db, { nombre: "Zeus", sexo: "macho", fechaNacimiento: "2018-01-01" });
});
afterEach(() => db.cerrar());

const tratamiento = (cambios: Partial<DatosRegistroSalud> = {}): DatosRegistroSalud => ({
  destino: { animalId: bella },
  tipo: "tratamiento",
  producto: "Oxitetraciclina",
  numeroRegistroIca: "ICA-EJEMPLO-1",
  loteProducto: "L-77",
  dosis: "10 ml",
  via: "intramuscular",
  fechaInicio: "2026-09-10",
  fechaFin: null,
  retiroLecheDias: 5,
  retiroCarneDias: 28,
  aplicador: "Luis",
  veterinario: "Dra. Gómez",
  condicionCorporal: null,
  proximaFecha: null,
  observaciones: null,
  ...cambios,
});
const codigos = async (promesa: Promise<unknown>) => {
  try {
    await promesa;
    return [];
  } catch (e) {
    if (e instanceof ErrorDeRegistro) return e.motivos.map((m) => m.codigo);
    throw e;
  }
};

describe("Flujo 3: registrar un tratamiento con los campos del ICA", () => {
  it("guarda todos los campos y el operario también puede (R14)", async () => {
    const [id] = await registrarEventoSalud(db, tratamiento(), OPERARIO);
    const [e] = await listarEventosSalud(db, { animalId: bella });
    expect(e).toMatchObject({
      id,
      animalId: bella,
      animal: "Bella",
      loteId: null,
      tipo: "tratamiento",
      producto: "Oxitetraciclina",
      numeroRegistroIca: "ICA-EJEMPLO-1",
      loteProducto: "L-77",
      dosis: "10 ml",
      via: "intramuscular",
      fechaInicio: "2026-09-10",
      retiroLecheDias: 5,
      retiroCarneDias: 28,
      aplicador: "Luis",
      veterinario: "Dra. Gómez",
      finRetiroLeche: "2026-09-15",
      finRetiroCarne: "2026-10-08",
    });
    // Queda en el historial del animal.
    expect((await listarHistorialAnimal(db, bella)).some((h) => h.entidad === "evento_salud" && h.campo === "producto")).toBe(true);
  });

  it("a un lote: una fila por cada animal activo del lote ese día, con el lote anotado", async () => {
    const ids = await registrarEventoSalud(db, tratamiento({ destino: { loteId: lote } }), PROPIETARIO);
    expect(ids).toHaveLength(2);
    const eventos = await listarEventosSalud(db, {});
    expect(eventos.map((e) => [e.animal, e.lote]).sort()).toEqual([
      ["Bella", "Ordeño"],
      ["Dalia", "Ordeño"],
    ]);
  });

  it("R11: no se trata a un animal vendido o muerto, y en un lote se salta a los que ya no están", async () => {
    const actual = (await obtenerAnimal(db, dalia))!;
    await guardarAnimal(db, { ...actual, estado: "vendido" }, PROPIETARIO, dalia);
    expect(await codigos(registrarEventoSalud(db, tratamiento({ destino: { animalId: dalia } }), PROPIETARIO))).toEqual(["animal_no_disponible"]);
    expect(await registrarEventoSalud(db, tratamiento({ destino: { loteId: lote } }), PROPIETARIO)).toHaveLength(1);
  });

  it("un lote sin animales activos no recibe tratamientos", async () => {
    const vacio = await crearLote(db, { nombre: "Vacío", descripcion: null }, PROPIETARIO);
    expect(await codigos(registrarEventoSalud(db, tratamiento({ destino: { loteId: vacio } }), PROPIETARIO))).toEqual(["lote_sin_animales"]);
  });

  it("valida antes de escribir y no deja nada a medias", async () => {
    expect(await codigos(registrarEventoSalud(db, tratamiento({ producto: "", retiroLecheDias: -2 }), PROPIETARIO))).toEqual([
      "dato_obligatorio",
      "retiro_invalido",
    ]);
    expect(await codigos(registrarEventoSalud(db, tratamiento({ fechaInicio: "2019-01-01" }), PROPIETARIO))).toEqual([
      "fecha_anterior_al_nacimiento",
    ]);
    expect(await listarEventosSalud(db, {})).toEqual([]);
  });

  it("un evento registrado por error se retira (borrado lógico) y deja de dar alertas; solo el propietario", async () => {
    const [id] = await registrarEventoSalud(db, tratamiento(), PROPIETARIO);
    expect(await codigos(retirarEventoSalud(db, id, OPERARIO))).toEqual(["sin_permiso"]);
    await retirarEventoSalud(db, id, PROPIETARIO);
    expect(await listarAlertasRetiro(db, "2026-09-12")).toEqual([]);
    const [{ n }] = await db.consultar<{ n: number }>("SELECT count(*) AS n FROM evento_salud WHERE eliminado_en IS NOT NULL");
    expect(n).toBe(1);
  });
});

describe("RF-24: alertas de retiro (R7)", () => {
  it("vigentes hasta D+5 inclusive y desaparecen al vencer (CA-04 con la base)", async () => {
    await registrarEventoSalud(db, tratamiento({ retiroCarneDias: null }), PROPIETARIO);
    expect((await listarAlertasRetiro(db, "2026-09-15")).map((a) => [a.animal, a.tipo, a.hasta, a.producto])).toEqual([
      ["Bella", "leche", "2026-09-15", "Oxitetraciclina"],
    ]);
    expect(await listarAlertasRetiro(db, "2026-09-16")).toEqual([]);
  });

  it("para el ordeño: la fecha más lejana de retiro de leche de cada hembra", async () => {
    await registrarEventoSalud(db, tratamiento({ producto: "A", retiroLecheDias: 3 }), PROPIETARIO);
    await registrarEventoSalud(db, tratamiento({ producto: "B", retiroLecheDias: 7 }), PROPIETARIO);
    await registrarEventoSalud(db, tratamiento({ destino: { animalId: zeus }, producto: "C", retiroLecheDias: 0, retiroCarneDias: 10 }), PROPIETARIO);
    const retiros = await retirosDeLechePorAnimal(db, "2026-09-12");
    expect(Object.fromEntries(retiros)).toEqual({ [bella]: { hasta: "2026-09-17", productos: ["A", "B"] } });
  });

  it("R11: no muestra alertas de animales vendidos o muertos", async () => {
    await registrarEventoSalud(db, tratamiento(), PROPIETARIO);
    const actual = (await obtenerAnimal(db, bella))!;
    await guardarAnimal(db, { ...actual, estado: "muerto" }, PROPIETARIO, bella);
    expect(await listarAlertasRetiro(db, "2026-09-12")).toEqual([]);
  });
});

describe("RF-22 y RF-25: calendario y condición corporal", () => {
  it("lista las próximas vacunas y desparasitaciones dentro del plazo, con las vencidas", async () => {
    await registrarEventoSalud(
      db,
      tratamiento({ destino: { loteId: lote }, tipo: "vacuna", producto: "Clostridial", retiroLecheDias: null, retiroCarneDias: null, fechaInicio: "2026-04-01", proximaFecha: "2026-10-01" }),
      PROPIETARIO,
    );
    await registrarEventoSalud(
      db,
      tratamiento({ destino: { animalId: zeus }, tipo: "desparasitacion", producto: "Albendazol", retiroLecheDias: null, retiroCarneDias: 14, fechaInicio: "2026-06-01", proximaFecha: "2026-09-01" }),
      PROPIETARIO,
    );
    const proximas = await listarProximasAplicaciones(db, "2026-09-20", 30);
    expect(proximas.map((p) => [p.animal, p.producto, p.proximaFecha, p.vencida, p.lote])).toEqual([
      ["Zeus", "Albendazol", "2026-09-01", true, null],
      ["Bella", "Clostridial", "2026-10-01", false, "Ordeño"],
      ["Dalia", "Clostridial", "2026-10-01", false, "Ordeño"],
    ]);
  });

  it("anota la condición corporal de 1 a 5", async () => {
    await registrarEventoSalud(
      db,
      tratamiento({ tipo: "condicion_corporal", producto: null, numeroRegistroIca: null, retiroLecheDias: null, retiroCarneDias: null, condicionCorporal: 3.5 }),
      OPERARIO,
    );
    expect(await codigos(registrarEventoSalud(db, tratamiento({ tipo: "condicion_corporal", producto: null, condicionCorporal: 6 }), OPERARIO))).toEqual([
      "condicion_invalida",
    ]);
    const [e] = await listarEventosSalud(db, { animalId: bella });
    expect([e.tipo, e.condicionCorporal, e.producto]).toEqual(["condicion_corporal", 3.5, null]);
  });
});
