import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OPERARIO, PROPIETARIO } from "../ayudas-pruebas";
import { crearBaseDePrueba, type ConexionMemoria } from "../conexion-memoria";
import { ErrorDeRegistro } from "../errores";
import { actualizarUsuario, cambiarPin, comprobarPin, crearUsuario, listarUsuarios, retirarUsuario } from "./usuarios";

let db: ConexionMemoria;
beforeEach(() => {
  db = crearBaseDePrueba();
});
afterEach(() => db.cerrar());

const motivos = (promesa: Promise<unknown>) =>
  promesa.then(
    () => [],
    (e: unknown) => (e instanceof ErrorDeRegistro ? e.motivos.map((m) => m.codigo) : [String(e)]),
  );

describe("usuarios (RF-06)", () => {
  it("guarda el PIN con hash y nunca en texto plano", async () => {
    const id = await crearUsuario(db, { nombre: "Ana", rol: "propietario", contacto: null }, "4826", PROPIETARIO);
    const [fila] = await db.consultar<{ pin_hash: string }>("SELECT pin_hash FROM usuario WHERE id = ?", [id]);
    expect(fila.pin_hash).toMatch(/^pbkdf2-sha256\$600000\$/);
    expect(fila.pin_hash).not.toContain("4826");
    expect(await comprobarPin(db, id, "4826")).toBe(true);
    expect(await comprobarPin(db, id, "0000")).toBe(false);
    const enHistorial = await db.consultar<{ valor_nuevo: string }>(
      "SELECT valor_nuevo FROM historial_cambios WHERE campo = 'pin_hash'",
    );
    expect(enHistorial).toEqual([{ valor_nuevo: "[protegido]" }]);
  });

  it("un usuario sin PIN entra directamente", async () => {
    const id = await crearUsuario(db, { nombre: "Luis", rol: "operario", contacto: null }, null, PROPIETARIO);
    expect(await comprobarPin(db, id, "")).toBe(true);
    expect((await listarUsuarios(db))[0]).toMatchObject({ nombre: "Luis", tienePin: false });
  });

  it("rechaza nombres repetidos y PIN inválidos", async () => {
    await crearUsuario(db, { nombre: "Ana", rol: "propietario", contacto: null }, null, PROPIETARIO);
    expect(await motivos(crearUsuario(db, { nombre: "ana", rol: "operario", contacto: null }, null, PROPIETARIO))).toEqual([
      "nombre_duplicado",
    ]);
    expect(await motivos(crearUsuario(db, { nombre: "Eva", rol: "operario", contacto: null }, "12", PROPIETARIO))).toEqual([
      "pin_invalido",
    ]);
  });

  it("siempre queda un propietario y nadie se retira a sí mismo", async () => {
    const ana = await crearUsuario(db, { nombre: "Ana", rol: "propietario", contacto: null }, null, PROPIETARIO);
    const luis = await crearUsuario(db, { nombre: "Luis", rol: "operario", contacto: null }, null, PROPIETARIO);
    const comoAna = { ...PROPIETARIO, usuarioId: ana };
    expect(await motivos(actualizarUsuario(db, ana, { nombre: "Ana", rol: "operario", contacto: null }, comoAna))).toEqual([
      "ultimo_propietario",
    ]);
    expect(await motivos(retirarUsuario(db, ana, { ...PROPIETARIO, usuarioId: luis }))).toEqual(["ultimo_propietario"]);
    expect(await motivos(retirarUsuario(db, ana, comoAna))).toEqual(["no_puede_retirarse_a_si_mismo"]);
    await retirarUsuario(db, luis, comoAna);
    expect((await listarUsuarios(db)).map((u) => u.nombre)).toEqual(["Ana"]);
  });

  it("quita y pone el PIN", async () => {
    const id = await crearUsuario(db, { nombre: "Ana", rol: "propietario", contacto: null }, "1111", PROPIETARIO);
    await cambiarPin(db, id, null, PROPIETARIO);
    expect((await listarUsuarios(db))[0].tienePin).toBe(false);
    await cambiarPin(db, id, "2222", PROPIETARIO);
    expect(await comprobarPin(db, id, "2222")).toBe(true);
  });

  it("R14: el operario no administra usuarios", async () => {
    expect(await motivos(crearUsuario(db, { nombre: "Eva", rol: "operario", contacto: null }, null, OPERARIO))).toEqual([
      "sin_permiso",
    ]);
  });
});
