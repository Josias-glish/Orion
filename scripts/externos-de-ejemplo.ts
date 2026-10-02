// Datos ficticios de la etapa 6 (especificación 2): un semental de otra finca con su propietario, tres servicios
// (uno preñada con su parto, uno vacía y uno sin diagnóstico, con costo y condiciones) y la cría con padre externo.
// Solo para desarrollo. Los nombres son inventados.
import { sumarDias } from "../src/dominio/fechas";
import type { Conexion, ContextoCambio } from "../src/datos/conexion";
import { animalExternoVacio, guardarAnimal, listarAnimales, listarExternos, obtenerAnimal } from "../src/datos/repositorios/animales";
import { listarCatalogo } from "../src/datos/repositorios/catalogos";
import { contactoVacio, guardarContacto } from "../src/datos/repositorios/contactos";
import { secarLactancia } from "../src/datos/repositorios/leche";
import { listarLotes } from "../src/datos/repositorios/lotes";
import { diagnosticarServicio, registrarParto, registrarServicio } from "../src/datos/repositorios/reproduccion";

export const REGISTRO_TITAN = "EJEMPLO-EXT-01";
const MARCA = "Dato de ejemplo (npm run semillas)";

/** Carga el semental de otra finca y sus servicios. Si ya está (por su registro de asociación), no hace nada. */
export async function cargarExternosDeEjemplo(conexion: Conexion, contexto: () => ContextoCambio, hoy: string): Promise<boolean> {
  if ((await listarExternos(conexion, { texto: REGISTRO_TITAN })).length > 0) return false;
  const porArete = async (arete: string) => {
    const [a] = await listarAnimales(conexion, { texto: arete });
    if (!a) throw new Error(`Falta el animal de ejemplo ${arete}: cargue primero los datos de ejemplo.`);
    return a.id;
  };
  const razas = new Map((await listarCatalogo(conexion, "raza")).map((r) => [r.nombre, r.id]));
  const libros = new Map((await listarCatalogo(conexion, "libro")).map((l) => [l.nombre, l.id]));

  const propietario = await guardarContacto(
    conexion,
    { ...contactoVacio(), nombre: "Criador vecino (ejemplo)", criadero: "Hato El Roble (ejemplo)", notas: MARCA },
    contexto(),
  );
  const titan = await guardarAnimal(
    conexion,
    {
      ...animalExternoVacio(),
      nombre: "Titán",
      sexo: "macho",
      fechaNacimiento: "2018-04-20",
      colorSenas: "Café rojizo, orejas largas",
      contactoId: propietario,
      libroId: libros.get("Pureza por pedigrí") ?? null,
      observaciones: MARCA,
      identificadores: [{ tipo: "registro_asociacion", valor: REGISTRO_TITAN, fecha: null, vigente: true, principal: true }],
      composicion: [{ razaId: razas.get("Anglonubiana")!, fraccion: 1 }],
    },
    contexto(),
  );

  const monta = (hembra: string, fecha: string, acordado: { costo: number; condiciones: string } | null) =>
    registrarServicio(
      conexion,
      { hembraId: hembra, tipo: "monta", machoId: titan, pajilla: null, fecha, observaciones: MARCA, costo: acordado?.costo ?? null, condiciones: acordado?.condiciones ?? null },
      contexto(),
    );
  const acordado = { costo: 150000, condiciones: "Se paga al confirmar la preñez; repite gratis si queda vacía (ejemplo)" };

  // 1. Canela × Titán: preñada y parto con un macho (R30, CA-14). La lactancia ya terminó.
  const canela = await porArete("EJ-04");
  const s1 = await monta(canela, "2024-05-01", acordado);
  await diagnosticarServicio(conexion, s1, "prenada", "2024-06-15", contexto());
  const parto = await registrarParto(
    conexion,
    {
      hembraId: canela,
      fecha: "2024-09-28",
      crias: [{ sexo: "macho", nombre: "Roble", arete: "EJ-17", pesoNacimiento: 3.7, nacioMuerta: false }],
      observaciones: MARCA,
    },
    contexto(),
  );
  await secarLactancia(conexion, parto.lactanciaId, "2025-07-24", contexto());
  const roble = (await obtenerAnimal(conexion, parto.criasIds[0]))!;
  const machos = (await listarLotes(conexion)).find((l) => l.nombre === "Machos")?.id ?? null;
  await guardarAnimal(conexion, { ...roble, observaciones: MARCA, loteId: machos }, contexto(), roble.id);

  // 2. Brisa × Titán: vacía.
  const s2 = await monta(await porArete("EJ-03"), "2023-10-10", null);
  await diagnosticarServicio(conexion, s2, "vacia", "2023-11-25", contexto());

  // 3. Dalia × Titán: hace 5 días, sin diagnóstico todavía, con costo y condiciones.
  await monta(await porArete("EJ-09"), sumarDias(hoy, -5), acordado);
  return true;
}
