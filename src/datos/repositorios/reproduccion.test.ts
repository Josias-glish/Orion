import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { arete, crearAnimalDePrueba as crear, OPERARIO, PROPIETARIO } from "../ayudas-pruebas";
import { crearBaseDePrueba, type ConexionMemoria } from "../conexion-memoria";
import { ErrorDeRegistro } from "../errores";
import { listarCatalogo } from "./catalogos";
import { obtenerAnimal } from "./animales";
import { listarLactancias } from "./leche";
import { listarHistorialAnimal } from "./historial";
import { pesajesDeAnimal } from "./pesos";
import {
  diagnosticarServicio,
  historialReproductivo,
  listarHembrasDisponibles,
  listarMachosDisponibles,
  listarPartosProximos,
  listarServicios,
  registrarParto,
  registrarServicio,
  resumenIntervalos,
} from "./reproduccion";

let db: ConexionMemoria;
let bella: string;
let zeus: string;
beforeEach(async () => {
  db = crearBaseDePrueba();
  const razas = await listarCatalogo(db, "raza");
  const saanen = razas.find((r) => r.nombre === "Saanen")!.id;
  const alpina = razas.find((r) => r.nombre === "Alpina")!.id;
  zeus = await crear(db, { nombre: "Zeus", sexo: "macho", fechaNacimiento: "2020-01-01", composicion: [{ razaId: saanen, fraccion: 1 }] });
  bella = await crear(db, { nombre: "Bella", fechaNacimiento: "2021-01-01", composicion: [{ razaId: alpina, fraccion: 1 }] });
});
afterEach(() => db.cerrar());

const codigos = (p: Promise<unknown>) =>
  p.then(
    () => [],
    (e: unknown) => (e instanceof ErrorDeRegistro ? e.motivos.map((m) => m.codigo) : [String(e)]),
  );

const servicio = (datos: Partial<Parameters<typeof registrarServicio>[1]> = {}) =>
  registrarServicio(db, { hembraId: bella, tipo: "monta", machoId: zeus, pajilla: null, fecha: "2025-03-10", observaciones: null, ...datos }, PROPIETARIO);

describe("servicios (RF-18, RF-19)", () => {
  it("R4: guarda la fecha probable de parto = servicio + 150 días", async () => {
    await servicio();
    const [s] = await listarServicios(db);
    expect(s).toMatchObject({ hembra: "Bella", macho: "Zeus", resultado: "pendiente", fechaProbableParto: "2025-08-07" });
  });

  it("valida el macho, la pajilla y la fecha", async () => {
    expect(await codigos(servicio({ machoId: null }))).toEqual(["monta_sin_macho"]);
    expect(await codigos(servicio({ tipo: "inseminacion", machoId: null }))).toEqual(["inseminacion_sin_dato"]);
    expect(await codigos(servicio({ tipo: "inseminacion", machoId: null, pajilla: "PJ-778" }))).toEqual([]);
    expect(await codigos(servicio({ fecha: "2020-06-01" }))).toEqual(["fecha_anterior_al_nacimiento"]);
    expect(await codigos(servicio({ hembraId: zeus }))).toContain("debe_ser_hembra");
  });

  it("R11: una hembra vendida o muerta ya no recibe servicios ni aparece en la lista", async () => {
    await db.ejecutar("UPDATE animal SET estado = 'vendido' WHERE id = ?", [bella]);
    expect(await codigos(servicio())).toEqual(["animal_no_disponible"]);
    expect((await listarHembrasDisponibles(db)).map((h) => h.nombre)).not.toContain("Bella");
    await db.ejecutar("UPDATE animal SET estado = 'muerto' WHERE id = ?", [zeus]);
    expect((await listarMachosDisponibles(db, "monta")).map((m) => m.nombre)).not.toContain("Zeus");
  });

  it("diagnostica preñez, vacía o aborto con fecha no anterior al servicio", async () => {
    const id = await servicio();
    expect(await codigos(diagnosticarServicio(db, id, "prenada", "2025-03-01", PROPIETARIO))).toEqual(["diagnostico_antes_del_servicio"]);
    await diagnosticarServicio(db, id, "aborto", "2025-05-20", PROPIETARIO);
    const [s] = await listarServicios(db);
    expect([s.resultado, s.fechaDiagnostico]).toEqual(["aborto", "2025-05-20"]);
  });

  it("R14 (SUPOSICION): el operario no registra servicios", async () => {
    await expect(registrarServicio(db, { hembraId: bella, tipo: "monta", machoId: zeus, pajilla: null, fecha: "2025-03-10", observaciones: null }, OPERARIO)).rejects.toThrow(/sin_permiso/);
  });

  it("partos próximos: preñadas o sin diagnóstico, sin parto después del servicio", async () => {
    const id = await servicio({ fecha: "2025-03-10" });
    await diagnosticarServicio(db, id, "prenada", "2025-04-20", PROPIETARIO);
    expect((await listarPartosProximos(db, "2025-07-20")).map((s) => s.hembra)).toEqual(["Bella"]);
    expect(await listarPartosProximos(db, "2025-05-01")).toEqual([]);
    await registrarParto(db, { hembraId: bella, fecha: "2025-08-05", crias: [cria("Una")], observaciones: null }, PROPIETARIO);
    expect(await listarPartosProximos(db, "2025-07-20")).toEqual([]);
  });
});

const cria = (nombre: string | null, extra: Partial<Parameters<typeof registrarParto>[1]["crias"][number]> = {}) => ({
  sexo: "hembra" as const,
  nombre,
  arete: null,
  pesoNacimiento: null,
  nacioMuerta: false,
  ...extra,
});

describe("CA-03 / R5: registrar un parto", () => {
  it("un parto de tres crías crea tres fichas con la madre asignada y abre la lactancia", async () => {
    const s = await servicio();
    await diagnosticarServicio(db, s, "prenada", "2025-04-20", PROPIETARIO);
    const r = await registrarParto(
      db,
      {
        hembraId: bella,
        fecha: "2025-08-06",
        crias: [
          cria("Uno", { arete: "C-1", pesoNacimiento: 3.4 }),
          cria("Dos", { sexo: "macho", arete: "C-2" }),
          cria("Tres", { nacioMuerta: true }),
        ],
        observaciones: "Parto sin ayuda",
      },
      OPERARIO, // R14: el operario sí registra partos
    );
    expect(r.criasIds).toHaveLength(3);
    for (const id of r.criasIds) {
      const f = (await obtenerAnimal(db, id))!;
      expect(f).toMatchObject({ madreId: bella, padreId: zeus, padreSinVerificar: false, fechaNacimiento: "2025-08-06", libroId: null });
      expect(f.formaConcepcion).toBe("monta_natural");
      // SUPOSICION: composición = promedio de los padres (100 % Saanen y 100 % Alpina).
      expect(f.composicion.map((c) => [c.raza, c.fraccion]).sort()).toEqual([
        ["Alpina", 0.5],
        ["Saanen", 0.5],
      ]);
    }
    expect((await obtenerAnimal(db, r.criasIds[2]))!.estado).toBe("muerto");
    expect((await obtenerAnimal(db, r.criasIds[0]))!.identificadores[0].valor).toBe("C-1");
    expect((await pesajesDeAnimal(db, r.criasIds[0])).map((p) => [p.tipo, p.kilos])).toEqual([["nacimiento", 3.4]]);
    const lactancias = await listarLactancias(db);
    expect(lactancias.map((l) => [l.hembra, l.fechaInicio, l.fechaSecado])).toEqual([["Bella", "2025-08-06", null]]);
    const h = await historialReproductivo(db, bella);
    expect(h.partos[0]).toMatchObject({ numeroCrias: 3, observaciones: "Parto sin ayuda" });
    // El parto y la lactancia quedan en el historial de la madre; el peso al nacer, en el de cada cría.
    const entidades = new Set((await listarHistorialAnimal(db, bella)).map((e) => e.entidad));
    expect([...entidades]).toEqual(expect.arrayContaining(["parto", "lactancia", "evento_reproductivo"]));
    expect((await listarHistorialAnimal(db, r.criasIds[0])).some((e) => e.entidad === "pesaje_corporal")).toBe(true);
    expect(h.partos[0].crias).toHaveLength(3);
  });

  it("sin servicio «preñada» previo, el padre queda vacío y «sin verificar»", async () => {
    const r = await registrarParto(db, { hembraId: bella, fecha: "2025-08-06", crias: [cria("Sola")], observaciones: null }, PROPIETARIO);
    const f = (await obtenerAnimal(db, r.criasIds[0]))!;
    expect([f.padreId, f.padreSinVerificar, f.composicion]).toEqual([null, true, []]);
  });

  it("valida antes de escribir: aretes repetidos, crías sin nombre ni arete, fechas imposibles", async () => {
    await crear(db, { nombre: "Otra", identificadores: [arete("C-9")] });
    expect(
      await codigos(registrarParto(db, { hembraId: bella, fecha: "2025-08-06", crias: [cria("A", { arete: "c-9" }), cria(null)], observaciones: null }, PROPIETARIO)),
    ).toEqual(["identificador_duplicado", "sin_nombre_ni_identificador"]);
    expect(await codigos(registrarParto(db, { hembraId: bella, fecha: "2020-01-01", crias: [cria("A")], observaciones: null }, PROPIETARIO))).toEqual([
      "fecha_anterior_al_nacimiento",
    ]);
    expect(await codigos(registrarParto(db, { hembraId: bella, fecha: "2025-08-06", crias: [], observaciones: null }, PROPIETARIO))).toEqual(["sin_crias"]);
    const [{ n }] = await db.consultar<{ n: number }>("SELECT count(*) AS n FROM parto");
    expect(n).toBe(0);
  });

  it("un parto nuevo seca la lactancia anterior; R9 da el intervalo entre partos", async () => {
    await registrarParto(db, { hembraId: bella, fecha: "2024-08-01", crias: [cria("Primera")], observaciones: null }, PROPIETARIO);
    await registrarParto(db, { hembraId: bella, fecha: "2025-08-06", crias: [cria("Segunda")], observaciones: null }, PROPIETARIO);
    const lactancias = await listarLactancias(db, { soloAbiertas: false });
    expect(lactancias.map((l) => [l.fechaInicio, l.fechaSecado])).toEqual([
      ["2025-08-06", null],
      ["2024-08-01", "2025-08-05"],
    ]);
    const h = await historialReproductivo(db, bella);
    expect(h.intervalos).toEqual([370]);
    expect(await resumenIntervalos(db)).toEqual([
      { hembraId: bella, hembra: "Bella", partos: 2, ultimoIntervalo: 370, intervaloPromedio: 370 },
    ]);
  });
});
