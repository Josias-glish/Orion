// RF-43 y CA-11: copia de respaldo de todos los datos de la finca y su restauración.
// El archivo que ve el usuario es un .zip (lo arma Rust: datos.json + fotos + documentos); aquí se arma y se lee
// datos.json. SUPOSICION (restaurar): solo en una instalación vacía, para no borrar ni mezclar datos.
import { exigirPermiso } from "./cambios";
import type { Conexion, ContextoCambio, Sentencia, ValorSql } from "./conexion";
import { ErrorDeRegistro } from "./errores";
import { obtenerFinca } from "./repositorios/finca";

export const FORMATO_RESPALDO = "registro-caprino-respaldo";
export const VERSION_FORMATO = 1;
/** Número de migraciones que conoce esta versión del programa (una prueba lo compara con la carpeta). */
export const VERSION_ESQUEMA = 5;

/** Todas las tablas de datos, en un orden en que cada tabla va después de las que referencia. */
export const TABLAS_RESPALDO = [
  "finca",
  "usuario",
  "raza",
  "libro",
  "lote",
  "contacto",
  "animal",
  "identificador",
  "composicion_racial",
  "evento_reproductivo",
  "parto",
  "lactancia",
  "pesaje_leche",
  "pesaje_corporal",
  "meta_peso",
  "evento_salud",
  "certificado",
  "historial_cambios",
] as const;
export type TablaRespaldo = (typeof TABLAS_RESPALDO)[number];

/** Catálogos que la migración 0001 precarga con id fijos: al restaurar se actualizan en lugar de chocar. */
const PRECARGADAS: ReadonlySet<TablaRespaldo> = new Set(["raza", "libro"]);

export type Fila = Record<string, ValorSql>;

export interface Respaldo {
  formato: typeof FORMATO_RESPALDO;
  versionFormato: number;
  versionEsquema: number;
  creadoEn: string;
  finca: string | null;
  tablas: Record<TablaRespaldo, Fila[]>;
}

const FILAS_POR_LECTURA = 5000;

/** Lee una tabla completa por partes, en orden de id (igual en el original y en la copia restaurada). */
async function leerTabla(conexion: Conexion, tabla: TablaRespaldo): Promise<Fila[]> {
  const filas: Fila[] = [];
  let ultimo = "";
  for (;;) {
    const parte = await conexion.consultar<Fila>(`SELECT * FROM ${tabla} WHERE id > ? ORDER BY id LIMIT ?`, [ultimo, FILAS_POR_LECTURA]);
    filas.push(...parte);
    if (parte.length < FILAS_POR_LECTURA) return filas;
    ultimo = String(parte[parte.length - 1].id);
  }
}

/** RF-43: todos los datos de la finca, incluidos el historial, los registros retirados y los hash de PIN. */
export async function exportarRespaldo(conexion: Conexion, contexto: ContextoCambio): Promise<Respaldo> {
  exigirPermiso(contexto, "exportar_respaldo");
  const tablas = {} as Record<TablaRespaldo, Fila[]>;
  for (const tabla of TABLAS_RESPALDO) tablas[tabla] = await leerTabla(conexion, tabla);
  return {
    formato: FORMATO_RESPALDO,
    versionFormato: VERSION_FORMATO,
    versionEsquema: VERSION_ESQUEMA,
    creadoEn: contexto.marcaTiempo,
    finca: (await obtenerFinca(conexion))?.nombre ?? null,
    tablas,
  };
}

const danado = () => new ErrorDeRegistro([{ codigo: "respaldo_danado" }]);
const esValor = (v: unknown) => v === null || typeof v === "string" || (typeof v === "number" && Number.isFinite(v));

/** Lee el texto de datos.json y comprueba que tiene la forma de un respaldo. */
export function leerRespaldo(texto: string): Respaldo {
  let r: unknown;
  try {
    r = JSON.parse(texto);
  } catch {
    throw danado();
  }
  const posible = r as Partial<Respaldo> | null;
  if (
    !posible ||
    typeof posible !== "object" ||
    posible.formato !== FORMATO_RESPALDO ||
    posible.versionFormato !== VERSION_FORMATO ||
    typeof posible.versionEsquema !== "number" ||
    !posible.tablas ||
    typeof posible.tablas !== "object"
  ) {
    throw danado();
  }
  return posible as Respaldo;
}

/** Ordena los animales para que cada padre y cada madre se inserten antes que sus crías (R1 en la base). */
export function animalesEnOrden(filas: Fila[]): Fila[] {
  const porId = new Map(filas.map((f) => [String(f.id), f]));
  const resultado: Fila[] = [];
  const visitados = new Set<string>();
  const visitar = (f: Fila, camino: Set<string>) => {
    const id = String(f.id);
    if (visitados.has(id)) return;
    if (camino.has(id)) throw danado(); // un ciclo en la genealogía no puede venir de un respaldo sano
    camino.add(id);
    for (const p of [f.padre_id, f.madre_id]) {
      const padre = typeof p === "string" ? porId.get(p) : undefined;
      if (padre) visitar(padre, camino);
    }
    camino.delete(id);
    visitados.add(id);
    resultado.push(f);
  };
  for (const f of filas) visitar(f, new Set());
  return resultado;
}

const MAX_VARIABLES = 30000;

/**
 * CA-11: restaura un respaldo en una instalación vacía. Valida todo antes de escribir (tablas, columnas y valores
 * conocidos; versión del esquema) y escribe en un solo lote. Los catálogos precargados se actualizan.
 */
export async function restaurarRespaldo(conexion: Conexion, r: Respaldo): Promise<void> {
  if (r.versionEsquema > VERSION_ESQUEMA) throw new ErrorDeRegistro([{ codigo: "respaldo_mas_nuevo" }]);

  // 1. Forma: solo tablas y columnas que existen (los nombres van dentro del SQL), valores simples.
  const columnasDe = new Map<TablaRespaldo, Set<string>>();
  for (const tabla of TABLAS_RESPALDO) {
    const columnas = await conexion.consultar<{ name: string }>("SELECT name FROM pragma_table_info(?)", [tabla]);
    columnasDe.set(tabla, new Set(columnas.map((c) => c.name)));
  }
  for (const [tabla, filas] of Object.entries(r.tablas)) {
    const conocidas = columnasDe.get(tabla as TablaRespaldo);
    if (!conocidas || !Array.isArray(filas)) throw danado();
    for (const fila of filas) {
      if (!fila || typeof fila !== "object" || typeof fila.id !== "string") throw danado();
      for (const [columna, valor] of Object.entries(fila)) if (!conocidas.has(columna) || !esValor(valor)) throw danado();
    }
  }

  // 2. Solo en una instalación vacía (los catálogos precargados no cuentan).
  for (const tabla of TABLAS_RESPALDO) {
    if (PRECARGADAS.has(tabla)) continue;
    const [{ n }] = await conexion.consultar<{ n: number }>(`SELECT count(*) AS n FROM ${tabla}`);
    if (n > 0) throw new ErrorDeRegistro([{ codigo: "base_no_vacia" }]);
  }

  // 3. Un INSERT de varias filas por cada grupo; ON CONFLICT solo ocurre en los catálogos precargados.
  const sentencias: Sentencia[] = [];
  for (const tabla of TABLAS_RESPALDO) {
    const filas = tabla === "animal" ? animalesEnOrden(r.tablas[tabla] ?? []) : (r.tablas[tabla] ?? []);
    if (filas.length === 0) continue;
    const columnas = Object.keys(filas[0]);
    if (filas.some((f) => Object.keys(f).length !== columnas.length || columnas.some((c) => !(c in f)))) throw danado();
    const porSentencia = Math.max(1, Math.min(500, Math.floor(MAX_VARIABLES / columnas.length)));
    const actualizar = columnas.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`).join(", ");
    for (let i = 0; i < filas.length; i += porSentencia) {
      const grupo = filas.slice(i, i + porSentencia);
      sentencias.push({
        sql: `INSERT INTO ${tabla} (${columnas.join(", ")}) VALUES ${grupo.map(() => `(${columnas.map(() => "?").join(", ")})`).join(", ")}${
          PRECARGADAS.has(tabla) ? ` ON CONFLICT (id) DO UPDATE SET ${actualizar}` : ""
        }`,
        parametros: grupo.flatMap((f) => columnas.map((c) => f[c])),
      });
    }
  }
  await conexion.ejecutarLote(sentencias);
}
