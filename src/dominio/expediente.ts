import type { FormaConcepcion, Sexo, TipoIdentificador } from "./tipos";

/**
 * R13. Campos del expediente para ANCO, en orden.
 * SUPOSICION: esta lista sale de R13 y se revisará cuando haya un CRG real. ANCO no publica un formato.
 */
export const CAMPOS_EXPEDIENTE = [
  "nombre",
  "crg",
  "criador",
  "propietario",
  "criadero",
  "sexo",
  "composicion",
  "libro",
  "formaConcepcion",
  "marcas",
  "color",
  "nacimiento",
  "padre",
  "madre",
  "abueloPaterno",
  "abuelaPaterna",
  "abueloMaterno",
  "abuelaMaterna",
] as const;
export type CampoExpediente = (typeof CAMPOS_EXPEDIENTE)[number];

export const CAMPOS_ASCENDENCIA = ["padre", "madre", "abueloPaterno", "abuelaPaterna", "abueloMaterno", "abuelaMaterna"] as const;
export type CampoAscendencia = (typeof CAMPOS_ASCENDENCIA)[number];

/**
 * Campos que pueden quedar vacíos sin que falte nada: el CRG del animal («si existe», R13).
 * El CRG de cada ancestro tampoco es obligatorio («con su CRG si lo tienen»).
 */
const OPCIONALES: ReadonlySet<CampoExpediente> = new Set(["crg"]);

export interface Ancestro {
  nombre: string | null;
  /** Número de registro de la asociación (identificador `registro_asociacion`), si lo tiene. */
  crg: string | null;
  /** El vínculo con su hijo está marcado «sin verificar» (RF-13). */
  sinVerificar: boolean;
}

export interface Marca {
  tipo: TipoIdentificador;
  valor: string;
}

export interface FraccionConRaza {
  raza: string;
  fraccion: number;
}

export interface EntradaExpediente {
  animal: {
    nombre: string | null;
    crg: string | null;
    sexo: Sexo;
    fechaNacimiento: string | null;
    colorSenas: string | null;
    libro: string | null;
    formaConcepcion: FormaConcepcion | null;
    /** Identificadores vigentes que no son el registro de la asociación (arete, tatuaje, microchip). */
    marcas: Marca[];
    composicion: FraccionConRaza[];
  };
  criador: string | null;
  propietario: string | null;
  criadero: string | null;
  ascendencia: Record<CampoAscendencia, Ancestro | null>;
}

export interface DatosExpediente {
  nombre: string | null;
  crg: string | null;
  criador: string | null;
  propietario: string | null;
  criadero: string | null;
  sexo: Sexo;
  composicion: FraccionConRaza[];
  libro: string | null;
  formaConcepcion: FormaConcepcion | null;
  marcas: Marca[];
  color: string | null;
  nacimiento: string | null;
  padre: Ancestro | null;
  madre: Ancestro | null;
  abueloPaterno: Ancestro | null;
  abuelaPaterna: Ancestro | null;
  abueloMaterno: Ancestro | null;
  abuelaMaterna: Ancestro | null;
}

export type AvisoExpediente = { codigo: "ancestro_sin_verificar"; campo: CampoAscendencia };

export interface Expediente {
  datos: DatosExpediente;
  /** Campos obligatorios sin dato, en el orden de CAMPOS_EXPEDIENTE. */
  faltantes: CampoExpediente[];
  avisos: AvisoExpediente[];
}

const texto = (valor: string | null) => (valor && valor.trim() ? valor.trim() : null);

/** R13. Arma el expediente de un animal y avisa qué falta. */
export function armarExpediente(e: EntradaExpediente): Expediente {
  const a = e.animal;
  const datos: DatosExpediente = {
    nombre: texto(a.nombre),
    crg: texto(a.crg),
    criador: texto(e.criador),
    propietario: texto(e.propietario),
    criadero: texto(e.criadero),
    sexo: a.sexo,
    composicion: a.composicion,
    libro: texto(a.libro),
    formaConcepcion: a.formaConcepcion,
    marcas: a.marcas,
    color: texto(a.colorSenas),
    nacimiento: a.fechaNacimiento,
    ...e.ascendencia,
  };
  const estaVacio = (campo: CampoExpediente) => {
    const v = datos[campo];
    return v === null || (Array.isArray(v) && v.length === 0);
  };
  return {
    datos,
    faltantes: CAMPOS_EXPEDIENTE.filter((c) => !OPCIONALES.has(c) && estaVacio(c)),
    avisos: CAMPOS_ASCENDENCIA.filter((c) => e.ascendencia[c]?.sinVerificar).map((campo) => ({ codigo: "ancestro_sin_verificar" as const, campo })),
  };
}
