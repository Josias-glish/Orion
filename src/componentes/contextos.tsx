import { createContext, useCallback, useContext } from "react";
import type { Conexion, ContextoCambio } from "../datos/conexion";
import type { Finca } from "../datos/repositorios/finca";
import type { Usuario } from "../datos/repositorios/usuarios";
import { marcaDeTiempo } from "../dominio/fechas";
import { puede, type Accion } from "../dominio/permisos";

export const ConexionContexto = createContext<Conexion | null>(null);

/** Conexión a la base, abierta por App. */
export function useConexion(): Conexion {
  const conexion = useContext(ConexionContexto);
  if (!conexion) throw new Error("useConexion se usó fuera de ConexionContexto");
  return conexion;
}

export interface Sesion {
  usuario: Usuario;
  finca: Finca;
  recargarFinca: () => Promise<void>;
  cerrarSesion: () => void;
}

export const SesionContexto = createContext<Sesion | null>(null);

export function useSesion(): Sesion {
  const sesion = useContext(SesionContexto);
  if (!sesion) throw new Error("useSesion se usó fuera de SesionContexto");
  return sesion;
}

/** Devuelve una función que crea el contexto de un cambio (usuario, rol y hora actual) para el historial. */
export function useContextoCambio(): () => ContextoCambio {
  const { usuario } = useSesion();
  return useCallback(() => ({ usuarioId: usuario.id, rol: usuario.rol, marcaTiempo: marcaDeTiempo() }), [usuario]);
}

/** R14 en la interfaz: ¿puede el usuario actual hacer esta acción? */
export function usePermiso(accion: Accion): boolean {
  return puede(useSesion().usuario.rol, accion);
}

export type PestanaAnimal = "ficha" | "genealogia" | "reproduccion" | "pesos" | "historial";
export type SeccionAjustes = "finca" | "usuarios" | "razas" | "libros" | "lotes" | "datos";
export type SeccionReproduccion = "servicios" | "proximos" | "intervalos";
export type SeccionLeche = "ordeno" | "lactancias";
export type SeccionPesos = "registrar" | "metas";

/** Pantallas del programa. */
export type Ruta =
  | { pantalla: "inicio" }
  | { pantalla: "animales" }
  | { pantalla: "animal"; id: string; pestana: PestanaAnimal }
  | { pantalla: "nuevoAnimal" }
  | { pantalla: "editarAnimal"; id: string }
  | { pantalla: "reproduccion"; seccion: SeccionReproduccion }
  | { pantalla: "registrarParto"; hembraId: string | null }
  | { pantalla: "leche"; seccion: SeccionLeche }
  | { pantalla: "lactancia"; id: string }
  | { pantalla: "pesos"; seccion: SeccionPesos; animalId?: string }
  | { pantalla: "ajustes"; seccion: SeccionAjustes };

export const NavegacionContexto = createContext<(ruta: Ruta) => void>(() => {});

export function useNavegar(): (ruta: Ruta) => void {
  return useContext(NavegacionContexto);
}
