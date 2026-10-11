// Formas de lo que contesta el servidor (servidor/PROTOCOLO.md). Solo tipos: no hace nada.
import type { CambioRemoto } from "../datos/sincronizacion/aplicador";

export interface VinculoDelServidor {
  finca_id: string;
  finca_nombre: string;
  dispositivo_id: string;
  codigo_equipo: string;
  hora_servidor_ms: number;
  seq_actual: number;
  version_esquema_minima: number;
}

export interface RespuestaSincronizar {
  hora_servidor_ms: number;
  aceptados: string[];
  ya_aplicados: string[];
  rechazados: { cambio_id: string; grupo_id: string; motivo: string }[];
  corregidos: { cambio_id: string; marca_nueva: string }[];
  cambios: CambioRemoto[];
  seq_siguiente: number;
  hay_mas: boolean;
  version_esquema_minima: number;
}

export interface OperacionEnviada {
  id: string;
  grupo_id: string;
  orden: number;
  entidad: string;
  registro_id: string;
  operacion: "crear" | "modificar" | "eliminar";
  campos: Record<string, string | number | null>;
  marca: string;
  usuario_id: string | null;
}

export interface ResumenDeEntidad {
  entidad: string;
  filas: number;
  huella: string;
}

export interface ResumenDeFinca {
  seq_actual: number;
  hora_servidor_ms: number;
  entidades: ResumenDeEntidad[];
}

export interface PaginaDescargada {
  registros: { registro_id: string; campos: Record<string, string | number | null>; marcas: { base: string; campos: Record<string, string> } }[];
  siguiente: string | null;
}

export interface InicioDeDescarga {
  seq_inicial: number;
  hora_servidor_ms: number;
  conteos: Record<string, number>;
}

/** Lo que dice un resultado de llamada arbitrada (R31). */
export interface ResultadoArbitrado {
  seq_final: number;
  hora_servidor_ms: number;
}
