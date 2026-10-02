import { composicionDeCria, type FraccionRacial } from "../../dominio/composicion";
import { esFechaValida, fechaLocal, sumarDias } from "../../dominio/fechas";
import { validarGenealogia } from "../../dominio/genealogia";
import { normalizarValor, validarIdentificadores, type IdentificadorEditable } from "../../dominio/identificadores";
import { esDelHato } from "../../dominio/externos";
import {
  analizarPaternidad,
  elegirPadre,
  fechaProbableParto,
  intervalosEntrePartos,
  MARGEN_GESTACION_POR_DEFECTO,
  planificarCrias,
  promedio,
  validarServicio,
  type AnalisisPaternidad,
  type CandidatoPadre,
  type CriaAnotada,
  type EleccionPadre,
  type ResultadoServicio,
  type ServicioResumido,
  type TipoServicio,
} from "../../dominio/reproduccion";
import type { EstadoAnimal, OrigenAnimal, Sexo } from "../../dominio/tipos";
import { Cambios, exigirPermiso } from "../cambios";
import type { Conexion, ContextoCambio } from "../conexion";
import { ErrorDeRegistro, rechazarSi, type Motivo } from "../errores";
import { animalVacio, identificadoresEnUso, prepararAnimalNuevo, SQL_PROPIETARIO } from "./animales";
import { obtenerFinca } from "./finca";

/** SUPOSICION: si todavía no hay finca (pruebas), se usan los valores por defecto de la especificación. */
const DIAS_GESTACION_POR_DEFECTO = 150;

/** Datos mínimos de un animal para validar reproducción, leche y pesos. */
export interface AnimalBasico {
  id: string;
  nombre: string;
  sexo: Sexo;
  fechaNacimiento: string | null;
  estado: EstadoAnimal;
  enHato: boolean;
  origen: OrigenAnimal;
}

export async function obtenerAnimalBasico(conexion: Conexion, id: string): Promise<AnimalBasico | null> {
  const [fila] = await conexion.consultar<Omit<AnimalBasico, "enHato"> & { enHato: number }>(
    `SELECT a.id, coalesce(a.nombre, i.valor, '') AS nombre, a.sexo, a.fecha_nacimiento AS fechaNacimiento,
            a.estado, a.en_hato AS enHato, a.origen
     FROM animal AS a
     LEFT JOIN identificador AS i ON i.animal_id = a.id AND i.principal = 1 AND i.eliminado_en IS NULL
     WHERE a.id = ? AND a.eliminado_en IS NULL`,
    [id],
  );
  return fila ? { ...fila, enHato: fila.enHato === 1 } : null;
}

/** R11 y R29: un animal vendido o muerto, o que no es del hato, no participa en servicios ni en el ordeño. */
export function estaDisponible(a: AnimalBasico): boolean {
  return a.estado === "activo" && esDelHato(a);
}

/** Fecha válida, no futura y no anterior al nacimiento del animal. */
export function validarFechaEvento(fecha: string, animal: AnimalBasico | null, hoy: string, campo = "fecha"): Motivo[] {
  if (!esFechaValida(fecha)) return [{ codigo: "fecha_invalida", campo }];
  if (fecha > hoy) return [{ codigo: "fecha_futura", campo }];
  if (animal?.fechaNacimiento && fecha < animal.fechaNacimiento) {
    return [{ codigo: "fecha_anterior_al_nacimiento", otro: animal.nombre }];
  }
  return [];
}

async function diasGestacion(conexion: Conexion): Promise<number> {
  return (await obtenerFinca(conexion))?.diasGestacion ?? DIAS_GESTACION_POR_DEFECTO;
}

async function margenGestacion(conexion: Conexion): Promise<number> {
  return (await obtenerFinca(conexion))?.margenGestacion ?? MARGEN_GESTACION_POR_DEFECTO;
}

// ---------------------------------------------------------------- Servicios (RF-18, RF-19, RF-21)

export interface DatosServicio {
  hembraId: string;
  tipo: TipoServicio;
  machoId: string | null;
  pajilla: string | null;
  fecha: string;
  observaciones: string | null;
  /** R30: con un macho de otra finca, el costo acordado (pesos, opcional) y las condiciones con su dueño. */
  costo?: number | null;
  condiciones?: string | null;
}

export interface Servicio extends ServicioResumido {
  hembraId: string;
  hembra: string;
  macho: string | null;
  /** R30: el macho es de otra finca (o se registró solo para la genealogía). */
  machoExterno: boolean;
  /** «Nombre · Criadero» del dueño del macho de otra finca. */
  propietarioMacho: string | null;
  pajilla: string | null;
  fechaDiagnostico: string | null;
  fechaProbableParto: string | null;
  observaciones: string | null;
  costo: number | null;
  condiciones: string | null;
}

const SELECT_SERVICIO = `
  SELECT e.id, e.hembra_id AS hembraId, coalesce(h.nombre, ih.valor, '') AS hembra,
         e.macho_id AS machoId, coalesce(m.nombre, im.valor) AS macho,
         coalesce(m.en_hato = 0, 0) AS machoExterno, ${SQL_PROPIETARIO} AS propietarioMacho,
         e.pajilla, e.tipo, e.fecha, e.resultado,
         e.fecha_diagnostico AS fechaDiagnostico, e.fecha_probable_parto AS fechaProbableParto, e.observaciones,
         e.costo, e.condiciones
  FROM evento_reproductivo AS e
  JOIN animal AS h ON h.id = e.hembra_id
  LEFT JOIN identificador AS ih ON ih.animal_id = h.id AND ih.principal = 1 AND ih.eliminado_en IS NULL
  LEFT JOIN animal AS m ON m.id = e.macho_id
  LEFT JOIN identificador AS im ON im.animal_id = m.id AND im.principal = 1 AND im.eliminado_en IS NULL
  LEFT JOIN contacto AS c ON c.id = m.contacto_id`;

type FilaServicio = Omit<Servicio, "machoExterno"> & { machoExterno: number };
const aServicio = (f: FilaServicio): Servicio => ({ ...f, machoExterno: f.machoExterno === 1 });

/** Hembras que pueden recibir un servicio o parir (R11 y R29: activas y del hato). */
export async function listarHembrasDisponibles(conexion: Conexion): Promise<AnimalBasico[]> {
  return listarDisponibles(conexion, "hembra", 1);
}

/**
 * R30. Machos activos para un servicio: los del hato o los de otras fincas (incluidos los registrados solo para la
 * genealogía en la versión 0.1.0, por ejemplo el donante de una pajilla).
 */
export async function listarMachosDisponibles(conexion: Conexion, procedencia: "hato" | "otra_finca"): Promise<AnimalBasico[]> {
  return listarDisponibles(conexion, "macho", procedencia === "hato" ? 1 : 0);
}

async function listarDisponibles(conexion: Conexion, sexo: Sexo, enHato: 0 | 1): Promise<AnimalBasico[]> {
  const filas = await conexion.consultar<Omit<AnimalBasico, "enHato"> & { enHato: number }>(
    `SELECT a.id, coalesce(a.nombre, i.valor, '') AS nombre, a.sexo, a.fecha_nacimiento AS fechaNacimiento,
            a.estado, a.en_hato AS enHato, a.origen
     FROM animal AS a
     LEFT JOIN identificador AS i ON i.animal_id = a.id AND i.principal = 1 AND i.eliminado_en IS NULL
     WHERE a.eliminado_en IS NULL AND a.sexo = ? AND a.estado = 'activo' AND a.en_hato = ?
     ORDER BY nombre COLLATE NOCASE`,
    [sexo, enHato],
  );
  return filas.map((f) => ({ ...f, enHato: f.enHato === 1 }));
}

/** RF-18 y R30: registra un servicio con un macho del hato, uno de otra finca o solo la pajilla. */
export async function registrarServicio(conexion: Conexion, datos: DatosServicio, contexto: ContextoCambio): Promise<string> {
  exigirPermiso(contexto, "registrar_servicio");
  const hoy = fechaLocal();
  const hembra = await obtenerAnimalBasico(conexion, datos.hembraId);
  const macho = datos.machoId ? await obtenerAnimalBasico(conexion, datos.machoId) : null;
  if (!hembra || (datos.machoId && !macho)) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  const costo = datos.costo ?? null;
  const condiciones = datos.condiciones?.trim() || null;
  const motivos: Motivo[] = [
    ...validarServicio({ tipo: datos.tipo, pajilla: datos.pajilla, costo, condiciones }, hembra, macho),
    ...validarFechaEvento(datos.fecha, hembra, hoy),
  ];
  rechazarSi(motivos);

  const cambios = new Cambios(contexto);
  const id = cambios.insertar("evento_reproductivo", {
    hembra_id: hembra.id,
    macho_id: macho?.id ?? null,
    pajilla: datos.pajilla?.trim() || null,
    tipo: datos.tipo,
    fecha: datos.fecha,
    resultado: "pendiente",
    fecha_probable_parto: fechaProbableParto(datos.fecha, await diasGestacion(conexion)),
    observaciones: datos.observaciones?.trim() || null,
    costo,
    condiciones,
  });
  await cambios.aplicar(conexion);
  return id;
}

/** Diagnóstico de preñez (RF-19) o registro de un aborto (RF-21). */
export async function diagnosticarServicio(
  conexion: Conexion,
  servicioId: string,
  resultado: Exclude<ResultadoServicio, "pendiente">,
  fecha: string,
  contexto: ContextoCambio,
): Promise<void> {
  exigirPermiso(contexto, "registrar_servicio");
  const [actual] = await conexion.consultar<{ fecha: string; resultado: string; fecha_diagnostico: string | null }>(
    "SELECT fecha, resultado, fecha_diagnostico FROM evento_reproductivo WHERE id = ? AND eliminado_en IS NULL",
    [servicioId],
  );
  if (!actual) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  const motivos: Motivo[] = [];
  if (!["prenada", "vacia", "aborto"].includes(resultado)) motivos.push({ codigo: "resultado_invalido" });
  motivos.push(...validarFechaEvento(fecha, null, fechaLocal(), "fechaDiagnostico"));
  if (esFechaValida(fecha) && fecha < actual.fecha) motivos.push({ codigo: "diagnostico_antes_del_servicio" });
  rechazarSi(motivos);
  const cambios = new Cambios(contexto);
  cambios.actualizar(
    "evento_reproductivo",
    servicioId,
    { resultado: actual.resultado, fecha_diagnostico: actual.fecha_diagnostico },
    { resultado, fecha_diagnostico: fecha },
  );
  await cambios.aplicar(conexion);
}

export async function listarServicios(
  conexion: Conexion,
  filtro: { hembraId?: string; soloPendientes?: boolean } = {},
): Promise<Servicio[]> {
  const filas = await conexion.consultar<FilaServicio>(
    `${SELECT_SERVICIO}
     WHERE e.eliminado_en IS NULL
       AND (? IS NULL OR e.hembra_id = ?)
       AND (? = 0 OR e.resultado = 'pendiente')
     ORDER BY e.fecha DESC`,
    [filtro.hembraId ?? null, filtro.hembraId ?? null, filtro.soloPendientes ? 1 : 0],
  );
  return filas.map(aServicio);
}

export interface ServicioComoMacho extends Servicio {
  /** Crías nacidas de los partos registrados con este servicio. */
  crias: number;
}

export interface HistorialMacho {
  servicios: ServicioComoMacho[];
  resumen: { servicios: number; prenadas: number; vacias: number; abortos: number; pendientes: number; partos: number; crias: number };
}

/** R30: historial de servicios de un macho (del hato o de otra finca) y sus resultados. */
export async function serviciosComoMacho(conexion: Conexion, machoId: string): Promise<HistorialMacho> {
  const filas = await conexion.consultar<FilaServicio & { crias: number; partos: number }>(
    `${SELECT_SERVICIO.replace(
      "e.costo, e.condiciones",
      `e.costo, e.condiciones,
         (SELECT coalesce(sum(p.numero_crias), 0) FROM parto AS p WHERE p.evento_reproductivo_id = e.id AND p.eliminado_en IS NULL) AS crias,
         (SELECT count(*) FROM parto AS p WHERE p.evento_reproductivo_id = e.id AND p.eliminado_en IS NULL) AS partos`,
    )}
     WHERE e.eliminado_en IS NULL AND e.macho_id = ?
     ORDER BY e.fecha DESC`,
    [machoId],
  );
  const contar = (r: ResultadoServicio) => filas.filter((f) => f.resultado === r).length;
  return {
    servicios: filas.map(({ partos: _partos, ...f }) => ({ ...aServicio(f), crias: f.crias })),
    resumen: {
      servicios: filas.length,
      prenadas: contar("prenada"),
      vacias: contar("vacia"),
      abortos: contar("aborto"),
      pendientes: contar("pendiente"),
      partos: filas.reduce((s, f) => s + f.partos, 0),
      crias: filas.reduce((s, f) => s + f.crias, 0),
    },
  };
}

/**
 * Partos próximos: servicios «preñada» o aún sin diagnóstico, de hembras disponibles, sin parto registrado
 * después del servicio. SUPOSICION: se muestran desde 15 días atrasados hasta `dias` días adelante.
 */
export async function listarPartosProximos(conexion: Conexion, hoy: string, dias = 30): Promise<Servicio[]> {
  const filas = await conexion.consultar<FilaServicio>(
    `${SELECT_SERVICIO}
     WHERE e.eliminado_en IS NULL AND e.resultado IN ('prenada', 'pendiente')
       AND h.estado = 'activo' AND h.en_hato = 1 AND h.eliminado_en IS NULL
       AND e.fecha_probable_parto BETWEEN ? AND ?
       AND NOT EXISTS (SELECT 1 FROM parto AS p
                       WHERE p.hembra_id = e.hembra_id AND p.fecha > e.fecha AND p.eliminado_en IS NULL)
     ORDER BY e.fecha_probable_parto`,
    [sumarDias(hoy, -15), sumarDias(hoy, dias)],
  );
  return filas.map(aServicio);
}

// ---------------------------------------------------------------- Partos (RF-20, R5)

export interface DatosParto {
  hembraId: string;
  fecha: string;
  crias: CriaAnotada[];
  observaciones: string | null;
  /** R30: el padre que eligió el usuario. Obligatorio cuando la paternidad es incierta. */
  padre?: EleccionPadre;
}

export interface ResultadoParto {
  partoId: string;
  lactanciaId: string;
  criasIds: string[];
  padreId: string | null;
}

/** Un padre posible, con lo que la pantalla necesita mostrar. */
export interface CandidatoConNombre extends CandidatoPadre {
  macho: string | null;
  machoExterno: boolean;
  propietario: string | null;
}

export interface PaternidadDelParto extends Omit<AnalisisPaternidad, "candidatos"> {
  candidatos: CandidatoConNombre[];
  /** El servicio del padre propuesto por R5 (para mostrar su macho, pajilla y fecha). */
  servicioPropuesto: Servicio | null;
}

/** Fecha del último parto de la hembra antes de `fecha` (sus servicios anteriores ya dieron crías). */
async function partoAnterior(conexion: Conexion, hembraId: string, fecha: string): Promise<string | null> {
  const [fila] = await conexion.consultar<{ fecha: string | null }>(
    "SELECT max(fecha) AS fecha FROM parto WHERE hembra_id = ? AND fecha < ? AND eliminado_en IS NULL",
    [hembraId, fecha],
  );
  return fila?.fecha ?? null;
}

/**
 * R5 y R30 (CA-15): quién puede ser el padre de un parto. El programa propone el último servicio «preñada» y avisa si
 * dentro de la ventana de gestación hubo servicios con machos distintos.
 */
export async function analisisDePaternidad(conexion: Conexion, hembraId: string, fecha: string): Promise<PaternidadDelParto> {
  const servicios = await listarServicios(conexion, { hembraId });
  const analisis = analizarPaternidad(
    servicios,
    fecha,
    await diasGestacion(conexion),
    await margenGestacion(conexion),
    await partoAnterior(conexion, hembraId, fecha),
  );
  const porId = new Map(servicios.map((s) => [s.id, s]));
  return {
    ...analisis,
    candidatos: analisis.candidatos.map((c) => {
      const s = porId.get(c.servicioId)!;
      return { ...c, macho: s.macho, machoExterno: s.machoExterno, propietario: s.propietarioMacho };
    }),
    servicioPropuesto: analisis.propuesto.servicioId ? (porId.get(analisis.propuesto.servicioId) ?? null) : null,
  };
}

async function composicionDe(conexion: Conexion, animalId: string | null): Promise<FraccionRacial[]> {
  if (!animalId) return [];
  return conexion.consultar<FraccionRacial>(
    "SELECT raza_id AS razaId, fraccion FROM composicion_racial WHERE animal_id = ? AND eliminado_en IS NULL",
    [animalId],
  );
}

/**
 * R5 (Flujo 1). Registra el parto y, en un solo lote de cambios: una ficha por cría (madre asignada, padre del último
 * servicio «preñada» o vacío y «sin verificar», libro vacío), el peso al nacer de cada cría, el cierre de la lactancia
 * anterior si seguía abierta y la apertura de la nueva lactancia de la madre.
 */
export async function registrarParto(conexion: Conexion, datos: DatosParto, contexto: ContextoCambio): Promise<ResultadoParto> {
  exigirPermiso(contexto, "registrar_parto");
  const hoy = fechaLocal();
  const madre = await obtenerAnimalBasico(conexion, datos.hembraId);
  if (!madre) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  const motivos: Motivo[] = [];
  if (madre.sexo !== "hembra") motivos.push({ codigo: "debe_ser_hembra", otro: madre.nombre });
  if (!estaDisponible(madre)) motivos.push({ codigo: "animal_no_disponible", otro: madre.nombre });
  motivos.push(...validarFechaEvento(datos.fecha, madre, hoy));
  if (datos.crias.length === 0) motivos.push({ codigo: "sin_crias" });
  if (datos.crias.some((c) => c.pesoNacimiento !== null && !(c.pesoNacimiento > 0))) motivos.push({ codigo: "kilos_invalidos" });
  rechazarSi(motivos);

  // R5 y R30: el padre propuesto o, si la paternidad es incierta, el que elija el usuario.
  const analisis = await analisisDePaternidad(conexion, madre.id, datos.fecha);
  if (analisis.incierta && !datos.padre) throw new ErrorDeRegistro([{ codigo: "elegir_padre" }]);
  const eleccion = datos.padre ? elegirPadre(analisis, datos.padre) : { padre: analisis.propuesto, motivos: [] };
  rechazarSi(eleccion.motivos);
  const padre = eleccion.padre;
  const datosPadre = padre.padreId ? await obtenerAnimalBasico(conexion, padre.padreId) : null;
  const composicion = composicionDeCria(await composicionDe(conexion, padre.padreId), await composicionDe(conexion, madre.id));
  const fichas = planificarCrias(madre.id, datos.fecha, padre, datos.crias);

  // R1 y R2 para cada cría, antes de escribir nada.
  const enUso = await identificadoresEnUso(conexion, null);
  const aretes: IdentificadorEditable[][] = fichas.map((f) =>
    f.arete?.trim() ? [{ tipo: "arete", valor: f.arete, fecha: datos.fecha, vigente: true, principal: true }] : [],
  );
  const vistos = new Set<string>();
  fichas.forEach((f, i) => {
    if (!f.nombre?.trim() && aretes[i].length === 0) motivos.push({ codigo: "sin_nombre_ni_identificador" });
    motivos.push(
      ...validarGenealogia({
        animal: { id: "", nombre: f.nombre, sexo: f.sexo, fechaNacimiento: f.fechaNacimiento },
        padre: datosPadre,
        madre,
        descendientes: new Set(),
        hijosComoPadre: [],
        hijosComoMadre: [],
      }),
      ...validarIdentificadores(aretes[i], enUso),
    );
    for (const a of aretes[i]) {
      const clave = normalizarValor(a.valor).toUpperCase();
      if (vistos.has(clave)) motivos.push({ codigo: "identificador_repetido_en_animal", tipo: "arete", valor: normalizarValor(a.valor) });
      vistos.add(clave);
    }
  });
  rechazarSi([...new Map(motivos.map((m) => [JSON.stringify(m), m])).values()]);

  const cambios = new Cambios(contexto);
  const partoId = cambios.insertar("parto", {
    hembra_id: madre.id,
    evento_reproductivo_id: padre.servicioId,
    fecha: datos.fecha,
    numero_crias: fichas.length,
    observaciones: datos.observaciones?.trim() || null,
  });
  const criasIds = fichas.map((f, i) => {
    const id = prepararAnimalNuevo(cambios, {
      ...animalVacio(),
      nombre: f.nombre?.trim() || null,
      sexo: f.sexo,
      fechaNacimiento: f.fechaNacimiento,
      estado: f.estado,
      formaConcepcion: f.formaConcepcion,
      padreId: f.padreId,
      madreId: f.madreId,
      padreSinVerificar: f.padreSinVerificar,
      madreSinVerificar: false,
      libroId: null,
      identificadores: aretes[i],
      composicion,
    });
    if (f.pesoNacimiento !== null) {
      cambios.insertar("pesaje_corporal", { animal_id: id, fecha: f.fechaNacimiento, kilos: f.pesoNacimiento, tipo: "nacimiento" });
    }
    return id;
  });

  // SUPOSICION: si la madre tenía una lactancia abierta, se seca el día anterior al parto.
  const [abierta] = await conexion.consultar<{ id: string; fecha_inicio: string }>(
    "SELECT id, fecha_inicio FROM lactancia WHERE hembra_id = ? AND fecha_secado IS NULL AND eliminado_en IS NULL",
    [madre.id],
  );
  if (abierta) {
    const secado = sumarDias(datos.fecha, -1);
    cambios.actualizar("lactancia", abierta.id, { fecha_secado: null }, {
      fecha_secado: secado < abierta.fecha_inicio ? abierta.fecha_inicio : secado,
    });
  }
  const lactanciaId = cambios.insertar("lactancia", { hembra_id: madre.id, parto_id: partoId, fecha_inicio: datos.fecha });
  await cambios.aplicar(conexion);
  return { partoId, lactanciaId, criasIds, padreId: padre.padreId };
}

export interface Parto {
  id: string;
  hembraId: string;
  fecha: string;
  numeroCrias: number;
  observaciones: string | null;
  crias: { id: string; nombre: string | null; sexo: Sexo; estado: EstadoAnimal }[];
}

/** Historial reproductivo de una hembra: servicios, partos con sus crías e intervalos entre partos (R9). */
export async function historialReproductivo(conexion: Conexion, hembraId: string) {
  const servicios = await listarServicios(conexion, { hembraId });
  const partos = await conexion.consultar<Omit<Parto, "crias">>(
    `SELECT id, hembra_id AS hembraId, fecha, numero_crias AS numeroCrias, observaciones
     FROM parto WHERE hembra_id = ? AND eliminado_en IS NULL ORDER BY fecha`,
    [hembraId],
  );
  const conCrias: Parto[] = [];
  for (const p of partos) {
    const crias = await conexion.consultar<Parto["crias"][number]>(
      `SELECT id, nombre, sexo, estado FROM animal
       WHERE madre_id = ? AND fecha_nacimiento = ? AND eliminado_en IS NULL ORDER BY creado_en`,
      [hembraId, p.fecha],
    );
    conCrias.push({ ...p, crias });
  }
  const intervalos = intervalosEntrePartos(partos.map((p) => p.fecha));
  return { servicios, partos: conCrias, intervalos, intervaloPromedio: promedio(intervalos) };
}

export interface ResumenIntervalo {
  hembraId: string;
  hembra: string;
  partos: number;
  ultimoIntervalo: number;
  intervaloPromedio: number;
}

/** R9 para todo el hato: hembras con dos o más partos registrados. */
export async function resumenIntervalos(conexion: Conexion): Promise<ResumenIntervalo[]> {
  const filas = await conexion.consultar<{ hembraId: string; hembra: string; fechas: string }>(
    `SELECT p.hembra_id AS hembraId, coalesce(a.nombre, i.valor, '') AS hembra, group_concat(p.fecha) AS fechas
     FROM parto AS p
     JOIN animal AS a ON a.id = p.hembra_id
     LEFT JOIN identificador AS i ON i.animal_id = a.id AND i.principal = 1 AND i.eliminado_en IS NULL
     WHERE p.eliminado_en IS NULL AND a.eliminado_en IS NULL
     GROUP BY p.hembra_id HAVING count(*) >= 2
     ORDER BY hembra COLLATE NOCASE`,
  );
  return filas.map((f) => {
    const intervalos = intervalosEntrePartos(f.fechas.split(","));
    return {
      hembraId: f.hembraId,
      hembra: f.hembra,
      partos: intervalos.length + 1,
      ultimoIntervalo: intervalos[intervalos.length - 1],
      intervaloPromedio: promedio(intervalos)!,
    };
  });
}
