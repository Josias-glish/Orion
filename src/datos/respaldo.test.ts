// CA-11 y RF-43: exportar todos los datos de la finca y restaurarlos en una instalación vacía.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cargarDatosDeEjemplo } from "../../scripts/datos-de-ejemplo";
import { OPERARIO, PROPIETARIO } from "./ayudas-pruebas";
import { archivosDeMigracion, crearBaseDePrueba, type ConexionMemoria } from "./conexion-memoria";
import { ErrorDeRegistro } from "./errores";
import { eliminarAnimal, listarAnimales } from "./repositorios/animales";
import { cambiarPin } from "./repositorios/usuarios";
import { registrarEventoSalud } from "./repositorios/salud";
import { exportarRespaldo, leerRespaldo, restaurarRespaldo, TABLAS_RESPALDO, VERSION_ESQUEMA, type Respaldo } from "./respaldo";

let origen: ConexionMemoria;
let destino: ConexionMemoria;
beforeEach(() => {
  origen = crearBaseDePrueba();
  destino = crearBaseDePrueba();
});
afterEach(() => {
  origen.cerrar();
  destino.cerrar();
});

const HOY = "2026-09-15";
const codigos = async (promesa: Promise<unknown>) => {
  try {
    await promesa;
    return [];
  } catch (e) {
    if (e instanceof ErrorDeRegistro) return e.motivos.map((m) => m.codigo);
    throw e;
  }
};

/** Datos de ejemplo (16 animales, servicios, partos, lactancias, pesajes, salud…) más un PIN, un tratamiento y un animal retirado. */
async function finca(db: ConexionMemoria) {
  await cargarDatosDeEjemplo(db, HOY);
  const [{ id: usuario }] = await db.consultar<{ id: string }>("SELECT id FROM usuario LIMIT 1");
  await cambiarPin(db, usuario, "4321", PROPIETARIO);
  await eliminarAnimal(db, (await listarAnimales(db, { texto: "EJ-16" }))[0].id, PROPIETARIO);
  const [bella] = await listarAnimales(db, { texto: "EJ-07" });
  await registrarEventoSalud(
    db,
    {
      destino: { animalId: bella.id },
      tipo: "tratamiento",
      producto: "Oxitetraciclina (ejemplo)",
      numeroRegistroIca: "EJEMPLO-ICA",
      loteProducto: "L-1",
      dosis: "10 ml",
      via: "intramuscular",
      fechaInicio: "2026-09-10",
      fechaFin: null,
      retiroLecheDias: 5,
      retiroCarneDias: 28,
      aplicador: "Ana",
      veterinario: "Dr. Ejemplo",
      condicionCorporal: null,
      proximaFecha: null,
      observaciones: null,
    },
    PROPIETARIO,
  );
}

describe("CA-11: restaurar un respaldo reproduce los mismos datos", () => {
  it("todas las tablas, fila por fila, incluidos el historial, los retirados y los hash de PIN", async () => {
    await finca(origen);
    const respaldo = await exportarRespaldo(origen, PROPIETARIO);
    await restaurarRespaldo(destino, leerRespaldo(JSON.stringify(respaldo)));
    const copia = await exportarRespaldo(destino, PROPIETARIO);
    expect(copia.tablas).toEqual(respaldo.tablas);
    // No es una comparación vacía: hay datos de verdad en las tablas grandes.
    expect(respaldo.tablas.animal.length).toBe(16);
    expect(respaldo.tablas.pesaje_leche.length).toBe(670);
    expect(respaldo.tablas.historial_cambios.length).toBeGreaterThan(3000);
    expect(respaldo.tablas.evento_salud.length).toBe(14); // 13 de las semillas + 1 de esta prueba
    expect(respaldo.tablas.usuario[0].pin_hash).toMatch(/^pbkdf2-sha256\$/);
    expect(respaldo.tablas.animal.filter((a) => a.eliminado_en !== null)).toHaveLength(1);
  });

  it("el respaldo dice qué es, de qué versión del esquema y cuándo se hizo", async () => {
    await finca(origen);
    const r = await exportarRespaldo(origen, PROPIETARIO);
    expect(r.formato).toBe("registro-caprino-respaldo");
    expect(r.versionFormato).toBe(1);
    expect(r.versionEsquema).toBe(VERSION_ESQUEMA);
    expect(r.finca).toBe("Aprisco de ejemplo");
    expect(Object.keys(r.tablas)).toEqual([...TABLAS_RESPALDO]);
  });
});

describe("RF-43: reglas del respaldo (SUPOSICION)", () => {
  it("incluye todas las tablas de la base (una tabla nueva sin respaldo hace fallar esta prueba)", async () => {
    const tablas = await origen.consultar<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_sqlx%' ORDER BY name",
    );
    expect(tablas.map((t) => t.name)).toEqual([...TABLAS_RESPALDO].sort());
  });

  it("VERSION_ESQUEMA coincide con el número de migraciones", () => {
    expect(VERSION_ESQUEMA).toBe(archivosDeMigracion().length);
  });

  it("solo el propietario exporta la copia completa (R14)", async () => {
    expect(await codigos(exportarRespaldo(origen, OPERARIO))).toEqual(["sin_permiso"]);
  });

  it("solo se restaura en una instalación vacía: nunca se borran ni se mezclan datos", async () => {
    await finca(origen);
    const r = await exportarRespaldo(origen, PROPIETARIO);
    await finca(destino);
    expect(await codigos(restaurarRespaldo(destino, r))).toEqual(["base_no_vacia"]);
  });

  it("rechaza archivos que no son un respaldo, dañados o de una versión más nueva del programa", async () => {
    expect(() => leerRespaldo("esto no es json")).toThrow(ErrorDeRegistro);
    expect(() => leerRespaldo(JSON.stringify({ formato: "otro" }))).toThrow(ErrorDeRegistro);
    await finca(origen);
    const r = await exportarRespaldo(origen, PROPIETARIO);
    const nuevo: Respaldo = { ...r, versionEsquema: VERSION_ESQUEMA + 1 };
    expect(await codigos(restaurarRespaldo(destino, nuevo))).toEqual(["respaldo_mas_nuevo"]);
  });

  it("rechaza tablas o columnas desconocidas antes de escribir nada", async () => {
    await finca(origen);
    const r = await exportarRespaldo(origen, PROPIETARIO);
    const raro = structuredClone(r);
    (raro.tablas.animal[0] as Record<string, unknown>)["columna_inventada; DROP TABLE animal"] = 1;
    expect(await codigos(restaurarRespaldo(destino, raro))).toEqual(["respaldo_danado"]);
    const [{ n }] = await destino.consultar<{ n: number }>("SELECT count(*) AS n FROM animal");
    expect(n).toBe(0);
  });
});
