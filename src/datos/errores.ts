import type { ErrorComposicion } from "../dominio/composicion";
import type { ErrorGenealogia } from "../dominio/genealogia";
import type { ErrorIdentificador } from "../dominio/identificadores";

/** Motivo por el que se rechaza un cambio. La interfaz muestra el texto según el código (src/textos/es.ts). */
export type Motivo =
  | ErrorGenealogia
  | ErrorIdentificador
  | ErrorComposicion
  | { codigo: "sin_permiso" }
  | { codigo: "no_encontrado" }
  | { codigo: "dato_obligatorio"; campo: string }
  | { codigo: "fecha_invalida"; campo: string }
  | { codigo: "fecha_futura"; campo: string }
  | { codigo: "sin_nombre_ni_identificador" }
  | { codigo: "numero_invalido"; campo: string }
  | { codigo: "nombre_duplicado"; nombre: string }
  | { codigo: "pin_invalido" }
  | { codigo: "ultimo_propietario" }
  | { codigo: "no_puede_retirarse_a_si_mismo" }
  | { codigo: "lote_con_animales"; cantidad: number };

/** Error esperado: el cambio no cumple una regla. Lleva todos los motivos para mostrarlos juntos. */
export class ErrorDeRegistro extends Error {
  readonly motivos: Motivo[];

  constructor(motivos: Motivo[]) {
    super(motivos.map((m) => m.codigo).join(", "));
    this.name = "ErrorDeRegistro";
    this.motivos = motivos;
  }
}

/** Lanza el error si hay motivos. */
export function rechazarSi(motivos: Motivo[]): void {
  if (motivos.length > 0) throw new ErrorDeRegistro(motivos);
}
