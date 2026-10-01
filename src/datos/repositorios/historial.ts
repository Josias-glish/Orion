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
 * Historial de un animal, incluidos sus identificadores y su composición racial, del más reciente al más antiguo.
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
     ORDER BY h.marca_tiempo DESC, h.entidad, h.campo`,
    [animalId, animalId, animalId],
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
