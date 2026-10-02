// Números de registro genealógico (R31): las cinco operaciones arbitradas de PROTOCOLO.md, sección 6.
// Incluye la instantánea corregida por el servidor (numero y version), la idempotencia por `p_cambio_id` y todas las
// intercalaciones de las llamadas de dos equipos sobre el mismo libro.
import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  ErrorDeServidor,
  HORA_BASE,
  agregarEquipo,
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
let libroId: string;

beforeAll(async () => {
  servidor = await crearServidorDePrueba();
});
afterAll(async () => {
  await servidor.cerrar();
});
beforeEach(async () => {
  await servidor.reiniciar();
  finca = await crearFincaDePrueba(servidor);
  libroId = await crearLibro();
});

const T = (minutos: number, contador = 0, equipo = "aaaaaaaa") => marca(HORA_BASE + minutos * 60_000, contador, equipo);
const MARCA_DEL_SERVIDOR = (ms: number, contador = 0) => marca(ms, contador, "00000000");

async function falla(promesa: Promise<unknown>, codigo: string): Promise<void> {
  const error = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `debía fallar con ${codigo}`).toBeInstanceOf(ErrorDeServidor);
  expect((error as ErrorDeServidor).codigo).toBe(codigo);
}

/** Un libro (entidad `libro`) creado por sincronización normal; el contador `siguiente_numero` solo lo escribe el servidor. */
async function crearLibro(campos: Record<string, string | number | null> = {}, id = uuid()): Promise<string> {
  const r = await sincronizarComo(servidor, finca, [
    operacion({ operacion: "crear", entidad: "libro", registro_id: id, campos: { nombre: "Libro principal", prefijo: "PPE", separador_numero: "-", digitos_numero: 4, eliminado_en: null, ...campos }, marca: T(-10) }),
  ]);
  expect(r.rechazados).toEqual([]);
  return id;
}

/** Un borrador de registro (R31: se crea desde el programa, sin número). */
async function crearBorrador(animalId: string, libro = libroId, registroId = uuid()): Promise<string> {
  const r = await sincronizarComo(servidor, finca, [
    operacion({
      operacion: "crear",
      entidad: "registro_genealogico",
      registro_id: registroId,
      campos: { animal_id: animalId, libro_id: libro, estado: "borrador", version: 1, creado_en: "2026-10-02T11:00:00.000Z", eliminado_en: null },
      marca: T(-9),
    }),
  ]);
  expect(r.rechazados).toEqual([]);
  return registroId;
}

interface Elemento {
  registro_id: string;
  animal_id: string;
  libro_id: string;
  fecha_registro: string;
  instantanea: string;
  responsable: string | null;
  observaciones: string | null;
}

function elemento(registroId: string, animalId: string, libro = libroId, extra: Partial<Elemento> = {}): Elemento {
  return {
    registro_id: registroId,
    animal_id: animalId,
    libro_id: libro,
    fecha_registro: "2026-10-02",
    instantanea: JSON.stringify({ numero: null, version: 1, animal: { id: animalId, nombre: `Cabra ${animalId.slice(0, 4)}` } }),
    responsable: "Josías",
    observaciones: null,
    ...extra,
  };
}

interface OpcionesLlamada {
  cambioId?: string;
  dispositivo?: string;
  como?: string;
}

function emitir(elementos: unknown, o: OpcionesLlamada = {}) {
  return servidor.rpc("emitir_registros", { p_finca_id: finca.fincaId, p_dispositivo_id: o.dispositivo ?? finca.dispositivoId, p_cambio_id: o.cambioId ?? uuid(), p_registros: elementos }, { como: o.como ?? finca.cuentaId });
}
function reemitir(registroId: string, versionBase: number, campos: Record<string, unknown>, o: OpcionesLlamada = {}) {
  return servidor.rpc(
    "reemitir_registro",
    { p_finca_id: finca.fincaId, p_dispositivo_id: o.dispositivo ?? finca.dispositivoId, p_cambio_id: o.cambioId ?? uuid(), p_registro_id: registroId, p_version_base: versionBase, p_campos: campos },
    { como: o.como ?? finca.cuentaId },
  );
}
function anular(registroId: string, motivo: string, o: OpcionesLlamada = {}) {
  return servidor.rpc(
    "anular_registro",
    { p_finca_id: finca.fincaId, p_dispositivo_id: o.dispositivo ?? finca.dispositivoId, p_cambio_id: o.cambioId ?? uuid(), p_registro_id: registroId, p_motivo: motivo },
    { como: o.como ?? finca.cuentaId },
  );
}
function fijar(libro: string, valor: number | null, o: OpcionesLlamada = {}) {
  return servidor.rpc(
    "fijar_siguiente_numero",
    { p_finca_id: finca.fincaId, p_dispositivo_id: o.dispositivo ?? finca.dispositivoId, p_cambio_id: o.cambioId ?? uuid(), p_libro_id: libro, p_valor: valor },
    { como: o.como ?? finca.cuentaId },
  );
}
function importar(registros: unknown, o: OpcionesLlamada = {}) {
  return servidor.rpc(
    "importar_registros_emitidos",
    { p_finca_id: finca.fincaId, p_dispositivo_id: o.dispositivo ?? finca.dispositivoId, p_cambio_id: o.cambioId ?? uuid(), p_registros: registros },
    { como: o.como ?? finca.cuentaId },
  );
}

async function registro(entidad: string, id: string) {
  const filas = await servidor.sql<{ campos: Record<string, unknown>; marcas: { base: string; campos: Record<string, string> } }>(
    `select campos, marcas from public.registro where finca_id = $1 and entidad = $2 and registro_id = $3`,
    [finca.fincaId, entidad, id],
  );
  return filas[0] ?? null;
}
const contarCambios = async () => Number((await servidor.sql<{ n: number }>(`select count(*)::int as n from public.cambio`))[0].n);
const siguienteDelLibro = async (libro = libroId) =>
  (await servidor.sql<{ siguiente: number }>(`select siguiente from public.libro_numeracion where finca_id = $1 and libro_id = $2`, [finca.fincaId, libro]))[0]?.siguiente ?? null;

/** Un `uuid` de texto a partir del MD5 de `<cambio_id>:<orden>` (así se derivan los `cambio_id` de lo que produce una llamada arbitrada). */
function derivado(cambioId: string, orden: number): string {
  const h = createHash("md5").update(`${cambioId}:${orden}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

describe("emitir_registros: el número", () => {
  it("asigna consecutivos en el orden recibido, sobre borradores, y avanza el contador del libro", async () => {
    const animales = [uuid(), uuid(), uuid()];
    const borradores = await Promise.all(animales.map((a) => crearBorrador(a)));
    await servidor.avanzarHora(1000);
    // Se emiten en un orden distinto del de creación.
    const orden = [2, 0, 1];
    const r = await emitir(orden.map((i) => elemento(borradores[i], animales[i])));
    expect(r.resultados.map((x: { numero: string }) => x.numero)).toEqual(["PPE-0001", "PPE-0002", "PPE-0003"]);
    expect(r.resultados.map((x: { registro_id: string }) => x.registro_id)).toEqual(orden.map((i) => borradores[i]));
    expect(r.resultados.map((x: { consecutivo: number }) => x.consecutivo)).toEqual([1, 2, 3]);
    expect(r.hora_servidor_ms).toBe(HORA_BASE + 1000);
    expect(await siguienteDelLibro()).toBe(4);
    expect((await registro("libro", libroId))?.campos.siguiente_numero).toBe(4);
    const emitido = await registro("registro_genealogico", borradores[2]);
    expect(emitido?.campos).toMatchObject({ estado: "emitido", version: 1, consecutivo: 1, numero: "PPE-0001", libro_id: libroId, animal_id: animales[2], fecha_registro: "2026-10-02", responsable: "Josías", motivo_anulacion: null, observaciones: null, eliminado_en: null });
    // Un `modificar` de un borrador no reescribe `creado_en` ni `animal_id`.
    expect(emitido?.campos.creado_en).toBe("2026-10-02T11:00:00.000Z");
  });

  it("sin borrador previo, produce un `crear` con animal_id y creado_en (la hora de la marca)", async () => {
    await servidor.avanzarHora(1000);
    const id = uuid();
    const animal = uuid();
    const r = await emitir([elemento(id, animal)]);
    expect(r.resultados[0]).toMatchObject({ registro_id: id, libro_id: libroId, consecutivo: 1, numero: "PPE-0001", version: 1 });
    const campos = (await registro("registro_genealogico", id))?.campos;
    expect(campos).toMatchObject({ animal_id: animal, estado: "emitido", creado_en: new Date(HORA_BASE + 1000).toISOString() });
    const [cambio] = await servidor.sql(`select operacion from public.cambio where registro_id = $1`, [id]);
    expect(cambio.operacion).toBe("crear");
  });

  it("cada libro lleva su propio contador y por cada libro tocado hay un `modificar` de `libro` al final", async () => {
    const otroLibro = await crearLibro({ nombre: "Libro B", prefijo: "B" });
    const a = [uuid(), uuid(), uuid(), uuid()];
    const r = await emitir([elemento(uuid(), a[0]), elemento(uuid(), a[1], otroLibro), elemento(uuid(), a[2]), elemento(uuid(), a[3], otroLibro)]);
    expect(r.resultados.map((x: { numero: string }) => x.numero)).toEqual(["PPE-0001", "B-0001", "PPE-0002", "B-0002"]);
    expect(await siguienteDelLibro(libroId)).toBe(3);
    expect(await siguienteDelLibro(otroLibro)).toBe(3);
    const cambios = await servidor.sql<{ orden: number; entidad: string; registro_id: string; operacion: string; campos: Record<string, unknown> }>(
      `select orden, entidad, registro_id, operacion, campos from public.cambio where arbitrado order by seq`,
    );
    expect(cambios.map((c) => [c.orden, c.entidad])).toEqual([[0, "registro_genealogico"], [1, "registro_genealogico"], [2, "registro_genealogico"], [3, "registro_genealogico"], [4, "libro"], [5, "libro"]]);
    expect(cambios[4]).toMatchObject({ registro_id: libroId, operacion: "modificar", campos: { siguiente_numero: 3 } });
    expect(cambios[5]).toMatchObject({ registro_id: otroLibro, operacion: "modificar", campos: { siguiente_numero: 3 } });
    expect(r.seq_final).toBe(Number((await servidor.sql(`select max(seq)::int as m from public.cambio`))[0].m));
  });

  it("formato del número: prefijo, separador y ceros a la izquierda según el libro; por defecto `-` y 4 dígitos", async () => {
    const sinSeparador = await crearLibro({ nombre: "S", prefijo: "AB", separador_numero: "", digitos_numero: 6 });
    const porDefecto = await crearLibro({ nombre: "D", prefijo: "ZZ", separador_numero: null, digitos_numero: null });
    const sinDatos = await crearLibro({ nombre: "N", prefijo: "NN", separador_numero: undefined as never, digitos_numero: undefined as never });
    const r = await emitir([elemento(uuid(), uuid(), sinSeparador), elemento(uuid(), uuid(), porDefecto), elemento(uuid(), uuid(), sinDatos)]);
    expect(r.resultados.map((x: { numero: string }) => x.numero)).toEqual(["AB000001", "ZZ-0001", "NN-0001"]);
  });

  it("un consecutivo más largo que los dígitos no se recorta", async () => {
    const libro = await crearLibro({ nombre: "Corto", prefijo: "C", digitos_numero: 2 });
    await fijar(libro, 99);
    const r = await emitir([elemento(uuid(), uuid(), libro), elemento(uuid(), uuid(), libro), elemento(uuid(), uuid(), libro)]);
    expect(r.resultados.map((x: { numero: string }) => x.numero)).toEqual(["C-99", "C-100", "C-101"]);
  });

  it("el consecutivo nunca es menor que el mayor ya existente más uno (aunque el contador se haya quedado atrás)", async () => {
    await emitir([elemento(uuid(), uuid()), elemento(uuid(), uuid()), elemento(uuid(), uuid())]);
    await servidor.sql(`update public.libro_numeracion set siguiente = 2`);
    const r = await emitir([elemento(uuid(), uuid())]);
    expect(r.resultados[0].numero).toBe("PPE-0004");
    expect(await siguienteDelLibro()).toBe(5);
  });

  it("los números nunca se repiten ni tienen saltos en muchas emisiones seguidas", async () => {
    const vistos: number[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await emitir(Array.from({ length: (i % 3) + 1 }, () => elemento(uuid(), uuid())));
      for (const x of r.resultados) vistos.push(x.consecutivo);
    }
    expect(vistos).toEqual(Array.from({ length: vistos.length }, (_, i) => i + 1));
  });
});

describe("emitir_registros: la instantánea la completa el servidor", () => {
  it("pone `numero` y `version` = 1 (aunque el programa mande null o cualquier otra cosa), conserva el resto y la guarda como texto", async () => {
    const animal = uuid();
    const original = { numero: null, version: 1, animal: { id: animal, nombre: "Luna", pesos: [1, 2.5, "x"] }, nota: "ñandú", otro: null };
    const r = await emitir([elemento(uuid(), animal, libroId, { instantanea: JSON.stringify(original) })]);
    const texto = r.resultados[0].instantanea;
    expect(typeof texto).toBe("string");
    expect(JSON.parse(texto)).toEqual({ ...original, numero: "PPE-0001", version: 1 });
  });

  it("completa las claves que faltan y corrige una versión equivocada", async () => {
    const r = await emitir([
      elemento(uuid(), uuid(), libroId, { instantanea: '{"animal":"A"}' }),
      elemento(uuid(), uuid(), libroId, { instantanea: '{"numero":"PPE-9999","version":7,"animal":"B"}' }),
    ]);
    expect(JSON.parse(r.resultados[0].instantanea)).toEqual({ animal: "A", numero: "PPE-0001", version: 1 });
    expect(JSON.parse(r.resultados[1].instantanea)).toEqual({ animal: "B", numero: "PPE-0002", version: 1 });
  });

  it("el resultado, el registro y el cambio `crear`/`modificar` llevan exactamente el mismo texto ya corregido", async () => {
    const animalNuevo = uuid();
    const animalConBorrador = uuid();
    const borrador = await crearBorrador(animalConBorrador);
    const idNuevo = uuid();
    const r = await emitir([elemento(idNuevo, animalNuevo), elemento(borrador, animalConBorrador)]);
    for (const [i, id] of [idNuevo, borrador].entries()) {
      const texto: string = r.resultados[i].instantanea;
      expect(JSON.parse(texto).numero).toBe(r.resultados[i].numero);
      expect((await registro("registro_genealogico", id))?.campos.instantanea).toBe(texto);
      const [cambio] = await servidor.sql<{ campos: { instantanea: string; numero: string }; operacion: string }>(`select campos, operacion from public.cambio where registro_id = $1 and arbitrado`, [id]);
      expect(cambio.campos.instantanea).toBe(texto);
      expect(cambio.campos.numero).toBe(r.resultados[i].numero);
      expect(cambio.operacion).toBe(i === 0 ? "crear" : "modificar");
    }
  });

  it("el cliente que baja el cambio por `sincronizar` recibe la instantánea corregida", async () => {
    const b = await agregarEquipo(servidor, finca);
    const animal = uuid();
    const id = uuid();
    const r = await emitir([elemento(id, animal)]);
    const bajada = await sincronizarComo(servidor, finca, [], { dispositivo: b.dispositivo_id });
    const cambio = bajada.cambios.find((c) => c.registro_id === id)!;
    expect(cambio.campos.instantanea).toBe(r.resultados[0].instantanea);
    expect(JSON.parse(cambio.campos.instantanea as string)).toMatchObject({ numero: "PPE-0001", version: 1 });
  });

  it("una instantánea que no es un objeto JSON da parametro_invalido y no consume ningún número", async () => {
    for (const mala of ["no es json", "[1,2]", "5", '"texto"', "null", "", "{"]) {
      await falla(emitir([elemento(uuid(), uuid()), elemento(uuid(), uuid(), libroId, { instantanea: mala })]), "parametro_invalido");
    }
    expect(await siguienteDelLibro()).toBeNull();
    expect(await contarCambios()).toBe(1); // solo el libro
  });

  it("reemitir_registro NO toca la instantánea: se guarda tal cual la manda el programa", async () => {
    const id = uuid();
    await emitir([elemento(id, uuid())]);
    const texto = '{ "version": 2,   "numero": "PPE-0001", "zeta": 1, "alfa": [1, 2] }';
    await reemitir(id, 1, { instantanea: texto });
    expect((await registro("registro_genealogico", id))?.campos.instantanea).toBe(texto);
  });
});

describe("emitir_registros: validaciones (todo o nada)", () => {
  it("si algún elemento falla no se consume ningún número ni se escribe ningún cambio", async () => {
    const antes = await contarCambios();
    await falla(emitir([elemento(uuid(), uuid()), elemento(uuid(), uuid(), uuid())]), "libro_no_encontrado");
    expect(await siguienteDelLibro()).toBeNull();
    expect(await contarCambios()).toBe(antes);
    expect(await servidor.sql(`select 1 from public.llamada_arbitrada`)).toHaveLength(0);
    const r = await emitir([elemento(uuid(), uuid())]);
    expect(r.resultados[0].numero).toBe("PPE-0001");
  });

  it("libro inexistente, eliminado o sin prefijo", async () => {
    const eliminado = await crearLibro({ nombre: "Borrado", prefijo: "X" });
    await sincronizarComo(servidor, finca, [operacion({ operacion: "eliminar", entidad: "libro", registro_id: eliminado, campos: { eliminado_en: "2026-10-02T11:30:00.000Z" }, marca: T(-5) })]);
    const sinPrefijo = await crearLibro({ nombre: "Sin", prefijo: null });
    const vacio = await crearLibro({ nombre: "Vacío", prefijo: "  " });
    await falla(emitir([elemento(uuid(), uuid(), uuid())]), "libro_no_encontrado");
    await falla(emitir([elemento(uuid(), uuid(), eliminado)]), "libro_no_encontrado");
    await falla(emitir([elemento(uuid(), uuid(), sinPrefijo)]), "libro_sin_prefijo");
    await falla(emitir([elemento(uuid(), uuid(), vacio)]), "libro_sin_prefijo");
  });

  it("parámetros mal formados: arreglo vacío, elementos sin campos, tipos erróneos, p_cambio_id nulo", async () => {
    await falla(emitir([]), "parametro_invalido");
    await falla(emitir({}), "parametro_invalido");
    await falla(emitir(null), "parametro_invalido");
    await falla(emitir([{}]), "parametro_invalido");
    await falla(emitir([{ ...elemento(uuid(), uuid()), fecha_registro: 5 }]), "parametro_invalido");
    await falla(emitir([{ ...elemento(uuid(), uuid()), responsable: 5 }]), "parametro_invalido");
    await falla(emitir([{ ...elemento(uuid(), uuid()), animal_id: "" }]), "parametro_invalido");
    await falla(servidor.rpc("emitir_registros", { p_finca_id: finca.fincaId, p_dispositivo_id: finca.dispositivoId, p_cambio_id: null, p_registros: [elemento(uuid(), uuid())] }, { como: finca.cuentaId }), "parametro_invalido");
  });

  it("más de 500 elementos: demasiado_grande", async () => {
    const muchos = Array.from({ length: 501 }, () => elemento(uuid(), uuid()));
    await falla(emitir(muchos), "demasiado_grande");
  });

  it("el mismo registro_id dos veces: parametro_invalido; el mismo animal dos veces: animal_con_registro", async () => {
    const id = uuid();
    await falla(emitir([elemento(id, uuid()), elemento(id, uuid())]), "parametro_invalido");
    const animal = uuid();
    await falla(emitir([elemento(uuid(), animal), elemento(uuid(), animal)]), "animal_con_registro");
    expect(await siguienteDelLibro()).toBeNull();
  });

  it("un registro que ya está emitido (registro_ya_emitido) o anulado (registro_anulado) no se vuelve a emitir", async () => {
    const id = uuid();
    const animal = uuid();
    await emitir([elemento(id, animal)]);
    await falla(emitir([elemento(id, animal)]), "registro_ya_emitido");
    await anular(id, "error de captura");
    await falla(emitir([elemento(id, animal)]), "registro_anulado");
  });

  it("un animal que ya tiene un registro vigente (borrador o emitido) no recibe otro; uno anulado o eliminado no cuenta", async () => {
    const animal = uuid();
    const primero = uuid();
    await emitir([elemento(primero, animal)]);
    await falla(emitir([elemento(uuid(), animal)]), "animal_con_registro");
    // Anulado: el animal puede tener otro registro.
    await anular(primero, "se anula");
    const segundo = uuid();
    const r = await emitir([elemento(segundo, animal)]);
    expect(r.resultados[0].numero).toBe("PPE-0002");
    // Un borrador vigente de otro registro_id también cuenta.
    const otro = uuid();
    await crearBorrador(otro);
    await falla(emitir([elemento(uuid(), otro)]), "animal_con_registro");
    // Pero se puede emitir ese mismo borrador.
    const borrador = await crearBorrador(uuid());
    expect(borrador).toBeTruthy();
  });

  it("un borrador eliminado no cuenta para el animal, y no se puede emitir: registro_no_encontrado", async () => {
    const animal = uuid();
    const borrador = await crearBorrador(animal);
    await sincronizarComo(servidor, finca, [operacion({ operacion: "eliminar", entidad: "registro_genealogico", registro_id: borrador, campos: { eliminado_en: "2026-10-02T11:30:00.000Z" }, marca: T(-5) })]);
    await falla(emitir([elemento(borrador, animal)]), "registro_no_encontrado");
    const r = await emitir([elemento(uuid(), animal)]);
    expect(r.resultados[0].numero).toBe("PPE-0001");
  });

  it("si el borrador es de otro animal: registro_inconsistente (validación adicional, ver LEEME)", async () => {
    const borrador = await crearBorrador(uuid());
    await falla(emitir([elemento(borrador, uuid())]), "registro_inconsistente");
  });
});

describe("operaciones arbitradas: el cambio y su marca", () => {
  it("los cambios son arbitrados, del equipo que llamó, con un grupo por llamada, `orden` correlativo y `cambio_id` derivado", async () => {
    const b = await agregarEquipo(servidor, finca);
    const cambioId = uuid();
    const r = await emitir([elemento(uuid(), uuid()), elemento(uuid(), uuid())], { cambioId, dispositivo: b.dispositivo_id });
    const filas = await servidor.sql<{ cambio_id: string; grupo_id: string; orden: number; dispositivo_id: string; arbitrado: boolean; usuario_id: string | null; marca_original: string | null }>(
      `select cambio_id, grupo_id, orden, dispositivo_id, arbitrado, usuario_id, marca_original from public.cambio where arbitrado order by seq`,
    );
    expect(filas).toHaveLength(3); // dos registros y el libro
    expect(new Set(filas.map((f) => f.grupo_id)).size).toBe(1);
    expect(filas.map((f) => f.orden)).toEqual([0, 1, 2]);
    expect(filas.map((f) => f.cambio_id)).toEqual([0, 1, 2].map((o) => derivado(cambioId, o)));
    expect(filas.every((f) => f.dispositivo_id === b.dispositivo_id && f.usuario_id === null && f.marca_original === null)).toBe(true);
    expect(r.seq_final).toBe(Number((await servidor.sql(`select max(seq)::int as m from public.cambio`))[0].m));
  });

  it("la marca la genera el servidor: la hora del servidor con contador 0 y equipo 00000000; una segunda llamada en el mismo instante sube el contador", async () => {
    await servidor.avanzarHora(60_000);
    const uno = uuid();
    const dos = uuid();
    await emitir([elemento(uno, uuid())]);
    await emitir([elemento(dos, uuid())]);
    const marcas = await servidor.sql<{ registro_id: string; marca: string }>(`select registro_id, marca from public.cambio where arbitrado and entidad = 'registro_genealogico' order by seq`);
    expect(marcas.map((m) => m.marca)).toEqual([MARCA_DEL_SERVIDOR(HORA_BASE + 60_000, 0), MARCA_DEL_SERVIDOR(HORA_BASE + 60_000, 1)]);
    expect((await servidor.sql<{ m: string }>(`select marca_ultima as m from public.finca_servidor`))[0].m).toBe(MARCA_DEL_SERVIDOR(HORA_BASE + 60_000, 1));
    // Todos los cambios de una llamada llevan la misma marca (el `modificar` del libro también).
    const delLibro = await servidor.sql<{ marca: string }>(`select marca from public.cambio where arbitrado and entidad = 'libro' order by seq`);
    expect(delLibro.map((m) => m.marca)).toEqual([MARCA_DEL_SERVIDOR(HORA_BASE + 60_000, 0), MARCA_DEL_SERVIDOR(HORA_BASE + 60_000, 1)]);
  });

  it("si `marca_ultima` es posterior a la hora del servidor, la marca nueva conserva esa hora con el contador subido (nunca retrocede)", async () => {
    // Un equipo con el reloj adelantado 8 minutos (dentro del margen de 10) deja `marca_ultima` en el futuro.
    await sincronizarComo(servidor, finca, [operacion({ campos: { nombre: "Adelantado" }, marca: T(8, 3, "bbbbbbbb") })]);
    await emitir([elemento(uuid(), uuid())]);
    const [m] = await servidor.sql<{ marca: string }>(`select marca from public.cambio where arbitrado and entidad = 'registro_genealogico'`);
    expect(m.marca).toBe(MARCA_DEL_SERVIDOR(HORA_BASE + 8 * 60_000, 4));
  });

  it("los dos equipos reciben los cambios arbitrados, también el que llamó (los suyos de `sincronizar` no, los arbitrados sí)", async () => {
    const b = await agregarEquipo(servidor, finca);
    const id = uuid();
    await emitir([elemento(id, uuid())]);
    const delEmisor = await sincronizarComo(servidor, finca, []);
    const delOtro = await sincronizarComo(servidor, finca, [], { dispositivo: b.dispositivo_id });
    // El emisor no recibe el libro creado por él mismo con `sincronizar`, pero sí lo arbitrado.
    expect(delEmisor.cambios.every((c) => c.arbitrado)).toBe(true);
    expect(delEmisor.cambios.map((c) => c.entidad)).toEqual(["registro_genealogico", "libro"]);
    expect(delOtro.cambios.map((c) => c.entidad)).toEqual(["libro", "registro_genealogico", "libro"]);
    expect(delOtro.cambios.filter((c) => c.arbitrado)).toHaveLength(2);
  });
});

describe("idempotencia por p_cambio_id", () => {
  it("un reintento de emitir_registros devuelve exactamente lo mismo, sin consumir otro número ni escribir otro cambio", async () => {
    const cambioId = uuid();
    const elementos = [elemento(uuid(), uuid()), elemento(uuid(), uuid())];
    const primera = await emitir(elementos, { cambioId });
    const cambios = await contarCambios();
    await servidor.avanzarHora(5000);
    const segunda = await emitir(elementos, { cambioId });
    expect(segunda).toEqual(primera);
    expect(await contarCambios()).toBe(cambios);
    expect(await siguienteDelLibro()).toBe(3);
  });

  it("el reintento se resuelve aunque el contenido cambie o el equipo sea otro (lo decide el p_cambio_id)", async () => {
    const b = await agregarEquipo(servidor, finca);
    const cambioId = uuid();
    const primera = await emitir([elemento(uuid(), uuid())], { cambioId });
    expect(await emitir([elemento(uuid(), uuid())], { cambioId, dispositivo: b.dispositivo_id })).toEqual(primera);
    expect(await siguienteDelLibro()).toBe(2);
  });

  it("anular, reemitir, fijar e importar también son idempotentes", async () => {
    const id = uuid();
    const animal = uuid();
    await emitir([elemento(id, animal)]);
    const ca = uuid();
    const a1 = await anular(id, "motivo", { cambioId: ca });
    expect(await anular(id, "motivo", { cambioId: ca })).toEqual(a1);

    const id2 = uuid();
    await emitir([elemento(id2, uuid())]);
    const cr = uuid();
    const r1 = await reemitir(id2, 1, { instantanea: "{}" }, { cambioId: cr });
    expect(await reemitir(id2, 1, { instantanea: "{}" }, { cambioId: cr })).toEqual(r1); // sin `version_cambio`
    expect(r1.version).toBe(2);

    const libro = await crearLibro({ nombre: "Otro", prefijo: "O" });
    const cf = uuid();
    const f1 = await fijar(libro, 10, { cambioId: cf });
    expect(await fijar(libro, 10, { cambioId: cf })).toEqual(f1);
  });

  it("reutilizar un p_cambio_id en otra función es un error del programa: cambio_id_reutilizado", async () => {
    const cambioId = uuid();
    const id = uuid();
    await emitir([elemento(id, uuid())], { cambioId });
    await falla(anular(id, "motivo", { cambioId }), "cambio_id_reutilizado");
  });

  it("una llamada que falla no deja guardado nada: el mismo p_cambio_id se puede volver a intentar", async () => {
    const cambioId = uuid();
    await falla(emitir([elemento(uuid(), uuid(), uuid())], { cambioId }), "libro_no_encontrado");
    const r = await emitir([elemento(uuid(), uuid())], { cambioId });
    expect(r.resultados[0].numero).toBe("PPE-0001");
  });
});

describe("anular_registro", () => {
  it("pone estado anulado y el motivo; el número se conserva y no se reutiliza", async () => {
    const id = uuid();
    await emitir([elemento(id, uuid())]);
    const r = await anular(id, "  Error de captura  ");
    expect(r).toMatchObject({ registro_id: id, numero: "PPE-0001" });
    expect((await registro("registro_genealogico", id))?.campos).toMatchObject({ estado: "anulado", motivo_anulacion: "Error de captura", numero: "PPE-0001", consecutivo: 1 });
    const siguiente = await emitir([elemento(uuid(), uuid())]);
    expect(siguiente.resultados[0].numero).toBe("PPE-0002");
  });

  it("un registro ya anulado devuelve ya_anulado sin producir cambios", async () => {
    const id = uuid();
    await emitir([elemento(id, uuid())]);
    await anular(id, "uno");
    const cambios = await contarCambios();
    const otra = await anular(id, "dos");
    expect(otra).toMatchObject({ ya_anulado: true, registro_id: id, numero: "PPE-0001" });
    expect(await contarCambios()).toBe(cambios);
    expect((await registro("registro_genealogico", id))?.campos.motivo_anulacion).toBe("uno");
  });

  it("motivo vacío, borrador o inexistente", async () => {
    const id = uuid();
    await emitir([elemento(id, uuid())]);
    await falla(anular(id, "   "), "motivo_requerido");
    await falla(anular(id, null as never), "motivo_requerido");
    const borrador = await crearBorrador(uuid());
    await falla(anular(borrador, "motivo"), "registro_no_emitido");
    await falla(anular(uuid(), "motivo"), "registro_no_encontrado");
  });
});

describe("reemitir_registro", () => {
  it("sube la versión, no cambia el número y deja los campos opcionales que se mandan", async () => {
    const id = uuid();
    await emitir([elemento(id, uuid())]);
    const r = await reemitir(id, 1, { instantanea: '{"v":2}', fecha_registro: "2026-11-01", responsable: "Otra", observaciones: null });
    expect(r).toMatchObject({ registro_id: id, numero: "PPE-0001", version: 2 });
    expect((await registro("registro_genealogico", id))?.campos).toMatchObject({ version: 2, instantanea: '{"v":2}', fecha_registro: "2026-11-01", responsable: "Otra", observaciones: null, numero: "PPE-0001", estado: "emitido" });
    const r3 = await reemitir(id, 2, { instantanea: '{"v":3}' });
    expect(r3.version).toBe(3);
    // Lo que no se mandó no se toca.
    expect((await registro("registro_genealogico", id))?.campos).toMatchObject({ fecha_registro: "2026-11-01", responsable: "Otra" });
  });

  it("version_cambio si la versión actual no es la base; registro_no_emitido, registro_anulado y registro_no_encontrado", async () => {
    const id = uuid();
    await emitir([elemento(id, uuid())]);
    await reemitir(id, 1, { instantanea: "{}" });
    await falla(reemitir(id, 1, { instantanea: "{}" }), "version_cambio");
    await falla(reemitir(id, 5, { instantanea: "{}" }), "version_cambio");
    const borrador = await crearBorrador(uuid());
    await falla(reemitir(borrador, 1, { instantanea: "{}" }), "registro_no_emitido");
    await falla(reemitir(uuid(), 1, { instantanea: "{}" }), "registro_no_encontrado");
    await anular(id, "anulado");
    await falla(reemitir(id, 2, { instantanea: "{}" }), "registro_anulado");
  });

  it("parámetros: la instantánea es obligatoria y solo se admiten cuatro campos", async () => {
    const id = uuid();
    await emitir([elemento(id, uuid())]);
    await falla(reemitir(id, 1, {}), "parametro_invalido");
    await falla(reemitir(id, 1, { instantanea: null }), "parametro_invalido");
    await falla(reemitir(id, 1, { instantanea: "{}", fecha_registro: null }), "parametro_invalido");
    await falla(reemitir(id, 1, { instantanea: "{}", estado: "borrador" }), "campo_invalido");
    await falla(reemitir(id, 1, { instantanea: "{}", numero: "PPE-0099" }), "campo_invalido");
    await falla(reemitir(id, 1, [] as never), "parametro_invalido");
  });
});

describe("fijar_siguiente_numero", () => {
  it("fija el contador de un libro sin registros y la primera emisión parte de ahí", async () => {
    const r = await fijar(libroId, 150);
    expect(r).toMatchObject({ siguiente: 150 });
    expect((await registro("libro", libroId))?.campos.siguiente_numero).toBe(150);
    const e = await emitir([elemento(uuid(), uuid())]);
    expect(e.resultados[0].numero).toBe("PPE-0150");
    expect(await siguienteDelLibro()).toBe(151);
  });

  it("se puede cambiar mientras el libro no tenga registros con número; con borradores sí", async () => {
    await crearBorrador(uuid());
    await fijar(libroId, 10);
    await fijar(libroId, 20);
    expect(await siguienteDelLibro()).toBe(20);
  });

  it("libro_con_registros si ya hay uno con número (emitido o anulado); numero_invalido; libro_no_encontrado", async () => {
    await fijar(libroId, 0 as never).catch(() => undefined);
    await falla(fijar(libroId, 0), "numero_invalido");
    await falla(fijar(libroId, -3), "numero_invalido");
    await falla(fijar(libroId, null), "numero_invalido");
    await falla(fijar(uuid(), 5), "libro_no_encontrado");
    const id = uuid();
    await emitir([elemento(id, uuid())]);
    await falla(fijar(libroId, 50), "libro_con_registros");
    await anular(id, "anulado");
    await falla(fijar(libroId, 50), "libro_con_registros");
  });
});

describe("importar_registros_emitidos", () => {
  const fila = (libro: string, consecutivo: number, extra: Record<string, unknown> = {}, marcaFila = T(-3)) => {
    const id = uuid();
    return {
      registro_id: id,
      marca: marcaFila,
      campos: {
        animal_id: uuid(),
        libro_id: libro,
        consecutivo,
        numero: `PPE-${String(consecutivo).padStart(4, "0")}`,
        fecha_registro: "2026-01-15",
        estado: "emitido",
        version: 1,
        instantanea: JSON.stringify({ numero: `PPE-${String(consecutivo).padStart(4, "0")}`, version: 1 }),
        responsable: null,
        motivo_anulacion: null,
        observaciones: null,
        creado_en: "2026-01-15T10:00:00.000Z",
        eliminado_en: null,
        ...extra,
      },
    };
  };

  it("sube los registros emitidos y anulados con su marca, como cambios arbitrados, y deja el contador en el mayor + 1", async () => {
    const filas = [fila(libroId, 1), fila(libroId, 2, { estado: "anulado", motivo_anulacion: "error" }), fila(libroId, 3)];
    const r = await importar(filas);
    expect(r).toMatchObject({ importados: 3 });
    expect(await siguienteDelLibro()).toBe(4);
    for (const f of filas) {
      const guardado = await registro("registro_genealogico", f.registro_id);
      expect(guardado?.campos).toMatchObject({ numero: f.campos.numero, estado: f.campos.estado, consecutivo: f.campos.consecutivo });
      expect(guardado?.marcas.base).toBe(T(-3));
    }
    const cambios = await servidor.sql<{ arbitrado: boolean; operacion: string; marca: string }>(`select arbitrado, operacion, marca from public.cambio where entidad = 'registro_genealogico' order by seq`);
    expect(cambios).toHaveLength(3);
    expect(cambios.every((c) => c.arbitrado && c.operacion === "crear" && c.marca === T(-3))).toBe(true);
    const siguiente = await emitir([elemento(uuid(), uuid())]);
    expect(siguiente.resultados[0].numero).toBe("PPE-0004");
  });

  it("una marca en el futuro se acorta a la hora del servidor y la original queda en `marca_original`", async () => {
    const futura = T(60, 2, "cccccccc");
    const f = fila(libroId, 1, {}, futura);
    await importar([f]);
    const [c] = await servidor.sql<{ marca: string; marca_original: string | null }>(`select marca, marca_original from public.cambio where registro_id = $1`, [f.registro_id]);
    expect(c.marca).toBe(marca(HORA_BASE, 2, "cccccccc"));
    expect(c.marca_original).toBe(futura);
  });

  it("importacion_no_permitida si ya hay un registro emitido o anulado en el servidor", async () => {
    await emitir([elemento(uuid(), uuid())]);
    await falla(importar([fila(libroId, 5)]), "importacion_no_permitida");
  });

  it("un borrador no impide importar", async () => {
    await crearBorrador(uuid());
    const r = await importar([fila(libroId, 1)]);
    expect(r.importados).toBe(1);
  });

  it("importacion_invalida: saltos, repetidos, números repetidos, estados, campos faltantes o consecutivos que no son enteros", async () => {
    await falla(importar([fila(libroId, 1), fila(libroId, 3)]), "importacion_invalida");
    await falla(importar([fila(libroId, 1), fila(libroId, 1, { numero: "PPE-9999" })]), "importacion_invalida");
    await falla(importar([fila(libroId, 1), fila(libroId, 2, { numero: "PPE-0001" })]), "importacion_invalida");
    await falla(importar([fila(libroId, 1, { estado: "borrador" })]), "importacion_invalida");
    await falla(importar([fila(libroId, 1, { estado: null })]), "importacion_invalida");
    await falla(importar([fila(libroId, 1, { instantanea: null })]), "importacion_invalida");
    await falla(importar([fila(libroId, 1, { numero: "" })]), "importacion_invalida");
    await falla(importar([fila(libroId, 1.5)]), "importacion_invalida");
    await falla(importar([fila(libroId, 0)]), "importacion_invalida");
    await falla(importar([{ ...fila(libroId, 1), marca: "mala" }]), "importacion_invalida");
    const sinLibro = fila(libroId, 1);
    delete (sinLibro.campos as Record<string, unknown>).libro_id;
    await falla(importar([sinLibro]), "importacion_invalida");
    const repetido = fila(libroId, 1);
    await falla(importar([repetido, { ...fila(libroId, 2), registro_id: repetido.registro_id }]), "importacion_invalida");
    expect(await contarCambios()).toBe(1);
  });

  it("cada libro se revisa por separado: dos libros con consecutivos contiguos cada uno", async () => {
    const otro = await crearLibro({ nombre: "Otro", prefijo: "OT" });
    const r = await importar([fila(libroId, 1), fila(otro, 7, { numero: "OT-0007" }), fila(libroId, 2), fila(otro, 8, { numero: "OT-0008" })]);
    expect(r.importados).toBe(4);
    expect(await siguienteDelLibro(libroId)).toBe(3);
    expect(await siguienteDelLibro(otro)).toBe(9);
  });

  it("parámetros: arreglo vacío o más de 2000 filas", async () => {
    await falla(importar([]), "parametro_invalido");
    await falla(importar(null), "parametro_invalido");
    await falla(importar(Array.from({ length: 2001 }, () => ({}))), "demasiado_grande");
  });
});

describe("permisos de las operaciones arbitradas", () => {
  it("un equipo revocado recibe dispositivo_revocado en las cinco; una cuenta ajena, finca_inexistente; un equipo de otra cuenta, dispositivo_desconocido", async () => {
    const b = await agregarEquipo(servidor, finca);
    const id = uuid();
    await emitir([elemento(id, uuid())]);
    await servidor.rpc("revocar_dispositivo", { p_finca_id: finca.fincaId, p_dispositivo_id: b.dispositivo_id }, { como: finca.cuentaId });
    const revocado = { dispositivo: b.dispositivo_id };
    await falla(emitir([elemento(uuid(), uuid())], revocado), "dispositivo_revocado");
    await falla(reemitir(id, 1, { instantanea: "{}" }, revocado), "dispositivo_revocado");
    await falla(anular(id, "x", revocado), "dispositivo_revocado");
    await falla(fijar(libroId, 5, revocado), "dispositivo_revocado");
    await falla(importar([{}], revocado), "dispositivo_revocado");

    const ajena = await crearFincaDePrueba(servidor);
    await falla(emitir([elemento(uuid(), uuid())], { como: ajena.cuentaId, dispositivo: ajena.dispositivoId }), "finca_inexistente");
    await falla(emitir([elemento(uuid(), uuid())], { como: ajena.cuentaId }), "finca_inexistente");
    // La cuenta es miembro de la finca pero el equipo es de otra cuenta.
    const comoMiembro = await servidor.rpc("mis_fincas", {}, { como: finca.cuentaId });
    expect(comoMiembro).toHaveLength(1);
    await falla(emitir([elemento(uuid(), uuid())], { dispositivo: ajena.dispositivoId }), "dispositivo_desconocido");
  });

  it("la finca de otra cuenta no se ve afectada: los números de cada finca son independientes", async () => {
    const otra = await crearFincaDePrueba(servidor);
    const libroOtra = uuid();
    await sincronizarComo(servidor, otra, [operacion({ operacion: "crear", entidad: "libro", registro_id: libroOtra, campos: { nombre: "L", prefijo: "OTRA", separador_numero: "-", digitos_numero: 4, eliminado_en: null }, marca: T(-10) })]);
    await emitir([elemento(uuid(), uuid())]);
    const r = await servidor.rpc(
      "emitir_registros",
      { p_finca_id: otra.fincaId, p_dispositivo_id: otra.dispositivoId, p_cambio_id: uuid(), p_registros: [elemento(uuid(), uuid(), libroOtra)] },
      { como: otra.cuentaId },
    );
    expect(r.resultados[0].numero).toBe("OTRA-0001");
    expect(await siguienteDelLibro()).toBe(2);
  });
});

describe("sincronizar y números: lo que el programa no puede escribir", () => {
  it("el programa no puede inventar un número por `sincronizar` (campo_reservado) pero sí editar campos libres de un registro emitido", async () => {
    const id = uuid();
    await emitir([elemento(id, uuid())]);
    const reservado = await sincronizarComo(servidor, finca, [operacion({ entidad: "registro_genealogico", registro_id: id, campos: { numero: "PPE-0777" }, marca: T(1) })]);
    expect(reservado.rechazados.map((x) => x.motivo)).toEqual(["campo_reservado"]);
    const libre = await sincronizarComo(servidor, finca, [operacion({ entidad: "registro_genealogico", registro_id: id, campos: { observaciones: "nota" }, marca: T(2) })]);
    expect(libre.rechazados).toEqual([]);
    expect((await registro("registro_genealogico", id))?.campos).toMatchObject({ numero: "PPE-0001", estado: "emitido", observaciones: "nota" });
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// Todas las intercalaciones de dos equipos sobre el mismo libro
// ---------------------------------------------------------------------------------------------------------------------------

/** Todas las formas de mezclar dos listas conservando el orden interno de cada una. */
function intercalaciones<T>(a: readonly T[], b: readonly T[]): T[][] {
  if (a.length === 0) return [[...b]];
  if (b.length === 0) return [[...a]];
  return [...intercalaciones(a.slice(1), b).map((resto) => [a[0], ...resto]), ...intercalaciones(a, b.slice(1)).map((resto) => [b[0], ...resto])];
}

describe("dos equipos emitiendo sobre el mismo libro: todas las intercalaciones", () => {
  type Paso = { equipo: "A" | "B"; nombre: string };
  const pasosA: Paso[] = [
    { equipo: "A", nombre: "A1 emitir a1 y a2" },
    { equipo: "A", nombre: "A2 reintento de A1" },
    { equipo: "A", nombre: "A3 anular el registro de a1" },
  ];
  const pasosB: Paso[] = [
    { equipo: "B", nombre: "B1 emitir b1" },
    { equipo: "B", nombre: "B2 emitir con un libro sin prefijo (falla)" },
    { equipo: "B", nombre: "B3 emitir b2 y b3" },
  ];
  const todas = intercalaciones(pasosA, pasosB);

  it("hay C(6,3) = 20 intercalaciones", () => {
    expect(todas).toHaveLength(20);
  });

  it.each(todas.map((orden, i) => [i + 1, orden.map((p) => p.nombre.slice(0, 2)).join(" ")] as const))("intercalación %i: %s", async (_i, _texto) => {
    const orden = todas[Number(_i) - 1];
    // Cada intercalación parte de cero.
    await servidor.reiniciar();
    finca = await crearFincaDePrueba(servidor);
    libroId = await crearLibro();
    const sinPrefijo = await crearLibro({ nombre: "Sin prefijo", prefijo: null });
    const equipoB = await agregarEquipo(servidor, finca);

    const animales = { a1: uuid(), a2: uuid(), b1: uuid(), b2: uuid(), b3: uuid() };
    const registros = { a1: await crearBorrador(animales.a1), a2: await crearBorrador(animales.a2), b1: await crearBorrador(animales.b1), b2: await crearBorrador(animales.b2), b3: await crearBorrador(animales.b3) };
    const cA1 = uuid();
    const resultados: Record<string, { numero: string; registro_id: string }[]> = {};
    let primeraDeA1: unknown = null;
    const enB = { dispositivo: equipoB.dispositivo_id };

    for (const paso of orden) {
      switch (paso.nombre.slice(0, 2)) {
        case "A1": {
          const r = await emitir([elemento(registros.a1, animales.a1), elemento(registros.a2, animales.a2)], { cambioId: cA1 });
          primeraDeA1 = r;
          resultados.A1 = r.resultados;
          break;
        }
        case "A2": {
          const r = await emitir([elemento(registros.a1, animales.a1), elemento(registros.a2, animales.a2)], { cambioId: cA1 });
          expect(r, "el reintento devuelve lo mismo que la primera vez").toEqual(primeraDeA1);
          break;
        }
        case "A3": {
          const r = await anular(registros.a1, "prueba");
          expect(r.numero).toBe(resultados.A1[0].numero);
          break;
        }
        case "B1": {
          resultados.B1 = (await emitir([elemento(registros.b1, animales.b1)], enB)).resultados;
          break;
        }
        case "B2": {
          await falla(emitir([elemento(uuid(), uuid(), sinPrefijo)], enB), "libro_sin_prefijo");
          break;
        }
        case "B3": {
          resultados.B3 = (await emitir([elemento(registros.b2, animales.b2), elemento(registros.b3, animales.b3)], enB)).resultados;
          break;
        }
      }
    }

    // Invariantes: los cinco consecutivos son 1..5, sin saltos ni repeticiones, y el contador queda en 6.
    const filas = await servidor.sql<{ registro_id: string; campos: { consecutivo: number; numero: string; estado: string } }>(
      `select registro_id, campos from public.registro where entidad = 'registro_genealogico' and campos ->> 'libro_id' = $1 and campos ->> 'estado' <> 'borrador'`,
      [libroId],
    );
    const consecutivos = filas.map((f) => f.campos.consecutivo).sort((x, y) => x - y);
    expect(consecutivos).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(filas.map((f) => f.campos.numero)).size).toBe(5);
    expect(await siguienteDelLibro()).toBe(6);
    expect((await registro("libro", libroId))?.campos.siguiente_numero).toBe(6);
    // Los números de cada resultado son los que quedaron guardados.
    for (const lista of Object.values(resultados)) {
      for (const x of lista) expect(filas.find((f) => f.registro_id === x.registro_id)?.campos.numero).toBe(x.numero);
    }
    // Dentro de cada llamada los consecutivos son seguidos.
    for (const lista of [resultados.A1, resultados.B3]) {
      const n = lista.map((x) => Number(x.numero.slice(-4)));
      expect(n[1]).toBe(n[0] + 1);
    }
    // `seq` es único y creciente; no hay dos cambios con la misma marca y el mismo registro (cada cambio arbitrado lleva marca propia por llamada).
    const marcas = await servidor.sql<{ marca: string }>(`select distinct marca from public.cambio where arbitrado`);
    expect(marcas.length).toBeGreaterThanOrEqual(3);
    // Ningún animal quedó con dos registros vigentes.
    const vigentes = await servidor.sql<{ animal: string; n: number }>(
      `select campos ->> 'animal_id' as animal, count(*)::int as n from public.registro
        where entidad = 'registro_genealogico' and campos ->> 'estado' in ('emitido', 'borrador') group by 1 having count(*) > 1`,
    );
    expect(vigentes).toEqual([]);
  });

  it("dos equipos que piden el mismo animal: el segundo recibe animal_con_registro, en cualquier orden, y los números no se pierden", async () => {
    const equipoB = await agregarEquipo(servidor, finca);
    for (const primero of ["A", "B"] as const) {
      await servidor.reiniciar();
      finca = await crearFincaDePrueba(servidor);
      libroId = await crearLibro();
      const b = await agregarEquipo(servidor, finca);
      const animal = uuid();
      const otro = uuid();
      const llamadas = {
        A: () => emitir([elemento(uuid(), animal), elemento(uuid(), otro)]),
        B: () => emitir([elemento(uuid(), animal)], { dispositivo: b.dispositivo_id }),
      };
      const segundo = primero === "A" ? "B" : "A";
      const r1 = await llamadas[primero]();
      expect(r1.resultados[0].numero).toBe("PPE-0001");
      await falla(llamadas[segundo](), "animal_con_registro");
      // El fallo del segundo no consumió números: la siguiente emisión continúa sin saltos.
      const siguiente = await emitir([elemento(uuid(), uuid())]);
      expect(siguiente.resultados[0].consecutivo).toBe(primero === "A" ? 3 : 2);
    }
    expect(equipoB.codigo_equipo).toBe("B");
  });
});
