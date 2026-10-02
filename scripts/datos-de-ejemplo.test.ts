import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sumarDias } from "../src/dominio/fechas";
import { crearBaseDePrueba, type ConexionMemoria } from "../src/datos/conexion-memoria";
import { listarAnimales, listarExternos, obtenerAnimal } from "../src/datos/repositorios/animales";
import { calcularConsanguinidad } from "../src/datos/repositorios/genealogia";
import { listarLactancias, listarOrdeno } from "../src/datos/repositorios/leche";
import { listarMetas, pesajesDeAnimal } from "../src/datos/repositorios/pesos";
import { listarAlertasRetiro, listarProximasAplicaciones } from "../src/datos/repositorios/salud";
import { historialReproductivo, listarPartosProximos, listarServicios, resumenIntervalos, serviciosComoMacho } from "../src/datos/repositorios/reproduccion";
import { consultarArbol } from "../src/datos/repositorios/genealogia";
import { PROPIETARIO } from "../src/datos/ayudas-pruebas";
import { listarVerificaciones } from "../src/datos/repositorios/registros";
import { listarCategorias, listarMovimientos, resumenFinanciero, serviciosConGasto } from "../src/datos/repositorios/finanzas";
import { listarComparacionCalidad } from "../src/datos/repositorios/leche";
import { cargarCalidadYFinanzasDeEjemplo } from "./calidad-y-finanzas-de-ejemplo";
import { cargarExternosDeEjemplo } from "./externos-de-ejemplo";
import { cargarRegistrosDeEjemplo } from "./registros-de-ejemplo";
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
    expect(await cargarDatosDeEjemplo(db, HOY)).toEqual({ creados: 16, yaCargados: false, creoFinca: true, externos: true, registros: true, finanzas: true });
    // Más Roble, la cría de Titán (etapa 6), y cuatro animales para probar los registros (etapa 7).
    expect(await listarAnimales(db)).toHaveLength(21);
    const consanguinidad = async (arete: string) => (await calcularConsanguinidad(db, (await porArete(arete)).id)).coeficiente;
    expect(await consanguinidad("EJ-10")).toBeCloseTo(0.25, 10); // hijos de hermanos completos
    expect(await consanguinidad("EJ-11")).toBeCloseTo(0.125, 10); // hijos de medios hermanos
    expect(await consanguinidad("EJ-12")).toBe(0);
    const gema = (await obtenerAnimal(db, (await porArete("EJ-12")).id))!;
    expect(gema.padreSinVerificar).toBe(true);
  });

  it("no duplica nada si se ejecuta dos veces", async () => {
    await cargarDatosDeEjemplo(db, HOY);
    expect(await cargarDatosDeEjemplo(db, HOY)).toEqual({ creados: 0, yaCargados: true, creoFinca: false, externos: false, registros: false, finanzas: false });
    expect(await listarAnimales(db)).toHaveLength(21);
    expect(await listarExternos(db)).toHaveLength(1);
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
      "pendiente",
      "prenada",
      "prenada",
      "prenada",
      "prenada",
      "prenada",
      "vacia",
      "vacia",
    ]);
    // R9 con los partos antiguos y los recientes.
    expect((await resumenIntervalos(db)).map((r) => [r.hembra, r.partos])).toEqual([
      ["Abril", 2],
      ["Bella", 3],
      ["Canela", 2],
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

  it("trae un semental de otra finca con su propietario, tres servicios y una cría suya (etapa 6)", async () => {
    await cargarDatosDeEjemplo(db, HOY);
    const [titan] = await listarExternos(db);
    expect([titan.nombre, titan.origen, titan.propietario]).toEqual(["Titán", "externo", "Criador vecino (ejemplo) · Hato El Roble (ejemplo)"]);
    const h = await serviciosComoMacho(db, titan.id);
    expect(h.resumen).toMatchObject({ servicios: 3, prenadas: 1, vacias: 1, pendientes: 1, partos: 1, crias: 1 });
    const roble = await porArete("EJ-17");
    const [padre] = (await consultarArbol(db, roble.id)).filter((n) => n.camino === "P");
    expect([padre.nombre, padre.propietario]).toEqual(["Titán", "Criador vecino (ejemplo) · Hato El Roble (ejemplo)"]);
    // Titán no aparece en el inventario ni en el ordeño; Canela no quedó con la lactancia abierta.
    expect((await listarAnimales(db)).map((a) => a.nombre)).not.toContain("Titán");
    expect((await listarOrdeno(db, HOY, "manana")).map((f) => f.nombre)).not.toContain("Canela");
  });

  it("agrega el semental a una base que ya tenía los datos de ejemplo de la versión 0.1.0, sin duplicarlo", async () => {
    await cargarDatosDeEjemplo(db, HOY);
    expect(await cargarExternosDeEjemplo(db, () => PROPIETARIO, HOY)).toBe(false);
    expect(await listarExternos(db)).toHaveLength(1);
  });
});

describe("registros genealógicos de ejemplo (etapa 7)", () => {
  it("deja animales listos para registrar y otros a los que les falta algún requisito, sin ningún registro emitido", async () => {
    await cargarDatosDeEjemplo(db, HOY);
    const lista = await listarVerificaciones(db);
    const faltantes = Object.fromEntries(lista.map((v) => [v.nombre, v.lista.faltantes]));
    // Listos: los doce de las etapas anteriores (los fundadores sin padres están exentos) y Nube.
    for (const nombre of ["Zeus", "Abril", "Brisa", "Canela", "Duque", "Bruno", "Bella", "Cacique", "Dalia", "Estrella", "Faro", "Gema", "Nube"]) {
      expect(faltantes[nombre], nombre).toEqual([]);
    }
    // Con algo pendiente.
    expect(faltantes["Perla"]).toEqual(["padre"]);
    expect(faltantes["Chispa"]).toEqual(["identificador"]);
    expect(faltantes["Ciro"]).toEqual(["nacimiento", "composicion"]);
    // Las crías recién nacidas no tienen libro todavía (R5).
    expect(lista.filter((v) => v.lista.faltantes.includes("libro"))).toHaveLength(5);
    expect(lista.filter((v) => v.lista.cumple)).toHaveLength(13);
    expect(lista.every((v) => v.registro === null)).toBe(true);
  });

  it("también se carga en una base que ya tenía los demás datos, y no se repite", async () => {
    await cargarDatosDeEjemplo(db, HOY);
    expect(await cargarRegistrosDeEjemplo(db, () => PROPIETARIO)).toBe(false);
  });
});

describe("calidad de la leche y finanzas de ejemplo (etapa 8)", () => {
  it("deja muestras de calidad con los promedios del cálculo manual y datos vacíos que no cuentan (R18)", async () => {
    await cargarDatosDeEjemplo(db, HOY);
    const filas = await listarComparacionCalidad(db);
    const de = (hembra: string) => filas.find((f) => f.hembra === hembra)!.resumen;
    // A mano: Abril (850 + 920 + 780 + 1100 + 870) mil / 5 = 904 000 células por ml.
    expect(de("Abril").celulas).toEqual({ promedio: 904000, muestras: 5 });
    expect(de("Abril").grasa.promedio).toBeCloseTo(3.14, 10);
    expect(de("Abril").proteina.promedio).toBeCloseTo(2.98, 10);
    // Bella: (340 + 410 + 380 + 450 + 360) mil / 5 = 388 000.
    expect(de("Bella").celulas).toEqual({ promedio: 388000, muestras: 5 });
    expect(de("Bella").grasa.promedio).toBeCloseTo(3.94, 10);
    // Dalia tiene vacíos a propósito: solo cuentan las muestras que traen el dato.
    expect(de("Dalia").celulas).toEqual({ promedio: 570000, muestras: 3 });
    expect(de("Dalia").grasa.muestras).toBe(3);
    expect(de("Dalia").grasa.promedio).toBeCloseTo(3.5, 10);
    expect(de("Dalia").proteina.muestras).toBe(2);
    expect(de("Dalia").proteina.promedio).toBeCloseTo(3.05, 10);
  });

  it("deja ingresos y gastos con el resumen del cálculo manual y los gastos generales aparte (R19)", async () => {
    await cargarDatosDeEjemplo(db, HOY);
    expect((await listarCategorias(db)).length).toBe(6);
    expect((await listarMovimientos(db)).length).toBe(8);
    const { finca, lotes, animales } = await resumenFinanciero(db);
    expect(finca).toMatchObject({
      ingresos: 3_400_000,
      gastos: 3_910_000,
      rentabilidad: -510_000,
      gastosGenerales: 2_700_000,
      gastosDeLotes: 940_000,
      gastosDeAnimales: 270_000,
      ingresosGenerales: 2_300_000,
    });
    expect(lotes.map((l) => [l.nombre, l.ingresos, l.gastos, l.rentabilidad])).toEqual([
      ["Levante", 0, 90_000, -90_000],
      ["Ordeño", 1_100_000, 850_000, 250_000],
    ]);
    expect(animales.map((a) => [a.nombre, a.costo])).toEqual([
      ["Canela", 150_000],
      ["Bella", 120_000],
    ]);
  });

  it("R30: la monta de Canela ya tiene su gasto y la de Dalia (con costo) queda sin él, lista para ofrecerlo", async () => {
    await cargarDatosDeEjemplo(db, HOY);
    const [titan] = await listarExternos(db);
    const { servicios } = await serviciosComoMacho(db, titan.id);
    const conCosto = servicios.filter((s) => s.costo);
    expect(conCosto.map((s) => s.hembra).sort()).toEqual(["Canela", "Dalia"]);
    const conGasto = await serviciosConGasto(db, conCosto.map((s) => s.id));
    expect(conCosto.filter((s) => conGasto.has(s.id)).map((s) => s.hembra)).toEqual(["Canela"]);
  });

  it("también se carga en una base que ya tenía los demás datos, y no se repite", async () => {
    await cargarDatosDeEjemplo(db, HOY);
    expect(await cargarCalidadYFinanzasDeEjemplo(db, () => PROPIETARIO, HOY)).toBe(false);
    expect((await listarMovimientos(db)).length).toBe(8);
  });
});
