// Etapa 6 (especificación 2): R29, R30, CA-13, CA-14, CA-15 y R23 con la base de datos. Escritas antes del código.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sumarDias } from "../../dominio/fechas";
import { arete, crearAnimalDePrueba as crear, OPERARIO, PROPIETARIO } from "../ayudas-pruebas";
import { crearBaseDePrueba, type ConexionMemoria } from "../conexion-memoria";
import { ErrorDeRegistro } from "../errores";
import { animalExternoVacio, contarAnimales, eliminarAnimal, guardarAnimal, listarAnimales, listarExternos, obtenerAnimal } from "./animales";
import { listarCatalogo } from "./catalogos";
import { guardarContacto } from "./contactos";
import { calcularConsanguinidad, consultarArbol } from "./genealogia";
import { listarOrdeno } from "./leche";
import { listarLotes, crearLote } from "./lotes";
import {
  analisisDePaternidad,
  diagnosticarServicio,
  listarHembrasDisponibles,
  listarMachosDisponibles,
  listarPartosProximos,
  listarServicios,
  registrarParto,
  registrarServicio,
  serviciosComoMacho,
} from "./reproduccion";
import { listarAlertasRetiro, registrarEventoSalud } from "./salud";

let db: ConexionMemoria;
let roble: string;
let titan: string;
let bella: string;
let duque: string;
beforeEach(async () => {
  db = crearBaseDePrueba();
  const razas = await listarCatalogo(db, "raza");
  const raza = (nombre: string) => razas.find((r) => r.nombre === nombre)!.id;
  roble = await guardarContacto(
    db,
    { nombre: "Ramiro Ejemplo", criadero: "Hato El Roble", municipio: "San Gil", telefono: null, correo: null, notas: null },
    PROPIETARIO,
  );
  titan = await guardarAnimal(
    db,
    {
      ...animalExternoVacio(),
      nombre: "Titán",
      sexo: "macho",
      fechaNacimiento: "2019-05-10",
      contactoId: roble,
      identificadores: [{ tipo: "registro_asociacion", valor: "ANCO-777", fecha: null, vigente: true, principal: true }],
      composicion: [{ razaId: raza("Anglonubiana"), fraccion: 1 }],
    },
    PROPIETARIO,
  );
  duque = await crear(db, { nombre: "Duque", sexo: "macho", fechaNacimiento: "2018-01-01", identificadores: [arete("D-1")] });
  bella = await crear(db, {
    nombre: "Bella",
    fechaNacimiento: "2021-01-01",
    identificadores: [arete("B-1")],
    composicion: [{ razaId: raza("Alpina"), fraccion: 1 }],
  });
});
afterEach(() => db.cerrar());

const codigos = (p: Promise<unknown>) =>
  p.then(
    () => [],
    (e: unknown) => (e instanceof ErrorDeRegistro ? e.motivos.map((m) => m.codigo) : [String(e)]),
  );

const monta = (machoId: string, fecha: string, extra: { costo?: number | null; condiciones?: string | null } = {}) =>
  registrarServicio(
    db,
    { hembraId: bella, tipo: "monta", machoId, pajilla: null, fecha, observaciones: null, costo: null, condiciones: null, ...extra },
    PROPIETARIO,
  );

describe("R29: registrar animales de otras fincas", () => {
  it("guarda el origen, el propietario y queda fuera del hato y de los lotes", async () => {
    const t = (await obtenerAnimal(db, titan))!;
    expect(t).toMatchObject({ origen: "externo", enHato: false, contactoId: roble, loteId: null });
    expect(t.propietario).toMatchObject({ nombre: "Ramiro Ejemplo", criadero: "Hato El Roble" });
  });

  it("exige el propietario y no admite lote", async () => {
    const lote = await crearLote(db, { nombre: "Ordeño", descripcion: null }, PROPIETARIO);
    const base = { ...animalExternoVacio(), nombre: "Reina", sexo: "hembra" as const };
    expect(await codigos(guardarAnimal(db, base, PROPIETARIO))).toEqual(["externo_sin_propietario"]);
    expect(await codigos(guardarAnimal(db, { ...base, contactoId: roble, loteId: lote }, PROPIETARIO))).toEqual(["externo_en_lote"]);
    expect((await listarLotes(db))[0].animales).toBe(0);
  });

  it("la lista «De otras fincas» trae los externos con su propietario, y también los registrados solo para la genealogía", async () => {
    await crear(db, { nombre: "Abuelo antiguo", sexo: "macho", enHato: false });
    const externos = await listarExternos(db);
    expect(externos.map((a) => [a.nombre, a.origen, a.propietario])).toEqual([
      ["Abuelo antiguo", "nacido_aqui", null],
      ["Titán", "externo", "Ramiro Ejemplo · Hato El Roble"],
    ]);
  });
});

describe("CA-13: un externo está en el pedigrí pero no en las listas de trabajo", () => {
  let reina: string;
  let hija: string;
  beforeEach(async () => {
    reina = await guardarAnimal(db, { ...animalExternoVacio(), nombre: "Reina", sexo: "hembra", fechaNacimiento: "2018-02-02", contactoId: roble }, PROPIETARIO);
    hija = await crear(db, { nombre: "Hija de Titán", fechaNacimiento: "2023-04-04", padreId: titan, madreId: reina, identificadores: [arete("H-1")] });
  });

  it("aparece en el pedigrí con su propietario", async () => {
    const arbol = await consultarArbol(db, hija);
    expect(arbol.filter((n) => n.camino !== "").map((n) => [n.camino, n.nombre, n.origen, n.propietario])).toEqual([
      ["P", "Titán", "externo", "Ramiro Ejemplo · Hato El Roble"],
      ["M", "Reina", "externo", "Ramiro Ejemplo · Hato El Roble"],
    ]);
  });

  it("no aparece en el inventario ni cuenta en el conteo de animales (base del tope de la Etapa 14)", async () => {
    expect((await listarAnimales(db)).map((a) => a.nombre).sort()).toEqual(["Bella", "Duque", "Hija de Titán"]);
    expect(await contarAnimales(db)).toEqual({ total: 3, hembras: 2, machos: 1 });
  });

  it("no recibe servicios propios, no entra al ordeño ni a las alertas", async () => {
    expect((await listarHembrasDisponibles(db)).map((h) => h.nombre)).not.toContain("Reina");
    expect(
      await codigos(
        registrarServicio(
          db,
          { hembraId: reina, tipo: "monta", machoId: duque, pajilla: null, fecha: "2025-03-10", observaciones: null, costo: null, condiciones: null },
          PROPIETARIO,
        ),
      ),
    ).toEqual(["animal_no_disponible"]);
    expect(await codigos(registrarParto(db, { hembraId: reina, fecha: "2025-08-07", crias: [], observaciones: null }, PROPIETARIO))).toContain(
      "animal_no_disponible",
    );
    expect(await listarOrdeno(db, "2025-08-08", "manana")).toEqual([]);
    expect(
      await codigos(
        registrarEventoSalud(
          db,
          {
            destino: { animalId: titan },
            tipo: "tratamiento",
            producto: "Oxitetraciclina",
            numeroRegistroIca: null,
            loteProducto: null,
            dosis: null,
            via: null,
            fechaInicio: "2025-08-01",
            fechaFin: null,
            retiroLecheDias: 5,
            retiroCarneDias: 7,
            aplicador: null,
            veterinario: null,
            condicionCorporal: null,
            proximaFecha: null,
            observaciones: null,
          },
          PROPIETARIO,
        ),
      ),
    ).toEqual(["animal_no_disponible"]);
    expect(await listarAlertasRetiro(db, "2025-08-02")).toEqual([]);
    expect(await listarPartosProximos(db, "2025-08-02")).toEqual([]);
  });

  it("no se puede retirar si es ancestro de un animal del hato; si no lo es, sí", async () => {
    expect(await codigos(eliminarAnimal(db, titan, PROPIETARIO))).toEqual(["externo_ancestro_de_propio"]);
    const solo = await guardarAnimal(db, { ...animalExternoVacio(), nombre: "Sin crías", sexo: "macho", contactoId: roble }, PROPIETARIO);
    await eliminarAnimal(db, solo, PROPIETARIO);
    expect((await listarExternos(db)).map((a) => a.nombre)).not.toContain("Sin crías");
  });

  it("la consanguinidad incluye a los externos", async () => {
    // Nieta de Titán por las dos líneas: hija de Titán × hijo de Titán.
    const hijo = await crear(db, { nombre: "Hijo de Titán", sexo: "macho", fechaNacimiento: "2023-05-05", padreId: titan, identificadores: [arete("H-2")] });
    const nieta = await crear(db, { nombre: "Nieta", fechaNacimiento: "2025-01-01", padreId: hijo, madreId: hija, identificadores: [arete("N-1")] });
    expect((await calcularConsanguinidad(db, nieta)).coeficiente).toBeCloseTo(0.125, 10);
  });
});

describe("R30: montas con machos de otras fincas", () => {
  it("el servicio acepta un macho de otra finca, con costo y condiciones", async () => {
    await monta(titan, "2025-03-10", { costo: 150000, condiciones: "Se paga al confirmar la preñez" });
    const [s] = await listarServicios(db);
    expect(s).toMatchObject({ macho: "Titán", machoExterno: true, costo: 150000, condiciones: "Se paga al confirmar la preñez" });
  });

  it("costo y condiciones solo con un macho de otra finca", async () => {
    expect(await codigos(monta(duque, "2025-03-10", { costo: 1000 }))).toEqual(["costo_solo_externo"]);
  });

  it("separa los machos del hato de los de otras fincas", async () => {
    expect((await listarMachosDisponibles(db, "hato")).map((m) => m.nombre)).toEqual(["Duque"]);
    expect((await listarMachosDisponibles(db, "otra_finca")).map((m) => m.nombre)).toEqual(["Titán"]);
  });

  it("la ficha del macho externo trae su historial de servicios y sus resultados", async () => {
    const s1 = await monta(titan, "2025-03-10", { costo: 150000 });
    await diagnosticarServicio(db, s1, "prenada", "2025-04-20", PROPIETARIO);
    await registrarParto(
      db,
      {
        hembraId: bella,
        fecha: "2025-08-07",
        crias: [
          { sexo: "hembra", nombre: "Cría 1", arete: "C-1", pesoNacimiento: 3.1, nacioMuerta: false },
          { sexo: "macho", nombre: "Cría 2", arete: "C-2", pesoNacimiento: 3.4, nacioMuerta: false },
        ],
        observaciones: null,
      },
      PROPIETARIO,
    );
    await monta(titan, "2025-10-01");
    const h = await serviciosComoMacho(db, titan);
    expect(h.resumen).toEqual({ servicios: 2, prenadas: 1, vacias: 0, abortos: 0, pendientes: 1, partos: 1, crias: 2 });
    expect(h.servicios.map((s) => [s.fecha, s.hembra, s.resultado, s.crias, s.costo])).toEqual([
      ["2025-10-01", "Bella", "pendiente", 0, null],
      ["2025-03-10", "Bella", "prenada", 2, 150000],
    ]);
  });
});

describe("CA-14: parto de una hembra servida por un macho de otra finca", () => {
  it("crea la cría con ese macho como padre, y el pedigrí muestra su nombre y su propietario", async () => {
    const s = await monta(titan, "2025-03-10");
    await diagnosticarServicio(db, s, "prenada", "2025-04-20", PROPIETARIO);
    const { criasIds, padreId } = await registrarParto(
      db,
      { hembraId: bella, fecha: sumarDias("2025-03-10", 150), crias: [{ sexo: "hembra", nombre: "Luna", arete: "L-1", pesoNacimiento: 3, nacioMuerta: false }], observaciones: null },
      PROPIETARIO,
    );
    expect(padreId).toBe(titan);
    const luna = (await obtenerAnimal(db, criasIds[0]))!;
    expect(luna).toMatchObject({ padreId: titan, padreSinVerificar: false, madreId: bella, origen: "nacido_aqui", enHato: true, formaConcepcion: "monta_natural" });
    // R3: Anglonubiana 100 % × Alpina 100 % → 50 % y 50 %.
    expect(luna.composicion.map((c) => [c.raza, c.fraccion])).toEqual([
      ["Alpina", 0.5],
      ["Anglonubiana", 0.5],
    ]);
    const [padre] = (await consultarArbol(db, luna.id)).filter((n) => n.camino === "P");
    expect(padre).toMatchObject({ nombre: "Titán", origen: "externo", propietario: "Ramiro Ejemplo · Hato El Roble", identificador: "ANCO-777" });
  });
});

describe("CA-15: paternidad incierta con dos machos dentro de la ventana de gestación", () => {
  const parto = { hembraId: "", fecha: "2025-08-07", crias: [{ sexo: "macho" as const, nombre: "Duda", arete: "X-1", pesoNacimiento: null, nacioMuerta: false }], observaciones: null };
  let sDuque: string;
  let sTitan: string;
  beforeEach(async () => {
    parto.hembraId = bella;
    sDuque = await monta(duque, "2025-03-05");
    sTitan = await monta(titan, "2025-03-14");
  });

  it("avisa la incertidumbre y ofrece los dos machos", async () => {
    const a = await analisisDePaternidad(db, bella, "2025-08-07");
    expect(a.incierta).toBe(true);
    // 150 días de gestación ± 10 de margen (SUPOSICION) antes del parto.
    expect(a.ventana).toEqual({ desde: "2025-02-28", hasta: "2025-03-20" });
    expect(a.candidatos.map((c) => [c.servicioId, c.macho, c.machoExterno, c.propietario])).toEqual([
      [sTitan, "Titán", true, "Ramiro Ejemplo · Hato El Roble"],
      [sDuque, "Duque", false, null],
    ]);
  });

  it("no registra el parto sin que el usuario elija al padre", async () => {
    expect(await codigos(registrarParto(db, parto, PROPIETARIO))).toEqual(["elegir_padre"]);
  });

  it("deja elegir al padre y marcarlo «sin verificar»", async () => {
    const { criasIds } = await registrarParto(db, { ...parto, padre: { servicioId: sDuque, sinVerificar: true } }, PROPIETARIO);
    expect((await obtenerAnimal(db, criasIds[0]))!).toMatchObject({ padreId: duque, padreSinVerificar: true });
  });

  it("también puede dejar el padre desconocido", async () => {
    const { criasIds } = await registrarParto(db, { ...parto, padre: { servicioId: null, sinVerificar: true } }, PROPIETARIO);
    expect((await obtenerAnimal(db, criasIds[0]))!).toMatchObject({ padreId: null, padreSinVerificar: true });
  });

  it("usa el margen configurado en la finca: con margen 0 solo cuenta el día exacto", async () => {
    await db.ejecutar(
      "INSERT INTO finca (id, nombre, margen_gestacion, creado_en, modificado_en) VALUES ('00000000-0000-4000-8000-000000000001', 'Finca', 0, ?, ?)",
      [PROPIETARIO.marcaTiempo, PROPIETARIO.marcaTiempo],
    );
    const a = await analisisDePaternidad(db, bella, "2025-08-07");
    expect(a.incierta).toBe(false);
  });
});

describe("R23: el operario ve a los externos pero no los crea ni los edita", () => {
  it("ve la lista y la ficha", async () => {
    expect((await listarExternos(db)).map((a) => a.nombre)).toEqual(["Titán"]);
  });

  it("no crea ni edita animales externos ni contactos", async () => {
    expect(await codigos(guardarAnimal(db, { ...animalExternoVacio(), nombre: "Otro", contactoId: roble }, OPERARIO))).toEqual(["sin_permiso"]);
    const t = (await obtenerAnimal(db, titan))!;
    expect(await codigos(guardarAnimal(db, { ...t, nombre: "Titán II" }, OPERARIO, titan))).toEqual(["sin_permiso"]);
    expect(
      await codigos(guardarContacto(db, { nombre: "Nuevo", criadero: null, municipio: null, telefono: null, correo: null, notas: null }, OPERARIO)),
    ).toEqual(["sin_permiso"]);
  });
});
