import { Cambios, exigirPermiso } from "../cambios";
import type { Conexion, ContextoCambio, ValorSql } from "../conexion";
import { rechazarSi, type Motivo } from "../errores";

export interface Finca {
  id: string;
  nombre: string;
  criadero: string | null;
  municipio: string | null;
  registroSanitarioPredio: string | null;
  diasGestacion: number;
  diasLactancia: number;
}

export type DatosFinca = Omit<Finca, "id">;

/** En el MVP hay una sola finca: la primera activa. */
export async function obtenerFinca(conexion: Conexion): Promise<Finca | null> {
  const filas = await conexion.consultar<Finca>(
    `SELECT id, nombre, criadero, municipio, registro_sanitario_predio AS registroSanitarioPredio,
            dias_gestacion AS diasGestacion, dias_lactancia AS diasLactancia
     FROM finca WHERE eliminado_en IS NULL ORDER BY creado_en LIMIT 1`,
  );
  return filas[0] ?? null;
}

export function validarFinca(datos: DatosFinca): Motivo[] {
  const motivos: Motivo[] = [];
  if (!datos.nombre.trim()) motivos.push({ codigo: "dato_obligatorio", campo: "nombre" });
  for (const campo of ["diasGestacion", "diasLactancia"] as const) {
    if (!Number.isInteger(datos[campo]) || datos[campo] <= 0) motivos.push({ codigo: "numero_invalido", campo });
  }
  return motivos;
}

function aFila(datos: DatosFinca): Record<string, ValorSql> {
  const texto = (v: string | null) => v?.trim() || null;
  return {
    nombre: datos.nombre.trim(),
    criadero: texto(datos.criadero),
    municipio: texto(datos.municipio),
    registro_sanitario_predio: texto(datos.registroSanitarioPredio),
    dias_gestacion: datos.diasGestacion,
    dias_lactancia: datos.diasLactancia,
  };
}

/** Prepara la creación de la finca en un lote de cambios (el asistente la crea junto con el propietario). */
export function prepararFinca(cambios: Cambios, datos: DatosFinca): string {
  rechazarSi(validarFinca(datos));
  return cambios.insertar("finca", aFila(datos));
}

export async function actualizarFinca(
  conexion: Conexion,
  datos: DatosFinca,
  contexto: ContextoCambio,
): Promise<void> {
  exigirPermiso(contexto, "ver_ajustes");
  rechazarSi(validarFinca(datos));
  const actual = await obtenerFinca(conexion);
  if (!actual) throw new Error("No hay finca registrada");
  const antes = aFila(actual);
  const cambios = new Cambios(contexto);
  cambios.actualizar("finca", actual.id, antes, aFila(datos));
  await cambios.aplicar(conexion);
}
