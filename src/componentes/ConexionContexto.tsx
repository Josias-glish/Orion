import { createContext, useContext } from "react";
import type { Conexion, ContextoCambio } from "../datos/conexion";
import { marcaDeTiempo } from "../dominio/fechas";

export const ConexionContexto = createContext<Conexion | null>(null);

/** Conexión a la base abierta por App. Solo se usa dentro de las pantallas. */
export function useConexion(): Conexion {
  const conexion = useContext(ConexionContexto);
  if (!conexion) throw new Error("useConexion se usó fuera de ConexionContexto");
  return conexion;
}

/** Quién y cuándo, para el historial. Hasta la Etapa 2 no hay usuarios, así que va vacío. */
export function contextoDeCambio(): ContextoCambio {
  return { usuarioId: null, marcaTiempo: marcaDeTiempo() };
}
