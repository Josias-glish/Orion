import { marcaDeTiempo } from "../dominio/fechas";
import { nuevoId } from "../dominio/identidad";
import { Cambios } from "./cambios";
import type { Conexion } from "./conexion";
import { obtenerFinca, prepararFinca, type DatosFinca, type Finca } from "./repositorios/finca";
import { listarUsuarios, prepararUsuario, type DatosUsuario, type Usuario } from "./repositorios/usuarios";

export interface EstadoArranque {
  finca: Finca | null;
  usuarios: Usuario[];
  /** El asistente se muestra si falta la finca o no hay ningún propietario. */
  necesitaAsistente: boolean;
}

export async function consultarArranque(conexion: Conexion): Promise<EstadoArranque> {
  const finca = await obtenerFinca(conexion);
  const usuarios = await listarUsuarios(conexion);
  return { finca, usuarios, necesitaAsistente: !finca || !usuarios.some((u) => u.rol === "propietario") };
}

/**
 * Primer arranque (RF-06): crea la finca (si aún no existe) y el usuario propietario en un solo cambio.
 * El historial queda a nombre del propietario recién creado. Devuelve ese usuario.
 */
export async function completarAsistente(
  conexion: Conexion,
  datosFinca: DatosFinca | null,
  datosUsuario: Omit<DatosUsuario, "rol">,
  pin: string | null,
): Promise<Usuario> {
  const usuarioId = nuevoId();
  const cambios = new Cambios({ usuarioId, rol: "propietario", marcaTiempo: marcaDeTiempo() });
  if (datosFinca) prepararFinca(cambios, datosFinca);
  await prepararUsuario(conexion, cambios, { ...datosUsuario, rol: "propietario" }, pin, usuarioId);
  await cambios.aplicar(conexion);
  return (await listarUsuarios(conexion)).find((u) => u.id === usuarioId)!;
}
