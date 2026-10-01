import { esFechaValida, sumarDias } from "./fechas";

export type TipoSalud = "vacuna" | "desparasitacion" | "tratamiento" | "condicion_corporal";
export const TIPOS_SALUD: readonly TipoSalud[] = ["vacuna", "desparasitacion", "tratamiento", "condicion_corporal"];
export type TipoRetiro = "leche" | "carne";

/** Lo que se anota en un evento de salud (RF-22 a RF-25), con los campos del Registro de Tratamientos del ICA. */
export interface DatosEventoSalud {
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
}

export type ErrorSalud =
  | { codigo: "dato_obligatorio"; campo: string }
  | { codigo: "fecha_invalida"; campo: string }
  | { codigo: "fecha_futura"; campo: string }
  | { codigo: "fin_antes_del_inicio" }
  | { codigo: "proxima_antes_del_inicio" }
  | { codigo: "retiro_invalido" }
  | { codigo: "condicion_invalida" }
  | { codigo: "tipo_salud_invalido" };

/**
 * R7. Fin del retiro: fecha_fin (o fecha_inicio si no hay) más los días de retiro.
 * SUPOSICION: sin días de retiro (vacío o cero) no hay retiro y se devuelve null.
 */
export function finDeRetiro(fechaInicio: string, fechaFin: string | null, dias: number | null): string | null {
  if (!dias || dias <= 0) return null;
  return sumarDias(fechaFin ?? fechaInicio, dias);
}

export interface EventoConRetiro {
  id: string;
  animalId: string;
  producto: string | null;
  fechaInicio: string;
  fechaFin: string | null;
  retiroLecheDias: number | null;
  retiroCarneDias: number | null;
}

/** R7. ¿Está vigente el retiro de leche o de carne en `hoy`? Vigente desde el inicio hasta el fin, inclusive. */
export function retiroVigente(evento: EventoConRetiro, tipo: TipoRetiro, hoy: string): { hasta: string } | null {
  const dias = tipo === "leche" ? evento.retiroLecheDias : evento.retiroCarneDias;
  const hasta = finDeRetiro(evento.fechaInicio, evento.fechaFin, dias);
  if (hasta === null || hoy < evento.fechaInicio || hoy > hasta) return null;
  return { hasta };
}

export interface AlertaRetiro {
  eventoId: string;
  animalId: string;
  producto: string | null;
  tipo: TipoRetiro;
  hasta: string;
}

/** RF-24. Alertas de retiro vigentes en `hoy`, de la que vence antes a la que vence después (leche antes que carne). */
export function alertasDeRetiro(eventos: readonly EventoConRetiro[], hoy: string): AlertaRetiro[] {
  const alertas: AlertaRetiro[] = [];
  for (const e of eventos) {
    for (const tipo of ["leche", "carne"] as const) {
      const vigente = retiroVigente(e, tipo, hoy);
      if (vigente) alertas.push({ eventoId: e.id, animalId: e.animalId, producto: e.producto, tipo, hasta: vigente.hasta });
    }
  }
  return alertas.sort((a, b) => a.hasta.localeCompare(b.hasta) || a.tipo.localeCompare(b.tipo) * -1);
}

export interface EventoParaCalendario {
  id: string;
  animalId: string;
  tipo: TipoSalud;
  producto: string | null;
  fechaInicio: string;
  proximaFecha: string | null;
}

export interface ProximaAplicacion {
  eventoId: string;
  animalId: string;
  tipo: TipoSalud;
  producto: string | null;
  proximaFecha: string;
  vencida: boolean;
}

/**
 * RF-22. Próximas vacunas y desparasitaciones hasta `dias` días después de `hoy`, más las ya vencidas.
 * SUPOSICION: una aplicación posterior del mismo tipo y producto al mismo animal cumple la fecha pendiente
 * de la anterior (solo cuenta la más reciente).
 */
export function proximasAplicaciones(eventos: readonly EventoParaCalendario[], hoy: string, dias: number): ProximaAplicacion[] {
  const limite = sumarDias(hoy, dias);
  const ultima = new Map<string, EventoParaCalendario>();
  for (const e of eventos) {
    if (e.tipo !== "vacuna" && e.tipo !== "desparasitacion") continue;
    const clave = `${e.animalId}|${e.tipo}|${(e.producto ?? "").trim().toLowerCase()}`;
    const actual = ultima.get(clave);
    if (!actual || e.fechaInicio > actual.fechaInicio) ultima.set(clave, e);
  }
  return [...ultima.values()]
    .filter((e): e is EventoParaCalendario & { proximaFecha: string } => e.proximaFecha !== null && e.proximaFecha <= limite)
    .map((e) => ({
      eventoId: e.id,
      animalId: e.animalId,
      tipo: e.tipo,
      producto: e.producto,
      proximaFecha: e.proximaFecha,
      vencida: e.proximaFecha < hoy,
    }))
    .sort((a, b) => a.proximaFecha.localeCompare(b.proximaFecha));
}

const vacio = (texto: string | null) => !texto || !texto.trim();
const retiroValido = (dias: number | null) => dias === null || (Number.isInteger(dias) && dias >= 0);

/** Reglas propias de un evento de salud (las que dependen del animal, como R11, las revisa el repositorio). */
export function validarEventoSalud(d: DatosEventoSalud, hoy: string): ErrorSalud[] {
  const errores: ErrorSalud[] = [];
  if (!(TIPOS_SALUD as readonly string[]).includes(d.tipo)) return [{ codigo: "tipo_salud_invalido" }];
  const esCondicion = d.tipo === "condicion_corporal";
  if (!esCondicion && vacio(d.producto)) errores.push({ codigo: "dato_obligatorio", campo: "producto" });
  if (!esFechaValida(d.fechaInicio)) errores.push({ codigo: "fecha_invalida", campo: "fecha_inicio" });
  else if (d.fechaInicio > hoy) errores.push({ codigo: "fecha_futura", campo: "fecha_inicio" });
  // La fecha de fin puede ser futura: un tratamiento de varios días que todavía sigue.
  if (d.fechaFin !== null && !esFechaValida(d.fechaFin)) errores.push({ codigo: "fecha_invalida", campo: "fecha_fin" });
  else if (d.fechaFin !== null && esFechaValida(d.fechaInicio) && d.fechaFin < d.fechaInicio) errores.push({ codigo: "fin_antes_del_inicio" });
  if (d.proximaFecha !== null && !esFechaValida(d.proximaFecha)) errores.push({ codigo: "fecha_invalida", campo: "proxima_fecha" });
  else if (d.proximaFecha !== null && esFechaValida(d.fechaInicio) && d.proximaFecha <= d.fechaInicio) {
    errores.push({ codigo: "proxima_antes_del_inicio" });
  }
  if (esCondicion) {
    const cc = d.condicionCorporal;
    // SUPOSICION: escala de 1 a 5 en pasos de medio punto.
    if (cc === null || !Number.isFinite(cc) || cc < 1 || cc > 5 || !Number.isInteger(cc * 2)) errores.push({ codigo: "condicion_invalida" });
  } else if (!retiroValido(d.retiroLecheDias) || !retiroValido(d.retiroCarneDias)) {
    errores.push({ codigo: "retiro_invalido" });
  }
  return errores;
}
