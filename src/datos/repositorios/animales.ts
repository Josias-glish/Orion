import { compararCaminos, MAX_GENERACIONES_POR_DEFECTO, type Camino } from "../../dominio/genealogia";
import { nuevoId } from "../../dominio/identidad";
import { ErrorDeRegistro, type Conexion, type ContextoCambio, type ValorSql } from "../conexion";
import { cambiosDeCreacion, registrarCambios } from "../historial";

export type Sexo = "hembra" | "macho";
export type EstadoAnimal = "activo" | "vendido" | "muerto";
export type TipoIdentificador = "tatuaje" | "microchip" | "arete" | "registro_asociacion";

export interface NuevoAnimal {
  nombre: string | null;
  sexo: Sexo;
  fechaNacimiento: string | null;
  padreId?: string | null;
  madreId?: string | null;
  observaciones?: string | null;
  /** Identificador principal con el que se registra el animal (opcional). */
  identificador?: { tipo: TipoIdentificador; valor: string } | null;
}

export interface AnimalResumen {
  id: string;
  nombre: string | null;
  sexo: Sexo;
  fechaNacimiento: string | null;
  estado: EstadoAnimal;
  tipoIdentificador: TipoIdentificador | null;
  identificador: string | null;
  observaciones: string | null;
  creadoEn: string;
}

export interface Ancestro {
  id: string;
  camino: Camino;
  generacion: number;
  nombre: string | null;
  sexo: Sexo;
  fechaNacimiento: string | null;
  tipoIdentificador: TipoIdentificador | null;
  identificador: string | null;
}

/** ¿Hay otro identificador vigente con el mismo tipo y valor? (R2) */
export async function existeIdentificadorVigente(
  conexion: Conexion,
  tipo: TipoIdentificador,
  valor: string,
): Promise<boolean> {
  const filas = await conexion.consultar<{ n: number }>(
    `SELECT count(*) AS n FROM identificador
     WHERE tipo = ? AND valor = ? COLLATE NOCASE AND vigente = 1 AND eliminado_en IS NULL`,
    [tipo, valor.trim()],
  );
  return filas[0].n > 0;
}

/**
 * Registra un animal y, si viene, su identificador principal. Anota todo en el historial.
 * Las reglas de genealogía (R1) se validan en la Etapa 3; aquí solo actúan las restricciones de la base.
 * Devuelve el id del animal nuevo.
 */
export async function crearAnimal(conexion: Conexion, datos: NuevoAnimal, contexto: ContextoCambio): Promise<string> {
  const identificador = datos.identificador
    ? { tipo: datos.identificador.tipo, valor: datos.identificador.valor.trim() }
    : null;

  // Se revisa antes de escribir para no dejar un animal a medias si el identificador está repetido.
  if (identificador && (await existeIdentificadorVigente(conexion, identificador.tipo, identificador.valor))) {
    throw new ErrorDeRegistro("identificador_duplicado", `${identificador.tipo} ${identificador.valor}`);
  }

  const animalId = nuevoId();
  const animal: Record<string, ValorSql> = {
    id: animalId,
    nombre: datos.nombre?.trim() || null,
    sexo: datos.sexo,
    fecha_nacimiento: datos.fechaNacimiento,
    padre_id: datos.padreId ?? null,
    madre_id: datos.madreId ?? null,
    observaciones: datos.observaciones ?? null,
    creado_en: contexto.marcaTiempo,
    modificado_en: contexto.marcaTiempo,
  };
  await insertar(conexion, "animal", animal);
  await registrarCambios(conexion, "animal", animalId, cambiosDeCreacion(animal), contexto);

  if (identificador) {
    const fila: Record<string, ValorSql> = {
      id: nuevoId(),
      animal_id: animalId,
      tipo: identificador.tipo,
      valor: identificador.valor,
      vigente: 1,
      principal: 1,
      creado_en: contexto.marcaTiempo,
      modificado_en: contexto.marcaTiempo,
    };
    await insertar(conexion, "identificador", fila);
    await registrarCambios(conexion, "identificador", String(fila.id), cambiosDeCreacion(fila), contexto);
  }

  return animalId;
}

/** Animales no eliminados, con su identificador principal, del más reciente al más antiguo. */
export async function listarAnimales(conexion: Conexion): Promise<AnimalResumen[]> {
  return conexion.consultar<AnimalResumen>(
    `SELECT a.id, a.nombre, a.sexo, a.fecha_nacimiento AS fechaNacimiento, a.estado,
            i.tipo AS tipoIdentificador, i.valor AS identificador,
            a.observaciones, a.creado_en AS creadoEn
     FROM animal AS a
     LEFT JOIN identificador AS i
       ON i.animal_id = a.id AND i.principal = 1 AND i.eliminado_en IS NULL
     WHERE a.eliminado_en IS NULL
     ORDER BY a.creado_en DESC, a.nombre`,
  );
}

export async function contarAnimales(conexion: Conexion): Promise<number> {
  const filas = await conexion.consultar<{ n: number }>(
    "SELECT count(*) AS n FROM animal WHERE eliminado_en IS NULL",
  );
  return filas[0].n;
}

/**
 * Ancestros de un animal hasta `maxGeneraciones`, con una consulta recursiva.
 * Cada fila trae su camino (P = padre, M = madre) para saber qué parentesco tiene.
 * SUPOSICION: los animales eliminados (borrado lógico) se tratan como desconocidos y cortan esa rama.
 * El límite de generaciones también evita un bucle infinito si hubiera un ciclo en los datos.
 */
export async function consultarAncestros(
  conexion: Conexion,
  animalId: string,
  maxGeneraciones: number = MAX_GENERACIONES_POR_DEFECTO,
): Promise<Ancestro[]> {
  const filas = await conexion.consultar<Ancestro>(
    `WITH RECURSIVE
       lados (lado) AS (VALUES ('P'), ('M')),
       ancestros (id, camino) AS (
         SELECT ?, ''
         UNION ALL
         SELECT CASE l.lado WHEN 'P' THEN h.padre_id ELSE h.madre_id END,
                a.camino || l.lado
         FROM ancestros AS a
         JOIN animal AS h ON h.id = a.id AND h.eliminado_en IS NULL
         CROSS JOIN lados AS l
         WHERE length(a.camino) < ?
           AND CASE l.lado WHEN 'P' THEN h.padre_id ELSE h.madre_id END IS NOT NULL
       )
     SELECT x.id, an.camino, length(an.camino) AS generacion, x.nombre, x.sexo,
            x.fecha_nacimiento AS fechaNacimiento,
            i.tipo AS tipoIdentificador, i.valor AS identificador
     FROM ancestros AS an
     JOIN animal AS x ON x.id = an.id AND x.eliminado_en IS NULL
     LEFT JOIN identificador AS i
       ON i.animal_id = x.id AND i.principal = 1 AND i.eliminado_en IS NULL
     WHERE an.camino <> ''`,
    [animalId, maxGeneraciones],
  );
  return filas.sort((a, b) => compararCaminos(a.camino, b.camino));
}

/** Borrado lógico de un animal y de sus identificadores, con su historial. */
export async function eliminarAnimal(conexion: Conexion, animalId: string, contexto: ContextoCambio): Promise<void> {
  const identificadores = await conexion.consultar<{ id: string }>(
    "SELECT id FROM identificador WHERE animal_id = ? AND eliminado_en IS NULL",
    [animalId],
  );
  for (const { id } of identificadores) {
    await marcarEliminado(conexion, "identificador", id, contexto);
  }
  await marcarEliminado(conexion, "animal", animalId, contexto);
}

async function marcarEliminado(
  conexion: Conexion,
  tabla: "animal" | "identificador",
  id: string,
  contexto: ContextoCambio,
): Promise<void> {
  await conexion.ejecutar(
    `UPDATE ${tabla} SET eliminado_en = ?, modificado_en = ? WHERE id = ? AND eliminado_en IS NULL`,
    [contexto.marcaTiempo, contexto.marcaTiempo, id],
  );
  await registrarCambios(
    conexion,
    tabla,
    id,
    [{ campo: "eliminado_en", anterior: null, nuevo: contexto.marcaTiempo }],
    contexto,
  );
}

/** INSERT a partir de un objeto columna → valor. Los nombres de columna vienen del código, nunca del usuario. */
async function insertar(conexion: Conexion, tabla: string, valores: Record<string, ValorSql>): Promise<void> {
  const columnas = Object.keys(valores);
  await conexion.ejecutar(
    `INSERT INTO ${tabla} (${columnas.join(", ")}) VALUES (${columnas.map(() => "?").join(", ")})`,
    Object.values(valores),
  );
}
