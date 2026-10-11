import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import type { Conexion, ContextoCambio } from "../datos/conexion";
import type { Finca } from "../datos/repositorios/finca";
import type { Usuario } from "../datos/repositorios/usuarios";
import { marcaDeTiempo } from "../dominio/fechas";
import { puede, type Accion } from "../dominio/permisos";
import type { Sincronizacion } from "../sincronizacion/ensamblaje";
import type { EstadoVisible } from "../sincronizacion/servicio";

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

export type PestanaAnimal = "ficha" | "genealogia" | "reproduccion" | "servicios" | "pesos" | "salud" | "documentos" | "registro" | "historial";
/** R29: los animales del hato, los de otras fincas y los contactos (propietarios). */
export type VistaAnimales = "hato" | "externos" | "contactos";
export type SeccionAjustes = "finca" | "usuarios" | "razas" | "libros" | "lotes" | "datos" | "sincronizacion";
export type SeccionReproduccion = "servicios" | "proximos" | "intervalos";
export type SeccionLeche = "ordeno" | "lactancias" | "calidad";
export type SeccionPesos = "registrar" | "metas";
export type SeccionSalud = "registrar" | "calendario" | "retiros" | "historial";
export type SeccionDocumentos = "certificado" | "expediente" | "inventario" | "hojaVenta" | "emitidos" | "respaldo";
/** R31: registros genealógicos propios (solo el propietario). */
export type SeccionRegistros = "registros" | "verificacion" | "libro" | "configuracion";
/** RF-33 y RF-34: ingresos, gastos y resumen (solo el propietario, R23). */
export type SeccionFinanzas = "movimientos" | "resumen" | "categorias";

/** Pantallas del programa. */
export type Ruta =
  | { pantalla: "inicio" }
  | { pantalla: "animales"; vista?: VistaAnimales }
  | { pantalla: "animal"; id: string; pestana: PestanaAnimal }
  | { pantalla: "nuevoAnimal"; externo?: boolean }
  | { pantalla: "editarAnimal"; id: string }
  | { pantalla: "reproduccion"; seccion: SeccionReproduccion }
  | { pantalla: "registrarParto"; hembraId: string | null }
  | { pantalla: "leche"; seccion: SeccionLeche }
  | { pantalla: "lactancia"; id: string }
  | { pantalla: "pesos"; seccion: SeccionPesos; animalId?: string }
  | { pantalla: "salud"; seccion: SeccionSalud; animalId?: string }
  | { pantalla: "documentos"; seccion: SeccionDocumentos; animalId?: string }
  | { pantalla: "registros"; seccion: SeccionRegistros; registroId?: string }
  | { pantalla: "finanzas"; seccion: SeccionFinanzas }
  /** RF-50 y RF-16: historial de compras y ventas (solo el propietario, R23). */
  | { pantalla: "traspasos" }
  /** R32: registrar una compra; con `animalId`, el animal de otra finca que se promueve a comprado. */
  | { pantalla: "registrarCompra"; animalId?: string }
  /** R20: registrar la venta de un animal del hato. */
  | { pantalla: "registrarVenta"; animalId: string }
  | { pantalla: "ajustes"; seccion: SeccionAjustes };

export const NavegacionContexto = createContext<(ruta: Ruta) => void>(() => {});

export function useNavegar(): (ruta: Ruta) => void {
  return useContext(NavegacionContexto);
}

/** Las piezas de la sincronización (Etapa 10), armadas por App. */
export const SincronizacionContexto = createContext<Sincronizacion | null>(null);

export function useSincronizacion(): Sincronizacion {
  const sincronizacion = useContext(SincronizacionContexto);
  if (!sincronizacion) throw new Error("useSincronizacion se usó fuera de SincronizacionContexto");
  return sincronizacion;
}

/** El estado que muestra el indicador; React lo vuelve a dibujar cuando cambia. */
export function useEstadoDeSincronizacion(): EstadoVisible {
  const { servicio } = useSincronizacion();
  return useSyncExternalStore(
    useCallback((avisar: () => void) => servicio.suscribir(avisar), [servicio]),
    () => servicio.obtenerEstado(),
  );
}
