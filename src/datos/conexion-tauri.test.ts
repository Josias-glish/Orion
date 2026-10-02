// D-004 (D-054): en el programa, un lote de sentencias va entero al comando Rust `ejecutar_lote`, que lo aplica dentro de
// una transacción; las sentencias sueltas siguen yendo por el plugin SQL.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, execute, select, load } = vi.hoisted(() => {
  const execute = vi.fn();
  const select = vi.fn();
  return { invoke: vi.fn(), execute, select, load: vi.fn(async () => ({ execute, select })) };
});
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load } }));

import { abrirConexionTauri, URL_BASE_DATOS } from "./conexion-tauri";

describe("conexión del programa (D-004)", () => {
  beforeEach(() => {
    invoke.mockReset();
    execute.mockReset();
    select.mockReset();
  });

  it("un lote viaja entero al comando ejecutar_lote, sin sentencias sueltas por el plugin", async () => {
    const conexion = await abrirConexionTauri();
    await conexion.ejecutarLote([
      { sql: "INSERT INTO raza (id, nombre) VALUES (?, ?)", parametros: ["r1", "Saanen"] },
      { sql: "UPDATE raza SET nombre = ? WHERE id = ?", parametros: [null, "r1"] },
    ]);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("ejecutar_lote", {
      db: URL_BASE_DATOS,
      sentencias: [
        { sql: "INSERT INTO raza (id, nombre) VALUES (?, ?)", parametros: ["r1", "Saanen"] },
        { sql: "UPDATE raza SET nombre = ? WHERE id = ?", parametros: [null, "r1"] },
      ],
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("un lote vacío no llama a Rust", async () => {
    const conexion = await abrirConexionTauri();
    await conexion.ejecutarLote([]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("si Rust rechaza el lote, el error llega a quien lo pidió", async () => {
    invoke.mockRejectedValueOnce("error returned from database: CHECK constraint failed");
    const conexion = await abrirConexionTauri();
    await expect(conexion.ejecutarLote([{ sql: "INSERT INTO raza (id) VALUES (?)", parametros: ["r1"] }])).rejects.toBe(
      "error returned from database: CHECK constraint failed",
    );
  });

  it("una sentencia suelta y una consulta siguen yendo por el plugin SQL", async () => {
    select.mockResolvedValueOnce([{ n: 1 }]);
    const conexion = await abrirConexionTauri();
    await conexion.ejecutar("UPDATE raza SET nombre = ? WHERE id = ?", ["Alpina", "r1"]);
    expect(await conexion.consultar("SELECT count(*) AS n FROM raza")).toEqual([{ n: 1 }]);
    expect(execute).toHaveBeenCalledWith("UPDATE raza SET nombre = ? WHERE id = ?", ["Alpina", "r1"]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("la base se abre una sola vez (D-011)", async () => {
    vi.resetModules(); // un módulo nuevo, para contar solo las aperturas de esta prueba
    load.mockClear();
    const { abrirConexionTauri: abrir } = await import("./conexion-tauri");
    await abrir();
    await abrir();
    expect(load).toHaveBeenCalledTimes(1);
  });
});
