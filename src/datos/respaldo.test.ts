// CA-11 y RF-43: exportar todos los datos de la finca y restaurarlos en una instalación vacía.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cargarDatosDeEjemplo } from "../../scripts/datos-de-ejemplo";
import { cargarTraspasosDeEjemplo } from "../../scripts/traspasos-de-ejemplo";
import { OPERARIO, PROPIETARIO } from "./ayudas-pruebas";
import { archivosDeMigracion, crearBaseDePrueba, type ConexionMemoria } from "./conexion-memoria";
import { ErrorDeRegistro } from "./errores";
import { eliminarAnimal, listarAnimales } from "./repositorios/animales";
import { listarTraspasos } from "./repositorios/traspasos";
import { actualizarCategoria, listarCategorias, listarMovimientos } from "./repositorios/finanzas";
import { cambiarPin } from "./repositorios/usuarios";
import { anularRegistro, emitirRegistro, reemitirRegistro, registrarDocumentoDeRegistro } from "./repositorios/registros";
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

/** Datos de ejemplo (21 animales, servicios, partos, lactancias, pesajes, salud…) más un PIN, un tratamiento, un animal retirado y dos registros genealógicos. */
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
  // Etapa 7: Estrella se registra y se reemite (versión 2); Bruno se registra y se anula.
  const [estrella] = await listarAnimales(db, { texto: "EJ-10" });
  const [bruno] = await listarAnimales(db, { texto: "EJ-06" });
  const emitido = await emitirRegistro(db, estrella.id, PROPIETARIO, { hoy: "2026-09-15" });
  await registrarDocumentoDeRegistro(db, emitido.registroId, "documentos/PPE-0001-v1.pdf", PROPIETARIO, "2026-09-15");
  await reemitirRegistro(db, emitido.registroId, PROPIETARIO, { hoy: "2026-09-16" });
  await registrarDocumentoDeRegistro(db, emitido.registroId, "documentos/PPE-0001-v2.pdf", PROPIETARIO, "2026-09-16");
  const segundo = await emitirRegistro(db, bruno.id, PROPIETARIO, { hoy: "2026-09-15" });
  await anularRegistro(db, segundo.registroId, "Prueba de la copia de respaldo", PROPIETARIO);
}

describe("CA-11: restaurar un respaldo reproduce los mismos datos", () => {
  it("todas las tablas, fila por fila, incluidos el historial, los retirados y los hash de PIN", async () => {
    await finca(origen);
    const respaldo = await exportarRespaldo(origen, PROPIETARIO);
    await restaurarRespaldo(destino, leerRespaldo(JSON.stringify(respaldo)));
    const copia = await exportarRespaldo(destino, PROPIETARIO);
    expect(copia.tablas).toEqual(respaldo.tablas);
    // No es una comparación vacía: hay datos de verdad en las tablas grandes.
    // 16 de la sección 12 más Titán (de otra finca) y su cría Roble (etapa 6), con el contacto de su propietario,
    // y cuatro animales para probar los registros (etapa 7).
    expect(respaldo.tablas.animal.length).toBe(22);
    // Etapa 7: dos registros emitidos (uno reemitido y otro anulado) con su copia fija; también se restauran.
    expect(respaldo.tablas.registro_genealogico).toHaveLength(2);
    expect(respaldo.tablas.registro_genealogico.map((r) => r.estado).sort()).toEqual(["anulado", "emitido"]);
    expect(respaldo.tablas.registro_genealogico.every((r) => typeof r.instantanea === "string" && String(r.instantanea).includes('"esquema":1'))).toBe(true);
    expect(respaldo.tablas.certificado.filter((c) => c.tipo === "registro_propio")).toHaveLength(2);
    expect(respaldo.tablas.contacto).toHaveLength(1);
    expect(respaldo.tablas.animal.filter((a) => a.origen === "externo")).toHaveLength(1);
    expect(respaldo.tablas.pesaje_leche.length).toBe(670);
    expect(respaldo.tablas.historial_cambios.length).toBeGreaterThan(3000);
    expect(respaldo.tablas.evento_salud.length).toBe(14); // 13 de las semillas + 1 de esta prueba
    expect(respaldo.tablas.usuario[0].pin_hash).toMatch(/^pbkdf2-sha256\$/);
    expect(respaldo.tablas.animal.filter((a) => a.eliminado_en !== null)).toHaveLength(1);
  });

  it("Etapa 8: la calidad de la leche, las categorías y los movimientos se restauran tal cual", async () => {
    await finca(origen);
    const respaldo = await exportarRespaldo(origen, PROPIETARIO);
    await restaurarRespaldo(destino, leerRespaldo(JSON.stringify(respaldo)));
    expect(respaldo.tablas.categoria_economica.length).toBeGreaterThanOrEqual(6);
    expect(respaldo.tablas.movimiento_economico.length).toBeGreaterThan(0);
    expect(respaldo.tablas.pesaje_leche.some((p) => p.celulas_somaticas !== null)).toBe(true);
    expect(respaldo.tablas.pesaje_leche.some((p) => p.grasa_pct === null && p.celulas_somaticas === null)).toBe(true);
    expect((await listarMovimientos(destino)).length).toBe(respaldo.tablas.movimiento_economico.filter((m) => m.eliminado_en === null).length);
  });

  it("Etapa 9: las compras, las ventas y sus adjuntos se restauran tal cual, y el animal vendido sigue en su sitio", async () => {
    await cargarDatosDeEjemplo(origen, HOY);
    await cargarTraspasosDeEjemplo(origen, () => PROPIETARIO, HOY);
    const respaldo = await exportarRespaldo(origen, PROPIETARIO);
    expect(respaldo.tablas.traspaso.map((t) => t.tipo).sort()).toEqual(["compra", "venta"]);
    await restaurarRespaldo(destino, leerRespaldo(JSON.stringify(respaldo)));
    const copia = await exportarRespaldo(destino, PROPIETARIO);
    expect(copia.tablas.traspaso).toEqual(respaldo.tablas.traspaso);
    expect(copia.tablas.animal).toEqual(respaldo.tablas.animal);
    const filas = await listarTraspasos(destino);
    expect(filas.map((f) => f.tipo).sort()).toEqual(["compra", "venta"]);
    expect(filas.find((f) => f.tipo === "venta")!.animal).toBe("Cacique");
  });

  it("una categoría precargada renombrada se restaura aunque otra nueva use su nombre original", async () => {
    const ALIMENTO = "cc5e2353-d7bc-4c1a-bf4d-446ae292c429";
    await actualizarCategoria(origen, ALIMENTO, { nombre: "Concentrado", activo: true }, PROPIETARIO);
    // El id nuevo va antes que el precargado en el orden del respaldo: sin cuidado, chocaría con «Alimento».
    await origen.ejecutar(
      "INSERT INTO categoria_economica (id, nombre, tipo, creado_en, modificado_en) VALUES ('00000000-0000-4000-8000-000000000000', 'Alimento', 'gasto', ?, ?)",
      ["2026-09-15T12:00:00.000Z", "2026-09-15T12:00:00.000Z"],
    );
    const respaldo = await exportarRespaldo(origen, PROPIETARIO);
    await restaurarRespaldo(destino, leerRespaldo(JSON.stringify(respaldo)));
    expect((await exportarRespaldo(destino, PROPIETARIO)).tablas.categoria_economica).toEqual(respaldo.tablas.categoria_economica);
    expect((await listarCategorias(destino, { tipo: "gasto" })).map((c) => c.nombre)).toEqual(["Alimento", "Compra de animales", "Concentrado", "Mano de obra", "Medicamentos", "Montas y pajillas"]);
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
