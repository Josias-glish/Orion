// Información técnica de la base y limpieza de los datos de la prueba técnica de la Etapa 1.
import { Cambios, exigirPermiso } from "./cambios";
import type { Conexion, ContextoCambio } from "./conexion";
import { listarAnimales, type AnimalResumen } from "./repositorios/animales";
import { ErrorDeRegistro } from "./errores";
import { leerVinculo } from "./sincronizacion/estado";

/** Texto que la Etapa 1 guardó en «observaciones» de los animales de la prueba técnica. */
export const MARCA_DIAGNOSTICO = "[diagnóstico]";

export interface EstadoBaseDatos {
  versionSqlite: string;
  clavesForaneasActivas: boolean;
  migraciones: { version: number; descripcion: string; aplicadaEn: string }[];
  razas: number;
  libros: number;
  animales: number;
}

export async function consultarEstado(conexion: Conexion): Promise<EstadoBaseDatos> {
  const [version] = await conexion.consultar<{ v: string }>("SELECT sqlite_version() AS v");
  const [fk] = await conexion.consultar<{ foreign_keys: number }>("SELECT foreign_keys FROM pragma_foreign_keys");
  const [conteo] = await conexion.consultar<{ razas: number; libros: number; animales: number }>(
    `SELECT (SELECT count(*) FROM raza WHERE eliminado_en IS NULL) AS razas,
            (SELECT count(*) FROM libro WHERE eliminado_en IS NULL) AS libros,
            (SELECT count(*) FROM animal WHERE eliminado_en IS NULL) AS animales`,
  );
  // La tabla _sqlx_migrations la crea el plugin; no existe en las pruebas con SQLite en memoria.
  const [tabla] = await conexion.consultar<{ n: number }>(
    "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = '_sqlx_migrations'",
  );
  const migraciones =
    tabla.n > 0
      ? await conexion.consultar<{ version: number; descripcion: string; aplicadaEn: string }>(
          `SELECT version, description AS descripcion, installed_on AS aplicadaEn
           FROM _sqlx_migrations WHERE success = 1 ORDER BY version`,
        )
      : [];
  return {
    versionSqlite: version.v,
    clavesForaneasActivas: fk.foreign_keys === 1,
    migraciones,
    razas: conteo.razas,
    libros: conteo.libros,
    animales: conteo.animales,
  };
}

export async function listarAnimalesDePrueba(conexion: Conexion): Promise<AnimalResumen[]> {
  return (await listarAnimales(conexion, { incluirSoloGenealogia: true })).filter(
    (a) => a.observaciones === MARCA_DIAGNOSTICO,
  );
}

/** Borrado lógico de los animales de la prueba técnica y de sus identificadores. Devuelve cuántos se retiraron. */
export async function retirarDatosDePrueba(conexion: Conexion, contexto: ContextoCambio): Promise<number> {
  exigirPermiso(contexto, "ver_ajustes");
  if (await leerVinculo(conexion)) throw new ErrorDeRegistro([{ codigo: "restaurar_vinculado" }]);
  const animales = await listarAnimalesDePrueba(conexion);
  if (animales.length === 0) return 0;
  const cambios = new Cambios(contexto);
  const marcas = animales.map(() => "?").join(", ");
  const identificadores = await conexion.consultar<{ id: string }>(
    `SELECT id FROM identificador WHERE animal_id IN (${marcas}) AND eliminado_en IS NULL`,
    animales.map((a) => a.id),
  );
  for (const { id } of identificadores) cambios.eliminar("identificador", id);
  for (const animal of animales) cambios.eliminar("animal", animal.id);
  await cambios.aplicar(conexion);
  return animales.length;
}
