// Descarga inicial y verificación (migración 0006; PROTOCOLO.md, sección 7) y políticas de Storage (migración 0007; sección 8).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  ErrorDeServidor,
  HORA_BASE,
  VERSION_ESQUEMA_DE_PRUEBA,
  agregarEquipo,
  calcularHuella,
  crearFincaDePrueba,
  crearServidorDePrueba,
  marca,
  operacion,
  sincronizarComo,
  uuid,
  type FincaDePrueba,
  type ServidorDePrueba,
} from "./ayudas";

let servidor: ServidorDePrueba;
let finca: FincaDePrueba;

beforeAll(async () => {
  servidor = await crearServidorDePrueba();
});
afterAll(async () => {
  await servidor.cerrar();
});
beforeEach(async () => {
  await servidor.reiniciar();
  finca = await crearFincaDePrueba(servidor, { correo: "a@ejemplo.com" });
});

const T = (minutos: number, contador = 0, equipo = "aaaaaaaa") => marca(HORA_BASE + minutos * 60_000, contador, equipo);

async function falla(promesa: Promise<unknown>, codigo: string): Promise<void> {
  const error = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `debía fallar con ${codigo}`).toBeInstanceOf(ErrorDeServidor);
  expect((error as ErrorDeServidor).codigo).toBe(codigo);
}

interface Pagina {
  registros: { registro_id: string; campos: Record<string, unknown>; marcas: { base: string; campos: Record<string, string> } }[];
  siguiente: string | null;
}

function pagina(entidad: string, despuesDe: string | null, limite?: number, o: { como?: string; fincaId?: string; dispositivo?: string } = {}): Promise<Pagina> {
  return servidor.rpc<Pagina>(
    "descargar_pagina",
    {
      p_finca_id: o.fincaId ?? finca.fincaId,
      p_dispositivo_id: o.dispositivo ?? finca.dispositivoId,
      p_entidad: entidad,
      p_despues_de: despuesDe,
      p_limite: limite,
    },
    { como: o.como ?? finca.cuentaId },
  );
}

function resumen(o: { como?: string; fincaId?: string; dispositivo?: string } = {}) {
  return servidor.rpc<{ seq_actual: number; hora_servidor_ms: number; entidades: { entidad: string; filas: number; huella: string }[] }>(
    "resumen_finca",
    { p_finca_id: o.fincaId ?? finca.fincaId, p_dispositivo_id: o.dispositivo ?? finca.dispositivoId },
    { como: o.como ?? finca.cuentaId },
  );
}

function iniciar(o: { como?: string; fincaId?: string; dispositivo?: string } = {}) {
  return servidor.rpc<{ seq_inicial: number; hora_servidor_ms: number; conteos: Record<string, number> }>(
    "iniciar_descarga",
    { p_finca_id: o.fincaId ?? finca.fincaId, p_dispositivo_id: o.dispositivo ?? finca.dispositivoId },
    { como: o.como ?? finca.cuentaId },
  );
}

/** Crea registros con un solo envío por tramos de 300 (el máximo de un envío es 500 operaciones). */
async function crearRegistros(entidad: string, ids: string[], marcaDe: (i: number) => string = (i) => T(-100, i)): Promise<void> {
  for (let desde = 0; desde < ids.length; desde += 300) {
    const tramo = ids.slice(desde, desde + 300);
    const r = await sincronizarComo(
      servidor,
      finca,
      tramo.map((id, i) => operacion({ operacion: "crear", entidad, registro_id: id, campos: { nombre: `Fila ${id}` }, marca: marcaDe(desde + i) })),
    );
    expect(r.rechazados).toEqual([]);
  }
}

/** La marca más alta de un registro, calculada aquí (no con la función SQL) a partir de `base` y `campos`. */
function marcaMaxima(marcas: { base: string; campos: Record<string, string> }): string {
  return [marcas.base, ...Object.values(marcas.campos)].reduce((mayor, m) => (m > mayor ? m : mayor));
}

/** Los registros de una finca tal como están en la tabla, para calcular la huella que calcularía el programa. */
async function filasDeLaTabla(entidad: string, fincaId = finca.fincaId) {
  const filas = await servidor.sql<{ registro_id: string; marcas: { base: string; campos: Record<string, string> } }>(
    `select registro_id, marcas from public.registro where finca_id = $1 and entidad = $2`,
    [fincaId, entidad],
  );
  return filas.map((f) => ({ registro_id: f.registro_id, marca_maxima: marcaMaxima(f.marcas) }));
}

// ---------------------------------------------------------------------------------------------------------------------------
describe("iniciar_descarga", () => {
  it("finca vacía: seq 0, sin conteos y con la hora del servidor", async () => {
    expect(await iniciar()).toEqual({ seq_inicial: 0, hora_servidor_ms: HORA_BASE, conteos: {} });
  });

  it("devuelve el seq actual y cuenta los registros por entidad, incluidos los eliminados", async () => {
    await crearRegistros("animal", ["a1", "a2", "a3"]);
    await crearRegistros("lactancia", ["l1"]);
    // a2 se elimina: sigue contando (el borrado es lógico).
    await sincronizarComo(servidor, finca, [
      operacion({ operacion: "eliminar", entidad: "animal", registro_id: "a2", campos: { eliminado_en: "2026-10-02T12:00:00.000Z" }, marca: T(5) }),
    ]);
    const r = await iniciar();
    expect(r.conteos).toEqual({ animal: 3, lactancia: 1 });
    // Cinco cambios con seq 1..5: tres creaciones, una más, un eliminar.
    expect(r.seq_inicial).toBe(5);
    expect(r.hora_servidor_ms).toBe(HORA_BASE);
  });

  it("un cambio dos veces sobre el mismo registro sube el seq pero no el conteo", async () => {
    await crearRegistros("animal", ["a1"]);
    await sincronizarComo(servidor, finca, [operacion({ entidad: "animal", registro_id: "a1", campos: { color: "negro" }, marca: T(1) })]);
    const r = await iniciar();
    expect(r.conteos).toEqual({ animal: 1 });
    expect(r.seq_inicial).toBe(2);
  });

  it("los cambios arbitrados (números de registro) cuentan en el seq", async () => {
    const libroId = uuid();
    await sincronizarComo(servidor, finca, [
      operacion({ operacion: "crear", entidad: "libro", registro_id: libroId, campos: { nombre: "L", prefijo: "PPE", separador_numero: "-", digitos_numero: 4, eliminado_en: null }, marca: T(-10) }),
    ]);
    const antes = (await iniciar()).seq_inicial;
    await servidor.rpc(
      "emitir_registros",
      {
        p_finca_id: finca.fincaId,
        p_dispositivo_id: finca.dispositivoId,
        p_cambio_id: uuid(),
        p_registros: [{ registro_id: uuid(), animal_id: uuid(), libro_id: libroId, fecha_registro: "2026-10-02", instantanea: JSON.stringify({ numero: null, version: 1 }), responsable: null, observaciones: null }],
      },
      { como: finca.cuentaId },
    );
    const despues = await iniciar();
    expect(despues.seq_inicial).toBe(antes + 2); // el registro y el contador del libro
    expect(despues.conteos).toEqual({ libro: 1, registro_genealogico: 1 });
  });

  it("no cuenta nada de otra finca", async () => {
    const otra = await crearFincaDePrueba(servidor, { correo: "otra@ejemplo.com" });
    await sincronizarComo(servidor, otra, [operacion({ operacion: "crear", entidad: "animal", registro_id: "ajeno", campos: { nombre: "X" }, marca: T(0) })]);
    expect(await iniciar()).toEqual({ seq_inicial: 0, hora_servidor_ms: HORA_BASE, conteos: {} });
    expect((await iniciar({ fincaId: otra.fincaId, dispositivo: otra.dispositivoId, como: otra.cuentaId })).conteos).toEqual({ animal: 1 });
  });

  it("un equipo revocado o de otro no puede iniciarla; otra cuenta tampoco", async () => {
    const segundo = await agregarEquipo(servidor, finca);
    await servidor.rpc("revocar_dispositivo", { p_finca_id: finca.fincaId, p_dispositivo_id: segundo.dispositivo_id }, { como: finca.cuentaId });
    await falla(iniciar({ dispositivo: segundo.dispositivo_id }), "dispositivo_revocado");
    await falla(iniciar({ dispositivo: uuid() }), "dispositivo_desconocido");
    const otra = await crearFincaDePrueba(servidor, { correo: "otra@ejemplo.com" });
    await falla(iniciar({ como: otra.cuentaId }), "finca_inexistente");
  });

  it("no toma el candado de la finca: se puede llamar mientras otra transacción escribe (solo lee)", async () => {
    // Una transacción abierta con el candado no impide la lectura. PGlite tiene una sola conexión, así que se comprueba que la
    // función no usa el candado mirando su código.
    const [fila] = await servidor.sql<{ definicion: string }>(`select pg_get_functiondef('public.iniciar_descarga(uuid, uuid)'::regprocedure) as definicion`);
    expect(fila.definicion).not.toContain("candado_de_finca");
    expect(fila.definicion).not.toContain("advisory");
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
describe("descargar_pagina", () => {
  it("finca vacía o entidad sin registros: lista vacía y siguiente null", async () => {
    expect(await pagina("animal", null)).toEqual({ registros: [], siguiente: null });
    await crearRegistros("animal", ["a1"]);
    expect(await pagina("lactancia", null)).toEqual({ registros: [], siguiente: null });
  });

  it("ordena por registro_id con COLLATE \"C\" (bytes, no el alfabeto del idioma)", async () => {
    // En orden de bytes: dígitos < mayúsculas < guion bajo < minúsculas < letras con tilde.
    const ids = ["b", "B", "a", "A", "_x", "10", "9", "Z", "é", "z"];
    await crearRegistros("animal", ids);
    const esperado = [...ids].sort((x, y) => Buffer.compare(Buffer.from(x), Buffer.from(y)));
    expect(esperado).toEqual(["10", "9", "A", "B", "Z", "_x", "a", "b", "z", "é"]);
    const r = await pagina("animal", null);
    expect(r.registros.map((f) => f.registro_id)).toEqual(esperado);
    expect(r.siguiente).toBeNull();
  });

  it("devuelve los campos y las marcas tal como están guardados", async () => {
    await crearRegistros("animal", ["a1"]);
    await sincronizarComo(servidor, finca, [operacion({ entidad: "animal", registro_id: "a1", campos: { color: "negro" }, marca: T(3) })]);
    const r = await pagina("animal", null);
    expect(r.registros).toEqual([
      { registro_id: "a1", campos: { nombre: "Fila a1", color: "negro" }, marcas: { base: T(-100, 0), campos: { color: T(3) } } },
    ]);
  });

  it("incluye los registros eliminados (para que el equipo nuevo también los tenga)", async () => {
    await crearRegistros("animal", ["a1", "a2"]);
    await sincronizarComo(servidor, finca, [
      operacion({ operacion: "eliminar", entidad: "animal", registro_id: "a1", campos: { eliminado_en: "2026-10-02T12:00:00.000Z" }, marca: T(5) }),
    ]);
    const r = await pagina("animal", null);
    expect(r.registros.map((f) => f.registro_id)).toEqual(["a1", "a2"]);
    expect(r.registros[0].campos.eliminado_en).toBe("2026-10-02T12:00:00.000Z");
  });

  it("pagina con `siguiente`: todas las páginas juntas son todos los registros, sin repetir ni saltar", async () => {
    const ids = Array.from({ length: 11 }, (_, i) => `r${String(i).padStart(2, "0")}`);
    await crearRegistros("animal", ids);
    const vistos: string[] = [];
    let cursor: string | null = null;
    let paginas = 0;
    do {
      const r: Pagina = await pagina("animal", cursor, 4);
      expect(r.registros.length).toBeLessThanOrEqual(4);
      vistos.push(...r.registros.map((f) => f.registro_id));
      if (r.siguiente !== null) expect(r.siguiente).toBe(r.registros[r.registros.length - 1].registro_id);
      cursor = r.siguiente;
      paginas++;
    } while (cursor !== null);
    expect(vistos).toEqual(ids);
    expect(paginas).toBe(3); // 4 + 4 + 3
  });

  it("cuando el total es múltiplo del límite, la última página trae `siguiente` null (no hay una página vacía de más)", async () => {
    await crearRegistros("animal", ["a", "b", "c", "d"]);
    const primera = await pagina("animal", null, 2);
    expect(primera.registros.map((f) => f.registro_id)).toEqual(["a", "b"]);
    expect(primera.siguiente).toBe("b");
    const segunda = await pagina("animal", "b", 2);
    expect(segunda.registros.map((f) => f.registro_id)).toEqual(["c", "d"]);
    expect(segunda.siguiente).toBeNull();
  });

  it("`p_despues_de` vacío equivale a null; uno posterior al último da una página vacía; uno que no existe sirve de punto de corte", async () => {
    await crearRegistros("animal", ["b", "d", "f"]);
    expect((await pagina("animal", "")).registros).toHaveLength(3);
    expect(await pagina("animal", "f")).toEqual({ registros: [], siguiente: null });
    expect(await pagina("animal", "zzz")).toEqual({ registros: [], siguiente: null });
    expect((await pagina("animal", "c")).registros.map((f) => f.registro_id)).toEqual(["d", "f"]);
  });

  it("el cursor compara en orden de bytes: con `Z` quedan las minúsculas pero no las mayúsculas anteriores", async () => {
    await crearRegistros("animal", ["A", "Z", "a", "z"]);
    expect((await pagina("animal", "Z")).registros.map((f) => f.registro_id)).toEqual(["a", "z"]);
  });

  it("el límite se acota: 0 o negativo da 1, null da 500, y nunca pasa de 500", async () => {
    const ids = Array.from({ length: 520 }, (_, i) => `r${String(i).padStart(4, "0")}`);
    await crearRegistros("animal", ids);
    expect((await pagina("animal", null, 0)).registros).toHaveLength(1);
    expect((await pagina("animal", null, -5)).registros).toHaveLength(1);
    const porDefecto = await pagina("animal", null, undefined);
    expect(porDefecto.registros).toHaveLength(500);
    expect(porDefecto.siguiente).toBe("r0499");
    const enorme = await pagina("animal", null, 100_000);
    expect(enorme.registros).toHaveLength(500);
    expect(enorme.siguiente).toBe("r0499");
    const resto = await pagina("animal", enorme.siguiente, 100_000);
    expect(resto.registros).toHaveLength(20);
    expect(resto.siguiente).toBeNull();
  });

  it("entidad con formato inválido: entidad_invalida; con formato válido pero desconocida: lista vacía", async () => {
    await falla(pagina("Animal", null), "entidad_invalida");
    await falla(pagina("1animal", null), "entidad_invalida");
    await falla(pagina("animal; drop table cambio", null), "entidad_invalida");
    await falla(pagina("", null), "entidad_invalida");
    await falla(pagina("a".repeat(41), null), "entidad_invalida");
    await falla(servidor.rpc("descargar_pagina", { p_finca_id: finca.fincaId, p_dispositivo_id: finca.dispositivoId, p_entidad: null, p_despues_de: null, p_limite: 5 }, { como: finca.cuentaId }), "entidad_invalida");
    expect(await pagina("entidad_que_nadie_creo", null)).toEqual({ registros: [], siguiente: null });
  });

  it("solo trae la entidad pedida y solo de su finca", async () => {
    const otra = await crearFincaDePrueba(servidor, { correo: "otra@ejemplo.com" });
    await crearRegistros("animal", ["a1"]);
    await crearRegistros("lactancia", ["l1"]);
    await sincronizarComo(servidor, otra, [operacion({ operacion: "crear", entidad: "animal", registro_id: "ajeno", campos: { nombre: "X" }, marca: T(0) })]);
    expect((await pagina("animal", null)).registros.map((f) => f.registro_id)).toEqual(["a1"]);
    expect((await pagina("lactancia", null)).registros.map((f) => f.registro_id)).toEqual(["l1"]);
  });

  it("la misma id en dos entidades o dos fincas son registros distintos", async () => {
    const otra = await crearFincaDePrueba(servidor, { correo: "otra@ejemplo.com" });
    await crearRegistros("animal", ["igual"]);
    await crearRegistros("lactancia", ["igual"]);
    await sincronizarComo(servidor, otra, [operacion({ operacion: "crear", entidad: "animal", registro_id: "igual", campos: { nombre: "De otra" }, marca: T(0) })]);
    expect((await pagina("animal", null)).registros[0].campos.nombre).toBe("Fila igual");
    expect((await pagina("animal", null, 500, { como: otra.cuentaId, fincaId: otra.fincaId, dispositivo: otra.dispositivoId })).registros[0].campos.nombre).toBe("De otra");
  });

  it("equipo revocado: dispositivo_revocado", async () => {
    const segundo = await agregarEquipo(servidor, finca);
    await servidor.rpc("revocar_dispositivo", { p_finca_id: finca.fincaId, p_dispositivo_id: segundo.dispositivo_id }, { como: finca.cuentaId });
    await falla(pagina("animal", null, 5, { dispositivo: segundo.dispositivo_id }), "dispositivo_revocado");
  });

  it("descargar todo y luego pedir cambios desde el seq inicial deja el estado completo aunque haya cambios entre medio", async () => {
    // El flujo del cliente: iniciar_descarga → páginas → sincronizar(desde = seq_inicial). Un cambio que llega durante la descarga
    // se recibe por la bitácora, y repetirlo sobre lo ya descargado no daña nada (la mezcla es idempotente).
    await crearRegistros("animal", ["a1", "a2", "a3"]);
    const inicio = await iniciar();
    const primera = await pagina("animal", null, 2);
    await sincronizarComo(servidor, finca, [operacion({ entidad: "animal", registro_id: "a3", campos: { color: "blanco" }, marca: T(7) })]); // otro equipo cambia a3
    const segunda = await pagina("animal", primera.siguiente, 2);
    expect(segunda.registros[0].campos.color).toBe("blanco"); // ya trae el cambio...
    const nuevo = await agregarEquipo(servidor, finca, "Equipo nuevo");
    const alFinal = await sincronizarComo(servidor, finca, [], { dispositivo: nuevo.dispositivo_id, desde: inicio.seq_inicial });
    expect(alFinal.cambios.map((c) => c.campos)).toEqual([{ color: "blanco" }]); // ...y la bitácora también: se aplica dos veces sin problema
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
describe("resumen_finca", () => {
  it("finca vacía: sin entidades", async () => {
    expect(await resumen()).toEqual({ seq_actual: 0, hora_servidor_ms: HORA_BASE, entidades: [] });
  });

  it("la huella es el SHA-256 de las líneas `registro_id|marca_maxima` ordenadas por bytes", async () => {
    const ids = ["b", "B", "a", "_x", "10", "é"];
    await crearRegistros("animal", ids, (i) => T(-50 + i));
    const r = await resumen();
    expect(r.entidades).toHaveLength(1);
    expect(r.entidades[0].entidad).toBe("animal");
    expect(r.entidades[0].filas).toBe(ids.length);
    // La huella que calcula el programa, a partir de lo que mandó (sin mirar la función SQL).
    const esperado = calcularHuella(ids.map((id, i) => ({ registro_id: id, marca_maxima: T(-50 + i) })));
    expect(r.entidades[0].huella).toBe(esperado);
    expect(r.entidades[0].huella).toMatch(/^[0-9a-f]{64}$/);
    // Y coincide con las filas de la tabla.
    expect(r.entidades[0].huella).toBe(calcularHuella(await filasDeLaTabla("animal")));
  });

  it("la huella cambia si cambia un registro (marca más alta), se agrega uno o se elimina uno; los eliminados cuentan", async () => {
    await crearRegistros("animal", ["a1", "a2"], (i) => T(-10 + i));
    const h0 = (await resumen()).entidades[0];
    expect(h0.filas).toBe(2);

    await sincronizarComo(servidor, finca, [operacion({ entidad: "animal", registro_id: "a1", campos: { color: "negro" }, marca: T(1) })]);
    const h1 = (await resumen()).entidades[0];
    expect(h1.huella).not.toBe(h0.huella);
    expect(h1.huella).toBe(calcularHuella([{ registro_id: "a1", marca_maxima: T(1) }, { registro_id: "a2", marca_maxima: T(-9) }]));

    await sincronizarComo(servidor, finca, [
      operacion({ operacion: "eliminar", entidad: "animal", registro_id: "a2", campos: { eliminado_en: "2026-10-02T12:00:00.000Z" }, marca: T(2) }),
    ]);
    const h2 = (await resumen()).entidades[0];
    expect(h2.filas).toBe(2); // el eliminado sigue contando
    expect(h2.huella).toBe(calcularHuella([{ registro_id: "a1", marca_maxima: T(1) }, { registro_id: "a2", marca_maxima: T(2) }]));

    await crearRegistros("animal", ["a3"], () => T(3));
    const h3 = (await resumen()).entidades[0];
    expect(h3.filas).toBe(3);
    expect(h3.huella).not.toBe(h2.huella);
  });

  it("un cambio con marca más vieja que la de todos los campos no altera la huella (la marca máxima no baja)", async () => {
    await crearRegistros("animal", ["a1"], () => T(10));
    const antes = (await resumen()).entidades[0].huella;
    await sincronizarComo(servidor, finca, [operacion({ entidad: "animal", registro_id: "a1", campos: { nombre: "Viejo" }, marca: T(-30) })]);
    const despues = await resumen();
    expect(despues.entidades[0].huella).toBe(antes);
    expect(despues.seq_actual).toBe(2); // el cambio quedó en la bitácora igual
  });

  it("varias entidades: una huella por entidad, ordenadas por nombre, con sus conteos", async () => {
    await crearRegistros("pesaje", ["p1", "p2"], () => T(1));
    await crearRegistros("animal", ["a1"], () => T(2));
    await crearRegistros("lactancia", ["l1", "l2", "l3"], () => T(3));
    const r = await resumen();
    expect(r.entidades.map((e) => [e.entidad, e.filas])).toEqual([["animal", 1], ["lactancia", 3], ["pesaje", 2]]);
    expect(r.entidades[1].huella).toBe(calcularHuella([{ registro_id: "l1", marca_maxima: T(3) }, { registro_id: "l2", marca_maxima: T(3) }, { registro_id: "l3", marca_maxima: T(3) }]));
    expect(r.seq_actual).toBe(6);
  });

  it("incluye lo que producen las operaciones arbitradas (la marca del servidor)", async () => {
    const libroId = uuid();
    await sincronizarComo(servidor, finca, [
      operacion({ operacion: "crear", entidad: "libro", registro_id: libroId, campos: { nombre: "L", prefijo: "PPE", separador_numero: "-", digitos_numero: 4, eliminado_en: null }, marca: T(-10) }),
    ]);
    const registroId = uuid();
    await servidor.rpc(
      "emitir_registros",
      {
        p_finca_id: finca.fincaId,
        p_dispositivo_id: finca.dispositivoId,
        p_cambio_id: uuid(),
        p_registros: [{ registro_id: registroId, animal_id: uuid(), libro_id: libroId, fecha_registro: "2026-10-02", instantanea: JSON.stringify({ numero: null, version: 1 }), responsable: null, observaciones: null }],
      },
      { como: finca.cuentaId },
    );
    const r = await resumen();
    expect(r.entidades.map((e) => e.entidad)).toEqual(["libro", "registro_genealogico"]);
    for (const entidad of ["libro", "registro_genealogico"]) {
      expect(r.entidades.find((e) => e.entidad === entidad)?.huella).toBe(calcularHuella(await filasDeLaTabla(entidad)));
    }
  });

  it("no mezcla fincas", async () => {
    const otra = await crearFincaDePrueba(servidor, { correo: "otra@ejemplo.com" });
    await crearRegistros("animal", ["a1"], () => T(1));
    await sincronizarComo(servidor, otra, [operacion({ operacion: "crear", entidad: "animal", registro_id: "a1", campos: { nombre: "Otra" }, marca: T(9) })]);
    const mia = await resumen();
    const suya = await resumen({ como: otra.cuentaId, fincaId: otra.fincaId, dispositivo: otra.dispositivoId });
    expect(mia.entidades[0].huella).toBe(calcularHuella([{ registro_id: "a1", marca_maxima: T(1) }]));
    expect(suya.entidades[0].huella).toBe(calcularHuella([{ registro_id: "a1", marca_maxima: T(9) }]));
    expect(mia.seq_actual).toBe(1);
  });

  it("devuelve la hora del servidor (la fijada en la prueba)", async () => {
    await servidor.fijarHora(HORA_BASE + 123_456);
    expect((await resumen()).hora_servidor_ms).toBe(HORA_BASE + 123_456);
  });

  it("equipo revocado o de otra cuenta: error", async () => {
    const segundo = await agregarEquipo(servidor, finca);
    await servidor.rpc("revocar_dispositivo", { p_finca_id: finca.fincaId, p_dispositivo_id: segundo.dispositivo_id }, { como: finca.cuentaId });
    await falla(resumen({ dispositivo: segundo.dispositivo_id }), "dispositivo_revocado");
    const otra = await crearFincaDePrueba(servidor, { correo: "otra@ejemplo.com" });
    await falla(resumen({ como: otra.cuentaId }), "finca_inexistente");
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// Storage (migración 0007). El esquema `storage` es el doble mínimo de ayudas.ts: lo que se prueba aquí son las políticas de la migración.
// ---------------------------------------------------------------------------------------------------------------------------
describe("Storage: bucket `archivos`", () => {
  const ruta = (fincaId: string, resto = "fotos/cabra.jpg") => `${fincaId}/${resto}`;

  async function sinPermiso(promesa: Promise<unknown>): Promise<void> {
    const error = await promesa.then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ErrorDeServidor);
    expect((error as ErrorDeServidor).sqlstate).toBe("42501");
  }

  it("el bucket existe, es privado y es único", async () => {
    const filas = await servidor.sql<{ id: string; public: boolean }>(`select id, public from storage.buckets order by id`);
    expect(filas).toEqual([{ id: "archivos", public: false }]);
  });

  it("un miembro sube y ve lo que hay bajo la carpeta de su finca", async () => {
    await servidor.subirArchivo(ruta(finca.fincaId, "fotos/a.jpg"), { como: finca.cuentaId });
    await servidor.subirArchivo(ruta(finca.fincaId, "documentos/CP-2026-0001.pdf"), { como: finca.cuentaId });
    await servidor.subirArchivo(ruta(finca.fincaId, "documentos/adjunto-1.pdf"), { como: finca.cuentaId });
    expect(await servidor.listarArchivos({ como: finca.cuentaId })).toEqual([
      ruta(finca.fincaId, "documentos/CP-2026-0001.pdf"),
      ruta(finca.fincaId, "documentos/adjunto-1.pdf"),
      ruta(finca.fincaId, "fotos/a.jpg"),
    ]);
  });

  it("otra cuenta no ve nada de la finca ajena, ni puede subir bajo su carpeta; en la suya sí", async () => {
    const otra = await crearFincaDePrueba(servidor, { correo: "otra@ejemplo.com" });
    await servidor.subirArchivo(ruta(finca.fincaId), { como: finca.cuentaId });
    await servidor.subirArchivo(ruta(otra.fincaId, "fotos/suya.jpg"), { como: otra.cuentaId });

    expect(await servidor.listarArchivos({ como: otra.cuentaId })).toEqual([ruta(otra.fincaId, "fotos/suya.jpg")]);
    expect(await servidor.listarArchivos({ como: finca.cuentaId })).toEqual([ruta(finca.fincaId)]);
    await sinPermiso(servidor.subirArchivo(ruta(finca.fincaId, "fotos/intrusa.jpg"), { como: otra.cuentaId }));
    // Y de la finca ajena no se puede ni consultar un objeto por su nombre exacto.
    const directa = await servidor.sql(`select name from storage.objects where name = $1`, [ruta(finca.fincaId)], { como: otra.cuentaId });
    expect(directa).toEqual([]);
    expect(await servidor.listarArchivos()).toHaveLength(2); // el administrador ve los dos
  });

  it("`anon` no ve ni sube nada", async () => {
    await servidor.subirArchivo(ruta(finca.fincaId), { como: finca.cuentaId });
    expect(await servidor.listarArchivos({ como: "anon" })).toEqual([]);
    await sinPermiso(servidor.subirArchivo(ruta(finca.fincaId, "fotos/anon.jpg"), { como: "anon" }));
    await sinPermiso(servidor.subirArchivo(ruta(uuid(), "fotos/anon.jpg"), { como: "anon" }));
  });

  it("rutas que no son de una finca de la cuenta: sin carpeta, carpeta que no es uuid, uuid de una finca que no existe, bucket distinto", async () => {
    await sinPermiso(servidor.subirArchivo("cabra.jpg", { como: finca.cuentaId }));
    await sinPermiso(servidor.subirArchivo("fotos/cabra.jpg", { como: finca.cuentaId }));
    await sinPermiso(servidor.subirArchivo(ruta(uuid()), { como: finca.cuentaId }));
    await sinPermiso(servidor.subirArchivo(`../${finca.fincaId}/x.jpg`, { como: finca.cuentaId }));
    await sinPermiso(servidor.subirArchivo(`/${finca.fincaId}/x.jpg`, { como: finca.cuentaId }));
    await sinPermiso(servidor.subirArchivo(`${finca.fincaId}x/x.jpg`, { como: finca.cuentaId }));
    // Otro bucket (el de otro uso del proyecto): la política es solo de `archivos`.
    await servidor.sql(`insert into storage.buckets (id, name, public) values ('otro', 'otro', false)`);
    await sinPermiso(servidor.sql(`insert into storage.objects (bucket_id, name) values ('otro', $1)`, [ruta(finca.fincaId)], { como: finca.cuentaId }));
    await servidor.sql(`insert into storage.objects (bucket_id, name) values ('otro', $1)`, [ruta(finca.fincaId, "visible.jpg")]); // como administrador
    expect(await servidor.listarArchivos({ como: finca.cuentaId })).toEqual([]); // `listarArchivos` mira solo `archivos`
    const otros = await servidor.sql(`select name from storage.objects where bucket_id = 'otro'`, [], { como: finca.cuentaId });
    expect(otros).toEqual([]); // y tampoco ve nada de otro bucket
    expect(await servidor.listarArchivos({ como: finca.cuentaId })).toEqual([]);
  });

  it("los archivos son inmutables: nadie puede modificarlos ni borrarlos (no hay políticas de update ni delete)", async () => {
    const nombre = ruta(finca.fincaId);
    await servidor.subirArchivo(nombre, { como: finca.cuentaId });
    const cambiados = await servidor.sql<{ n: number }>(
      `with t as (update storage.objects set name = name || '.copia' where bucket_id = 'archivos' returning 1) select count(*)::int as n from t`,
      [],
      { como: finca.cuentaId },
    );
    expect(cambiados).toEqual([{ n: 0 }]);
    const borrados = await servidor.sql<{ n: number }>(`with t as (delete from storage.objects where bucket_id = 'archivos' returning 1) select count(*)::int as n from t`, [], { como: finca.cuentaId });
    expect(borrados).toEqual([{ n: 0 }]);
    expect(await servidor.listarArchivos({ como: finca.cuentaId })).toEqual([nombre]);
    // Las políticas que existen son exactamente dos: leer y subir.
    const politicas = await servidor.sql<{ policyname: string; cmd: string; roles: string }>(
      `select policyname, cmd, roles::text as roles from pg_policies where schemaname = 'storage' and tablename = 'objects' order by 1`,
    );
    expect(politicas.map((p) => [p.cmd, p.roles])).toEqual([["SELECT", "{authenticated}"], ["INSERT", "{authenticated}"]]);
  });

  it("otro miembro de la finca (que entró con un código) ve y sube bajo la misma carpeta; quien no entró, no", async () => {
    await servidor.subirArchivo(ruta(finca.fincaId, "fotos/a.jpg"), { como: finca.cuentaId });
    const invitada = await servidor.crearCuenta("invitada@ejemplo.com");
    const afuera = await servidor.crearCuenta("afuera@ejemplo.com");
    expect(await servidor.listarArchivos({ como: invitada })).toEqual([]); // todavía no es miembro
    const invitacion = await servidor.rpc("crear_invitacion", { p_finca_id: finca.fincaId }, { como: finca.cuentaId });
    const vinculo = await servidor.rpc(
      "unirse_a_finca",
      { p_finca_id: null, p_codigo: invitacion.codigo, p_dispositivo: { id: uuid(), nombre: "Equipo de la invitada", plataforma: "x" }, p_version_esquema: VERSION_ESQUEMA_DE_PRUEBA },
      { como: invitada },
    );
    expect(vinculo.finca_id).toBe(finca.fincaId);
    expect(await servidor.listarArchivos({ como: invitada })).toEqual([ruta(finca.fincaId, "fotos/a.jpg")]);
    await servidor.subirArchivo(ruta(finca.fincaId, "fotos/b.jpg"), { como: invitada });
    expect(await servidor.listarArchivos({ como: finca.cuentaId })).toHaveLength(2);
    expect(await servidor.listarArchivos({ como: afuera })).toEqual([]);
    await sinPermiso(servidor.subirArchivo(ruta(finca.fincaId, "fotos/c.jpg"), { como: afuera }));
  });

  it("la política mira la membresía de la cuenta, no el equipo: revocar un equipo no cambia el acceso a Storage (límite conocido, ver LEEME)", async () => {
    // Revocar un equipo corta sus llamadas a las funciones (que exigen equipo vigente), pero Storage se decide por cuenta: quien
    // conserve una sesión de una cuenta miembro sigue pudiendo leer y subir archivos de la finca. Se deja anotado, no es un error de la prueba.
    await servidor.subirArchivo(ruta(finca.fincaId), { como: finca.cuentaId });
    await servidor.rpc("revocar_dispositivo", { p_finca_id: finca.fincaId, p_dispositivo_id: finca.dispositivoId }, { como: finca.cuentaId });
    expect(await servidor.listarArchivos({ como: finca.cuentaId })).toEqual([ruta(finca.fincaId)]);
  });

  it("mayúsculas en la carpeta: el uuid se reconoce igual (no se abre una carpeta paralela, porque es el mismo uuid)", async () => {
    await servidor.subirArchivo(ruta(finca.fincaId.toUpperCase(), "fotos/mayusculas.jpg"), { como: finca.cuentaId });
    expect(await servidor.listarArchivos({ como: finca.cuentaId })).toEqual([ruta(finca.fincaId.toUpperCase(), "fotos/mayusculas.jpg")]);
  });
});
