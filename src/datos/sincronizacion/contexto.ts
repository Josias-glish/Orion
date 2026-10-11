// Lo que cada conexión necesita para sincronizar: el reloj (que las pruebas fijan) y un candado que ordena las escrituras
// que leen y guardan el reloj híbrido o las marcas (R17). Diseño: docs/SINCRONIZACION.md, secciones 4 y 5.
import type { Conexion } from "../conexion";

export interface Reloj {
  /** Hora del sistema en milisegundos desde 1970. */
  ahoraMs(): number;
}

const RELOJ_DEL_SISTEMA: Reloj = { ahoraMs: () => Date.now() };
const relojes = new WeakMap<object, Reloj>();
const candados = new WeakMap<object, Promise<unknown>>();

/** Solo para pruebas: cada equipo simulado puede tener su propio reloj (adelantado, atrasado o detenido). */
export function fijarReloj(conexion: Conexion, reloj: Reloj | null): void {
  if (reloj) relojes.set(conexion, reloj);
  else relojes.delete(conexion);
}

export function relojDe(conexion: Conexion): Reloj {
  return relojes.get(conexion) ?? RELOJ_DEL_SISTEMA;
}

/**
 * Ejecuta `tarea` cuando terminen las anteriores sobre la misma conexión. Quien lee el reloj híbrido, las marcas o el
 * cursor y luego escribe lo derivado de ellos lo hace aquí dentro: así dos guardados seguidos no reparten la misma marca
 * ni se pisan.
 */
export function conCandado<T>(conexion: Conexion, tarea: () => Promise<T>): Promise<T> {
  const anterior = candados.get(conexion) ?? Promise.resolve();
  const siguiente = anterior.then(tarea, tarea);
  candados.set(
    conexion,
    siguiente.catch(() => undefined),
  );
  return siguiente;
}

const oyentes = new WeakMap<object, Set<() => void>>();

/** Avisa cuando se guarda algo en la base (el servicio de sincronización programa un envío poco después). Devuelve cómo dejar de oír. */
export function alGuardar(conexion: Conexion, oyente: () => void): () => void {
  let conjunto = oyentes.get(conexion);
  if (!conjunto) {
    conjunto = new Set();
    oyentes.set(conexion, conjunto);
  }
  conjunto.add(oyente);
  return () => conjunto.delete(oyente);
}

export function avisarGuardado(conexion: Conexion): void {
  for (const oyente of oyentes.get(conexion) ?? []) {
    try {
      oyente();
    } catch {
      // Quien escucha no debe poder romper un guardado.
    }
  }
}
