// Etapa 9: la compra y la venta que carga `npm run semillas`.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PROPIETARIO } from "../src/datos/ayudas-pruebas";
import { crearBaseDePrueba, type ConexionMemoria } from "../src/datos/conexion-memoria";
import { listarAnimales, listarExternos, obtenerAnimal } from "../src/datos/repositorios/animales";
import { listarMovimientos } from "../src/datos/repositorios/finanzas";
import { datosInventario, listarTraspasos } from "../src/datos/repositorios/traspasos";
import { sumarDias } from "../src/dominio/fechas";
import { cargarDatosDeEjemplo } from "./datos-de-ejemplo";
import { cargarTraspasosDeEjemplo, REGISTRO_AURORA } from "./traspasos-de-ejemplo";

let db: ConexionMemoria;
beforeEach(() => {
  db = crearBaseDePrueba();
});
afterEach(() => db.cerrar());

const HOY = "2026-09-15";
const contexto = () => ({ ...PROPIETARIO, marcaTiempo: "2026-09-15T12:00:00.000Z" });
const porArete = async (arete: string) => (await listarAnimales(db, { texto: arete, incluirSoloGenealogia: true }))[0];

describe("compra y venta de ejemplo (npm run semillas, etapa 9)", () => {
  it("carga una compra y una venta, sin gasto ni ingreso, para probar el ofrecimiento desde el historial", async () => {
    await cargarDatosDeEjemplo(db, HOY);
    const gastosAntes = (await listarMovimientos(db)).length;
    expect(await cargarTraspasosDeEjemplo(db, contexto, HOY)).toBe(true);
    const traspasos = await listarTraspasos(db);
    expect(traspasos.map((t) => [t.tipo, t.animal, t.precio, t.fecha, t.movimientoId])).toEqual([
      ["venta", "Cacique", 900_000, sumarDias(HOY, -10), null],
      ["compra", "Aurora", 1_800_000, sumarDias(HOY, -40), null],
    ]);
    expect((await listarMovimientos(db)).length).toBe(gastosAntes);
  });

  it("la compra deja a Aurora en el hato con su registro de asociación y su padre como animal de otra finca", async () => {
    await cargarDatosDeEjemplo(db, HOY);
    await cargarTraspasosDeEjemplo(db, contexto, HOY);
    const aurora = (await obtenerAnimal(db, (await porArete("EJ-40")).id))!;
    expect(aurora).toMatchObject({ origen: "comprado", enHato: true, estado: "activo", fechaIngreso: sumarDias(HOY, -40) });
    expect(aurora.identificadores.some((i) => i.tipo === "registro_asociacion" && i.valor === REGISTRO_AURORA)).toBe(true);
    expect(aurora.padre?.nombre).toBe("Rey de La Esperanza");
    expect((await listarExternos(db)).map((e) => e.nombre)).toContain("Rey de La Esperanza");
    const inventario = await datosInventario(db, HOY);
    expect(inventario.filas.map((f) => f.nombre)).toContain("Aurora");
    expect(inventario.filas.map((f) => f.nombre)).not.toContain("Cacique");
  });

  it("la venta deja a Cacique vendido, con su genealogía intacta", async () => {
    await cargarDatosDeEjemplo(db, HOY);
    await cargarTraspasosDeEjemplo(db, contexto, HOY);
    const cacique = (await obtenerAnimal(db, (await porArete("EJ-08")).id))!;
    expect(cacique.estado).toBe("vendido");
    const faro = (await obtenerAnimal(db, (await porArete("EJ-11")).id))!;
    expect(faro.padre?.id).toBe(cacique.id);
  });

  it("no se repite: la segunda vez no cambia nada", async () => {
    await cargarDatosDeEjemplo(db, HOY);
    await cargarTraspasosDeEjemplo(db, contexto, HOY);
    expect(await cargarTraspasosDeEjemplo(db, contexto, HOY)).toBe(false);
    expect(await listarTraspasos(db)).toHaveLength(2);
  });
});
