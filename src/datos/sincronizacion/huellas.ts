// Verificación de la primera sincronización: la huella de una entidad es el SHA-256 de las líneas
// «registro_id|marca_máxima\n» de todos sus registros, ordenados por registro_id (byte a byte). El servidor calcula lo mismo
// (servidor/PROTOCOLO.md, sección 7) y las dos tienen que coincidir. Diseño: docs/SINCRONIZACION.md, sección 12.
import { sha256 } from "@noble/hashes/sha2.js";
import { ENTIDADES_SINCRONIZADAS } from "../../dominio/sincronizacion/entidades";
import { marcaMayor } from "../../dominio/sincronizacion/hlc";
import type { Conexion } from "../conexion";
import { entreComillas } from "./esquema";

export interface HuellaLocal {
  entidad: string;
  /** Filas de la tabla, con las eliminadas. */
  filas: number;
  /** Filas de la tabla que no tienen marcas (no debería haber ninguna). */
  sinMarcas: number;
  huella: string;
}

const PAGINA = 5000;

export async function huellasLocales(conexion: Conexion): Promise<HuellaLocal[]> {
  const resultado: HuellaLocal[] = [];
  const codificador = new TextEncoder();
  for (const { tabla } of ENTIDADES_SINCRONIZADAS) {
    const hash = sha256.create();
    let ultimo = "";
    for (;;) {
      const filas = await conexion.consultar<{ registro_id: string; marca_base: string; campos: string }>(
        "SELECT registro_id, marca_base, campos FROM marca_registro WHERE entidad = ? AND registro_id > ? ORDER BY registro_id LIMIT ?",
        [tabla, ultimo, PAGINA],
      );
      if (filas.length === 0) break;
      for (const f of filas) {
        let maxima = f.marca_base;
        for (const m of Object.values(JSON.parse(f.campos) as Record<string, string>)) maxima = marcaMayor(maxima, m);
        hash.update(codificador.encode(`${f.registro_id}|${maxima}\n`));
        ultimo = f.registro_id;
      }
    }
    const [{ n }] = await conexion.consultar<{ n: number }>(`SELECT count(*) AS n FROM ${entreComillas(tabla)}`);
    const [{ sin }] = await conexion.consultar<{ sin: number }>(
      `SELECT count(*) AS sin FROM ${entreComillas(tabla)} t WHERE NOT EXISTS (SELECT 1 FROM marca_registro m WHERE m.entidad = ? AND m.registro_id = t.id)`,
      [tabla],
    );
    resultado.push({ entidad: tabla, filas: n, sinMarcas: sin, huella: Array.from(hash.digest(), (b) => b.toString(16).padStart(2, "0")).join("") });
  }
  return resultado;
}
