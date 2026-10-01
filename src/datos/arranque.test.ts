import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { completarAsistente, consultarArranque } from "./arranque";
import { crearBaseDePrueba, type ConexionMemoria } from "./conexion-memoria";
import { ErrorDeRegistro } from "./errores";

let db: ConexionMemoria;
beforeEach(() => {
  db = crearBaseDePrueba();
});
afterEach(() => db.cerrar());

const finca = {
  nombre: "Aprisco de prueba",
  criadero: "El Paraíso",
  municipio: null,
  registroSanitarioPredio: null,
  diasGestacion: 150,
  diasLactancia: 305,
};

describe("primer arranque (RF-06)", () => {
  it("una base nueva necesita el asistente", async () => {
    expect(await consultarArranque(db)).toEqual({ finca: null, usuarios: [], necesitaAsistente: true });
  });

  it("crea la finca y el propietario, y el historial queda a su nombre", async () => {
    const usuario = await completarAsistente(db, finca, { nombre: "Ana", contacto: null }, null);
    const estado = await consultarArranque(db);
    expect(estado.necesitaAsistente).toBe(false);
    expect(estado.finca).toMatchObject({ nombre: "Aprisco de prueba", criadero: "El Paraíso", diasGestacion: 150 });
    expect(usuario).toMatchObject({ nombre: "Ana", rol: "propietario", tienePin: false });
    const autores = await db.consultar<{ usuario_id: string }>("SELECT DISTINCT usuario_id FROM historial_cambios");
    expect(autores).toEqual([{ usuario_id: usuario.id }]);
  });

  it("si falla la validación no crea nada", async () => {
    await expect(completarAsistente(db, { ...finca, nombre: " " }, { nombre: "Ana", contacto: null }, null)).rejects.toBeInstanceOf(
      ErrorDeRegistro,
    );
    expect((await consultarArranque(db)).finca).toBeNull();
  });
});
