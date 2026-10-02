// Lo que el servidor decide en los registros genealógicos (R31): los números. En un equipo vinculado emitir, reemitir,
// anular y fijar el siguiente número pasan por aquí; la implementación con red vive en src/sincronizacion/registros-remotos.ts.
// Diseño: docs/SINCRONIZACION.md, sección 7.
import type { Conexion } from "../conexion";

export interface RegistroParaEmitir {
  registro_id: string;
  animal_id: string;
  libro_id: string;
  fecha_registro: string;
  /** Texto JSON. El servidor pone dentro el número que asigna. */
  instantanea: string;
  responsable: string | null;
  observaciones: string | null;
}

export interface RegistroEmitido {
  registro_id: string;
  libro_id: string;
  consecutivo: number;
  numero: string;
  version: number;
}

export interface ServidorDeRegistros {
  /** Envía lo pendiente y recibe lo nuevo. Lanza `requiere_servidor` si no hay conexión. */
  alDia(): Promise<void>;
  /** Asigna los números en el orden recibido. Cuando vuelve, este equipo ya recibió los cambios resultantes. */
  emitir(registros: readonly RegistroParaEmitir[]): Promise<RegistroEmitido[]>;
  reemitir(registroId: string, versionBase: number, campos: { instantanea: string; fecha_registro?: string; responsable?: string | null; observaciones?: string | null }): Promise<{ numero: string; version: number }>;
  anular(registroId: string, motivo: string): Promise<void>;
  fijarSiguienteNumero(libroId: string, valor: number): Promise<void>;
}

const servidores = new WeakMap<object, ServidorDeRegistros>();

export function fijarServidorDeRegistros(conexion: Conexion, servidor: ServidorDeRegistros | null): void {
  if (servidor) servidores.set(conexion, servidor);
  else servidores.delete(conexion);
}

export function servidorDeRegistros(conexion: Conexion): ServidorDeRegistros | null {
  return servidores.get(conexion) ?? null;
}
