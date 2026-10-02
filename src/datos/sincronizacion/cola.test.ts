import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PROPIETARIO } from "../ayudas-pruebas";
import { Cambios } from "../cambios";
import { crearBaseDePrueba, type ConexionMemoria } from "../conexion-memoria";
import { vincularParaPruebas } from "./ayudas-pruebas";
import { contarPendientes, sentenciaRechazo, sentenciasEnviados, siguienteEnvio } from "./cola";

let db: ConexionMemoria;
beforeEach(async () => {
  db = crearBaseDePrueba();
  await vincularParaPruebas(db);
});
afterEach(() => db.cerrar());

async function guardarLotes(cantidad: number, prefijo: string) {
  const c = new Cambios(PROPIETARIO);
  for (let i = 0; i < cantidad; i++) c.insertar("lote", { nombre: `${prefijo}${i}`, descripcion: null, eliminado_en: null });
  await c.aplicar(db);
}

describe("cola de envío", () => {
  it("el envío no parte un grupo, y un grupo más grande que el límite va solo", async () => {
    await guardarLotes(3, "a");
    await guardarLotes(4, "b");
    const primero = await siguienteEnvio(db, 5); // 3 + 4 > 5: solo el primer grupo
    expect(primero).toHaveLength(3);
    expect(await contarPendientes(db)).toBe(2);
    const grande = await siguienteEnvio(db, 2);
    expect(grande).toHaveLength(3); // el primer grupo es más grande que el límite: va entero
    expect(new Set(grande.map((o) => o.grupo_id)).size).toBe(1);
  });

  it("lo enviado queda en la tabla sin su contenido, y lo rechazado no se vuelve a enviar solo", async () => {
    await guardarLotes(2, "a");
    await guardarLotes(2, "b");
    const todos = await siguienteEnvio(db, 100);
    const grupos = [...new Set(todos.map((o) => o.grupo_id))];
    await db.ejecutarLote(sentenciasEnviados(todos.filter((o) => o.grupo_id === grupos[0]).map((o) => o.id), "2026-10-02T12:00:00.000Z"));
    await db.ejecutarLote([sentenciaRechazo(grupos[1], "campo_reservado", "2026-10-02T12:00:00.000Z")]);
    expect(await siguienteEnvio(db, 100)).toEqual([]);
    expect(await contarPendientes(db)).toBe(0);
    const filas = await db.consultar<{ enviado: number; campos: string | null; rechazo: string | null }>("SELECT enviado, campos, rechazo FROM cola_cambios ORDER BY secuencia");
    expect(filas.filter((f) => f.enviado === 1).every((f) => f.campos === null)).toBe(true);
    expect(filas.filter((f) => f.rechazo === "campo_reservado")).toHaveLength(2);
    expect(filas.filter((f) => f.rechazo !== null).every((f) => f.campos !== null)).toBe(true); // el rechazado conserva su contenido
  });
});
