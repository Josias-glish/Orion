// Datos de prueba para medir el rendimiento (CA-09): 500 animales con lactancias y pesajes de leche.
// Solo para desarrollo, como los datos de ejemplo. Se escriben por lotes (sin pasar por las pantallas)
// para que la carga sea rápida, pero cada fila queda en historial_cambios como cualquier otro cambio.
import { sumarDias } from "../src/dominio/fechas";
import { Cambios } from "../src/datos/cambios";
import type { Conexion, ContextoCambio } from "../src/datos/conexion";
import { animalVacio, listarAnimales, prepararAnimalNuevo } from "../src/datos/repositorios/animales";
import { guardarPesajeLeche, listarOrdeno } from "../src/datos/repositorios/leche";
import { listarCatalogo } from "../src/datos/repositorios/catalogos";
import { asegurarFinca } from "./datos-de-ejemplo";
import { lecheDeEjemplo } from "./reproduccion-de-ejemplo";

export const MARCA_RENDIMIENTO = "Dato de prueba de rendimiento (npm run semillas -- --rendimiento)";
export const PREFIJO_RENDIMIENTO = "PR-";

/** Reparto de los 500: 20 machos, 250 hembras adultas y 230 crías (una por cada hembra en lactancia). */
const MACHOS = 20;
const HEMBRAS = 250;
const EN_LACTANCIA = 230;
export const TOTAL_RENDIMIENTO = MACHOS + HEMBRAS + EN_LACTANCIA;

export interface ResultadoRendimiento {
  yaCargados: boolean;
  animales: number;
  lactancias: number;
  pesajesLeche: number;
}

/** Números pseudoaleatorios repetibles (mulberry32): la misma semilla da siempre los mismos datos. */
function generador(semilla: number): () => number {
  let a = semilla;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const arete = (n: number) => `${PREFIJO_RENDIMIENTO}${String(n).padStart(4, "0")}`;

export async function cargarDatosDeRendimiento(conexion: Conexion, hoy: string): Promise<ResultadoRendimiento> {
  if ((await listarAnimales(conexion, { texto: arete(1), incluirSoloGenealogia: true })).length > 0) {
    return { yaCargados: true, animales: 0, lactancias: 0, pesajesLeche: 0 };
  }
  const { contexto } = await asegurarFinca(conexion);
  const azar = generador(500);
  const razas = (await listarCatalogo(conexion, "raza")).map((r) => r.id);
  const raza = (i: number) => [{ razaId: razas[i % razas.length], fraccion: 1 }];
  const fechaEntre = (desde: string, dias: number) => sumarDias(desde, Math.floor(azar() * dias));
  const animal = (n: number, datos: Partial<ReturnType<typeof animalVacio>>) => ({
    ...animalVacio(),
    observaciones: MARCA_RENDIMIENTO,
    identificadores: [{ tipo: "arete" as const, valor: arete(n), fecha: null, vigente: true, principal: true }],
    ...datos,
  });

  // Machos y hembras adultos.
  const adultos = new Cambios(contexto());
  const machos: string[] = [];
  const hembras: { id: string; raza: number }[] = [];
  for (let n = 1; n <= MACHOS + HEMBRAS; n++) {
    const esMacho = n <= MACHOS;
    const id = prepararAnimalNuevo(
      adultos,
      animal(n, {
        nombre: `${esMacho ? "Macho" : "Hembra"} de prueba ${n}`,
        sexo: esMacho ? "macho" : "hembra",
        fechaNacimiento: fechaEntre("2018-01-01", 4 * 365),
        composicion: raza(n),
      }),
    );
    if (esMacho) machos.push(id);
    else hembras.push({ id, raza: n });
  }
  await adultos.aplicar(conexion);

  // Una cría y una lactancia abierta por cada una de las primeras 230 hembras, con pesajes de mañana y tarde hasta ayer.
  let pesajesLeche = 0;
  for (let k = 0; k < EN_LACTANCIA; k++) {
    const madre = hembras[k];
    const diasEnLactancia = 10 + Math.floor(azar() * 190);
    const fechaParto = sumarDias(hoy, -diasEnLactancia);
    const cambios = new Cambios(contexto());
    const partoId = cambios.insertar("parto", {
      hembra_id: madre.id,
      evento_reproductivo_id: null,
      fecha: fechaParto,
      numero_crias: 1,
      observaciones: MARCA_RENDIMIENTO,
    });
    const n = MACHOS + HEMBRAS + k + 1;
    prepararAnimalNuevo(
      cambios,
      animal(n, {
        nombre: `Cría de prueba ${n}`,
        sexo: azar() < 0.5 ? "hembra" : "macho",
        fechaNacimiento: fechaParto,
        madreId: madre.id,
        padreId: machos[k % MACHOS],
        formaConcepcion: "monta_natural",
        composicion: raza(madre.raza),
      }),
    );
    const lactanciaId = cambios.insertar("lactancia", { hembra_id: madre.id, parto_id: partoId, fecha_inicio: fechaParto });
    const escala = 0.7 + azar() * 0.6;
    for (let dia = 1; dia < diasEnLactancia + 1; dia++) {
      const fecha = sumarDias(fechaParto, dia - 1);
      if (fecha >= hoy) break;
      const total = lecheDeEjemplo(dia, escala);
      for (const [jornada, parte] of [["manana", 0.55], ["tarde", 0.45]] as const) {
        cambios.insertar("pesaje_leche", { lactancia_id: lactanciaId, fecha, jornada, kilos: Math.round(total * parte * 10) / 10 });
        pesajesLeche++;
      }
    }
    await cambios.aplicar(conexion);
  }
  return { yaCargados: false, animales: TOTAL_RENDIMIENTO, lactancias: EN_LACTANCIA, pesajesLeche };
}

/** Tiempos de las operaciones del ordeño con los datos cargados (CA-09). */
export interface MedicionOrdeno {
  listarMs: number;
  guardarNuevoMs: number;
  corregirMs: number;
}

/**
 * Mide, como lo haría la pantalla de ordeño: cargar la lista de la jornada de `hoy`, guardar el pesaje de la
 * primera cabra (nuevo) y volver a guardarlo con otro valor (corrección). Devuelve los milisegundos de cada paso.
 */
export async function medirOrdeno(conexion: Conexion, hoy: string, contexto: ContextoCambio): Promise<MedicionOrdeno> {
  const t0 = performance.now();
  const lista = await listarOrdeno(conexion, hoy, "tarde");
  const t1 = performance.now();
  const fila = lista.find((f) => f.kilos === null) ?? lista[0];
  await guardarPesajeLeche(conexion, { lactanciaId: fila.lactanciaId, fecha: hoy, jornada: "tarde", kilos: 2.4 }, contexto);
  const t2 = performance.now();
  await guardarPesajeLeche(conexion, { lactanciaId: fila.lactanciaId, fecha: hoy, jornada: "tarde", kilos: 2.5 }, contexto);
  const t3 = performance.now();
  return { listarMs: t1 - t0, guardarNuevoMs: t2 - t1, corregirMs: t3 - t2 };
}
