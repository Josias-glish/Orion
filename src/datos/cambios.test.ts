import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PROPIETARIO } from "./ayudas-pruebas";
import { Cambios } from "./cambios";
import { crearBaseDePrueba, type ConexionMemoria } from "./conexion-memoria";

let db: ConexionMemoria;
beforeEach(() => {
  db = crearBaseDePrueba();
});
afterEach(() => db.cerrar());

describe("Cambios", () => {
  it("no hace nada si los valores no cambiaron", async () => {
    const cambios = new Cambios(PROPIETARIO);
    expect(cambios.actualizar("lote", "x", { nombre: "A" }, { nombre: "A" })).toBe(false);
    expect(cambios.vacio).toBe(true);
  });

  it("en memoria, un lote que falla a la mitad no deja nada guardado", async () => {
    const cambios = new Cambios(PROPIETARIO);
    cambios.insertar("lote", { nombre: "Ordeño" });
    cambios.insertar("lote", { nombre: "ordeño" }); // nombre repetido: viola el índice único
    await expect(cambios.aplicar(db)).rejects.toThrow(/UNIQUE/);
    const [fila] = await db.consultar<{ n: number }>("SELECT count(*) AS n FROM lote");
    expect(fila.n).toBe(0);
    const [historial] = await db.consultar<{ n: number }>("SELECT count(*) AS n FROM historial_cambios");
    expect(historial.n).toBe(0);
  });
});
