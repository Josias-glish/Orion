// `sincronizar` (PROTOCOLO.md, sección 5): idempotencia, grupos atómicos, marcas futuras, campos reservados, versiones del esquema,
// límites, descarga paginada y orden de `seq`.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  HORA_BASE,
  agregarEquipo,
  crearFincaDePrueba,
  crearServidorDePrueba,
  marca,
  operacion,
  uuid,
  type FincaDePrueba,
  type OperacionDeSincronizacion,
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
  finca = await crearFincaDePrueba(servidor);
});

interface Respuesta {
  hora_servidor_ms: number;
  aceptados: string[];
  ya_aplicados: string[];
  rechazados: { cambio_id: string; grupo_id: string; motivo: string }[];
  corregidos: { cambio_id: string; marca_nueva: string }[];
  cambios: { seq: number; cambio_id: string; grupo_id: string; orden: number; dispositivo_id: string; usuario_id: string | null; entidad: string; registro_id: string; operacion: string; campos: Record<string, unknown>; marca: string; arbitrado: boolean }[];
  seq_siguiente: number;
  hay_mas: boolean;
  version_esquema_minima: number;
}

function sincronizar(cambios: unknown[], extra: { desde?: number; limite?: number; version?: number; dispositivo?: string; como?: string; finca?: string } = {}): Promise<Respuesta> {
  return servidor.rpc<Respuesta>(
    "sincronizar",
    {
      p_finca_id: extra.finca ?? finca.fincaId,
      p_dispositivo_id: extra.dispositivo ?? finca.dispositivoId,
      p_version_esquema: extra.version ?? 9,
      p_desde: extra.desde ?? 0,
      p_cambios: cambios,
      p_limite: extra.limite,
    },
    { como: extra.como ?? finca.cuentaId },
  );
}

const T = (minutos: number, contador = 0, equipo = "aaaaaaaa") => marca(HORA_BASE + minutos * 60_000, contador, equipo);

async function registro(entidad: string, id: string) {
  const filas = await servidor.sql<{ campos: Record<string, unknown>; marcas: { base: string; campos: Record<string, string> } }>(
    `select campos, marcas from public.registro where finca_id = $1 and entidad = $2 and registro_id = $3`,
    [finca.fincaId, entidad, id],
  );
  return filas[0] ?? null;
}

const contarCambios = async () => Number((await servidor.sql<{ n: number }>(`select count(*)::int as n from public.cambio`))[0].n);
const marcaUltima = async () => (await servidor.sql<{ m: string }>(`select marca_ultima as m from public.finca_servidor where id = $1`, [finca.fincaId]))[0].m;

describe("aceptar cambios y mezclar", () => {
  it("un crear queda en cambio y en registro con la marca de cada campo", async () => {
    const op = operacion({ operacion: "crear", entidad: "animal", campos: { nombre: "Luna", peso: 3.5, color: null }, marca: T(0), usuario_id: "u1" });
    const r = await sincronizar([op]);
    expect(r.aceptados).toEqual([op.id]);
    expect(r.rechazados).toEqual([]);
    expect(r.hora_servidor_ms).toBe(HORA_BASE);
    const reg = await registro("animal", op.registro_id);
    expect(reg?.campos).toEqual({ nombre: "Luna", peso: 3.5, color: null });
    expect(reg?.marcas).toEqual({ base: T(0), campos: {} });
    const [fila] = await servidor.sql(`select * from public.cambio`);
    expect(fila).toMatchObject({ cambio_id: op.id, grupo_id: op.grupo_id, orden: 0, usuario_id: "u1", operacion: "crear", marca: T(0), marca_original: null, arbitrado: false });
  });

  it("dos equipos editan campos distintos y el mismo campo: se conservan los dos y gana la marca más reciente aunque llegue antes", async () => {
    const b = await agregarEquipo(servidor, finca);
    const id = uuid();
    await sincronizar([operacion({ registro_id: id, operacion: "crear", campos: { nombre: "Luna", peso: 3 }, marca: T(0) })]);
    // El equipo B edita el nombre a los 8 minutos y el color a los 9 (menos de 10 minutos adelante de la hora del servidor, así que no se acortan);
    // el equipo A edita el nombre a los 5 (llega después).
    await sincronizar(
      [operacion({ registro_id: id, campos: { nombre: "B" }, marca: T(8, 0, "bbbbbbbb") }), operacion({ registro_id: id, campos: { color: "negra" }, marca: T(9, 0, "bbbbbbbb") })],
      { dispositivo: b.dispositivo_id },
    );
    await sincronizar([operacion({ registro_id: id, campos: { nombre: "A", peso: 4 }, marca: T(5) })]);
    const reg = await registro("animal", id);
    expect(reg?.campos).toEqual({ nombre: "B", peso: 4, color: "negra" });
    expect(reg?.marcas).toEqual({ base: T(5), campos: { nombre: T(8, 0, "bbbbbbbb"), color: T(9, 0, "bbbbbbbb") } });
  });

  it("eliminar equivale a modificar eliminado_en: borrado, restauración por una edición posterior y nuevo borrado", async () => {
    const id = uuid();
    await sincronizar([operacion({ registro_id: id, operacion: "crear", campos: { nombre: "Luna", eliminado_en: null }, marca: T(0) })]);
    const eliminado = async () => (await servidor.sql<{ e: boolean }>(`select public.registro_eliminado(campos, marcas) as e from public.registro where registro_id = $1`, [id]))[0].e;
    await sincronizar([operacion({ registro_id: id, operacion: "eliminar", campos: { eliminado_en: "2026-10-02T12:05:00.000Z" }, marca: T(5) })]);
    expect(await eliminado()).toBe(true);
    await sincronizar([operacion({ registro_id: id, campos: { nombre: "Luna II" }, marca: T(7) })]);
    expect(await eliminado()).toBe(false);
    await sincronizar([operacion({ registro_id: id, operacion: "eliminar", campos: { eliminado_en: "2026-10-02T12:09:00.000Z" }, marca: T(9) })]);
    expect(await eliminado()).toBe(true);
  });

  it("dentro de un grupo se aplica por `orden`, no por el orden de llegada: con marcas iguales gana el último", async () => {
    const grupo = uuid();
    const id = uuid();
    const dos = operacion({ grupo_id: grupo, orden: 1, registro_id: id, campos: { nombre: "2" }, marca: T(5) });
    const uno = operacion({ grupo_id: grupo, orden: 0, registro_id: id, campos: { nombre: "1" }, marca: T(5) });
    await sincronizar([dos, uno]);
    expect((await registro("animal", id))?.campos).toEqual({ nombre: "2" });
    const filas = await servidor.sql<{ orden: number }>(`select orden from public.cambio order by seq`);
    expect(filas.map((f) => f.orden)).toEqual([0, 1]);
  });

  it("`marca_ultima` de la finca es la mayor marca aceptada (no baja con una marca menor ni sube con una rechazada)", async () => {
    await sincronizar([operacion({ campos: { a: 1 }, marca: T(5) })]);
    expect(await marcaUltima()).toBe(T(5));
    await sincronizar([operacion({ campos: { a: 1 }, marca: T(2) })]);
    expect(await marcaUltima()).toBe(T(5));
    await sincronizar([operacion({ entidad: "Mala", campos: { a: 1 }, marca: T(9) })]);
    expect(await marcaUltima()).toBe(T(5));
    await sincronizar([operacion({ campos: { a: 1 }, marca: T(7, 3, "bbbbbbbb") })]);
    expect(await marcaUltima()).toBe(T(7, 3, "bbbbbbbb"));
  });

  it("registra la versión del esquema y la hora de la última sincronización del equipo", async () => {
    servidor.avanzarHora(60_000);
    await sincronizar([]);
    const [d] = await servidor.sql<{ version_esquema: number; ultima_sincronizacion: Date }>(`select version_esquema, ultima_sincronizacion from public.dispositivo where id = $1`, [finca.dispositivoId]);
    expect(d.version_esquema).toBe(9);
    expect(new Date(d.ultima_sincronizacion).getTime()).toBe(HORA_BASE + 60_000);
  });

  it("`cambio` solo se agrega: update y delete fallan aun con permisos de administrador", async () => {
    await sincronizar([operacion({ campos: { a: 1 }, marca: T(0) })]);
    await expect(servidor.sql(`update public.cambio set orden = 5`)).rejects.toMatchObject({ codigo: "cambio_solo_se_agrega" });
    await expect(servidor.sql(`delete from public.cambio`)).rejects.toMatchObject({ codigo: "cambio_solo_se_agrega" });
    expect(await contarCambios()).toBe(1);
  });
});

describe("idempotencia por cambio_id (R15, CA-28)", () => {
  it("el mismo envío tres veces deja una sola fila en cambio y lo reenviado va a ya_aplicados", async () => {
    const grupo = uuid();
    const ops = [
      operacion({ grupo_id: grupo, orden: 0, campos: { nombre: "A" }, marca: T(0) }),
      operacion({ grupo_id: grupo, orden: 1, campos: { nombre: "B" }, marca: T(0) }),
      operacion({ campos: { nombre: "C" }, marca: T(1) }),
    ];
    const primera = await sincronizar(ops);
    expect(primera.aceptados).toHaveLength(3);
    for (let i = 0; i < 2; i++) {
      const otra = await sincronizar(ops);
      expect(otra.aceptados).toEqual([]);
      expect([...otra.ya_aplicados].sort()).toEqual(ops.map((o) => o.id).sort());
      expect(otra.rechazados).toEqual([]);
    }
    expect(await contarCambios()).toBe(3);
    expect(await marcaUltima()).toBe(T(1));
  });

  it("un reenvío mezclado con cambios nuevos aplica solo los nuevos", async () => {
    const viejo = operacion({ campos: { a: 1 }, marca: T(0) });
    await sincronizar([viejo]);
    const nuevo = operacion({ campos: { a: 2 }, marca: T(1) });
    const r = await sincronizar([viejo, nuevo]);
    expect(r.ya_aplicados).toEqual([viejo.id]);
    expect(r.aceptados).toEqual([nuevo.id]);
    expect(await contarCambios()).toBe(2);
  });

  it("un cambio_id repetido dentro del mismo envío es un error de forma (no se aplica nada)", async () => {
    const op = operacion({ campos: { a: 1 }, marca: T(0) });
    await expect(sincronizar([op, { ...op, grupo_id: uuid() }])).rejects.toMatchObject({ codigo: "parametro_invalido" });
    expect(await contarCambios()).toBe(0);
  });
});

describe("grupos atómicos", () => {
  it("un grupo con una operación inválida se rechaza entero y los demás grupos del envío siguen", async () => {
    const malo = uuid();
    const buena1 = operacion({ grupo_id: malo, orden: 0, registro_id: "r-buena-1", campos: { nombre: "A" }, marca: T(0) });
    const mala = operacion({ grupo_id: malo, orden: 1, registro_id: "r-mala", operacion: "crear", campos: { nombre: { x: 1 } as never }, marca: T(0) });
    const otro = operacion({ registro_id: "r-otro", campos: { nombre: "O" }, marca: T(1) });
    const r = await sincronizar([buena1, mala, otro]);
    expect(r.aceptados).toEqual([otro.id]);
    expect(r.rechazados).toEqual([
      { cambio_id: buena1.id, grupo_id: malo, motivo: "campo_invalido" },
      { cambio_id: mala.id, grupo_id: malo, motivo: "campo_invalido" },
    ]);
    expect(await registro("animal", "r-buena-1")).toBeNull();
    expect(await registro("animal", "r-mala")).toBeNull();
    expect(await registro("animal", "r-otro")).not.toBeNull();
    expect(await contarCambios()).toBe(1);
    // `marca_ultima` no subió por lo rechazado.
    expect(await marcaUltima()).toBe(T(1));
  });

  it("la parte de un grupo que el servidor ya conocía va a ya_aplicados y lo nuevo se rechaza si es inválido", async () => {
    const grupo = uuid();
    const conocido = operacion({ grupo_id: grupo, orden: 0, campos: { a: 1 }, marca: T(0) });
    await sincronizar([conocido]);
    const nuevo = operacion({ grupo_id: grupo, orden: 1, campos: { a: 2 }, marca: "mala" });
    const r = await sincronizar([conocido, nuevo]);
    expect(r.ya_aplicados).toEqual([conocido.id]);
    expect(r.rechazados).toEqual([{ cambio_id: nuevo.id, grupo_id: grupo, motivo: "marca_invalida" }]);
  });

  it("un rechazo no deja ningún cambio, ni siquiera de un grupo con muchas operaciones válidas antes del error", async () => {
    const grupo = uuid();
    const ops = [0, 1, 2, 3].map((i) => operacion({ grupo_id: grupo, orden: i, registro_id: `r${i}`, operacion: "crear", campos: { n: i }, marca: T(0) }));
    ops.push(operacion({ grupo_id: grupo, orden: 4, operacion: "borrar" as never, campos: { n: 1 }, marca: T(0) }));
    const r = await sincronizar(ops);
    expect(r.aceptados).toEqual([]);
    expect(r.rechazados).toHaveLength(5);
    expect(new Set(r.rechazados.map((x) => x.motivo))).toEqual(new Set(["operacion_invalida"]));
    expect(await contarCambios()).toBe(0);
    expect((await servidor.sql(`select 1 from public.registro`)).length).toBe(0);
  });
});

describe("validación de cada operación", () => {
  async function motivoDe(parcial: Partial<OperacionDeSincronizacion> & Record<string, unknown>): Promise<string> {
    const op = operacion({ campos: { a: 1 }, marca: T(0), ...parcial } as never);
    const r = await sincronizar([op]);
    expect(r.aceptados).toEqual([]);
    expect(r.rechazados).toHaveLength(1);
    return r.rechazados[0].motivo;
  }

  it("entidad_invalida", async () => {
    for (const entidad of ["Animal", "1animal", "", "a".repeat(41), "con-guion", "con espacio"]) expect(await motivoDe({ entidad }), entidad).toBe("entidad_invalida");
    expect(await motivoDe({ entidad: 5 as never })).toBe("entidad_invalida");
  });

  it("operacion_invalida", async () => {
    expect(await motivoDe({ operacion: "borrar" as never })).toBe("operacion_invalida");
    expect(await motivoDe({ operacion: undefined })).toBe("operacion_invalida");
  });

  it("marca_invalida", async () => {
    for (const marcaMala of ["", "ayer", "2026-10-02T12:00:00.000Z", "2026-02-30T00:00:00.000Z-0000-aaaaaaaa", "2026-10-02T12:00:00.000Z-0000-AAAAAAAA"]) {
      expect(await motivoDe({ marca: marcaMala }), marcaMala).toBe("marca_invalida");
    }
    expect(await motivoDe({ marca: 5 as never })).toBe("marca_invalida");
  });

  it("campo_invalido: sin campos, valores que no son texto, número ni null, o nombres raros", async () => {
    expect(await motivoDe({ campos: {} })).toBe("campo_invalido");
    expect(await motivoDe({ campos: [] as never })).toBe("campo_invalido");
    expect(await motivoDe({ campos: null as never })).toBe("campo_invalido");
    expect(await motivoDe({ campos: { a: true as never } })).toBe("campo_invalido");
    expect(await motivoDe({ campos: { a: [1] as never } })).toBe("campo_invalido");
    expect(await motivoDe({ campos: { a: { b: 1 } as never } })).toBe("campo_invalido");
    expect(await motivoDe({ campos: { "con espacio": 1 } })).toBe("campo_invalido");
    expect(await motivoDe({ campos: { "": 1 } })).toBe("campo_invalido");
  });

  it("eliminar solo acepta el campo eliminado_en", async () => {
    expect(await motivoDe({ operacion: "eliminar", campos: { nombre: "x" } })).toBe("campo_invalido");
    expect(await motivoDe({ operacion: "eliminar", campos: { eliminado_en: "2026-10-02T12:00:00.000Z", nombre: "x" } })).toBe("campo_invalido");
  });

  it("registro_invalido: sin registro_id o demasiado largo", async () => {
    expect(await motivoDe({ registro_id: "" })).toBe("registro_invalido");
    expect(await motivoDe({ registro_id: "x".repeat(101) })).toBe("registro_invalido");
    expect(await motivoDe({ registro_id: undefined })).toBe("registro_invalido");
  });

  it("valores límite que sí se aceptan: null, vacío, número, texto largo, 100 caracteres de registro_id", async () => {
    const op = operacion({ registro_id: "x".repeat(100), operacion: "crear", campos: { a: null, b: "", c: 0, d: -1.5, e: "ñandú ✓".repeat(100) }, marca: T(0) });
    const r = await sincronizar([op]);
    expect(r.aceptados).toEqual([op.id]);
    expect((await registro("animal", op.registro_id))?.campos).toMatchObject({ a: null, b: "", c: 0, d: -1.5 });
  });

  it("los errores de forma del envío (no de una operación) fallan toda la llamada: id sin uuid, grupo sin uuid, orden que no es entero, no es arreglo", async () => {
    const op = operacion({ campos: { a: 1 }, marca: T(0) });
    await expect(sincronizar([{ ...op, id: "no-es-uuid" }])).rejects.toMatchObject({ codigo: "parametro_invalido" });
    await expect(sincronizar([{ ...op, grupo_id: null }])).rejects.toMatchObject({ codigo: "parametro_invalido" });
    await expect(sincronizar([{ ...op, orden: 1.5 }])).rejects.toMatchObject({ codigo: "parametro_invalido" });
    await expect(sincronizar([{ ...op, orden: -1 }])).rejects.toMatchObject({ codigo: "parametro_invalido" });
    await expect(sincronizar(["texto"])).rejects.toMatchObject({ codigo: "parametro_invalido" });
    await expect(sincronizar({ no: "arreglo" } as never)).rejects.toMatchObject({ codigo: "parametro_invalido" });
    expect(await contarCambios()).toBe(0);
  });
});

describe("marca futura (R17, S-84)", () => {
  it("más de 10 minutos de adelanto se acorta a la hora del servidor, se conserva la original y se devuelve en corregidos", async () => {
    const futura = marca(HORA_BASE + 3 * 24 * 3_600_000, 7, "bbbbbbbb");
    const op = operacion({ operacion: "crear", campos: { nombre: "Luna", peso: 3 }, marca: futura });
    const r = await sincronizar([op]);
    const nueva = marca(HORA_BASE, 7, "bbbbbbbb");
    expect(r.aceptados).toEqual([op.id]);
    expect(r.corregidos).toEqual([{ cambio_id: op.id, marca_nueva: nueva }]);
    const [fila] = await servidor.sql<{ marca: string; marca_original: string }>(`select marca, marca_original from public.cambio`);
    expect(fila).toEqual({ marca: nueva, marca_original: futura });
    expect((await registro("animal", op.registro_id))?.marcas).toEqual({ base: nueva, campos: {} });
    expect(await marcaUltima()).toBe(nueva);
  });

  it("si el equipo reenvía el mismo cambio (la respuesta se perdió), la corrección vuelve a llegar aunque el cambio esté en ya_aplicados", async () => {
    const op = operacion({ operacion: "crear", campos: { nombre: "Luna" }, marca: marca(HORA_BASE + 3 * 24 * 3_600_000, 3, "bbbbbbbb") });
    const primera = await sincronizar([op]);
    const otra = await sincronizar([op]);
    expect(otra.aceptados).toEqual([]);
    expect(otra.ya_aplicados).toEqual([op.id]);
    expect(otra.corregidos).toEqual(primera.corregidos);
    // Un cambio con la marca sin corregir no genera corrección al reenviarse.
    const normal = operacion({ campos: { a: 1 }, marca: marca(HORA_BASE, 1, "bbbbbbbb") });
    await sincronizar([normal]);
    expect((await sincronizar([normal])).corregidos).toEqual([]);
  });

  it("exactamente 10 minutos no se corrige; 1 ms más, sí", async () => {
    const justa = operacion({ campos: { a: 1 }, marca: marca(HORA_BASE + 600_000) });
    const pasada = operacion({ campos: { b: 1 }, marca: marca(HORA_BASE + 600_001) });
    const r = await sincronizar([justa, pasada]);
    expect(r.corregidos.map((c) => c.cambio_id)).toEqual([pasada.id]);
    expect(r.corregidos[0].marca_nueva).toBe(marca(HORA_BASE));
  });

  it("una marca acortada no gana un choque que no merecía ganar", async () => {
    const id = uuid();
    await sincronizar([operacion({ registro_id: id, operacion: "crear", campos: { nombre: "A" }, marca: T(1) })]);
    servidor.avanzarHora(60_000 * 5);
    // Un equipo con el reloj en 2030 edita el nombre: su marca se acorta a la hora actual (T(5)), que sigue siendo posterior a T(1).
    await sincronizar([operacion({ registro_id: id, campos: { nombre: "B" }, marca: marca(Date.UTC(2030, 0, 1), 0, "bbbbbbbb") })]);
    // Otro equipo, con reloj bien puesto, edita a T(7): gana a la marca acortada, no pierde para siempre contra el año 2030.
    await sincronizar([operacion({ registro_id: id, campos: { nombre: "C" }, marca: T(7) })]);
    expect((await registro("animal", id))?.campos).toEqual({ nombre: "C" });
  });
});

describe("campos reservados (R31)", () => {
  async function motivo(entidad: string, operacionDe: "crear" | "modificar", campos: Record<string, string | number | null>): Promise<string | null> {
    const op = operacion({ entidad, operacion: operacionDe, campos, marca: T(0) });
    const r = await sincronizar([op]);
    return r.rechazados[0]?.motivo ?? null;
  }

  it("modificar un campo reservado de registro_genealogico se rechaza, uno por uno", async () => {
    for (const campo of ["estado", "consecutivo", "numero", "version", "instantanea", "motivo_anulacion"]) {
      expect(await motivo("registro_genealogico", "modificar", { [campo]: null }), campo).toBe("campo_reservado");
    }
    expect(await motivo("registro_genealogico", "modificar", { observaciones: "x", fecha_registro: "2026-10-02" })).toBeNull();
  });

  it("libro.siguiente_numero nunca viaja, ni en un crear", async () => {
    expect(await motivo("libro", "crear", { nombre: "Libro", prefijo: "PPE", siguiente_numero: 1 })).toBe("campo_reservado");
    expect(await motivo("libro", "modificar", { siguiente_numero: 9 })).toBe("campo_reservado");
    expect(await motivo("libro", "crear", { nombre: "Libro", prefijo: "PPE" })).toBeNull();
  });

  it("excepción: el crear de un borrador se acepta (estado ausente o borrador, version ausente o 1, el resto ausente o null)", async () => {
    expect(await motivo("registro_genealogico", "crear", { animal_id: "a1", libro_id: "l1" })).toBeNull();
    expect(await motivo("registro_genealogico", "crear", { animal_id: "a2", estado: "borrador", version: 1, consecutivo: null, numero: null, instantanea: null, motivo_anulacion: null })).toBeNull();
  });

  it("un crear que no es borrador se rechaza", async () => {
    expect(await motivo("registro_genealogico", "crear", { estado: "emitido" })).toBe("campo_reservado");
    expect(await motivo("registro_genealogico", "crear", { estado: null })).toBe("campo_reservado");
    expect(await motivo("registro_genealogico", "crear", { version: 2 })).toBe("campo_reservado");
    expect(await motivo("registro_genealogico", "crear", { version: "1" })).toBe("campo_reservado");
    expect(await motivo("registro_genealogico", "crear", { consecutivo: 5 })).toBe("campo_reservado");
    expect(await motivo("registro_genealogico", "crear", { numero: "PPE-0001" })).toBe("campo_reservado");
    expect(await motivo("registro_genealogico", "crear", { instantanea: "{}" })).toBe("campo_reservado");
    expect(await motivo("registro_genealogico", "crear", { motivo_anulacion: "x" })).toBe("campo_reservado");
  });

  it("eliminar un registro_genealogico no es tocar un campo reservado", async () => {
    const op = operacion({ entidad: "registro_genealogico", operacion: "eliminar", campos: { eliminado_en: "2026-10-02T12:00:00.000Z" }, marca: T(0) });
    expect((await sincronizar([op])).aceptados).toEqual([op.id]);
  });

  it("un crear de borrador no puede devolver a borrador un registro ya emitido (endurecimiento)", async () => {
    const reg = "r-emitido";
    await servidor.sql(
      `insert into public.registro (finca_id, entidad, registro_id, campos, marcas) values ($1, 'registro_genealogico', $2, '{"estado":"emitido","numero":"PPE-0001"}', $3)`,
      [finca.fincaId, reg, JSON.stringify({ base: T(0), campos: {} })],
    );
    const op = operacion({ entidad: "registro_genealogico", operacion: "crear", registro_id: reg, campos: { observaciones: "x" }, marca: T(5) });
    expect((await sincronizar([op])).rechazados[0].motivo).toBe("campo_reservado");
  });
});

describe("versión del esquema (S-93)", () => {
  it("un equipo con una versión menor que la mínima recibe esquema_antiguo y no se aplica nada", async () => {
    await expect(sincronizar([operacion({ campos: { a: 1 }, marca: T(0) })], { version: 8 })).rejects.toMatchObject({ codigo: "esquema_antiguo" });
    expect(await contarCambios()).toBe(0);
  });

  it("un equipo con una versión mayor sube la mínima de la finca y desde ese momento los de la anterior quedan fuera", async () => {
    const r = await sincronizar([], { version: 10 });
    expect(r.version_esquema_minima).toBe(10);
    await expect(sincronizar([], { version: 9 })).rejects.toMatchObject({ codigo: "esquema_antiguo" });
    expect((await sincronizar([], { version: 10 })).version_esquema_minima).toBe(10);
    const [f] = await servidor.sql<{ m: number }>(`select version_esquema_minima as m from public.finca_servidor`);
    expect(f.m).toBe(10);
  });

  it("la versión menor no sube nada si falla otra comprobación posterior (todo es una transacción)", async () => {
    const operaciones = Array.from({ length: 501 }, () => operacion({ campos: { a: 1 }, marca: T(0) }));
    await expect(sincronizar(operaciones, { version: 12 })).rejects.toMatchObject({ codigo: "demasiado_grande" });
    const [f] = await servidor.sql<{ m: number }>(`select version_esquema_minima as m from public.finca_servidor`);
    expect(f.m).toBe(9);
  });
});

describe("límites", () => {
  it("500 operaciones sí; 501 es demasiado_grande", async () => {
    const quinientas = Array.from({ length: 500 }, (_, i) => operacion({ registro_id: `r${i}`, operacion: "crear", campos: { n: i }, marca: T(0) }));
    const r = await sincronizar(quinientas);
    expect(r.aceptados).toHaveLength(500);
    const otras = Array.from({ length: 501 }, () => operacion({ campos: { a: 1 }, marca: T(1) }));
    await expect(sincronizar(otras)).rejects.toMatchObject({ codigo: "demasiado_grande" });
    expect(await contarCambios()).toBe(500);
  });

  it("más de 2 MB de JSON es demasiado_grande", async () => {
    const grande = operacion({ campos: { nota: "x".repeat(2_200_000) }, marca: T(0) });
    await expect(sincronizar([grande])).rejects.toMatchObject({ codigo: "demasiado_grande" });
    const aceptable = operacion({ campos: { nota: "x".repeat(1_900_000) }, marca: T(0) });
    expect((await sincronizar([aceptable])).aceptados).toEqual([aceptable.id]);
  });
});

describe("descarga: cursor, páginas y qué se devuelve", () => {
  it("no devuelve los cambios propios y sí los de otros equipos, en orden de seq, con su contenido", async () => {
    const b = await agregarEquipo(servidor, finca);
    const deA = operacion({ campos: { de: "A" }, marca: T(0), usuario_id: "ua" });
    const deB = operacion({ operacion: "crear", entidad: "lote", campos: { de: "B" }, marca: T(1, 2, "bbbbbbbb"), usuario_id: "ub", orden: 3 });
    await sincronizar([deA]);
    const r = await sincronizar([deB], { dispositivo: b.dispositivo_id });
    expect(r.cambios.map((c) => c.cambio_id)).toEqual([deA.id]);
    expect(r.cambios[0]).toMatchObject({ dispositivo_id: finca.dispositivoId, usuario_id: "ua", entidad: "animal", registro_id: deA.registro_id, operacion: "modificar", campos: { de: "A" }, marca: T(0), arbitrado: false, grupo_id: deA.grupo_id, orden: 0 });
    const deVuelta = await sincronizar([], { desde: 0 });
    expect(deVuelta.cambios.map((c) => c.cambio_id)).toEqual([deB.id]);
    expect(deVuelta.cambios[0]).toMatchObject({ entidad: "lote", orden: 3, usuario_id: "ub", marca: T(1, 2, "bbbbbbbb") });
    expect(deVuelta.seq_siguiente).toBe(r.seq_siguiente);
    expect(deVuelta.hay_mas).toBe(false);
  });

  it("pagina con p_limite (cuenta también los propios): seq_siguiente es el último examinado y hay_mas dice si queda algo", async () => {
    const b = await agregarEquipo(servidor, finca);
    // 3 de A, 1 de B, 3 de A: seq 1..7 (en esta finca, con la secuencia limpia).
    const deA1 = [0, 1, 2].map((i) => operacion({ registro_id: `a${i}`, campos: { i }, marca: T(i) }));
    const deB = operacion({ registro_id: "b", campos: { i: 9 }, marca: T(3, 0, "bbbbbbbb") });
    const deA2 = [4, 5, 6].map((i) => operacion({ registro_id: `a${i}`, campos: { i }, marca: T(i) }));
    await sincronizar(deA1);
    await sincronizar([deB], { dispositivo: b.dispositivo_id });
    await sincronizar(deA2);
    const seqs = (await servidor.sql<{ seq: number }>(`select seq from public.cambio order by seq`)).map((f) => f.seq);
    expect(seqs).toHaveLength(7);

    // A pide de a 2: examina [1,2], [3,4], [5,6], [7].
    const p1 = await sincronizar([], { desde: 0, limite: 2 });
    expect(p1.cambios).toEqual([]);
    expect(p1.seq_siguiente).toBe(seqs[1]);
    expect(p1.hay_mas).toBe(true);
    const p2 = await sincronizar([], { desde: p1.seq_siguiente, limite: 2 });
    expect(p2.cambios.map((c) => c.cambio_id)).toEqual([deB.id]);
    expect(p2.seq_siguiente).toBe(seqs[3]);
    expect(p2.hay_mas).toBe(true);
    const p3 = await sincronizar([], { desde: p2.seq_siguiente, limite: 2 });
    expect(p3.seq_siguiente).toBe(seqs[5]);
    expect(p3.hay_mas).toBe(true);
    const p4 = await sincronizar([], { desde: p3.seq_siguiente, limite: 2 });
    expect(p4.seq_siguiente).toBe(seqs[6]);
    expect(p4.hay_mas).toBe(false);
    // Sin más cambios, el cursor no se mueve.
    const p5 = await sincronizar([], { desde: p4.seq_siguiente });
    expect(p5.cambios).toEqual([]);
    expect(p5.seq_siguiente).toBe(seqs[6]);
    expect(p5.hay_mas).toBe(false);
    // limite 0: no pide nada, pero dice si hay más.
    const p6 = await sincronizar([], { desde: 0, limite: 0 });
    expect(p6.cambios).toEqual([]);
    expect(p6.seq_siguiente).toBe(0);
    expect(p6.hay_mas).toBe(true);
  });

  it("el tope de p_limite es 500", async () => {
    const b = await agregarEquipo(servidor, finca);
    const muchas = Array.from({ length: 500 }, (_, i) => operacion({ registro_id: `r${i}`, operacion: "crear", campos: { n: i }, marca: T(0) }));
    await sincronizar(muchas);
    await sincronizar([operacion({ registro_id: "extra", campos: { n: 1 }, marca: T(1) })]);
    const r = await sincronizar([], { dispositivo: b.dispositivo_id, limite: 100000 });
    expect(r.cambios).toHaveLength(500);
    expect(r.hay_mas).toBe(true);
    const resto = await sincronizar([], { dispositivo: b.dispositivo_id, desde: r.seq_siguiente });
    expect(resto.cambios).toHaveLength(1);
    expect(resto.hay_mas).toBe(false);
  });

  it("los cambios de grupos rechazados no aparecen y los envíos de otra finca no se mezclan en el cursor", async () => {
    const otra = await crearFincaDePrueba(servidor, { nombre: "Otra" });
    await sincronizar([operacion({ campos: { a: 1 }, marca: T(0) })]);
    await sincronizar([operacion({ campos: { a: 1 }, marca: T(0) })], { finca: otra.fincaId, dispositivo: otra.dispositivoId, como: otra.cuentaId });
    const b = await agregarEquipo(servidor, finca);
    const r = await sincronizar([], { dispositivo: b.dispositivo_id });
    expect(r.cambios).toHaveLength(1);
    expect(r.hay_mas).toBe(false);
  });

  it("el orden de seq es el de confirmación: crece de llamada en llamada y dentro del grupo sigue `orden`", async () => {
    const a = await sincronizar([operacion({ campos: { a: 1 }, marca: T(0) })]);
    const b = await sincronizar([operacion({ campos: { a: 2 }, marca: T(1) }), operacion({ campos: { a: 3 }, marca: T(2) })]);
    const c = await sincronizar([operacion({ campos: { a: 4 }, marca: T(3) })]);
    expect(a.seq_siguiente).toBeLessThan(b.seq_siguiente);
    expect(b.seq_siguiente).toBeLessThan(c.seq_siguiente);
    const filas = await servidor.sql<{ seq: number; campos: { a: number } }>(`select seq, campos from public.cambio order by seq`);
    expect(filas.map((f) => f.campos.a)).toEqual([1, 2, 3, 4]);
  });
});

describe("equipo y finca", () => {
  it("un equipo desconocido, de otra cuenta o de otra finca recibe dispositivo_desconocido", async () => {
    await expect(sincronizar([], { dispositivo: uuid() })).rejects.toMatchObject({ codigo: "dispositivo_desconocido" });
    const otra = await crearFincaDePrueba(servidor);
    await expect(sincronizar([], { dispositivo: otra.dispositivoId })).rejects.toMatchObject({ codigo: "dispositivo_desconocido" });
  });

  it("un equipo revocado ya no puede sincronizar y no se aplica nada de lo que mande", async () => {
    const b = await agregarEquipo(servidor, finca);
    expect((await sincronizar([], { dispositivo: b.dispositivo_id })).aceptados).toEqual([]);
    await servidor.rpc("revocar_dispositivo", { p_finca_id: finca.fincaId, p_dispositivo_id: b.dispositivo_id }, { como: finca.cuentaId });
    await expect(sincronizar([operacion({ campos: { a: 1 }, marca: T(0) })], { dispositivo: b.dispositivo_id })).rejects.toMatchObject({ codigo: "dispositivo_revocado" });
    expect(await contarCambios()).toBe(0);
    // El equipo A sigue sincronizando.
    expect((await sincronizar([operacion({ campos: { a: 1 }, marca: T(0) })])).aceptados).toHaveLength(1);
  });

  it("una cuenta que no es miembro, o una finca que no existe, reciben finca_inexistente", async () => {
    const ajena = await servidor.crearCuenta("ajena@ejemplo.com");
    await expect(sincronizar([], { como: ajena })).rejects.toMatchObject({ codigo: "finca_inexistente" });
    await expect(sincronizar([], { finca: uuid() })).rejects.toMatchObject({ codigo: "finca_inexistente" });
  });

  it("sin sesión (administrador sin JWT) es sin_sesion; como anon no hay permiso de ejecución", async () => {
    await expect(servidor.rpc("sincronizar", { p_finca_id: finca.fincaId, p_dispositivo_id: finca.dispositivoId, p_version_esquema: 9, p_desde: 0, p_cambios: [] })).rejects.toMatchObject({ codigo: "sin_sesion" });
    await expect(servidor.rpc("sincronizar", { p_finca_id: finca.fincaId, p_dispositivo_id: finca.dispositivoId, p_version_esquema: 9, p_desde: 0, p_cambios: [] }, { como: "anon" })).rejects.toMatchObject({ sqlstate: "42501" });
  });
});
