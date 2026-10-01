// Tipos del dominio compartidos por las reglas, los repositorios y las pantallas.

export type Sexo = "hembra" | "macho";
export type EstadoAnimal = "activo" | "vendido" | "muerto";
export type TipoIdentificador = "tatuaje" | "microchip" | "arete" | "registro_asociacion";
export type Rol = "propietario" | "operario";

export const SEXOS: readonly Sexo[] = ["hembra", "macho"];
export const ESTADOS_ANIMAL: readonly EstadoAnimal[] = ["activo", "vendido", "muerto"];
export const TIPOS_IDENTIFICADOR: readonly TipoIdentificador[] = ["arete", "tatuaje", "microchip", "registro_asociacion"];
export const ROLES: readonly Rol[] = ["propietario", "operario"];

/** SUPOSICION: valores de forma de concepción hasta que se definan (pregunta 9 de la Etapa 0). */
export type FormaConcepcion = "monta_natural" | "inseminacion_artificial" | "transferencia_embriones" | "desconocida";
export const FORMAS_CONCEPCION: readonly FormaConcepcion[] = [
  "monta_natural",
  "inseminacion_artificial",
  "transferencia_embriones",
  "desconocida",
];
