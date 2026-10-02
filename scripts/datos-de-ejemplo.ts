// Datos ficticios de ejemplo (sección 12): solo para desarrollo, nunca en el instalador.
// Etapa 2: genealogía. Etapa 3: servicios, partos, lactancias con pesajes, pesos corporales y metas.
// Etapa 4: tratamiento con retiro vigente, vacunas, desparasitación y condición corporal.
// Etapa 6: un semental de otra finca con su propietario, tres servicios y un parto con padre externo.
// Etapa 7: animales listos para registrar y otros a los que les falta algún requisito (registros genealógicos).
// Etapa 8: muestras de calidad de la leche e ingresos y gastos de ejemplo.
import { fechaLocal, marcaDeTiempo } from "../src/dominio/fechas";
import type { FormaConcepcion, Sexo } from "../src/dominio/tipos";
import { completarAsistente, consultarArranque } from "../src/datos/arranque";
import type { Conexion, ContextoCambio } from "../src/datos/conexion";
import { animalVacio, guardarAnimal, listarAnimales, obtenerAnimal } from "../src/datos/repositorios/animales";
import { listarCatalogo } from "../src/datos/repositorios/catalogos";
import { crearLote, listarLotes } from "../src/datos/repositorios/lotes";
import { cargarCalidadYFinanzasDeEjemplo } from "./calidad-y-finanzas-de-ejemplo";
import { cargarExternosDeEjemplo } from "./externos-de-ejemplo";
import { cargarRegistrosDeEjemplo } from "./registros-de-ejemplo";
import { cargarReproduccionDeEjemplo } from "./reproduccion-de-ejemplo";
import { cargarSaludDeEjemplo } from "./salud-de-ejemplo";

export const MARCA_EJEMPLO = "Dato de ejemplo (npm run semillas)";

interface Ficha {
  arete: string;
  nombre: string;
  sexo: Sexo;
  nacimiento: string;
  razas: Record<string, number>;
  libro: string;
  lote: string | null;
  padre?: string;
  madre?: string;
  padreSinVerificar?: boolean;
  forma?: FormaConcepcion;
  color: string;
  otros?: { tipo: "tatuaje" | "registro_asociacion"; valor: string }[];
}

/**
 * 12 animales en tres generaciones:
 *  - Fundadores: Zeus, Abril, Brisa, Canela y Duque.
 *  - Bruno y Bella son hermanos completos (Zeus × Abril); su hija Estrella tiene 25 % de consanguinidad.
 *  - Cacique (Zeus × Brisa) y Dalia (Zeus × Canela) son medios hermanos; su hijo Faro tiene 12,5 %.
 *  - Gema (Duque × Bella) no es consanguínea; su padre está marcado «sin verificar».
 * Los partos recientes de la etapa 3 agregan cuatro crías (EJ-13 a EJ-16): ver reproduccion-de-ejemplo.ts.
 */
export const FICHAS: Ficha[] = [
  { arete: "EJ-01", nombre: "Zeus", sexo: "macho", nacimiento: "2017-03-12", razas: { Saanen: 1 }, libro: "Fundadores", lote: "Machos", color: "Blanco", otros: [{ tipo: "registro_asociacion", valor: "EJEMPLO-0001" }] },
  { arete: "EJ-02", nombre: "Abril", sexo: "hembra", nacimiento: "2017-04-02", razas: { Saanen: 1 }, libro: "Fundadores", lote: "Ordeño", color: "Blanca" },
  { arete: "EJ-03", nombre: "Brisa", sexo: "hembra", nacimiento: "2017-05-20", razas: { Alpina: 1 }, libro: "Fundadores", lote: "Ordeño", color: "Café con negro" },
  { arete: "EJ-04", nombre: "Canela", sexo: "hembra", nacimiento: "2018-01-15", razas: { Alpina: 1 }, libro: "Fundadores", lote: "Ordeño", color: "Canela" },
  { arete: "EJ-05", nombre: "Duque", sexo: "macho", nacimiento: "2017-08-30", razas: { Toggenburg: 1 }, libro: "Fundadores", lote: "Machos", color: "Gris con franjas blancas" },
  { arete: "EJ-06", nombre: "Bruno", sexo: "macho", nacimiento: "2019-02-10", razas: { Saanen: 1 }, libro: "Pureza por pedigrí", lote: "Machos", padre: "EJ-01", madre: "EJ-02", forma: "monta_natural", color: "Blanco" },
  { arete: "EJ-07", nombre: "Bella", sexo: "hembra", nacimiento: "2019-02-10", razas: { Saanen: 1 }, libro: "Pureza por pedigrí", lote: "Ordeño", padre: "EJ-01", madre: "EJ-02", forma: "monta_natural", color: "Blanca", otros: [{ tipo: "tatuaje", valor: "T-1907" }] },
  { arete: "EJ-08", nombre: "Cacique", sexo: "macho", nacimiento: "2019-03-05", razas: { Saanen: 0.5, Alpina: 0.5 }, libro: "Mestizo", lote: "Machos", padre: "EJ-01", madre: "EJ-03", forma: "monta_natural", color: "Crema" },
  { arete: "EJ-09", nombre: "Dalia", sexo: "hembra", nacimiento: "2019-06-18", razas: { Saanen: 0.5, Alpina: 0.5 }, libro: "Mestizo", lote: "Ordeño", padre: "EJ-01", madre: "EJ-04", forma: "inseminacion_artificial", color: "Crema con manchas" },
  { arete: "EJ-10", nombre: "Estrella", sexo: "hembra", nacimiento: "2021-02-22", razas: { Saanen: 1 }, libro: "Pureza por pedigrí", lote: "Levante", padre: "EJ-06", madre: "EJ-07", forma: "monta_natural", color: "Blanca con estrella en la frente" },
  { arete: "EJ-11", nombre: "Faro", sexo: "macho", nacimiento: "2021-04-03", razas: { Saanen: 0.5, Alpina: 0.5 }, libro: "Mestizo", lote: "Levante", padre: "EJ-08", madre: "EJ-09", forma: "monta_natural", color: "Café claro" },
  { arete: "EJ-12", nombre: "Gema", sexo: "hembra", nacimiento: "2022-03-10", razas: { Toggenburg: 0.5, Saanen: 0.5 }, libro: "Mestizo", lote: "Levante", padre: "EJ-05", madre: "EJ-07", padreSinVerificar: true, forma: "monta_natural", color: "Gris claro" },
];

const LOTES = ["Ordeño", "Machos", "Levante"];

export interface ResultadoSemillas {
  /** Animales creados, contando las crías de los partos de ejemplo. */
  creados: number;
  yaCargados: boolean;
  creoFinca: boolean;
  /** Etapa 6: se cargó ahora el semental de otra finca (también en una base que ya tenía los demás datos). */
  externos: boolean;
  /** Etapa 7: se cargaron ahora los animales para probar los registros (también en una base que ya tenía los demás datos). */
  registros: boolean;
  /** Etapa 8: se cargaron ahora las muestras de calidad y los movimientos de ejemplo (también en una base que ya tenía los demás datos). */
  finanzas: boolean;
}

/**
 * Carga los datos de ejemplo. Si ya están (arete EJ-01 vigente), no hace nada.
 * Las fechas de la reproducción y la leche se cuentan hacia atrás desde `hoy`, para que siempre haya
 * lactancias en curso y un parto próximo.
 */
export async function cargarDatosDeEjemplo(conexion: Conexion, hoy = fechaLocal()): Promise<ResultadoSemillas> {
  if ((await listarAnimales(conexion, { texto: "EJ-01", incluirSoloGenealogia: true })).length > 0) {
    const { contexto } = await asegurarFinca(conexion);
    const externos = await cargarExternosDeEjemplo(conexion, contexto, hoy);
    const registros = await cargarRegistrosDeEjemplo(conexion, contexto);
    return { creados: 0, yaCargados: true, creoFinca: false, externos, registros, finanzas: await cargarCalidadYFinanzasDeEjemplo(conexion, contexto, hoy) };
  }
  const { contexto, creoFinca } = await asegurarFinca(conexion);

  const razas = new Map((await listarCatalogo(conexion, "raza")).map((r) => [r.nombre, r.id]));
  const libros = new Map((await listarCatalogo(conexion, "libro")).map((l) => [l.nombre, l.id]));
  const lotes = new Map((await listarLotes(conexion)).map((l) => [l.nombre, l.id]));
  for (const nombre of LOTES) {
    if (!lotes.has(nombre)) lotes.set(nombre, await crearLote(conexion, { nombre, descripcion: "Lote de ejemplo" }, contexto()));
  }

  const ids = new Map<string, string>();
  for (const f of FICHAS) {
    const id = await guardarAnimal(
      conexion,
      {
        ...animalVacio(),
        nombre: f.nombre,
        sexo: f.sexo,
        fechaNacimiento: f.nacimiento,
        colorSenas: f.color,
        libroId: libros.get(f.libro) ?? null,
        loteId: f.lote ? lotes.get(f.lote)! : null,
        formaConcepcion: f.forma ?? null,
        padreId: f.padre ? ids.get(f.padre)! : null,
        madreId: f.madre ? ids.get(f.madre)! : null,
        padreSinVerificar: f.padreSinVerificar ?? false,
        observaciones: MARCA_EJEMPLO,
        identificadores: [
          { tipo: "arete", valor: f.arete, fecha: f.nacimiento, vigente: true, principal: true },
          ...(f.otros ?? []).map((o) => ({ ...o, fecha: null, vigente: true, principal: false })),
        ],
        composicion: Object.entries(f.razas).map(([raza, fraccion]) => ({ razaId: razas.get(raza)!, fraccion })),
      },
      contexto(),
    );
    ids.set(f.arete, id);
  }

  const crias = await cargarReproduccionDeEjemplo(conexion, ids, contexto, hoy);
  // Las crías nacen sin libro (R5); se rotulan como ejemplo y van al lote de levante.
  for (const id of crias) {
    const cria = (await obtenerAnimal(conexion, id))!;
    await guardarAnimal(conexion, { ...cria, observaciones: MARCA_EJEMPLO, loteId: lotes.get("Levante")! }, contexto(), id);
  }
  await cargarSaludDeEjemplo(conexion, ids, contexto, hoy);
  const externos = await cargarExternosDeEjemplo(conexion, contexto, hoy);
  const registros = await cargarRegistrosDeEjemplo(conexion, contexto);
  const finanzas = await cargarCalidadYFinanzasDeEjemplo(conexion, contexto, hoy);
  return { creados: FICHAS.length + crias.length, yaCargados: false, creoFinca, externos, registros, finanzas };
}

/** Crea la finca y el propietario de ejemplo si el asistente no se ha completado. */
export async function asegurarFinca(conexion: Conexion): Promise<{ contexto: () => ContextoCambio; creoFinca: boolean }> {
  let arranque = await consultarArranque(conexion);
  const creoFinca = arranque.necesitaAsistente;
  if (creoFinca) {
    await completarAsistente(
      conexion,
      arranque.finca
        ? null
        : {
            nombre: "Aprisco de ejemplo",
            criadero: "Criadero de ejemplo",
            municipio: null,
            registroSanitarioPredio: null,
            diasGestacion: 150,
            diasLactancia: 305,
            margenGestacion: 10,
          },
      { nombre: "Propietario de ejemplo", contacto: null },
      null,
    );
    arranque = await consultarArranque(conexion);
  }
  const propietario = arranque.usuarios.find((u) => u.rol === "propietario")!;
  const contexto = (): ContextoCambio => ({ usuarioId: propietario.id, rol: "propietario", marcaTiempo: marcaDeTiempo() });
  return { contexto, creoFinca };
}
