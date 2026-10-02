// Sincroniza los archivos que las filas mencionan (foto de un animal, PDF de un documento, adjuntos de una compra): los que
// este equipo tiene y el servidor no, se suben; los que la fila menciona y este equipo no tiene, se bajan. Los archivos no
// cambian (su nombre lleva un uuid o el número del documento), así que basta saber si ya se subieron.
// Diseño: docs/SINCRONIZACION.md, sección 9. Corre al final de cada ciclo y nunca hace fallar la sincronización de datos.
import type { Conexion } from "../datos/conexion";
import { ErrorDeRed, type Red } from "./red";

export interface AlmacenDeArchivos {
  /** null si el archivo no está en este equipo. */
  leer(ruta: string): Promise<Uint8Array | null>;
  /** false si ya existía (no se pisa). */
  escribir(ruta: string, contenido: Uint8Array): Promise<boolean>;
}

export interface ResultadoArchivos {
  subidos: number;
  bajados: number;
  /** Archivos mencionados que todavía no están ni aquí ni en el servidor, o que fallaron: se reintentan en el próximo ciclo. */
  pendientes: number;
}

const TIPOS: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function tipoDeArchivo(ruta: string): string {
  return TIPOS[ruta.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

/** Rutas que las filas mencionan y que viajan: fotos de animales, PDF de documentos y adjuntos de compras. */
export async function rutasMencionadas(conexion: Conexion): Promise<string[]> {
  const rutas = new Set<string>();
  const simples = await conexion.consultar<{ ruta: string }>(
    `SELECT foto AS ruta FROM animal WHERE foto IS NOT NULL
     UNION SELECT archivo FROM certificado WHERE archivo IS NOT NULL`,
  );
  for (const { ruta } of simples) rutas.add(ruta);
  const filas = await conexion.consultar<{ adjuntos: string }>("SELECT adjuntos FROM traspaso WHERE adjuntos IS NOT NULL");
  for (const { adjuntos } of filas) {
    try {
      const lista: unknown = JSON.parse(adjuntos);
      if (Array.isArray(lista)) for (const r of lista) if (typeof r === "string") rutas.add(r);
    } catch {
      // Un valor que no es JSON no menciona ningún archivo.
    }
  }
  return [...rutas].filter((r) => /^(fotos|documentos)\/[A-Za-z0-9.-]+$/.test(r)).sort();
}

export async function sincronizarArchivos(
  conexion: Conexion,
  red: Red,
  almacen: AlmacenDeArchivos,
  fincaId: string,
  opciones: { maximo?: number; ahoraIso?: () => string } = {},
): Promise<ResultadoArchivos> {
  const resultado: ResultadoArchivos = { subidos: 0, bajados: 0, pendientes: 0 };
  const hechos = new Set((await conexion.consultar<{ ruta: string }>("SELECT ruta FROM archivo_sincronizado")).map((f) => f.ruta));
  const faltan = (await rutasMencionadas(conexion)).filter((r) => !hechos.has(r));
  const maximo = opciones.maximo ?? 25;
  const ahora = opciones.ahoraIso ?? (() => new Date().toISOString());
  let intentados = 0;
  for (const ruta of faltan) {
    if (intentados >= maximo) {
      resultado.pendientes += 1;
      continue;
    }
    intentados += 1;
    try {
      const local = await almacen.leer(ruta);
      if (local) {
        await red.subirArchivo(fincaId, ruta, local, tipoDeArchivo(ruta));
        resultado.subidos += 1;
      } else {
        const bytes = await red.bajarArchivo(fincaId, ruta);
        await almacen.escribir(ruta, bytes);
        resultado.bajados += 1;
      }
      const t = ahora();
      await conexion.ejecutarLote([{ sql: "INSERT OR IGNORE INTO archivo_sincronizado (ruta, subido_en) VALUES (?, ?)", parametros: [ruta, t] }]);
    } catch (error) {
      // Sin red se corta el resto; un archivo que aún no está en el servidor (404) o un fallo puntual solo se reintenta después.
      resultado.pendientes += 1;
      if (error instanceof ErrorDeRed && (error.tipo === "sin_conexion" || error.tipo === "tiempo" || error.tipo === "sesion")) {
        resultado.pendientes += faltan.length - intentados;
        break;
      }
    }
  }
  return resultado;
}
