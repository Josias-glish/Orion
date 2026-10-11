import type { ErrorCalidad } from "../dominio/calidad-leche";
import type { ErrorComposicion } from "../dominio/composicion";
import type { ErrorContacto } from "../dominio/contactos";
import type { ErrorExterno } from "../dominio/externos";
import type { ErrorFinanzas } from "../dominio/finanzas";
import type { ErrorGenealogia } from "../dominio/genealogia";
import type { ErrorIdentificador } from "../dominio/identificadores";
import type { ErrorRegistro } from "../dominio/registros";
import type { ErrorTraspaso } from "../dominio/traspasos";
import type { ErrorReproduccion } from "../dominio/reproduccion";
import type { ErrorSalud } from "../dominio/salud";

/** Motivo por el que se rechaza un cambio. La interfaz muestra el texto según el código (src/textos/es.ts). */
export type Motivo =
  | ErrorGenealogia
  | ErrorIdentificador
  | ErrorComposicion
  | ErrorSalud
  | ErrorReproduccion
  | ErrorExterno
  | ErrorContacto
  | ErrorRegistro
  | ErrorCalidad
  | ErrorFinanzas
  | ErrorTraspaso
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
  | { codigo: "lote_con_animales"; cantidad: number }
  | { codigo: "fecha_anterior_al_nacimiento"; otro: string }
  | { codigo: "diagnostico_antes_del_servicio" }
  | { codigo: "resultado_invalido" }
  | { codigo: "sin_crias" }
  | { codigo: "kilos_invalidos" }
  | { codigo: "fuera_de_la_lactancia" }
  | { codigo: "lactancia_secada" }
  | { codigo: "pesajes_despues_del_secado" }
  | { codigo: "meta_invalida" }
  | { codigo: "lote_sin_animales"; lote: string }
  | { codigo: "base_no_vacia" }
  | { codigo: "respaldo_mas_nuevo" }
  | { codigo: "respaldo_danado" }
  | { codigo: "elegir_padre" }
  | { codigo: "contacto_en_uso"; cantidad: number }
  | { codigo: "margen_invalido" }
  | { codigo: "requiere_servidor" }
  | { codigo: "equipo_ya_vinculado" }
  | { codigo: "equipo_con_datos" }
  | { codigo: "subida_rechazada"; motivo: string }
  | { codigo: "restaurar_vinculado" }
  | { codigo: "registro_cambiado_en_otro_equipo" }
  | { codigo: "servidor_rechazo"; motivo: string };

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
