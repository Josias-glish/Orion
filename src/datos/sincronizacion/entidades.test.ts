import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { crearBaseDePrueba, type ConexionMemoria } from "../conexion-memoria";
import {
  definicionDeEntidad,
  ENTIDADES_SINCRONIZADAS,
  esColumnaReservada,
  columnaSube,
  columnaViaja,
  ordenDeEntidad,
  TABLAS_LOCALES_O_EXCLUIDAS,
} from "../../dominio/sincronizacion/entidades";

let db: ConexionMemoria;
beforeEach(() => {
  db = crearBaseDePrueba();
});
afterEach(() => db.cerrar());

interface Columna {
  name: string;
}
interface Referencia {
  table: string;
}

describe("registro de entidades sincronizadas", () => {
  it("cada tabla de la base se sincroniza o figura con el motivo por el que no", async () => {
    const tablas = await db.consultar<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_sqlx%' ORDER BY name",
    );
    const conocidas = new Set([...ENTIDADES_SINCRONIZADAS.map((e) => e.tabla), ...Object.keys(TABLAS_LOCALES_O_EXCLUIDAS)]);
    const sinDecidir = tablas.map((t) => t.name).filter((nombre) => !conocidas.has(nombre));
    expect(sinDecidir, "Una tabla nueva obliga a decidir si se sincroniza (entidades.ts)").toEqual([]);
    for (const nombre of conocidas) expect(tablas.map((t) => t.name)).toContain(nombre);
  });

  it("ninguna tabla está en las dos listas", () => {
    for (const e of ENTIDADES_SINCRONIZADAS) expect(TABLAS_LOCALES_O_EXCLUIDAS).not.toHaveProperty(e.tabla);
  });

  it("cada tabla va después de las que referencia (se puede crear en este orden)", async () => {
    for (const entidad of ENTIDADES_SINCRONIZADAS) {
      const referencias = await db.consultar<Referencia>(`SELECT DISTINCT "table" FROM pragma_foreign_key_list('${entidad.tabla}')`);
      for (const { table } of referencias) {
        if (table === entidad.tabla || !definicionDeEntidad(table)) continue;
        expect(ordenDeEntidad(table), `${entidad.tabla} referencia a ${table}`).toBeLessThan(ordenDeEntidad(entidad.tabla));
      }
    }
  });

  it("las columnas que nombra el registro existen en la tabla", async () => {
    for (const e of ENTIDADES_SINCRONIZADAS) {
      const columnas = new Set((await db.consultar<Columna>(`SELECT name FROM pragma_table_info('${e.tabla}')`)).map((c) => c.name));
      expect(columnas.has("id"), `${e.tabla} tiene id`).toBe(true);
      const nombradas = [
        ...(e.autorreferencias ?? []),
        ...(e.excluidas ?? []),
        ...(e.reservadas ?? []),
        ...(e.archivos ?? []).map((a) => a.columna),
        ...(e.contactos ?? []),
      ];
      for (const columna of nombradas) expect(columnas.has(columna), `${e.tabla}.${columna}`).toBe(true);
    }
  });

  it("las tablas que se sincronizan tienen creado_en y eliminado_en (la mezcla los necesita)", async () => {
    for (const e of ENTIDADES_SINCRONIZADAS) {
      const columnas = new Set((await db.consultar<Columna>(`SELECT name FROM pragma_table_info('${e.tabla}')`)).map((c) => c.name));
      expect(columnas.has("creado_en"), `${e.tabla}.creado_en`).toBe(true);
      expect(columnas.has("modificado_en"), `${e.tabla}.modificado_en`).toBe(true);
    }
  });

  it("el PIN y las columnas locales no viajan, y las reservadas las marca el registro", () => {
    expect(columnaViaja("usuario", "pin_hash")).toBe(false);
    expect(columnaViaja("usuario", "pin_pendiente")).toBe(false);
    expect(columnaViaja("usuario", "nombre")).toBe(true);
    expect(columnaViaja("animal", "modificado_en")).toBe(false);
    expect(columnaViaja("animal", "id")).toBe(false);
    expect(esColumnaReservada("registro_genealogico", "numero")).toBe(true);
    expect(esColumnaReservada("libro", "siguiente_numero")).toBe(true);
    // Las reservadas se reciben pero no se envían.
    expect(columnaViaja("libro", "siguiente_numero")).toBe(true);
    expect(columnaSube("libro", "siguiente_numero")).toBe(false);
    expect(columnaSube("registro_genealogico", "numero")).toBe(false);
    expect(columnaSube("registro_genealogico", "observaciones")).toBe(true);
    expect(esColumnaReservada("libro", "prefijo")).toBe(false);
  });
});
