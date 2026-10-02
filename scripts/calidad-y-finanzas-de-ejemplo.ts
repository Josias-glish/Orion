// Datos ficticios de la etapa 8 (especificación 2: R18, R19 y R30): muestras de calidad de la leche y movimientos
// económicos. Solo para desarrollo. Todo se rotula «(ejemplo)».
//
// Calidad (R18): cinco muestras semanales de la jornada de la mañana en cada lactancia en curso. Abril tiene las
// células somáticas más altas, Bella las más bajas y Dalia tiene datos vacíos a propósito (los vacíos no cuentan).
// Promedios que se pueden comprobar a mano:
//   Abril: grasa 3,14 %, proteína 2,98 %, células 904.000 (5 muestras de cada una)
//   Bella: grasa 3,94 %, proteína 3,28 %, células 388.000 (5 muestras de cada una)
//   Dalia: grasa 3,5 % (3 muestras), proteína 3,05 % (2 muestras), células 570.000 (3 muestras)
//
// Finanzas (R19), «Todo el tiempo»: ingresos $ 3.400.000; gastos $ 3.910.000 (generales $ 2.700.000, de lotes
// $ 940.000, de animales $ 270.000); rentabilidad −$ 510.000. La monta de Canela con Titán (R30) ya tiene su gasto; la
// de Dalia (hace 5 días) tiene costo pero no gasto, para probar el ofrecimiento desde la ficha del semental.
import { sumarDias } from "../src/dominio/fechas";
import type { Conexion, ContextoCambio } from "../src/datos/conexion";
import { listarAnimales, listarExternos } from "../src/datos/repositorios/animales";
import { crearGastoDeServicio, listarCategorias, registrarMovimiento } from "../src/datos/repositorios/finanzas";
import { guardarPesajeLeche, listarOrdeno } from "../src/datos/repositorios/leche";
import { listarLotes } from "../src/datos/repositorios/lotes";
import { serviciosComoMacho } from "../src/datos/repositorios/reproduccion";
import { CATEGORIA_MONTAS_ID } from "../src/dominio/finanzas";
import { REGISTRO_TITAN } from "./externos-de-ejemplo";

const EJEMPLO = "(ejemplo)";

type Serie = (number | null)[];
/** Días atrás de cada muestra y valores de cada cabra: grasa %, proteína % y células somáticas por ml. */
const DIAS_DE_MUESTRA = [1, 8, 15, 22, 29];
const MUESTRAS: Record<string, { grasa: Serie; proteina: Serie; celulas: Serie }> = {
  Abril: { grasa: [3.1, 3.2, 3.0, 3.3, 3.1], proteina: [2.9, 3.0, 2.9, 3.0, 3.1], celulas: [850000, 920000, 780000, 1100000, 870000] },
  Bella: { grasa: [3.9, 4.0, 3.8, 4.1, 3.9], proteina: [3.2, 3.3, 3.2, 3.4, 3.3], celulas: [340000, 410000, 380000, 450000, 360000] },
  Dalia: { grasa: [3.5, null, 3.6, null, 3.4], proteina: [null, 3.1, null, null, 3.0], celulas: [520000, 610000, null, 580000, null] },
};

/** Anota las muestras de calidad en los pesajes de la mañana. Devuelve si cargó algo. */
async function cargarCalidad(conexion: Conexion, contexto: () => ContextoCambio, hoy: string): Promise<boolean> {
  const [{ n }] = await conexion.consultar<{ n: number }>("SELECT count(*) AS n FROM pesaje_leche WHERE celulas_somaticas IS NOT NULL OR grasa_pct IS NOT NULL");
  if (n > 0) return false;
  for (const [i, dias] of DIAS_DE_MUESTRA.entries()) {
    const fecha = sumarDias(hoy, -dias);
    const ordeno = await listarOrdeno(conexion, fecha, "manana");
    for (const fila of ordeno) {
      const muestra = MUESTRAS[fila.nombre ?? ""];
      if (!muestra || fila.kilos === null) continue;
      await guardarPesajeLeche(
        conexion,
        {
          lactanciaId: fila.lactanciaId,
          fecha,
          jornada: "manana",
          kilos: fila.kilos,
          grasaPct: muestra.grasa[i],
          proteinaPct: muestra.proteina[i],
          celulasSomaticas: muestra.celulas[i],
        },
        contexto(),
      );
    }
  }
  return true;
}

/** Anota los ingresos y gastos de ejemplo. Devuelve si cargó algo. */
async function cargarMovimientos(conexion: Conexion, contexto: () => ContextoCambio, hoy: string): Promise<boolean> {
  const [{ n }] = await conexion.consultar<{ n: number }>("SELECT count(*) AS n FROM movimiento_economico WHERE descripcion LIKE ?", [`%${EJEMPLO}%`]);
  if (n > 0) return false;
  const categorias = new Map((await listarCategorias(conexion)).map((c) => [c.nombre, c.id]));
  const lotes = new Map((await listarLotes(conexion)).map((l) => [l.nombre, l.id]));
  const bella = (await listarAnimales(conexion, { texto: "EJ-07" }))[0].id;
  const anotar = (tipo: "gasto" | "ingreso", categoria: string, dias: number, valor: number, descripcion: string, asignado: { animalId?: string; lote?: string } = {}) =>
    registrarMovimiento(
      conexion,
      {
        fecha: sumarDias(hoy, -dias),
        tipo,
        categoriaId: categorias.get(categoria)!,
        valor,
        animalId: asignado.animalId ?? null,
        loteId: asignado.lote ? lotes.get(asignado.lote)! : null,
        descripcion: `${descripcion} ${EJEMPLO}`,
      },
      contexto(),
    );
  await anotar("gasto", "Alimento", 45, 1_200_000, "Concentrado y forraje del mes");
  await anotar("gasto", "Alimento", 30, 850_000, "Heno para el lote de ordeño", { lote: "Ordeño" });
  await anotar("gasto", "Medicamentos", 20, 120_000, "Antibiótico de Bella", { animalId: bella });
  await anotar("gasto", "Mano de obra", 15, 1_500_000, "Jornales del mes");
  await anotar("gasto", "Medicamentos", 10, 90_000, "Desparasitante del lote de levante", { lote: "Levante" });
  await anotar("ingreso", "Venta de leche", 5, 2_300_000, "Venta de leche de la quincena");
  await anotar("ingreso", "Venta de leche", 3, 1_100_000, "Leche del lote de ordeño", { lote: "Ordeño" });

  // R30: el gasto de la monta de Canela con Titán (ya con diagnóstico). La de Dalia queda sin gasto.
  const [titan] = await listarExternos(conexion, { texto: REGISTRO_TITAN });
  if (titan) {
    const { servicios } = await serviciosComoMacho(conexion, titan.id);
    const deCanela = servicios.find((s) => s.hembra === "Canela" && s.costo);
    if (deCanela) await crearGastoDeServicio(conexion, deCanela.id, CATEGORIA_MONTAS_ID, `Monta de Canela con Titán ${EJEMPLO}`, contexto());
  }
  return true;
}

/** Carga la calidad y los movimientos de ejemplo. Si ya están, no hace nada. Devuelve si cargó algo. */
export async function cargarCalidadYFinanzasDeEjemplo(conexion: Conexion, contexto: () => ContextoCambio, hoy: string): Promise<boolean> {
  const calidad = await cargarCalidad(conexion, contexto, hoy);
  const movimientos = await cargarMovimientos(conexion, contexto, hoy);
  return calidad || movimientos;
}
