// Datos ficticios de la etapa 3 (sección 12): servicios, partos, lactancias con pesajes de leche, pesos corporales
// y metas por edad. Solo para desarrollo. Las fechas recientes se cuentan desde `hoy`.
import { sumarDias } from "../src/dominio/fechas";
import type { CriaAnotada } from "../src/dominio/reproduccion";
import { Cambios } from "../src/datos/cambios";
import type { Conexion, ContextoCambio } from "../src/datos/conexion";
import { guardarPesajeLeche } from "../src/datos/repositorios/leche";
import { guardarMeta, registrarPesaje } from "../src/datos/repositorios/pesos";
import { diagnosticarServicio, registrarParto, registrarServicio } from "../src/datos/repositorios/reproduccion";

/** Metas de peso de ejemplo (kilos por edad en meses). Son ilustrativas: cada finca anota las suyas. */
export const METAS_DE_EJEMPLO = {
  hembra: [
    [0, 3.5],
    [2, 12],
    [6, 22],
    [12, 32],
  ],
  macho: [
    [0, 4],
    [2, 14],
    [6, 27],
    [12, 40],
  ],
} as const;

/** Partos antiguos de los 12 animales de la etapa 2 (las crías ya existen; sus lactancias ya terminaron). */
const PARTOS_ANTIGUOS: { madre: string; fecha: string; crias: string[] }[] = [
  { madre: "EJ-02", fecha: "2019-02-10", crias: ["EJ-06", "EJ-07"] },
  { madre: "EJ-03", fecha: "2019-03-05", crias: ["EJ-08"] },
  { madre: "EJ-04", fecha: "2019-06-18", crias: ["EJ-09"] },
  { madre: "EJ-07", fecha: "2021-02-22", crias: ["EJ-10"] },
  { madre: "EJ-09", fecha: "2021-04-03", crias: ["EJ-11"] },
  { madre: "EJ-07", fecha: "2022-03-10", crias: ["EJ-12"] },
];

/** SUPOSICION (solo datos de ejemplo): las lactancias antiguas se secaron a los 300 días. */
const DIAS_LACTANCIAS_ANTIGUAS = 300;

/** Producción diaria de ejemplo: curva de Wood (a·d^b·e^(−c·d)) con el pico cerca del día 50 y algo de variación. */
export function lecheDeEjemplo(dia: number, escala: number): number {
  const wood = 1.956 * Math.pow(dia, 0.2) * Math.exp(-0.004 * dia);
  return escala * wood * (1 + 0.06 * Math.sin(dia * 1.7));
}

const redondear = (kilos: number) => Math.round(kilos * 10) / 10;

/**
 * Carga la parte reproductiva y devuelve los ids de las crías nacidas en los partos recientes.
 * `ids` relaciona cada arete de ejemplo con el id del animal.
 */
export async function cargarReproduccionDeEjemplo(
  conexion: Conexion,
  ids: Map<string, string>,
  contexto: () => ContextoCambio,
  hoy: string,
): Promise<string[]> {
  const id = (arete: string) => ids.get(arete)!;
  const atras = (dias: number) => sumarDias(hoy, -dias);

  // 1. Partos antiguos, con su lactancia ya secada. Se escriben directamente porque las crías ya existen.
  const antiguos = new Cambios(contexto());
  for (const p of PARTOS_ANTIGUOS) {
    const partoId = antiguos.insertar("parto", {
      hembra_id: id(p.madre),
      evento_reproductivo_id: null,
      fecha: p.fecha,
      numero_crias: p.crias.length,
      observaciones: "Parto de ejemplo",
    });
    antiguos.insertar("lactancia", {
      hembra_id: id(p.madre),
      parto_id: partoId,
      fecha_inicio: p.fecha,
      fecha_secado: sumarDias(p.fecha, DIAS_LACTANCIAS_ANTIGUAS - 1),
    });
  }
  await antiguos.aplicar(conexion);

  // 2. Servicios recientes con su diagnóstico (RF-18, RF-19, RF-21).
  const servicio = async (
    hembra: string,
    dias: number,
    datos: { macho?: string; pajilla?: string },
    diagnostico?: { resultado: "prenada" | "vacia" | "aborto"; dias: number },
  ) => {
    const servicioId = await registrarServicio(
      conexion,
      {
        hembraId: id(hembra),
        tipo: datos.pajilla ? "inseminacion" : "monta",
        machoId: datos.macho ? id(datos.macho) : null,
        pajilla: datos.pajilla ?? null,
        fecha: atras(dias),
        observaciones: null,
      },
      contexto(),
    );
    if (diagnostico) await diagnosticarServicio(conexion, servicioId, diagnostico.resultado, atras(diagnostico.dias), contexto());
  };
  await servicio("EJ-02", 350, { macho: "EJ-05" }, { resultado: "prenada", dias: 310 }); // Abril × Duque
  await servicio("EJ-07", 245, { macho: "EJ-05" }, { resultado: "prenada", dias: 200 }); // Bella × Duque
  await servicio("EJ-09", 190, { pajilla: "PAJILLA-EJEMPLO-01" }, { resultado: "prenada", dias: 150 }); // Dalia, donante sin registrar
  await servicio("EJ-10", 142, { macho: "EJ-05" }, { resultado: "prenada", dias: 100 }); // Estrella: parto próximo
  await servicio("EJ-04", 100, { macho: "EJ-05" }, { resultado: "aborto", dias: 55 }); // Canela: aborto
  await servicio("EJ-03", 60, { macho: "EJ-05" }, { resultado: "vacia", dias: 20 }); // Brisa: vacía
  await servicio("EJ-12", 25, { macho: "EJ-11" }); // Gema: sin diagnóstico todavía

  // 3. Partos recientes (Flujo 1): crean las fichas de las crías y abren la lactancia.
  const cria = (sexo: "hembra" | "macho", nombre: string, arete: string, peso: number): CriaAnotada => ({
    sexo,
    nombre,
    arete,
    pesoNacimiento: peso,
    nacioMuerta: false,
  });
  const recientes = [
    { madre: "EJ-02", dias: 200, crias: [cria("macho", "Rayo", "EJ-16", 3.8)], escala: 1 },
    { madre: "EJ-07", dias: 95, crias: [cria("hembra", "Luna", "EJ-13", 3.6), cria("macho", "Trueno", "EJ-14", 3.9)], escala: 1.15 },
    { madre: "EJ-09", dias: 40, crias: [cria("hembra", "Nieve", "EJ-15", 3.2)], escala: 0.85 },
  ];
  const criasIds: string[] = [];
  for (const r of recientes) {
    const parto = await registrarParto(
      conexion,
      { hembraId: id(r.madre), fecha: atras(r.dias), crias: r.crias, observaciones: "Parto de ejemplo" },
      contexto(),
    );
    r.crias.forEach((c, i) => ids.set(c.arete!, parto.criasIds[i]));
    criasIds.push(...parto.criasIds);

    // 4. Pesajes de leche de mañana y tarde desde el parto hasta ayer (hoy queda libre para probar el ordeño).
    for (let dia = 1; dia <= r.dias; dia++) {
      const total = lecheDeEjemplo(dia, r.escala);
      const fecha = sumarDias(atras(r.dias), dia - 1);
      await guardarPesajeLeche(conexion, { lactanciaId: parto.lactanciaId, fecha, jornada: "manana", kilos: redondear(total * 0.55) }, contexto());
      await guardarPesajeLeche(conexion, { lactanciaId: parto.lactanciaId, fecha, jornada: "tarde", kilos: redondear(total * 0.45) }, contexto());
    }
  }

  // 5. Pesos corporales (RF-30): destete a los 60 días y controles. Las crías recientes ya tienen su peso al nacer.
  const pesajes: [string, number, number, "nacimiento" | "destete" | "control"][] = [
    // [arete, días desde hoy, kilos, tipo]
    ["EJ-16", 170, 9.5, "control"],
    ["EJ-16", 140, 15.2, "destete"],
    ["EJ-16", 80, 22.8, "control"],
    ["EJ-16", 20, 29.5, "control"],
    ["EJ-13", 65, 8.4, "control"],
    ["EJ-13", 35, 12.6, "destete"],
    ["EJ-14", 65, 9.1, "control"],
    ["EJ-14", 35, 13.9, "destete"],
    ["EJ-15", 10, 6.1, "control"],
  ];
  for (const [arete, dias, kilos, tipo] of pesajes) {
    await registrarPesaje(conexion, { animalId: id(arete), fecha: atras(dias), kilos, tipo }, contexto());
  }
  // Los animales de la etapa 2 nacieron hace años: sus pesajes van en fechas fijas.
  const historicos: [string, string, number, "nacimiento" | "destete" | "control"][] = [
    ["EJ-10", "2021-02-22", 3.4, "nacimiento"],
    ["EJ-10", "2021-04-23", 12.1, "destete"],
    ["EJ-10", "2021-08-22", 21.5, "control"],
    ["EJ-10", "2022-02-22", 33.0, "control"],
    ["EJ-11", "2021-04-03", 3.9, "nacimiento"],
    ["EJ-11", "2021-06-02", 13.8, "destete"],
    ["EJ-11", "2021-10-03", 25.0, "control"],
    ["EJ-12", "2022-03-10", 3.1, "nacimiento"],
    ["EJ-12", "2022-05-09", 10.6, "destete"],
    ["EJ-12", "2022-09-10", 19.4, "control"],
  ];
  for (const [arete, fecha, kilos, tipo] of historicos) {
    await registrarPesaje(conexion, { animalId: id(arete), fecha, kilos, tipo }, contexto());
  }

  // 6. Metas por edad (RF-31).
  for (const sexo of ["hembra", "macho"] as const) {
    for (const [edadMeses, kilos] of METAS_DE_EJEMPLO[sexo]) await guardarMeta(conexion, { sexo, edadMeses, kilos }, contexto());
  }
  return criasIds;
}
