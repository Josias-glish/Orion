import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sumarDias } from "../src/dominio/fechas";
import { crearBaseDePrueba, type ConexionMemoria } from "../src/datos/conexion-memoria";
import { listarAnimales, obtenerAnimal } from "../src/datos/repositorios/animales";
import { calcularConsanguinidad } from "../src/datos/repositorios/genealogia";
import { listarLactancias, listarOrdeno } from "../src/datos/repositorios/leche";
import { listarMetas, pesajesDeAnimal } from "../src/datos/repositorios/pesos";
import { listarAlertasRetiro, listarProximasAplicaciones } from "../src/datos/repositorios/salud";
import { historialReproductivo, listarPartosProximos, listarServicios, resumenIntervalos } from "../src/datos/repositorios/reproduccion";
import { cargarDatosDeEjemplo, MARCA_EJEMPLO } from "./datos-de-ejemplo";

let db: ConexionMemoria;
beforeEach(() => {
  db = crearBaseDePrueba();
});
afterEach(() => db.cerrar());

const HOY = "2026-09-15"; // fijo y en el pasado: ningún dato queda en el futuro
const porArete = async (arete: string) => (await listarAnimales(db, { texto: arete }))[0];

describe("datos de ejemplo (sección 12)", () => {
  it("carga 12 animales en tres generaciones con la consanguinidad esperada, más las crías de los partos recientes", async () => {
    expect(await cargarDatosDeEjemplo(db, HOY)).toEqual({ creados: 16, yaCargados: false, creoFinca: true });
    expect(await listarAnimales(db)).toHaveLength(16);
    const consanguinidad = async (arete: string) => (await calcularConsanguinidad(db, (await porArete(arete)).id)).coeficiente;
    expect(await consanguinidad("EJ-10")).toBeCloseTo(0.25, 10); // hijos de hermanos completos
    expect(await consanguinidad("EJ-11")).toBeCloseTo(0.125, 10); // hijos de medios hermanos
    expect(await consanguinidad("EJ-12")).toBe(0);
    const gema = (await obtenerAnimal(db, (await porArete("EJ-12")).id))!;
    expect(gema.padreSinVerificar).toBe(true);
  });

  it("no duplica nada si se ejecuta dos veces", async () => {
    await cargarDatosDeEjemplo(db, HOY);
    expect(await cargarDatosDeEjemplo(db, HOY)).toEqual({ creados: 0, yaCargados: true, creoFinca: false });
    expect(await listarAnimales(db)).toHaveLength(16);
  });

  it("deja lactancias en curso con pesajes hasta ayer, un parto próximo, un aborto y metas de peso", async () => {
    await cargarDatosDeEjemplo(db, HOY);
    const abiertas = await listarLactancias(db);
    expect(abiertas.map((l) => [l.hembra, l.fechaInicio, l.pesajes])).toEqual([
      ["Dalia", sumarDias(HOY, -40), 80],
      ["Bella", sumarDias(HOY, -95), 190],
      ["Abril", sumarDias(HOY, -200), 400],
    ]);
    expect(abiertas.every((l) => l.proyeccion !== null && l.proyeccion.proyeccion > l.proyeccion.acumulado)).toBe(true);
    // El ordeño de hoy está vacío, listo para probar el Flujo 2.
    const ordeno = await listarOrdeno(db, HOY, "manana");
    expect(ordeno.map((f) => [f.nombre, f.kilos, f.kilosAnteriores !== null])).toEqual([
      ["Abril", null, true],
      ["Bella", null, true],
      ["Dalia", null, true],
    ]);
    expect((await listarPartosProximos(db, HOY)).map((s) => [s.hembra, s.fechaProbableParto])).toEqual([
      ["Estrella", sumarDias(HOY, 8)],
    ]);
    expect((await listarServicios(db)).map((s) => s.resultado).sort()).toEqual([
      "aborto",
      "pendiente",
      "prenada",
      "prenada",
      "prenada",
      "prenada",
      "vacia",
    ]);
    // R9 con los partos antiguos y los recientes.
    expect((await resumenIntervalos(db)).map((r) => [r.hembra, r.partos])).toEqual([
      ["Abril", 2],
      ["Bella", 3],
      ["Dalia", 2],
    ]);
    const bella = await historialReproductivo(db, (await porArete("EJ-07")).id);
    expect(bella.partos.map((p) => p.crias.map((c) => c.nombre))).toEqual([["Estrella"], ["Gema"], ["Luna", "Trueno"]]);
    // Crías: padre del servicio «preñada», rotuladas como ejemplo; Nieve viene de una pajilla sin macho registrado.
    const luna = (await obtenerAnimal(db, (await porArete("EJ-13")).id))!;
    expect([luna.padre?.nombre, luna.observaciones, luna.libroId]).toEqual(["Duque", MARCA_EJEMPLO, null]);
    const nieve = (await obtenerAnimal(db, (await porArete("EJ-15")).id))!;
    expect([nieve.padreId, nieve.padreSinVerificar, nieve.formaConcepcion]).toEqual([null, true, "inseminacion_artificial"]);
    // Pesos con ganancia diaria y meta.
    const rayo = await pesajesDeAnimal(db, (await porArete("EJ-16")).id);
    expect(rayo.map((p) => p.tipo)).toEqual(["nacimiento", "control", "destete", "control", "control"]);
    expect(rayo.slice(1).every((p) => p.gananciaDiaria! > 0 && p.meta !== null)).toBe(true);
    expect(await listarMetas(db)).toHaveLength(8);
  });

  it("trae un tratamiento con retiro vigente, una vacuna próxima y una desparasitación vencida (sección 12, etapa 4)", async () => {
    await cargarDatosDeEjemplo(db, HOY);
    expect((await listarAlertasRetiro(db, HOY)).map((a) => [a.animal, a.tipo, a.hasta])).toEqual([
      ["Bella", "leche", sumarDias(HOY, 4)],
      ["Bella", "carne", sumarDias(HOY, 6)],
    ]);
    const proximas = await listarProximasAplicaciones(db, HOY);
    expect(proximas.filter((p) => p.vencida).map((p) => p.animal)).toEqual(["Bruno", "Cacique", "Duque", "Zeus"]);
    expect(proximas.filter((p) => !p.vencida).map((p) => p.animal)).toEqual(["Abril", "Bella", "Brisa", "Canela", "Dalia"]);
  });
});
