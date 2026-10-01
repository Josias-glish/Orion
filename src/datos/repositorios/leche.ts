import { esFechaValida, fechaLocal } from "../../dominio/fechas";
import {
  calcularProyeccion,
  diaDeLactancia,
  DIAS_PARA_EL_PROMEDIO,
  produccionDiaria,
  proyectarLactancia,
  type Jornada,
  type PesajeLeche,
  type Proyeccion,
  type PuntoCurva,
} from "../../dominio/leche";
import { Cambios, exigirPermiso } from "../cambios";
import type { Conexion, ContextoCambio } from "../conexion";
import { ErrorDeRegistro, rechazarSi, type Motivo } from "../errores";
import { obtenerFinca } from "./finca";

/** SUPOSICION: si todavía no hay finca (pruebas), 305 días de lactancia como dice la especificación. */
const DIAS_LACTANCIA_POR_DEFECTO = 305;

async function diasLactancia(conexion: Conexion): Promise<number> {
  return (await obtenerFinca(conexion))?.diasLactancia ?? DIAS_LACTANCIA_POR_DEFECTO;
}

// ---------------------------------------------------------------- Ordeño en lote (RF-26, RF-29)

export interface FilaOrdeno {
  lactanciaId: string;
  hembraId: string;
  nombre: string | null;
  identificador: string | null;
  fechaInicio: string;
  diaLactancia: number;
  /** Pesaje ya anotado para esa fecha y jornada (se corrige si se vuelve a escribir). */
  pesajeId: string | null;
  kilos: number | null;
  /** Último pesaje de la misma jornada antes de esa fecha, como referencia. */
  kilosAnteriores: number | null;
}

/**
 * Hembras en lactancia en una fecha, para el ordeño. R11: solo hembras activas y del hato.
 * Una lactancia cuenta si empezó en o antes de la fecha y no estaba secada.
 */
export async function listarOrdeno(conexion: Conexion, fecha: string, jornada: Jornada): Promise<FilaOrdeno[]> {
  const filas = await conexion.consultar<Omit<FilaOrdeno, "diaLactancia">>(
    `SELECT l.id AS lactanciaId, a.id AS hembraId, a.nombre, i.valor AS identificador, l.fecha_inicio AS fechaInicio,
            p.id AS pesajeId, p.kilos,
            (SELECT x.kilos FROM pesaje_leche AS x
             WHERE x.lactancia_id = l.id AND x.jornada = ? AND x.fecha < ? AND x.eliminado_en IS NULL
             ORDER BY x.fecha DESC LIMIT 1) AS kilosAnteriores
     FROM lactancia AS l
     JOIN animal AS a ON a.id = l.hembra_id
     LEFT JOIN identificador AS i ON i.animal_id = a.id AND i.principal = 1 AND i.eliminado_en IS NULL
     LEFT JOIN pesaje_leche AS p
       ON p.lactancia_id = l.id AND p.fecha = ? AND p.jornada = ? AND p.eliminado_en IS NULL
     WHERE l.eliminado_en IS NULL AND l.fecha_inicio <= ? AND (l.fecha_secado IS NULL OR l.fecha_secado >= ?)
       AND a.eliminado_en IS NULL AND a.estado = 'activo' AND a.en_hato = 1
     ORDER BY coalesce(i.valor, a.nombre) COLLATE NOCASE`,
    [jornada, fecha, fecha, jornada, fecha, fecha],
  );
  return filas.map((f) => ({ ...f, diaLactancia: diaDeLactancia(f.fechaInicio, fecha) }));
}

export interface DatosPesajeLeche {
  lactanciaId: string;
  fecha: string;
  jornada: Jornada;
  kilos: number;
}

/**
 * Guarda el peso de leche de una cabra en una jornada (RF-26). Si ya había uno para esa lactancia, fecha y
 * jornada, lo corrige (queda en el historial). Devuelve el id del pesaje.
 */
export async function guardarPesajeLeche(conexion: Conexion, datos: DatosPesajeLeche, contexto: ContextoCambio): Promise<string> {
  exigirPermiso(contexto, "registrar_leche");
  const [lactancia] = await conexion.consultar<{
    fecha_inicio: string;
    fecha_secado: string | null;
    estado: string;
    en_hato: number;
    nombre: string;
  }>(
    `SELECT l.fecha_inicio, l.fecha_secado, a.estado, a.en_hato, coalesce(a.nombre, '') AS nombre
     FROM lactancia AS l JOIN animal AS a ON a.id = l.hembra_id
     WHERE l.id = ? AND l.eliminado_en IS NULL AND a.eliminado_en IS NULL`,
    [datos.lactanciaId],
  );
  if (!lactancia) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  const motivos: Motivo[] = [];
  if (!Number.isFinite(datos.kilos) || datos.kilos < 0) motivos.push({ codigo: "kilos_invalidos" });
  if (!["manana", "tarde"].includes(datos.jornada)) motivos.push({ codigo: "dato_obligatorio", campo: "jornada" });
  if (!esFechaValida(datos.fecha)) motivos.push({ codigo: "fecha_invalida", campo: "fecha" });
  else if (datos.fecha > fechaLocal()) motivos.push({ codigo: "fecha_futura", campo: "fecha" });
  else if (datos.fecha < lactancia.fecha_inicio || (lactancia.fecha_secado && datos.fecha > lactancia.fecha_secado)) {
    motivos.push({ codigo: "fuera_de_la_lactancia" });
  }
  if (lactancia.estado !== "activo" || lactancia.en_hato !== 1) {
    motivos.push({ codigo: "animal_no_disponible", otro: lactancia.nombre });
  }
  rechazarSi(motivos);

  const [existente] = await conexion.consultar<{ id: string; kilos: number }>(
    "SELECT id, kilos FROM pesaje_leche WHERE lactancia_id = ? AND fecha = ? AND jornada = ? AND eliminado_en IS NULL",
    [datos.lactanciaId, datos.fecha, datos.jornada],
  );
  const cambios = new Cambios(contexto);
  const id = existente
    ? (cambios.actualizar("pesaje_leche", existente.id, { kilos: existente.kilos }, { kilos: datos.kilos }), existente.id)
    : cambios.insertar("pesaje_leche", {
        lactancia_id: datos.lactanciaId,
        fecha: datos.fecha,
        jornada: datos.jornada,
        kilos: datos.kilos,
      });
  await cambios.aplicar(conexion);
  return id;
}

// ---------------------------------------------------------------- Lactancias (RF-27, RF-28)

export interface LactanciaResumen {
  id: string;
  hembraId: string;
  hembra: string;
  fechaInicio: string;
  fechaSecado: string | null;
  pesajes: number;
  proyeccion: Proyeccion | null;
}

/**
 * Lactancias con su acumulado y su proyección (R8). El resumen que necesita la fórmula se calcula en SQLite
 * (funciones de ventana) para no traer todos los pesajes; la fórmula es la misma del dominio.
 */
export async function listarLactancias(conexion: Conexion, { soloAbiertas = true } = {}): Promise<LactanciaResumen[]> {
  const dias = await diasLactancia(conexion);
  const filas = await conexion.consultar<{
    id: string;
    hembraId: string;
    hembra: string;
    fechaInicio: string;
    fechaSecado: string | null;
    pesajes: number;
    acumulado: number | null;
    sumaUltimos: number | null;
    cantidadUltimos: number | null;
    fechaUltimo: string | null;
  }>(
    `WITH diarios AS (
       SELECT lactancia_id, fecha, sum(kilos) AS kilos, count(*) AS n,
              row_number() OVER (PARTITION BY lactancia_id ORDER BY fecha DESC) AS orden
       FROM pesaje_leche WHERE eliminado_en IS NULL
       GROUP BY lactancia_id, fecha
     ),
     resumen AS (
       SELECT lactancia_id, sum(kilos) AS acumulado, sum(n) AS pesajes,
              sum(CASE WHEN orden <= ? THEN kilos END) AS sumaUltimos,
              sum(orden <= ?) AS cantidadUltimos,
              max(fecha) AS fechaUltimo
       FROM diarios GROUP BY lactancia_id
     )
     SELECT l.id, l.hembra_id AS hembraId, coalesce(a.nombre, i.valor, '') AS hembra,
            l.fecha_inicio AS fechaInicio, l.fecha_secado AS fechaSecado,
            coalesce(r.pesajes, 0) AS pesajes, r.acumulado, r.sumaUltimos, r.cantidadUltimos, r.fechaUltimo
     FROM lactancia AS l
     JOIN animal AS a ON a.id = l.hembra_id
     LEFT JOIN identificador AS i ON i.animal_id = a.id AND i.principal = 1 AND i.eliminado_en IS NULL
     LEFT JOIN resumen AS r ON r.lactancia_id = l.id
     WHERE l.eliminado_en IS NULL AND a.eliminado_en IS NULL AND (? = 0 OR l.fecha_secado IS NULL)
     ORDER BY l.fecha_inicio DESC`,
    [DIAS_PARA_EL_PROMEDIO, DIAS_PARA_EL_PROMEDIO, soloAbiertas ? 1 : 0],
  );
  return filas.map((f) => ({
    id: f.id,
    hembraId: f.hembraId,
    hembra: f.hembra,
    fechaInicio: f.fechaInicio,
    fechaSecado: f.fechaSecado,
    pesajes: f.pesajes,
    proyeccion:
      f.fechaUltimo === null
        ? null
        : calcularProyeccion(dias, {
            acumulado: f.acumulado!,
            sumaUltimosDias: f.sumaUltimos!,
            cantidadUltimosDias: f.cantidadUltimos!,
            diaUltimoRegistro: diaDeLactancia(f.fechaInicio, f.fechaUltimo),
          }),
  }));
}

export interface DetalleLactancia {
  id: string;
  hembraId: string;
  hembra: string;
  fechaInicio: string;
  fechaSecado: string | null;
  diasLactancia: number;
  pesajes: (PesajeLeche & { id: string })[];
  curva: PuntoCurva[];
  proyeccion: Proyeccion | null;
}

export async function obtenerLactancia(conexion: Conexion, id: string): Promise<DetalleLactancia | null> {
  const [l] = await conexion.consultar<{ id: string; hembraId: string; hembra: string; fechaInicio: string; fechaSecado: string | null }>(
    `SELECT l.id, l.hembra_id AS hembraId, coalesce(a.nombre, i.valor, '') AS hembra,
            l.fecha_inicio AS fechaInicio, l.fecha_secado AS fechaSecado
     FROM lactancia AS l JOIN animal AS a ON a.id = l.hembra_id
     LEFT JOIN identificador AS i ON i.animal_id = a.id AND i.principal = 1 AND i.eliminado_en IS NULL
     WHERE l.id = ? AND l.eliminado_en IS NULL`,
    [id],
  );
  if (!l) return null;
  const pesajes = await conexion.consultar<PesajeLeche & { id: string }>(
    `SELECT id, fecha, jornada, kilos FROM pesaje_leche
     WHERE lactancia_id = ? AND eliminado_en IS NULL ORDER BY fecha, jornada`,
    [id],
  );
  const dias = await diasLactancia(conexion);
  return {
    ...l,
    diasLactancia: dias,
    pesajes,
    curva: produccionDiaria(l.fechaInicio, pesajes),
    proyeccion: proyectarLactancia(l.fechaInicio, dias, pesajes),
  };
}

/** Lactancias de una hembra (para su ficha). */
export async function lactanciasDeHembra(conexion: Conexion, hembraId: string): Promise<LactanciaResumen[]> {
  return (await listarLactancias(conexion, { soloAbiertas: false })).filter((l) => l.hembraId === hembraId);
}

/** RF-27: secar una lactancia. No se puede secar antes del inicio ni antes del último pesaje anotado. */
export async function secarLactancia(conexion: Conexion, id: string, fecha: string, contexto: ContextoCambio): Promise<void> {
  exigirPermiso(contexto, "registrar_leche");
  const detalle = await obtenerLactancia(conexion, id);
  if (!detalle) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  const motivos: Motivo[] = [];
  if (detalle.fechaSecado) motivos.push({ codigo: "lactancia_secada" });
  if (!esFechaValida(fecha)) motivos.push({ codigo: "fecha_invalida", campo: "fecha" });
  else if (fecha > fechaLocal()) motivos.push({ codigo: "fecha_futura", campo: "fecha" });
  else if (fecha < detalle.fechaInicio) motivos.push({ codigo: "fuera_de_la_lactancia" });
  else if (detalle.pesajes.some((p) => p.fecha > fecha)) motivos.push({ codigo: "pesajes_despues_del_secado" });
  rechazarSi(motivos);
  const cambios = new Cambios(contexto);
  cambios.actualizar("lactancia", id, { fecha_secado: null }, { fecha_secado: fecha });
  await cambios.aplicar(conexion);
}

/** Para el inicio: hembras en lactancia hoy (R11: activas y del hato). */
export async function contarEnLactancia(conexion: Conexion, hoy: string): Promise<number> {
  return (await listarOrdeno(conexion, hoy, "manana")).length;
}
