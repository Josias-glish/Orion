// Mezcla por campo (R16) y marcas (R17) en SQL: los vectores compartidos con la versión de TypeScript, todas las permutaciones,
// el orden por bytes (COLLATE "C") y una comparación al azar contra src/dominio/sincronizacion/fusion.ts.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { estaEliminado, fusionarTodas, marcaMaxima, type EstadoRegistro } from "../../src/dominio/sincronizacion/fusion";
import { crearServidorDePrueba, type ServidorDePrueba } from "./ayudas";

type Valor = string | number | null;
interface Operacion {
  campos: Record<string, Valor>;
  marca: string;
}
interface Vector {
  nombre: string;
  ordenFijo: boolean;
  operaciones: Operacion[];
  esperado: { valores: Record<string, Valor>; marcas: { base: string; campos: Record<string, string> }; eliminado: boolean };
}
const vectores: { casos: Vector[] } = JSON.parse(readFileSync(new URL("../vectores-fusion.json", import.meta.url), "utf8"));

function permutaciones<T>(lista: readonly T[]): T[][] {
  if (lista.length <= 1) return [[...lista]];
  return lista.flatMap((elemento, i) => permutaciones([...lista.slice(0, i), ...lista.slice(i + 1)]).map((resto) => [elemento, ...resto]));
}

interface Resultado {
  valores: Record<string, Valor>;
  marcas: { base: string; campos: Record<string, string> };
  eliminado: boolean;
}

let servidor: ServidorDePrueba;
beforeAll(async () => {
  servidor = await crearServidorDePrueba();
});
afterAll(async () => {
  await servidor.cerrar();
});

/** El null de SQL (no existe) y no el jsonb «null». */
const comoJson = (valor: unknown): string | null => (valor === null ? null : JSON.stringify(valor));

/** Aplica las operaciones, una tras otra, con `fusionar_registro` desde un registro inexistente. */
async function fusionarEnSql(operaciones: readonly Operacion[]): Promise<Resultado> {
  let campos: unknown = null;
  let marcas: unknown = null;
  for (const op of operaciones) {
    const { rows } = await servidor.db.query<{ r: { campos: unknown; marcas: unknown } | null }>(
      `select public.fusionar_registro($1::jsonb, $2::jsonb, $3::jsonb, $4) as r`,
      [comoJson(campos), comoJson(marcas), JSON.stringify(op.campos), op.marca],
    );
    const r = rows[0].r;
    if (r) {
      campos = r.campos;
      marcas = r.marcas;
    }
  }
  const { rows } = await servidor.db.query<{ e: boolean }>(`select public.registro_eliminado($1::jsonb, $2::jsonb) as e`, [
    comoJson(campos),
    comoJson(marcas),
  ]);
  return { valores: campos as Resultado["valores"], marcas: marcas as Resultado["marcas"], eliminado: rows[0].e };
}

describe("mezcla por campo en SQL: vectores compartidos con TypeScript (servidor/vectores-fusion.json)", () => {
  for (const caso of vectores.casos) {
    it(caso.nombre, async () => {
      expect(await fusionarEnSql(caso.operaciones)).toEqual(caso.esperado);
    });

    if (!caso.ordenFijo) {
      it(`${caso.nombre}: el orden de llegada no cambia el resultado (todas las permutaciones)`, async () => {
        for (const orden of permutaciones(caso.operaciones)) {
          expect(await fusionarEnSql(orden)).toEqual(caso.esperado);
        }
      });
    }
  }
});

describe("fusionar_registro y registro_eliminado: bordes", () => {
  const m = (hora: string) => `2026-10-02T${hora}.000Z-0000-aaaaaaaa`;

  it("una operación sin campos devuelve null y no inventa un registro", async () => {
    const vacia = await servidor.db.query<{ r: unknown }>(`select public.fusionar_registro(null, null, '{}'::jsonb, $1) as r`, [m("10:00:00")]);
    expect(vacia.rows[0].r).toBeNull();
    const nula = await servidor.db.query<{ r: unknown }>(`select public.fusionar_registro(null, null, null, $1) as r`, [m("10:00:00")]);
    expect(nula.rows[0].r).toBeNull();
  });

  it("registro_eliminado: un registro que no existe, o sin eliminado_en, no está eliminado", async () => {
    const { rows } = await servidor.db.query<{ a: boolean; b: boolean; c: boolean }>(
      `select public.registro_eliminado(null, null) as a,
              public.registro_eliminado('{"nombre":"x"}'::jsonb, '{"base":"1","campos":{}}'::jsonb) as b,
              public.registro_eliminado('{"eliminado_en":null}'::jsonb, '{"base":"1","campos":{}}'::jsonb) as c`,
    );
    expect(rows[0]).toEqual({ a: false, b: false, c: false });
  });

  it("registro_eliminado: sin otros campos (solo creado_en y eliminado_en) está eliminado", async () => {
    const { rows } = await servidor.db.query<{ e: boolean }>(
      `select public.registro_eliminado('{"creado_en":"x","eliminado_en":"y"}'::jsonb, '{"base":"1","campos":{"eliminado_en":"0"}}'::jsonb) as e`,
    );
    expect(rows[0].e).toBe(true);
  });

  it("marca_maxima es la mayor marca de cualquier campo; null si no hay registro", async () => {
    const { rows } = await servidor.db.query<{ a: string; b: string | null; c: string }>(
      `select public.marca_maxima('{"base":"a","campos":{"x":"c","y":"b"}}'::jsonb) as a,
              public.marca_maxima(null) as b,
              public.marca_maxima('{"base":"k","campos":{}}'::jsonb) as c`,
    );
    expect(rows[0]).toEqual({ a: "c", b: null, c: "k" });
  });

  it("no modifica lo que recibe: aplicar dos veces la misma operación da lo mismo (idempotencia)", async () => {
    const op = { campos: { nombre: "Luna", peso: 3 }, marca: m("10:00:00") };
    const una = await fusionarEnSql([op]);
    const dos = await fusionarEnSql([op, op, op]);
    expect(dos).toEqual(una);
  });
});

describe('las marcas se comparan por bytes (COLLATE "C")', () => {
  async function ganador(marcaGuardada: string, marcaNueva: string): Promise<string> {
    const resultado = await fusionarEnSql([
      { campos: { c: "guardado" }, marca: marcaGuardada },
      { campos: { c: "nuevo" }, marca: marcaNueva },
    ]);
    return String(resultado.valores.c);
  }

  it("las mayúsculas van antes que las minúsculas", async () => {
    expect(await ganador("B", "b")).toBe("nuevo");
    expect(await ganador("b", "B")).toBe("guardado");
  });

  it("las letras con acento van después de las letras sin acento (bytes UTF-8)", async () => {
    expect(await ganador("z", "é")).toBe("nuevo");
    expect(await ganador("é", "z")).toBe("guardado");
  });

  it("los dígitos van antes que las letras y el guion antes que los dígitos", async () => {
    expect(await ganador("9", "a")).toBe("nuevo");
    expect(await ganador("a", "9")).toBe("guardado");
    expect(await ganador("0", "-")).toBe("guardado");
  });

  it("la base canónica es la menor por bytes", async () => {
    const r = await fusionarEnSql([{ campos: { a: 1, b: 2, c: 3 }, marca: "b" }, { campos: { a: 9 }, marca: "é" }, { campos: { b: 9 }, marca: "B" }]);
    // «B» < «b»: el campo b, que tenía «b», no se pisa con una marca menor.
    expect(r.valores).toEqual({ a: 9, b: 2, c: 3 });
    expect(r.marcas).toEqual({ base: "b", campos: { a: "é" } });
  });
});

describe("marcas válidas y su aritmética", () => {
  async function valida(texto: string | null): Promise<boolean> {
    return (await servidor.db.query<{ v: boolean }>(`select interno.marca_valida($1) as v`, [texto])).rows[0].v;
  }

  it("acepta el formato del protocolo", async () => {
    expect(await valida("2026-10-02T19:23:27.123Z-0001-a1b2c3d4")).toBe(true);
    expect(await valida("2026-02-28T00:00:00.000Z-ffff-00000000")).toBe(true);
  });

  it("rechaza lo que no es una marca o no es una fecha real", async () => {
    for (const mala of [
      null,
      "",
      "2026-10-02T19:23:27Z-0001-a1b2c3d4",
      "2026-10-02T19:23:27.123Z-0001-A1B2C3D4",
      "2026-10-02T19:23:27.123Z-001-a1b2c3d4",
      "2026-10-02T19:23:27.123Z-0001-a1b2c3d",
      "2026-10-02T19:23:27.123Z-0001-a1b2c3d4\n",
      "2026-02-30T00:00:00.000Z-0000-aaaaaaaa",
      "2026-13-01T00:00:00.000Z-0000-aaaaaaaa",
      "2026-10-02T24:00:00.000Z-0000-aaaaaaaa",
      "2026-10-02T23:60:00.000Z-0000-aaaaaaaa",
      "2026-10-02 19:23:27.123Z-0001-a1b2c3d4",
    ]) {
      expect(await valida(mala), String(mala)).toBe(false);
    }
  });

  it("marca_siguiente: hora del servidor, o la última con el contador subido; equipo 00000000", async () => {
    const f = async (ultima: string, ms: number) =>
      (await servidor.db.query<{ m: string }>(`select interno.marca_siguiente($1, $2::bigint) as m`, [ultima, ms])).rows[0].m;
    const ahora = Date.UTC(2026, 9, 2, 12, 0, 0);
    expect(await f("", ahora)).toBe("2026-10-02T12:00:00.000Z-0000-00000000");
    expect(await f("2026-10-02T11:00:00.000Z-0005-aaaaaaaa", ahora)).toBe("2026-10-02T12:00:00.000Z-0000-00000000");
    expect(await f("2026-10-02T12:00:00.000Z-0000-ffffffff", ahora)).toBe("2026-10-02T12:00:00.000Z-0001-00000000");
    expect(await f("2026-10-02T12:10:00.000Z-0009-aaaaaaaa", ahora)).toBe("2026-10-02T12:10:00.000Z-000a-00000000");
    expect(await f("2026-10-02T12:10:00.000Z-ffff-aaaaaaaa", ahora)).toBe("2026-10-02T12:10:00.001Z-0000-00000000");
  });

  it("acortar_marca: más de 10 minutos de adelanto se acorta a la hora del servidor; 10 minutos justos no", async () => {
    const f = async (marca: string, ms: number) =>
      (await servidor.db.query<{ m: string }>(`select interno.acortar_marca($1, $2::bigint) as m`, [marca, ms])).rows[0].m;
    const ahora = Date.UTC(2026, 9, 2, 12, 0, 0);
    expect(await f("2026-10-02T12:10:00.000Z-0003-bbbbbbbb", ahora)).toBe("2026-10-02T12:10:00.000Z-0003-bbbbbbbb");
    expect(await f("2026-10-02T12:10:00.001Z-0003-bbbbbbbb", ahora)).toBe("2026-10-02T12:00:00.000Z-0003-bbbbbbbb");
    expect(await f("2030-01-01T00:00:00.000Z-0000-aaaaaaaa", ahora)).toBe("2026-10-02T12:00:00.000Z-0000-aaaaaaaa");
  });
});

describe("la mezcla en SQL da lo mismo que la de TypeScript (operaciones al azar con semilla)", () => {
  function generador(semilla: number): () => number {
    let estado = semilla >>> 0;
    return () => {
      estado = (Math.imul(estado, 1664525) + 1013904223) >>> 0;
      return estado / 2 ** 32;
    };
  }

  it("300 casos de 1 a 6 operaciones sobre cuatro campos, con borrados y restauraciones", async () => {
    const azar = generador(20261002);
    const elegir = <T>(lista: readonly T[]): T => lista[Math.floor(azar() * lista.length)];
    const campos = ["nombre", "peso", "eliminado_en", "creado_en"] as const;
    const equipos = ["aaaaaaaa", "bbbbbbbb"] as const;
    for (let caso = 0; caso < 300; caso++) {
      const operaciones: Operacion[] = [];
      for (let i = 0, n = 1 + Math.floor(azar() * 6); i < n; i++) {
        const elegidos = campos.filter(() => azar() < 0.5);
        if (elegidos.length === 0) elegidos.push(elegir(campos));
        const valores: Record<string, Valor> = {};
        for (const campo of elegidos) valores[campo] = campo === "eliminado_en" ? elegir([null, "2026-10-02T10:30:00.000Z"]) : elegir(["x", "y", 1, 2, null]);
        const minuto = String(Math.floor(azar() * 6)).padStart(2, "0");
        operaciones.push({ campos: valores, marca: `2026-10-02T10:${minuto}:00.000Z-000${Math.floor(azar() * 3)}-${elegir(equipos)}` });
      }
      const ts = fusionarTodas(null, operaciones) as EstadoRegistro;
      const esperado = { valores: ts.valores, marcas: ts.marcas, eliminado: estaEliminado(ts) };
      const sql = await fusionarEnSql(operaciones);
      expect(sql, JSON.stringify(operaciones)).toEqual(esperado);
      const maxima = (await servidor.db.query<{ m: string }>(`select public.marca_maxima($1::jsonb) as m`, [JSON.stringify(sql.marcas)])).rows[0].m;
      expect(maxima).toBe(marcaMaxima(ts));
    }
  });
});
