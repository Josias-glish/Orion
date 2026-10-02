// Tipos del dominio compartidos por las reglas, los repositorios y las pantallas.

export type Sexo = "hembra" | "macho";
export type EstadoAnimal = "activo" | "vendido" | "muerto";
export type TipoIdentificador = "tatuaje" | "microchip" | "arete" | "registro_asociacion";
export type Rol = "propietario" | "operario";
/** R29 (especificación 2): de dónde viene el animal. «externo» = de otra finca, solo para la genealogía. */
export type OrigenAnimal = "nacido_aqui" | "comprado" | "externo";

export const SEXOS: readonly Sexo[] = ["hembra", "macho"];
export const ESTADOS_ANIMAL: readonly EstadoAnimal[] = ["activo", "vendido", "muerto"];
export const TIPOS_IDENTIFICADOR: readonly TipoIdentificador[] = ["arete", "tatuaje", "microchip", "registro_asociacion"];
export const ROLES: readonly Rol[] = ["propietario", "operario"];
export const ORIGENES: readonly OrigenAnimal[] = ["nacido_aqui", "comprado", "externo"];

/** SUPOSICION: valores de forma de concepción hasta que se definan (pregunta 9 de la Etapa 0). */
export type FormaConcepcion = "monta_natural" | "inseminacion_artificial" | "transferencia_embriones" | "desconocida";
export const FORMAS_CONCEPCION: readonly FormaConcepcion[] = [
  "monta_natural",
  "inseminacion_artificial",
  "transferencia_embriones",
  "desconocida",
];
