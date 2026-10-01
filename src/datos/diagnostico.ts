// Prueba técnica de la Etapa 1. Es temporal: se retira cuando existan las pantallas reales.
import { nuevoId } from "../dominio/identidad";
import type { Conexion, ContextoCambio } from "./conexion";
import { crearAnimal, eliminarAnimal, listarAnimales, type AnimalResumen, type NuevoAnimal } from "./repositorios/animales";

/** Texto que se guarda en «observaciones» para reconocer los animales creados por el diagnóstico. */
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
  return (await listarAnimales(conexion)).filter((a) => a.observaciones === MARCA_DIAGNOSTICO);
}

/** Código de arete corto y casi seguro de no repetirse, para no chocar con R2. */
function areteDePrueba(): string {
  return `DIAG-${nuevoId().slice(0, 8).toUpperCase()}`;
}

/** Prueba (a): un animal con su identificador principal. Devuelve el id. */
export async function crearAnimalDePrueba(conexion: Conexion, contexto: ContextoCambio): Promise<string> {
  const numero = (await listarAnimalesDePrueba(conexion)).length + 1;
  return crearAnimal(
    conexion,
    {
      nombre: `Prueba ${numero}`,
      sexo: "hembra",
      fechaNacimiento: "2024-01-15",
      observaciones: MARCA_DIAGNOSTICO,
      identificador: { tipo: "arete", valor: areteDePrueba() },
    },
    contexto,
  );
}

/**
 * Prueba (b): tres generaciones (cuatro abuelos, padre, madre y una cría), cada uno con arete.
 * Devuelve el id de la cría para consultar sus ancestros.
 */
export async function crearTresGeneraciones(conexion: Conexion, contexto: ContextoCambio): Promise<string> {
  const serie = (await listarAnimalesDePrueba(conexion)).filter((a) => a.nombre?.startsWith("Cría ")).length + 1;
  const crear = (datos: Omit<NuevoAnimal, "observaciones" | "identificador">) =>
    crearAnimal(
      conexion,
      { ...datos, observaciones: MARCA_DIAGNOSTICO, identificador: { tipo: "arete", valor: areteDePrueba() } },
      contexto,
    );

  const abueloPaterno = await crear({ nombre: `Abuelo paterno ${serie}`, sexo: "macho", fechaNacimiento: "2018-03-10" });
  const abuelaPaterna = await crear({ nombre: `Abuela paterna ${serie}`, sexo: "hembra", fechaNacimiento: "2018-05-02" });
  const abueloMaterno = await crear({ nombre: `Abuelo materno ${serie}`, sexo: "macho", fechaNacimiento: "2018-04-15" });
  const abuelaMaterna = await crear({ nombre: `Abuela materna ${serie}`, sexo: "hembra", fechaNacimiento: "2018-06-20" });
  const padre = await crear({
    nombre: `Padre ${serie}`,
    sexo: "macho",
    fechaNacimiento: "2020-04-01",
    padreId: abueloPaterno,
    madreId: abuelaPaterna,
  });
  const madre = await crear({
    nombre: `Madre ${serie}`,
    sexo: "hembra",
    fechaNacimiento: "2020-05-12",
    padreId: abueloMaterno,
    madreId: abuelaMaterna,
  });
  return crear({ nombre: `Cría ${serie}`, sexo: "hembra", fechaNacimiento: "2022-03-08", padreId: padre, madreId: madre });
}

/** Borrado lógico de los animales del diagnóstico. Devuelve cuántos se retiraron. */
export async function retirarDatosDePrueba(conexion: Conexion, contexto: ContextoCambio): Promise<number> {
  const animales = await listarAnimalesDePrueba(conexion);
  for (const animal of animales) {
    await eliminarAnimal(conexion, animal.id, contexto);
  }
  return animales.length;
}
