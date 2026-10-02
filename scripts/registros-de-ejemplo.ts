// Datos ficticios de la etapa 7 (especificación 2: R31): animales para probar el generador de registros genealógicos.
// Los 12 animales de las etapas anteriores ya sirven de ejemplo (casi todos cumplen todo, y las crías recién nacidas
// no tienen libro). Aquí se agregan cuatro más, con una variedad de requisitos pendientes. Solo para desarrollo.
// Ningún registro queda emitido: así se puede probar la emisión (sola y en lote) desde cero.
import type { Conexion, ContextoCambio } from "../src/datos/conexion";
import { animalVacio, guardarAnimal, listarAnimales, type DatosAnimal } from "../src/datos/repositorios/animales";
import { listarCatalogo } from "../src/datos/repositorios/catalogos";
import { listarLotes } from "../src/datos/repositorios/lotes";

const MARCA = "Dato de ejemplo (npm run semillas)";
export const ARETE_NUBE = "EJ-18";

/**
 * Agrega a Nube (lista para registrar) y a tres animales a los que les falta algo:
 *  - Perla: sin padre.
 *  - Chispa: sin ningún identificador (arete, tatuaje…).
 *  - Ciro: sin fecha de nacimiento y sin raza.
 * Si Nube ya está (por su arete), no hace nada. Devuelve si cargó algo.
 */
export async function cargarRegistrosDeEjemplo(conexion: Conexion, contexto: () => ContextoCambio): Promise<boolean> {
  if ((await listarAnimales(conexion, { texto: ARETE_NUBE })).length > 0) return false;
  const porArete = async (arete: string) => {
    const [a] = await listarAnimales(conexion, { texto: arete });
    if (!a) throw new Error(`Falta el animal de ejemplo ${arete}: cargue primero los datos de ejemplo.`);
    return a.id;
  };
  const razas = new Map((await listarCatalogo(conexion, "raza")).map((r) => [r.nombre, r.id]));
  const libros = new Map((await listarCatalogo(conexion, "libro")).map((l) => [l.nombre, l.id]));
  const levante = (await listarLotes(conexion)).find((l) => l.nombre === "Levante")?.id ?? null;
  const arete = (valor: string) => ({ tipo: "arete" as const, valor, fecha: null, vigente: true, principal: true });
  const base = (datos: Partial<DatosAnimal>): DatosAnimal => ({ ...animalVacio(), loteId: levante, observaciones: MARCA, formaConcepcion: "monta_natural", ...datos });

  const zeus = await porArete("EJ-01");
  const abril = await porArete("EJ-02");
  const brisa = await porArete("EJ-03");
  const cacique = await porArete("EJ-08");
  const dalia = await porArete("EJ-09");

  const nuevos: DatosAnimal[] = [
    base({
      nombre: "Nube",
      fechaNacimiento: "2023-03-15",
      colorSenas: "Blanca",
      libroId: libros.get("Pureza por pedigrí") ?? null,
      padreId: zeus,
      madreId: abril,
      identificadores: [arete(ARETE_NUBE)],
      composicion: [{ razaId: razas.get("Saanen")!, fraccion: 1 }],
    }),
    base({
      nombre: "Perla",
      fechaNacimiento: "2023-06-01",
      colorSenas: "Café con blanco",
      libroId: libros.get("Pureza por cruzamiento") ?? null,
      madreId: brisa,
      identificadores: [arete("EJ-19")],
      composicion: [{ razaId: razas.get("Alpina")!, fraccion: 1 }],
    }),
    base({
      nombre: "Chispa",
      fechaNacimiento: "2023-09-09",
      colorSenas: "Blanca con manchas",
      libroId: libros.get("Pureza por pedigrí") ?? null,
      padreId: zeus,
      madreId: abril,
      composicion: [{ razaId: razas.get("Saanen")!, fraccion: 1 }],
    }),
    base({
      nombre: "Ciro",
      sexo: "macho",
      colorSenas: "Gris",
      libroId: libros.get("Mestizo") ?? null,
      padreId: cacique,
      madreId: dalia,
      identificadores: [arete("EJ-20")],
    }),
  ];
  for (const datos of nuevos) await guardarAnimal(conexion, datos, contexto());
  return true;
}
