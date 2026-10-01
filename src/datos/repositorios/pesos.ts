import { diasEntre, fechaLocal } from "../../dominio/fechas";
import { gananciasSucesivas, metaParaEdad, type MetaPeso, type TipoPesaje } from "../../dominio/pesos";
import type { Sexo } from "../../dominio/tipos";
import { Cambios, exigirPermiso } from "../cambios";
import type { Conexion, ContextoCambio } from "../conexion";
import { ErrorDeRegistro, rechazarSi, type Motivo } from "../errores";
import { obtenerAnimalBasico, validarFechaEvento } from "./reproduccion";

export interface DatosPesaje {
  animalId: string;
  fecha: string;
  kilos: number;
  tipo: TipoPesaje;
}

/** RF-30: peso corporal por fecha y tipo. */
export async function registrarPesaje(conexion: Conexion, datos: DatosPesaje, contexto: ContextoCambio): Promise<string> {
  exigirPermiso(contexto, "registrar_peso");
  const animal = await obtenerAnimalBasico(conexion, datos.animalId);
  if (!animal) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  const motivos: Motivo[] = [];
  if (!Number.isFinite(datos.kilos) || datos.kilos <= 0) motivos.push({ codigo: "kilos_invalidos" });
  if (!["nacimiento", "destete", "control"].includes(datos.tipo)) motivos.push({ codigo: "dato_obligatorio", campo: "tipo" });
  motivos.push(...validarFechaEvento(datos.fecha, animal, fechaLocal()));
  rechazarSi(motivos);
  const cambios = new Cambios(contexto);
  const id = cambios.insertar("pesaje_corporal", {
    animal_id: animal.id,
    fecha: datos.fecha,
    kilos: datos.kilos,
    tipo: datos.tipo,
  });
  await cambios.aplicar(conexion);
  return id;
}

export interface PesajeConAnalisis {
  id: string;
  fecha: string;
  kilos: number;
  tipo: TipoPesaje;
  edadDias: number | null;
  /** R10: kilos por día respecto al pesaje anterior. */
  gananciaDiaria: number | null;
  /** RF-31: peso meta para la edad del animal en esa fecha (si hay metas que la cubran). */
  meta: number | null;
}

/** Pesajes de un animal en orden de fecha, con ganancia diaria (R10) y comparación con la meta (RF-31). */
export async function pesajesDeAnimal(conexion: Conexion, animalId: string): Promise<PesajeConAnalisis[]> {
  const animal = await obtenerAnimalBasico(conexion, animalId);
  if (!animal) return [];
  const pesajes = await conexion.consultar<{ id: string; fecha: string; kilos: number; tipo: TipoPesaje }>(
    `SELECT id, fecha, kilos, tipo FROM pesaje_corporal
     WHERE animal_id = ? AND eliminado_en IS NULL ORDER BY fecha, creado_en`,
    [animalId],
  );
  const metas = await listarMetas(conexion);
  const ganancias = gananciasSucesivas(pesajes);
  return pesajes.map((p, i) => {
    const edadDias = animal.fechaNacimiento ? diasEntre(animal.fechaNacimiento, p.fecha) : null;
    return {
      ...p,
      edadDias,
      gananciaDiaria: ganancias[i],
      meta: edadDias === null ? null : metaParaEdad(metas, animal.sexo, edadDias),
    };
  });
}

export interface PesajeReciente {
  id: string;
  animalId: string;
  animal: string;
  fecha: string;
  kilos: number;
  tipo: TipoPesaje;
}

export async function listarPesajesRecientes(conexion: Conexion, limite = 30): Promise<PesajeReciente[]> {
  return conexion.consultar<PesajeReciente>(
    `SELECT p.id, p.animal_id AS animalId, coalesce(a.nombre, i.valor, '') AS animal, p.fecha, p.kilos, p.tipo
     FROM pesaje_corporal AS p
     JOIN animal AS a ON a.id = p.animal_id
     LEFT JOIN identificador AS i ON i.animal_id = a.id AND i.principal = 1 AND i.eliminado_en IS NULL
     WHERE p.eliminado_en IS NULL AND a.eliminado_en IS NULL
     ORDER BY p.fecha DESC, p.creado_en DESC LIMIT ?`,
    [limite],
  );
}

// ---------------------------------------------------------------- Metas por edad (RF-31, SUPOSICION)

export interface MetaGuardada extends MetaPeso {
  id: string;
}

export async function listarMetas(conexion: Conexion): Promise<MetaGuardada[]> {
  return conexion.consultar<MetaGuardada>(
    `SELECT id, sexo, edad_meses AS edadMeses, kilos FROM meta_peso
     WHERE eliminado_en IS NULL ORDER BY sexo, edad_meses`,
  );
}

/** Crea la meta de un sexo y una edad, o cambia sus kilos si ya existía. */
export async function guardarMeta(
  conexion: Conexion,
  datos: { sexo: Sexo; edadMeses: number; kilos: number },
  contexto: ContextoCambio,
): Promise<void> {
  exigirPermiso(contexto, "editar_metas_peso");
  const valida =
    (datos.sexo === "hembra" || datos.sexo === "macho") &&
    Number.isInteger(datos.edadMeses) &&
    datos.edadMeses >= 0 &&
    Number.isFinite(datos.kilos) &&
    datos.kilos > 0;
  if (!valida) throw new ErrorDeRegistro([{ codigo: "meta_invalida" }]);
  const existente = (await listarMetas(conexion)).find((m) => m.sexo === datos.sexo && m.edadMeses === datos.edadMeses);
  const cambios = new Cambios(contexto);
  if (existente) cambios.actualizar("meta_peso", existente.id, { kilos: existente.kilos }, { kilos: datos.kilos });
  else cambios.insertar("meta_peso", { sexo: datos.sexo, edad_meses: datos.edadMeses, kilos: datos.kilos });
  await cambios.aplicar(conexion);
}

export async function retirarMeta(conexion: Conexion, id: string, contexto: ContextoCambio): Promise<void> {
  exigirPermiso(contexto, "editar_metas_peso");
  const cambios = new Cambios(contexto);
  cambios.eliminar("meta_peso", id);
  await cambios.aplicar(conexion);
}
