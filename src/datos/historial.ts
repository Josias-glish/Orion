import { nuevoId } from "../dominio/identidad";
import type { Conexion, ContextoCambio, ValorSql } from "./conexion";

/** Campos que no se anotan uno por uno: el id va en registro_id y las fechas comunes se deducen. */
const CAMPOS_NO_ANOTADOS = new Set(["id", "creado_en", "modificado_en"]);

export interface CambioDeCampo {
  campo: string;
  anterior: ValorSql;
  nuevo: ValorSql;
}

/** Guarda en historial_cambios una fila por cada campo que cambió. */
export async function registrarCambios(
  conexion: Conexion,
  entidad: string,
  registroId: string,
  cambios: readonly CambioDeCampo[],
  contexto: ContextoCambio,
): Promise<void> {
  const filas = cambios.filter((c) => !CAMPOS_NO_ANOTADOS.has(c.campo) && c.anterior !== c.nuevo);
  if (filas.length === 0) return;

  // Una sola sentencia con varias filas: es más rápido que una llamada por campo.
  const marcadores = filas.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
  const parametros = filas.flatMap((c) => [
    nuevoId(),
    entidad,
    registroId,
    c.campo,
    c.anterior === null ? null : String(c.anterior),
    c.nuevo === null ? null : String(c.nuevo),
    contexto.marcaTiempo,
    contexto.usuarioId,
    contexto.marcaTiempo,
    contexto.marcaTiempo,
  ]);
  await conexion.ejecutar(
    `INSERT INTO historial_cambios
       (id, entidad, registro_id, campo, valor_anterior, valor_nuevo, marca_tiempo, usuario_id, creado_en, modificado_en)
     VALUES ${marcadores}`,
    parametros,
  );
}

/** Al crear un registro se anota cada campo con valor, con valor anterior vacío. */
export function cambiosDeCreacion(valores: Readonly<Record<string, ValorSql>>): CambioDeCampo[] {
  return Object.entries(valores)
    .filter(([, valor]) => valor !== null)
    .map(([campo, valor]) => ({ campo, anterior: null, nuevo: valor }));
}
