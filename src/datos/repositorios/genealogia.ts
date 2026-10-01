import { coeficienteConsanguinidad, type NodoPedigri } from "../../dominio/consanguinidad";
import { compararCaminos, MAX_GENERACIONES_POR_DEFECTO, type AnimalGenealogico, type Camino } from "../../dominio/genealogia";
import type { EstadoAnimal, Sexo, TipoIdentificador } from "../../dominio/tipos";
import type { Conexion } from "../conexion";

/** Un animal dentro del árbol genealógico. El camino vacío es el propio animal. */
export interface NodoArbol {
  id: string;
  camino: Camino;
  generacion: number;
  /** ¿El hijo marcó este vínculo (padre o madre) como «sin verificar»? (RF-13) */
  sinVerificar: boolean;
  nombre: string | null;
  sexo: Sexo;
  fechaNacimiento: string | null;
  estado: EstadoAnimal;
  enHato: boolean;
  padreId: string | null;
  madreId: string | null;
  tipoIdentificador: TipoIdentificador | null;
  identificador: string | null;
}

/**
 * El animal y sus ancestros hasta `generaciones`, con una consulta recursiva (sección 5).
 * Cada fila trae su camino (P = padre, M = madre) para saber qué parentesco tiene.
 * SUPOSICION: los animales eliminados (borrado lógico) se tratan como desconocidos y cortan esa rama.
 * El límite de generaciones también evita un bucle infinito si hubiera un ciclo en los datos.
 */
export async function consultarArbol(
  conexion: Conexion,
  animalId: string,
  generaciones: number = MAX_GENERACIONES_POR_DEFECTO,
): Promise<NodoArbol[]> {
  const filas = await conexion.consultar<Omit<NodoArbol, "sinVerificar" | "enHato"> & { sinVerificar: number; enHato: number }>(
    `WITH RECURSIVE
       lados (lado) AS (VALUES ('P'), ('M')),
       arbol (id, camino, sin_verificar) AS (
         SELECT ?, '', 0
         UNION ALL
         SELECT CASE l.lado WHEN 'P' THEN h.padre_id ELSE h.madre_id END,
                a.camino || l.lado,
                CASE l.lado WHEN 'P' THEN h.padre_sin_verificar ELSE h.madre_sin_verificar END
         FROM arbol AS a
         JOIN animal AS h ON h.id = a.id AND h.eliminado_en IS NULL
         CROSS JOIN lados AS l
         WHERE length(a.camino) < ?
           AND CASE l.lado WHEN 'P' THEN h.padre_id ELSE h.madre_id END IS NOT NULL
       )
     SELECT x.id, ar.camino, length(ar.camino) AS generacion, ar.sin_verificar AS sinVerificar,
            x.nombre, x.sexo, x.fecha_nacimiento AS fechaNacimiento, x.estado, x.en_hato AS enHato,
            x.padre_id AS padreId, x.madre_id AS madreId,
            i.tipo AS tipoIdentificador, i.valor AS identificador
     FROM arbol AS ar
     JOIN animal AS x ON x.id = ar.id AND x.eliminado_en IS NULL
     LEFT JOIN identificador AS i
       ON i.animal_id = x.id AND i.principal = 1 AND i.eliminado_en IS NULL`,
    [animalId, generaciones],
  );
  return filas
    .map((f) => ({ ...f, sinVerificar: f.sinVerificar === 1, enHato: f.enHato === 1 }))
    .sort((a, b) => compararCaminos(a.camino, b.camino));
}

/** Solo los ancestros (sin el propio animal). */
export async function consultarAncestros(
  conexion: Conexion,
  animalId: string,
  generaciones: number = MAX_GENERACIONES_POR_DEFECTO,
): Promise<NodoArbol[]> {
  return (await consultarArbol(conexion, animalId, generaciones)).filter((n) => n.camino !== "");
}

export interface ResultadoConsanguinidad {
  /** De 0 a 1. */
  coeficiente: number;
  /** ¿Algún vínculo usado en el cálculo está marcado «sin verificar»? */
  incluyeSinVerificar: boolean;
  generaciones: number;
}

/** R6: consanguinidad del animal según su pedigrí registrado. */
export async function calcularConsanguinidad(
  conexion: Conexion,
  animalId: string,
  generaciones: number = MAX_GENERACIONES_POR_DEFECTO,
): Promise<ResultadoConsanguinidad> {
  const nodos = await consultarArbol(conexion, animalId, generaciones);
  const pedigri = new Map<string, NodoPedigri>(nodos.map((n) => [n.id, { padreId: n.padreId, madreId: n.madreId }]));
  return {
    coeficiente: coeficienteConsanguinidad(animalId, pedigri, generaciones),
    incluyeSinVerificar: nodos.some((n) => n.sinVerificar),
    generaciones,
  };
}

/** Ids de todos los descendientes, de cualquier generación. UNION (y no UNION ALL) evita bucles si hubiera un ciclo. */
export async function consultarDescendientes(conexion: Conexion, animalId: string): Promise<Set<string>> {
  const filas = await conexion.consultar<{ id: string }>(
    `WITH RECURSIVE descendientes (id) AS (
       SELECT id FROM animal WHERE (padre_id = ? OR madre_id = ?) AND eliminado_en IS NULL
       UNION
       SELECT a.id FROM animal AS a
       JOIN descendientes AS d ON a.padre_id = d.id OR a.madre_id = d.id
       WHERE a.eliminado_en IS NULL
     )
     SELECT id FROM descendientes`,
    [animalId, animalId],
  );
  return new Set(filas.map((f) => f.id));
}

export async function obtenerGenealogico(conexion: Conexion, id: string): Promise<AnimalGenealogico | null> {
  const [fila] = await conexion.consultar<AnimalGenealogico>(
    "SELECT id, nombre, sexo, fecha_nacimiento AS fechaNacimiento FROM animal WHERE id = ? AND eliminado_en IS NULL",
    [id],
  );
  return fila ?? null;
}

/** Hijos registrados de un animal, según figure como padre o como madre. */
export async function consultarHijos(
  conexion: Conexion,
  id: string,
): Promise<{ comoPadre: AnimalGenealogico[]; comoMadre: AnimalGenealogico[] }> {
  const filas = await conexion.consultar<AnimalGenealogico & { comoPadre: number }>(
    `SELECT id, nombre, sexo, fecha_nacimiento AS fechaNacimiento, padre_id = ? AS comoPadre
     FROM animal WHERE (padre_id = ? OR madre_id = ?) AND eliminado_en IS NULL
     ORDER BY fecha_nacimiento`,
    [id, id, id],
  );
  const sinMarca = ({ comoPadre: _marca, ...resto }: AnimalGenealogico & { comoPadre: number }) => resto;
  return {
    comoPadre: filas.filter((f) => f.comoPadre === 1).map(sinMarca),
    comoMadre: filas.filter((f) => f.comoPadre !== 1).map(sinMarca),
  };
}
