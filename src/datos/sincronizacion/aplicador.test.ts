import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nuevoId } from "../../dominio/identidad";
import { formatearMarca } from "../../dominio/sincronizacion/hlc";
import { aplicarCambios, reintentarConflictos, type CambioRemoto } from "./aplicador";
import { vincularParaPruebas } from "./ayudas-pruebas";
import { crearBaseDePrueba, type ConexionMemoria } from "../conexion-memoria";
import { CLAVES, leerEstado } from "./estado";
import { leerMarcas } from "./marcas";

let db: ConexionMemoria;
const REMOTO = "bbbbbbbb-0000-4000-8000-000000000000";
const OPCIONES = { ahoraIso: "2026-10-02T12:00:00.000Z", ahoraMs: Date.parse("2026-10-02T12:00:00.000Z") };

beforeEach(async () => {
  db = crearBaseDePrueba();
  await vincularParaPruebas(db);
});
afterEach(() => db.cerrar());

const marca = (hora: string, contador = 0, equipo = "bbbbbbbb"): string =>
  formatearMarca({ fisico: Date.parse(`2026-10-02T${hora}.000Z`), contador, dispositivo: equipo });

let seq = 0;
function cambio(c: Partial<CambioRemoto> & Pick<CambioRemoto, "entidad" | "registro_id" | "operacion" | "campos" | "marca">): CambioRemoto {
  return { seq: ++seq, cambio_id: nuevoId(), grupo_id: nuevoId(), orden: 0, dispositivo_id: REMOTO, usuario_id: null, ...c };
}

const crearLote = (id: string, nombre: string, hora = "10:00:00") =>
  cambio({ entidad: "lote", registro_id: id, operacion: "crear", marca: marca(hora), campos: { nombre, descripcion: null, creado_en: `2026-10-02T${hora}.000Z`, eliminado_en: null } });

const lote = async (id: string) => (await db.consultar<Record<string, unknown>>("SELECT * FROM lote WHERE id = ?", [id]))[0];
const historial = (id: string, campo: string) =>
  db.consultar<{ valor_anterior: string | null; valor_nuevo: string | null; aplicado: number; marca: string; dispositivo_id: string }>(
    "SELECT valor_anterior, valor_nuevo, aplicado, marca, dispositivo_id FROM historial_cambios WHERE registro_id = ? AND campo = ? ORDER BY aplicado DESC, marca_tiempo",
    [id, campo],
  );
const avisos = (tipo: string) => db.consultar<{ detalle: string; resuelto_en: string | null }>("SELECT detalle, resuelto_en FROM aviso_sincronizacion WHERE tipo = ? ORDER BY creado_en", [tipo]);

describe("aplicar cambios recibidos (R16)", () => {
  it("un `crear` ajeno crea la fila, el historial, las marcas y adelanta el reloj", async () => {
    const id = nuevoId();
    const r = await aplicarCambios(db, [crearLote(id, "Ordeño")], OPCIONES);
    expect(r).toMatchObject({ aplicados: 1, conflictos: 0 });
    expect(await lote(id)).toMatchObject({ nombre: "Ordeño", eliminado_en: null });
    const h = await historial(id, "nombre");
    expect(h).toEqual([{ valor_anterior: null, valor_nuevo: "Ordeño", aplicado: 1, marca: marca("10:00:00"), dispositivo_id: REMOTO }]);
    const [registro] = (await leerMarcas(db, "lote", [id])).values();
    expect(registro.marcas.base).toBe(marca("10:00:00"));
    expect((await leerEstado(db, [CLAVES.marcaUltima]))[CLAVES.marcaUltima]).toBe(marca("10:00:00"));
  });

  it("CA-27 (a): dos cambios en campos distintos del mismo registro se conservan los dos, en cualquier orden", async () => {
    const id = nuevoId();
    await aplicarCambios(db, [crearLote(id, "Ordeño")], OPCIONES);
    const nombre = cambio({ entidad: "lote", registro_id: id, operacion: "modificar", marca: marca("10:05:00"), campos: { nombre: "Ordeño A" } });
    const descripcion = cambio({ entidad: "lote", registro_id: id, operacion: "modificar", marca: marca("10:04:00", 0, "cccccccc"), campos: { descripcion: "Las de la mañana" } });
    await aplicarCambios(db, [nombre, descripcion], OPCIONES);
    expect(await lote(id)).toMatchObject({ nombre: "Ordeño A", descripcion: "Las de la mañana" });
  });

  it("CA-27 (b): en el mismo campo gana la marca más reciente y el valor que perdió queda con aplicado = 0", async () => {
    const id = nuevoId();
    await aplicarCambios(db, [crearLote(id, "Ordeño")], OPCIONES);
    const nuevo = cambio({ entidad: "lote", registro_id: id, operacion: "modificar", marca: marca("11:00:00"), campos: { descripcion: "Gana" } });
    const viejo = cambio({ entidad: "lote", registro_id: id, operacion: "modificar", marca: marca("10:30:00", 0, "cccccccc"), campos: { descripcion: "Pierde" }, dispositivo_id: "cccccccc-0000-4000-8000-000000000000" });
    await aplicarCambios(db, [nuevo], OPCIONES);
    await aplicarCambios(db, [viejo], OPCIONES); // llega después, pero se hizo antes
    expect(await lote(id)).toMatchObject({ descripcion: "Gana" });
    const h = await historial(id, "descripcion");
    expect(h.map((f) => [f.valor_anterior, f.valor_nuevo, f.aplicado])).toEqual([
      [null, "Gana", 1],
      ["Gana", "Pierde", 0],
    ]);
  });

  it("el resultado no depende del orden de llegada (la misma fila con cualquier orden)", async () => {
    const id = nuevoId();
    const ops = [
      crearLote(id, "Uno", "10:00:00"),
      cambio({ entidad: "lote", registro_id: id, operacion: "modificar", marca: marca("10:10:00"), campos: { nombre: "Dos" } }),
      cambio({ entidad: "lote", registro_id: id, operacion: "modificar", marca: marca("10:20:00", 0, "cccccccc"), campos: { nombre: "Tres", descripcion: "X" } }),
    ];
    const [a, b] = [crearBaseDePrueba(), crearBaseDePrueba()];
    await vincularParaPruebas(a);
    await vincularParaPruebas(b);
    await aplicarCambios(a, ops, OPCIONES);
    // La base b recibe primero los cambios más nuevos y la creación al final, uno por uno.
    for (const op of [ops[2], ops[1], ops[0]]) await aplicarCambios(b, [op], OPCIONES).catch(() => undefined);
    const fila = async (c: ConexionMemoria) => (await c.consultar("SELECT nombre, descripcion FROM lote WHERE id = ?", [id]))[0];
    // b rechazó los `modificar` que llegaron antes de la creación (quedan como conflicto) y los reintenta:
    await reintentarConflictos(b, OPCIONES);
    expect(await fila(b)).toEqual(await fila(a));
    expect(await fila(a)).toEqual({ nombre: "Tres", descripcion: "X" });
    a.cerrar();
    b.cerrar();
  });

  it("CA-27 (c): borrar en un equipo y editar después en otro restaura el registro con aviso", async () => {
    const id = nuevoId();
    await aplicarCambios(db, [crearLote(id, "Ordeño")], OPCIONES);
    await aplicarCambios(db, [cambio({ entidad: "lote", registro_id: id, operacion: "eliminar", marca: marca("10:00:00", 1), campos: { eliminado_en: "2026-10-02T10:00:00.000Z" } })], OPCIONES);
    expect((await lote(id)).eliminado_en).toBe("2026-10-02T10:00:00.000Z");
    const r = await aplicarCambios(db, [cambio({ entidad: "lote", registro_id: id, operacion: "modificar", marca: marca("10:05:00", 0, "cccccccc"), campos: { nombre: "Editado" } })], OPCIONES);
    expect(r.restaurados).toBe(1);
    expect(await lote(id)).toMatchObject({ nombre: "Editado", eliminado_en: null });
    expect((await avisos("restaurado")).length).toBe(1);
  });

  it("editar y luego borrar deja el registro borrado", async () => {
    const id = nuevoId();
    await aplicarCambios(db, [crearLote(id, "Ordeño")], OPCIONES);
    await aplicarCambios(db, [cambio({ entidad: "lote", registro_id: id, operacion: "modificar", marca: marca("10:05:00"), campos: { nombre: "Editado" } })], OPCIONES);
    await aplicarCambios(db, [cambio({ entidad: "lote", registro_id: id, operacion: "eliminar", marca: marca("10:10:00"), campos: { eliminado_en: "2026-10-02T10:10:00.000Z" } })], OPCIONES);
    expect(await lote(id)).toMatchObject({ nombre: "Editado", eliminado_en: "2026-10-02T10:10:00.000Z" });
    expect((await avisos("restaurado")).length).toBe(0);
  });

  it("aplicar dos veces el mismo envío no duplica nada (idempotente)", async () => {
    const id = nuevoId();
    const ops = [crearLote(id, "Ordeño"), cambio({ entidad: "lote", registro_id: id, operacion: "modificar", marca: marca("10:30:00"), campos: { descripcion: "A" } })];
    await aplicarCambios(db, ops, OPCIONES);
    await aplicarCambios(db, ops, OPCIONES);
    expect((await db.consultar("SELECT 1 FROM historial_cambios WHERE registro_id = ?", [id])).length).toBe(2); // nombre y descripcion
    expect((await db.consultar("SELECT 1 FROM lote")).length).toBe(1);
  });

  it("un usuario que llega por sincronización no trae PIN y queda pendiente de definirlo en este equipo (S-90)", async () => {
    const id = nuevoId();
    await aplicarCambios(db, [cambio({ entidad: "usuario", registro_id: id, operacion: "crear", marca: marca("10:00:00"), campos: { nombre: "Ana", rol: "operario", contacto: null, creado_en: "2026-10-02T10:00:00.000Z", eliminado_en: null } })], OPCIONES);
    const [u] = await db.consultar<{ pin_hash: string | null; pin_pendiente: number }>("SELECT pin_hash, pin_pendiente FROM usuario WHERE id = ?", [id]);
    expect(u).toEqual({ pin_hash: null, pin_pendiente: 1 });
  });

  it("un contacto que este equipo no tiene se crea como marcador, sin datos personales (R28)", async () => {
    const contacto = nuevoId();
    const animal = nuevoId();
    await aplicarCambios(db, [cambio({ entidad: "animal", registro_id: animal, operacion: "crear", marca: marca("10:00:00"), campos: { nombre: "Toro", sexo: "macho", origen: "externo", en_hato: 0, contacto_id: contacto, creado_en: "2026-10-02T10:00:00.000Z", eliminado_en: null } })], OPCIONES);
    const [c] = await db.consultar<{ nombre: string; marcador: number; telefono: string | null }>("SELECT nombre, marcador, telefono FROM contacto WHERE id = ?", [contacto]);
    expect(c).toEqual({ nombre: "Contacto guardado en otro equipo", marcador: 1, telefono: null });
  });

  it("S-86: dos lotes con el mismo nombre creados en equipos distintos se conservan: el posterior queda con « (2)»", async () => {
    const mio = nuevoId();
    const ajeno = nuevoId();
    await aplicarCambios(db, [crearLote(mio, "Ordeño", "10:00:00")], OPCIONES);
    const r = await aplicarCambios(db, [crearLote(ajeno, "Ordeño", "10:05:00")], OPCIONES);
    expect(r).toMatchObject({ aplicados: 1, renombrados: 1, conflictos: 0 });
    expect((await lote(mio)).nombre).toBe("Ordeño");
    expect((await lote(ajeno)).nombre).toBe("Ordeño (2)");
    expect((await avisos("renombrado")).length).toBe(1);

    // Si el que llega es el anterior, se renombra el que ya estaba: los dos equipos terminan igual.
    const otro = crearBaseDePrueba();
    await vincularParaPruebas(otro);
    await aplicarCambios(otro, [crearLote(ajeno, "Ordeño", "10:05:00")], OPCIONES);
    await aplicarCambios(otro, [crearLote(mio, "Ordeño", "10:00:00")], OPCIONES);
    const nombres = await otro.consultar<{ id: string; nombre: string }>("SELECT id, nombre FROM lote ORDER BY nombre");
    expect(nombres).toEqual([
      { id: mio, nombre: "Ordeño" },
      { id: ajeno, nombre: "Ordeño (2)" },
    ]);
    otro.cerrar();
  });

  it("un cambio que depende de un registro que aún no llegó queda guardado y se aplica cuando llega", async () => {
    const padre = nuevoId();
    const hijo = nuevoId();
    const crearHijo = cambio({ entidad: "animal", registro_id: hijo, operacion: "crear", marca: marca("10:10:00"), campos: { nombre: "Cría", sexo: "hembra", padre_id: padre, creado_en: "2026-10-02T10:10:00.000Z", eliminado_en: null } });
    const r = await aplicarCambios(db, [crearHijo], OPCIONES);
    expect(r).toMatchObject({ aplicados: 0, conflictos: 1 });
    expect((await avisos("conflicto")).length).toBe(1);
    expect((await db.consultar("SELECT 1 FROM animal")).length).toBe(0);

    // Llega el padre; el reintento aplica la cría y deja el aviso resuelto.
    await aplicarCambios(db, [cambio({ entidad: "animal", registro_id: padre, operacion: "crear", marca: marca("10:00:00"), campos: { nombre: "Toro", sexo: "macho", creado_en: "2026-10-02T10:00:00.000Z", eliminado_en: null } })], OPCIONES);
    expect(await reintentarConflictos(db, OPCIONES)).toBe(1);
    expect((await db.consultar("SELECT 1 FROM animal")).length).toBe(2);
    expect((await avisos("conflicto"))[0].resuelto_en).not.toBeNull();
    // Reintentar otra vez no hace nada.
    expect(await reintentarConflictos(db, OPCIONES)).toBe(0);
  });

  it("un envío con un cambio que la base rechaza aplica los demás y guarda ese como conflicto (nada se pierde)", async () => {
    const ok1 = nuevoId();
    const ok2 = nuevoId();
    const malo = cambio({ entidad: "animal", registro_id: nuevoId(), operacion: "crear", marca: marca("10:01:00"), campos: { nombre: "X", sexo: "ninguno", creado_en: "2026-10-02T10:01:00.000Z", eliminado_en: null } });
    const r = await aplicarCambios(db, [crearLote(ok1, "Uno"), malo, crearLote(ok2, "Dos", "10:02:00")], OPCIONES);
    expect(r).toMatchObject({ aplicados: 2, conflictos: 1 });
    expect((await db.consultar("SELECT 1 FROM lote")).length).toBe(2);
    const [aviso] = await avisos("conflicto");
    expect(JSON.parse(aviso.detalle).motivo).toBe("regla");
    const [{ operacion }] = await db.consultar<{ operacion: string }>("SELECT operacion FROM aviso_sincronizacion WHERE tipo = 'conflicto'");
    expect(JSON.parse(operacion).campos.sexo).toBe("ninguno"); // la operación completa queda guardada
  });

  it("las sentencias extra (marcar enviados, cursor) van en el mismo lote", async () => {
    const id = nuevoId();
    await aplicarCambios(db, [crearLote(id, "Ordeño")], {
      ...OPCIONES,
      extra: [{ sql: "INSERT INTO sincronizacion_estado (clave, valor, modificado_en) VALUES ('cursor_seq', '7', ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor", parametros: [OPCIONES.ahoraIso] }],
    });
    expect((await leerEstado(db, ["cursor_seq"])).cursor_seq).toBe("7");
  });

  it("una marca adelantada más de 10 minutos no arrastra el reloj de este equipo", async () => {
    const id = nuevoId();
    await aplicarCambios(db, [cambio({ entidad: "lote", registro_id: id, operacion: "crear", marca: formatearMarca({ fisico: Date.parse("2030-01-01T00:00:00.000Z"), contador: 0, dispositivo: "bbbbbbbb" }), campos: { nombre: "Futuro", creado_en: "2026-10-02T10:00:00.000Z", eliminado_en: null } })], OPCIONES);
    const estado = await leerEstado(db, [CLAVES.marcaUltima]);
    expect(estado[CLAVES.marcaUltima] ?? null).toBeNull();
  });
});
