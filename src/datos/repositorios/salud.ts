import { fechaLocal } from "../../dominio/fechas";
import {
  alertasDeRetiro,
  finDeRetiro,
  proximasAplicaciones,
  validarEventoSalud,
  type DatosEventoSalud,
  type TipoRetiro,
  type TipoSalud,
} from "../../dominio/salud";
import { Cambios, exigirPermiso } from "../cambios";
import type { Conexion, ContextoCambio } from "../conexion";
import { ErrorDeRegistro, rechazarSi, type Motivo } from "../errores";
import { estaDisponible, obtenerAnimalBasico, validarFechaEvento, type AnimalBasico } from "./reproduccion";

/** A quién se aplica: un animal o un lote (Flujo 3). */
export type DestinoSalud = { animalId: string } | { loteId: string };

export interface DatosRegistroSalud extends DatosEventoSalud {
  destino: DestinoSalud;
}

const limpio = (texto: string | null) => (texto && texto.trim() ? texto.trim() : null);

/** Animales activos del hato que están en el lote (R11). */
async function animalesDelLote(conexion: Conexion, loteId: string): Promise<{ lote: string; animales: AnimalBasico[] }> {
  const [lote] = await conexion.consultar<{ nombre: string }>("SELECT nombre FROM lote WHERE id = ? AND eliminado_en IS NULL", [loteId]);
  if (!lote) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  const filas = await conexion.consultar<Omit<AnimalBasico, "enHato"> & { enHato: number }>(
    `SELECT a.id, coalesce(a.nombre, i.valor, '') AS nombre, a.sexo, a.fecha_nacimiento AS fechaNacimiento,
            a.estado, a.en_hato AS enHato
     FROM animal AS a
     LEFT JOIN identificador AS i ON i.animal_id = a.id AND i.principal = 1 AND i.eliminado_en IS NULL
     WHERE a.lote_id = ? AND a.eliminado_en IS NULL AND a.estado = 'activo' AND a.en_hato = 1`,
    [loteId],
  );
  return { lote: lote.nombre, animales: filas.map((f) => ({ ...f, enHato: f.enHato === 1 })) };
}

/**
 * Flujo 3 (RF-22 a RF-25): registra una vacuna, desparasitación, tratamiento o condición corporal.
 * A un lote: una fila por cada animal activo del lote (SUPOSICION, ver la migración 0004). Devuelve los id creados.
 */
export async function registrarEventoSalud(conexion: Conexion, datos: DatosRegistroSalud, contexto: ContextoCambio): Promise<string[]> {
  exigirPermiso(contexto, "registrar_tratamiento");
  const hoy = fechaLocal();
  const motivos: Motivo[] = [...validarEventoSalud(datos, hoy)];

  let animales: AnimalBasico[];
  let loteId: string | null = null;
  if ("loteId" in datos.destino) {
    loteId = datos.destino.loteId;
    const { lote, animales: delLote } = await animalesDelLote(conexion, loteId);
    if (delLote.length === 0) motivos.push({ codigo: "lote_sin_animales", lote });
    animales = delLote;
  } else {
    const animal = await obtenerAnimalBasico(conexion, datos.destino.animalId);
    if (!animal) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
    // R11: un animal vendido o muerto ya no recibe tratamientos.
    if (!estaDisponible(animal)) motivos.push({ codigo: "animal_no_disponible", otro: animal.nombre });
    animales = [animal];
  }
  if (motivos.length === 0) {
    for (const a of animales) motivos.push(...validarFechaEvento(datos.fechaInicio, a, hoy, "fecha_inicio"));
  }
  rechazarSi([...new Map(motivos.map((m) => [JSON.stringify(m), m])).values()]);

  // La condición corporal no lleva producto, retiro ni próxima fecha.
  const esCondicion = datos.tipo === "condicion_corporal";
  const fila = {
    lote_id: loteId,
    tipo: datos.tipo,
    producto: esCondicion ? null : limpio(datos.producto),
    numero_registro_ica: esCondicion ? null : limpio(datos.numeroRegistroIca),
    lote_producto: esCondicion ? null : limpio(datos.loteProducto),
    dosis: esCondicion ? null : limpio(datos.dosis),
    via: esCondicion ? null : limpio(datos.via),
    fecha_inicio: datos.fechaInicio,
    fecha_fin: esCondicion ? null : datos.fechaFin,
    retiro_leche_dias: esCondicion ? null : datos.retiroLecheDias,
    retiro_carne_dias: esCondicion ? null : datos.retiroCarneDias,
    aplicador: limpio(datos.aplicador),
    veterinario: limpio(datos.veterinario),
    condicion_corporal: esCondicion ? datos.condicionCorporal : null,
    proxima_fecha: esCondicion ? null : datos.proximaFecha,
    observaciones: limpio(datos.observaciones),
  };
  const cambios = new Cambios(contexto);
  const ids = animales.map((a) => cambios.insertar("evento_salud", { animal_id: a.id, ...fila }));
  await cambios.aplicar(conexion);
  return ids;
}

/** Retira (borrado lógico) un evento anotado por error. Solo el propietario. */
export async function retirarEventoSalud(conexion: Conexion, id: string, contexto: ContextoCambio): Promise<void> {
  exigirPermiso(contexto, "editar_animal");
  const cambios = new Cambios(contexto);
  cambios.eliminar("evento_salud", id);
  await cambios.aplicar(conexion);
}

export interface EventoSalud {
  id: string;
  animalId: string;
  animal: string;
  loteId: string | null;
  lote: string | null;
  tipo: TipoSalud;
  producto: string | null;
  numeroRegistroIca: string | null;
  loteProducto: string | null;
  dosis: string | null;
  via: string | null;
  fechaInicio: string;
  fechaFin: string | null;
  retiroLecheDias: number | null;
  retiroCarneDias: number | null;
  aplicador: string | null;
  veterinario: string | null;
  condicionCorporal: number | null;
  proximaFecha: string | null;
  observaciones: string | null;
  /** R7: último día del retiro, o null si no tiene. */
  finRetiroLeche: string | null;
  finRetiroCarne: string | null;
}

const SELECT_EVENTO = `
  SELECT e.id, e.animal_id AS animalId, coalesce(a.nombre, i.valor, '') AS animal, e.lote_id AS loteId, l.nombre AS lote,
         e.tipo, e.producto, e.numero_registro_ica AS numeroRegistroIca, e.lote_producto AS loteProducto, e.dosis, e.via,
         e.fecha_inicio AS fechaInicio, e.fecha_fin AS fechaFin, e.retiro_leche_dias AS retiroLecheDias,
         e.retiro_carne_dias AS retiroCarneDias, e.aplicador, e.veterinario, e.condicion_corporal AS condicionCorporal,
         e.proxima_fecha AS proximaFecha, e.observaciones
  FROM evento_salud AS e
  JOIN animal AS a ON a.id = e.animal_id AND a.eliminado_en IS NULL
  LEFT JOIN identificador AS i ON i.animal_id = a.id AND i.principal = 1 AND i.eliminado_en IS NULL
  LEFT JOIN lote AS l ON l.id = e.lote_id`;

const conRetiros = (e: Omit<EventoSalud, "finRetiroLeche" | "finRetiroCarne">): EventoSalud => ({
  ...e,
  finRetiroLeche: finDeRetiro(e.fechaInicio, e.fechaFin, e.retiroLecheDias),
  finRetiroCarne: finDeRetiro(e.fechaInicio, e.fechaFin, e.retiroCarneDias),
});

/** Eventos de salud, del más reciente al más antiguo. */
export async function listarEventosSalud(
  conexion: Conexion,
  filtro: { animalId?: string; tipo?: TipoSalud; limite?: number },
): Promise<EventoSalud[]> {
  const filas = await conexion.consultar<Omit<EventoSalud, "finRetiroLeche" | "finRetiroCarne">>(
    `${SELECT_EVENTO}
     WHERE e.eliminado_en IS NULL AND (? IS NULL OR e.animal_id = ?) AND (? IS NULL OR e.tipo = ?)
     ORDER BY e.fecha_inicio DESC, e.creado_en DESC, animal COLLATE NOCASE
     LIMIT ?`,
    [filtro.animalId ?? null, filtro.animalId ?? null, filtro.tipo ?? null, filtro.tipo ?? null, filtro.limite ?? -1],
  );
  return filas.map(conRetiros);
}

export interface AlertaRetiroConAnimal {
  eventoId: string;
  animalId: string;
  animal: string;
  producto: string | null;
  tipo: TipoRetiro;
  hasta: string;
}

/**
 * RF-24: alertas de retiro vigentes en `hoy` (R7), de animales activos del hato.
 * SUPOSICION: un animal vendido o muerto ya no tiene leche ni carne que vender desde la finca: sin alerta (R11).
 */
export async function listarAlertasRetiro(conexion: Conexion, hoy: string): Promise<AlertaRetiroConAnimal[]> {
  const eventos = await conexion.consultar<{
    id: string;
    animalId: string;
    animal: string;
    producto: string | null;
    fechaInicio: string;
    fechaFin: string | null;
    retiroLecheDias: number | null;
    retiroCarneDias: number | null;
  }>(
    `SELECT e.id, e.animal_id AS animalId, coalesce(a.nombre, i.valor, '') AS animal, e.producto,
            e.fecha_inicio AS fechaInicio, e.fecha_fin AS fechaFin,
            e.retiro_leche_dias AS retiroLecheDias, e.retiro_carne_dias AS retiroCarneDias
     FROM evento_salud AS e
     JOIN animal AS a ON a.id = e.animal_id
     LEFT JOIN identificador AS i ON i.animal_id = a.id AND i.principal = 1 AND i.eliminado_en IS NULL
     WHERE e.eliminado_en IS NULL AND a.eliminado_en IS NULL AND a.estado = 'activo' AND a.en_hato = 1
       AND e.fecha_inicio <= ?
       AND (coalesce(e.retiro_leche_dias, 0) > 0 OR coalesce(e.retiro_carne_dias, 0) > 0)`,
    [hoy],
  );
  const nombres = new Map(eventos.map((e) => [e.id, e.animal]));
  return alertasDeRetiro(eventos, hoy).map((a) => ({ ...a, animal: nombres.get(a.eventoId)! }));
}

/** Para el ordeño (Flujo 2): hasta qué día está retenida la leche de cada hembra y por qué productos. */
export async function retirosDeLechePorAnimal(
  conexion: Conexion,
  hoy: string,
): Promise<Map<string, { hasta: string; productos: string[] }>> {
  const resultado = new Map<string, { hasta: string; productos: string[] }>();
  for (const a of await listarAlertasRetiro(conexion, hoy)) {
    if (a.tipo !== "leche") continue;
    const actual = resultado.get(a.animalId);
    const productos = [...(actual?.productos ?? []), ...(a.producto ? [a.producto] : [])];
    resultado.set(a.animalId, { hasta: actual && actual.hasta > a.hasta ? actual.hasta : a.hasta, productos: [...new Set(productos)].sort() });
  }
  return resultado;
}

export interface ProximaAplicacionConAnimal {
  eventoId: string;
  animalId: string;
  animal: string;
  lote: string | null;
  tipo: TipoSalud;
  producto: string | null;
  proximaFecha: string;
  vencida: boolean;
}

/** RF-22: calendario de próximas vacunas y desparasitaciones de animales activos del hato. */
export async function listarProximasAplicaciones(conexion: Conexion, hoy: string, dias = 30): Promise<ProximaAplicacionConAnimal[]> {
  const eventos = await conexion.consultar<{
    id: string;
    animalId: string;
    animal: string;
    lote: string | null;
    tipo: TipoSalud;
    producto: string | null;
    fechaInicio: string;
    proximaFecha: string | null;
  }>(
    `SELECT e.id, e.animal_id AS animalId, coalesce(a.nombre, i.valor, '') AS animal, l.nombre AS lote,
            e.tipo, e.producto, e.fecha_inicio AS fechaInicio, e.proxima_fecha AS proximaFecha
     FROM evento_salud AS e
     JOIN animal AS a ON a.id = e.animal_id
     LEFT JOIN identificador AS i ON i.animal_id = a.id AND i.principal = 1 AND i.eliminado_en IS NULL
     LEFT JOIN lote AS l ON l.id = e.lote_id
     WHERE e.eliminado_en IS NULL AND a.eliminado_en IS NULL AND a.estado = 'activo' AND a.en_hato = 1
       AND e.tipo IN ('vacuna', 'desparasitacion')`,
  );
  const porId = new Map(eventos.map((e) => [e.id, e]));
  return proximasAplicaciones(eventos, hoy, dias)
    .map((p) => ({ ...p, animal: porId.get(p.eventoId)!.animal, lote: porId.get(p.eventoId)!.lote }))
    .sort((a, b) => a.proximaFecha.localeCompare(b.proximaFecha) || a.animal.localeCompare(b.animal, "es"));
}
