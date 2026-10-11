// Equipos simulados para las pruebas de sincronización (Vitest): cada uno es una base SQLite en memoria con su reloj, su red
// simulada y su cliente, hablando con el mismo servidor de prueba. No lo usa el programa.
import type { ServidorDePrueba } from "../../servidor/pruebas/ayudas";
import { completarAsistente } from "../datos/arranque";
import { crearBaseDePrueba, type ConexionMemoria } from "../datos/conexion-memoria";
import type { ContextoCambio } from "../datos/conexion";
import { fijarServidorDeRegistros } from "../datos/sincronizacion/servidor-registros";
import { fijarReloj } from "../datos/sincronizacion/contexto";
import { ClienteDeSincronizacion } from "./cliente";
import { descargarDatosIniciales, subirDatosIniciales, verificarContraElServidor, type InformeDeVerificacion } from "./primera";
import { RedSimulada } from "./red-simulada";
import { crearServidorDeRegistros } from "./registros-remotos";
import { fincasDeLaCuenta, vincularPrimerEquipo, vincularSegundoEquipo } from "./vinculacion";
import { marcaDeTiempo } from "../dominio/fechas";
import { ENTIDADES_SINCRONIZADAS } from "../dominio/sincronizacion/entidades";
import { columnasQueSuben, entreComillas } from "../datos/sincronizacion/esquema";

export const VERSION_ESQUEMA_DE_LOS_EQUIPOS = 9;

/** Hora de los relojes de los equipos (igual a la del servidor de pruebas, salvo que una prueba la mueva). */
export const HORA_DE_LOS_EQUIPOS = Date.UTC(2026, 9, 2, 12, 0, 0);

export interface RelojDeEquipo {
  ms: number;
  ahoraMs(): number;
  avanzar(ms: number): void;
}

export interface EquipoSimulado {
  nombre: string;
  conexion: ConexionMemoria;
  red: RedSimulada;
  cliente: ClienteDeSincronizacion;
  reloj: RelojDeEquipo;
  /** Contexto de un cambio hecho por el propietario de este equipo, con la hora del reloj del equipo. */
  contexto(): ContextoCambio;
  cerrar(): void;
}

export interface OpcionesDeEquipo {
  servidor: ServidorDePrueba;
  cuentaId: string;
  correo?: string;
  nombre?: string;
  archivos?: Map<string, Uint8Array>;
  relojMs?: number;
  limiteEnvio?: number;
  limitePagina?: number;
  /** Una base ya armada (por ejemplo, una actualizada desde la 0.1.0). Por defecto, una base nueva. */
  conexion?: ConexionMemoria;
}

export function crearEquipo(opciones: OpcionesDeEquipo): EquipoSimulado {
  const conexion = opciones.conexion ?? crearBaseDePrueba();
  const reloj: RelojDeEquipo = {
    ms: opciones.relojMs ?? HORA_DE_LOS_EQUIPOS,
    ahoraMs() {
      return this.ms;
    },
    avanzar(ms: number) {
      this.ms += ms;
    },
  };
  fijarReloj(conexion, reloj);
  const red = new RedSimulada({ servidor: opciones.servidor, cuentaId: opciones.cuentaId, correo: opciones.correo, archivos: opciones.archivos });
  const cliente = new ClienteDeSincronizacion(conexion, red, {
    versionEsquema: VERSION_ESQUEMA_DE_LOS_EQUIPOS,
    limiteEnvio: opciones.limiteEnvio,
    limitePagina: opciones.limitePagina,
  });
  fijarServidorDeRegistros(conexion, crearServidorDeRegistros(conexion, red, cliente));
  return {
    nombre: opciones.nombre ?? "Equipo",
    conexion,
    red,
    cliente,
    reloj,
    contexto: () => ({ usuarioId: null, rol: "propietario", marcaTiempo: marcaDeTiempo(new Date(reloj.ms)) }),
    cerrar: () => conexion.cerrar(),
  };
}

export const FINCA_DE_PRUEBA = {
  nombre: "Aprisco de prueba",
  criadero: "El Paraíso",
  municipio: null,
  registroSanitarioPredio: null,
  diasGestacion: 150,
  diasLactancia: 305,
  margenGestacion: 10,
};

/** Un equipo con su finca y su propietario, todavía sin vincular (como el de la 0.5.0). */
export async function equipoConFinca(opciones: OpcionesDeEquipo): Promise<EquipoSimulado> {
  const equipo = crearEquipo(opciones);
  await completarAsistente(equipo.conexion, FINCA_DE_PRUEBA, { nombre: "Ana", contacto: null }, null);
  return equipo;
}

/** Vincula el equipo como primero de la finca y sube todo lo que tiene. Devuelve el informe de verificación. */
export async function vincularYSubir(equipo: EquipoSimulado, nombreDelEquipo = equipo.nombre): Promise<InformeDeVerificacion> {
  await vincularPrimerEquipo(equipo.conexion, equipo.red, { nombre: nombreDelEquipo, plataforma: "pruebas" }, VERSION_ESQUEMA_DE_LOS_EQUIPOS);
  await subirDatosIniciales(equipo.conexion, equipo.red, equipo.cliente, { versionEsquema: VERSION_ESQUEMA_DE_LOS_EQUIPOS });
  return verificarContraElServidor(equipo.conexion, equipo.red);
}

/** Une un equipo vacío a la finca (con la misma cuenta o con un código) y descarga todo. */
export async function unirYDescargar(
  equipo: EquipoSimulado,
  destino?: { codigo: string },
  nombreDelEquipo = equipo.nombre,
): Promise<InformeDeVerificacion> {
  const elegido = destino ?? { fincaId: (await fincasDeLaCuenta(equipo.red))[0].finca_id };
  await vincularSegundoEquipo(equipo.conexion, equipo.red, { nombre: nombreDelEquipo, plataforma: "pruebas" }, VERSION_ESQUEMA_DE_LOS_EQUIPOS, elegido);
  await descargarDatosIniciales(equipo.conexion, equipo.red, equipo.cliente, { versionEsquema: VERSION_ESQUEMA_DE_LOS_EQUIPOS });
  return verificarContraElServidor(equipo.conexion, equipo.red);
}

/** El contenido sincronizable de un equipo (todas las tablas y las columnas que viajan, en orden de id), para comparar dos equipos. */
export async function volcarDatos(conexion: ConexionMemoria): Promise<Record<string, Record<string, unknown>[]>> {
  const salida: Record<string, Record<string, unknown>[]> = {};
  for (const def of ENTIDADES_SINCRONIZADAS) {
    const columnas = (await columnasQueSuben(conexion, def.tabla)).concat(def.reservadas ?? []);
    const unicas = [...new Set(["id", ...columnas])];
    salida[def.tabla] = await conexion.consultar(`SELECT ${unicas.map(entreComillas).join(", ")} FROM ${entreComillas(def.tabla)} ORDER BY id`);
  }
  return salida;
}
