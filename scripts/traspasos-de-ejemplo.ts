// Datos ficticios de la etapa 9 (especificación 2: R20, R32): una compra y una venta. Solo para desarrollo (los carga
// `npm run semillas`; no entran en `cargarDatosDeEjemplo`, así los datos de las etapas anteriores quedan como estaban).
// Los nombres son inventados y las dos quedan sin gasto ni ingreso en Finanzas, para probar el ofrecimiento desde el
// historial («Anotar el gasto» y «Anotar el ingreso»).
//
//  - Compra: Aurora (Saanen, nacida hace 14 meses), comprada hace 40 días a «Hato La Esperanza (ejemplo)» por $ 1.800.000.
//    Trae su registro de asociación (EJEMPLO-0401) y su padre, «Rey de La Esperanza», cargado como animal de otra finca.
//  - Venta: Cacique (EJ-08) vendido hace 10 días a «Finca Los Alpes (ejemplo)» por $ 900.000. Conserva su genealogía:
//    sigue siendo el padre de Faro.
import { sumarDias } from "../src/dominio/fechas";
import type { Conexion, ContextoCambio } from "../src/datos/conexion";
import { animalExternoVacio, animalVacio, listarAnimales } from "../src/datos/repositorios/animales";
import { listarCatalogo } from "../src/datos/repositorios/catalogos";
import { contactoVacio, guardarContacto } from "../src/datos/repositorios/contactos";
import { listarTraspasos, registrarCompra, registrarVenta } from "../src/datos/repositorios/traspasos";

const MARCA = "Dato de ejemplo (npm run semillas)";
export const REGISTRO_AURORA = "EJEMPLO-0401";

/** Carga una compra y una venta de ejemplo. Si ya hay traspasos, no hace nada. Devuelve si cargó algo. */
export async function cargarTraspasosDeEjemplo(conexion: Conexion, contexto: () => ContextoCambio, hoy: string): Promise<boolean> {
  if ((await listarTraspasos(conexion)).length > 0) return false;
  const [cacique] = await listarAnimales(conexion, { texto: "EJ-08" });
  if (!cacique) throw new Error("Falta el animal de ejemplo EJ-08: cargue primero los datos de ejemplo.");
  const razas = new Map((await listarCatalogo(conexion, "raza")).map((r) => [r.nombre, r.id]));
  const libros = new Map((await listarCatalogo(conexion, "libro")).map((l) => [l.nombre, l.id]));

  const vendedor = await guardarContacto(
    conexion,
    { ...contactoVacio(), nombre: "Criadora de ejemplo", criadero: "Hato La Esperanza (ejemplo)", municipio: "Marinilla", notas: MARCA },
    contexto(),
  );
  const comprador = await guardarContacto(
    conexion,
    { ...contactoVacio(), nombre: "Comprador de ejemplo", criadero: "Finca Los Alpes (ejemplo)", municipio: "Sonsón", notas: MARCA },
    contexto(),
  );

  await registrarCompra(
    conexion,
    {
      animalId: null,
      nuevo: {
        ...animalVacio(),
        nombre: "Aurora",
        sexo: "hembra",
        fechaNacimiento: sumarDias(hoy, -14 * 30),
        colorSenas: "Blanca con una mancha café en la oreja",
        libroId: libros.get("Pureza por pedigrí") ?? null,
        observaciones: MARCA,
        identificadores: [{ tipo: "arete", valor: "EJ-40", fecha: null, vigente: true, principal: true }],
        composicion: [{ razaId: razas.get("Saanen")!, fraccion: 1 }],
      },
      padreNuevo: {
        ...animalExternoVacio(),
        nombre: "Rey de La Esperanza",
        sexo: "macho",
        fechaNacimiento: sumarDias(hoy, -5 * 365),
        contactoId: vendedor,
        observaciones: MARCA,
        identificadores: [{ tipo: "registro_asociacion", valor: "EJEMPLO-EXT-05", fecha: null, vigente: true, principal: true }],
        composicion: [{ razaId: razas.get("Saanen")!, fraccion: 1 }],
      },
      madreNuevo: null,
      vendedorId: vendedor,
      fechaIngreso: sumarDias(hoy, -40),
      precio: 1_800_000,
      registroAsociacion: REGISTRO_AURORA,
      adjuntos: [],
      observaciones: "Se compró con el certificado del criador anterior (ejemplo).",
      loteId: null,
      crearGasto: false,
    },
    contexto(),
    hoy,
  );

  await registrarVenta(
    conexion,
    { animalId: cacique.id, compradorId: comprador, fecha: sumarDias(hoy, -10), precio: 900_000, observaciones: "Vendido como reproductor (ejemplo).", crearIngreso: false },
    contexto(),
    hoy,
  );
  return true;
}
