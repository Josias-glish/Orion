import type { Conexion } from "../conexion";

export interface EntradaHistorial {
  marcaTiempo: string;
  entidad: string;
  campo: string;
  valorAnterior: string | null;
  valorNuevo: string | null;
  usuario: string | null;
}

/**
 * Historial de un animal, del más reciente al más antiguo: su ficha, identificadores, composición racial, servicios,
 * partos, lactancias, pesos, salud, documentos emitidos, registros genealógicos (sin la copia completa de cada versión) y las correcciones de sus pesajes de leche (los pesajes nuevos no se listan uno por uno).
 * Los valores que son id de otro registro (padre, raza, libro, lote…) se cambian por su nombre.
 */
export async function listarHistorialAnimal(conexion: Conexion, animalId: string): Promise<EntradaHistorial[]> {
  const filas = await conexion.consultar<EntradaHistorial>(
    `SELECT h.marca_tiempo AS marcaTiempo, h.entidad, h.campo,
            h.valor_anterior AS valorAnterior, h.valor_nuevo AS valorNuevo, u.nombre AS usuario
     FROM historial_cambios AS h
     LEFT JOIN usuario AS u ON u.id = h.usuario_id
     WHERE (h.entidad = 'animal' AND h.registro_id = ?)
        OR (h.entidad = 'identificador' AND h.registro_id IN (SELECT id FROM identificador WHERE animal_id = ?))
        OR (h.entidad = 'composicion_racial' AND h.registro_id IN (SELECT id FROM composicion_racial WHERE animal_id = ?))
        OR (h.entidad = 'evento_reproductivo' AND h.registro_id IN (SELECT id FROM evento_reproductivo WHERE hembra_id = ?))
        OR (h.entidad = 'parto' AND h.registro_id IN (SELECT id FROM parto WHERE hembra_id = ?))
        OR (h.entidad = 'lactancia' AND h.registro_id IN (SELECT id FROM lactancia WHERE hembra_id = ?))
        OR (h.entidad = 'pesaje_corporal' AND h.registro_id IN (SELECT id FROM pesaje_corporal WHERE animal_id = ?))
        OR (h.entidad = 'evento_salud' AND h.registro_id IN (SELECT id FROM evento_salud WHERE animal_id = ?))
        OR (h.entidad = 'certificado' AND h.registro_id IN (SELECT id FROM certificado WHERE animal_id = ?))
        OR (h.entidad = 'registro_genealogico' AND h.campo <> 'instantanea' AND h.registro_id IN (SELECT id FROM registro_genealogico WHERE animal_id = ?))
        OR (h.entidad = 'pesaje_leche' AND h.valor_anterior IS NOT NULL AND h.registro_id IN
              (SELECT p.id FROM pesaje_leche AS p JOIN lactancia AS l ON l.id = p.lactancia_id WHERE l.hembra_id = ?))
     ORDER BY h.marca_tiempo DESC, h.entidad, h.campo`,
    [animalId, animalId, animalId, animalId, animalId, animalId, animalId, animalId, animalId, animalId, animalId],
  );

  const ids = [
    ...new Set(
      filas
        .filter((f) => f.campo.endsWith("_id"))
        .flatMap((f) => [f.valorAnterior, f.valorNuevo])
        .filter((v): v is string => v !== null),
    ),
  ];
  const nombres = new Map<string, string>();
  if (ids.length > 0) {
    const marcas = ids.map(() => "?").join(", ");
    const encontrados = await conexion.consultar<{ id: string; nombre: string }>(
      `SELECT a.id, coalesce(a.nombre, i.valor, a.id) AS nombre FROM animal AS a
       LEFT JOIN identificador AS i ON i.animal_id = a.id AND i.principal = 1 AND i.eliminado_en IS NULL
       WHERE a.id IN (${marcas})
       UNION ALL SELECT id, nombre FROM raza WHERE id IN (${marcas})
       UNION ALL SELECT id, nombre FROM libro WHERE id IN (${marcas})
       UNION ALL SELECT id, nombre FROM lote WHERE id IN (${marcas})`,
      [...ids, ...ids, ...ids, ...ids],
    );
    for (const e of encontrados) nombres.set(e.id, e.nombre);
  }
  const traducir = (v: string | null) => (v !== null && nombres.has(v) ? nombres.get(v)! : v);
  return filas.map((f) =>
    f.campo.endsWith("_id") ? { ...f, valorAnterior: traducir(f.valorAnterior), valorNuevo: traducir(f.valorNuevo) } : f,
  );
}

/** Historial de un registro cualquiera (por ejemplo, un contacto), del más reciente al más antiguo. */
export function listarHistorialEntidad(conexion: Conexion, entidad: string, registroId: string): Promise<EntradaHistorial[]> {
  return conexion.consultar<EntradaHistorial>(
    `SELECT h.marca_tiempo AS marcaTiempo, h.entidad, h.campo,
            h.valor_anterior AS valorAnterior, h.valor_nuevo AS valorNuevo, u.nombre AS usuario
     FROM historial_cambios AS h
     LEFT JOIN usuario AS u ON u.id = h.usuario_id
     WHERE h.entidad = ? AND h.registro_id = ?
     ORDER BY h.marca_tiempo DESC, h.campo`,
    [entidad, registroId],
  );
}
