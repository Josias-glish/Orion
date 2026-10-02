// Etapa 9 (especificación 2): RF-50, RF-16 y RF-36 con la base de datos. CA-23 (compra, R32), CA-24 (venta, R20) y
// CA-25 (hoja de venta, R21: los datos), más R23 (el operario no ve compras, ventas ni finanzas).
// Escritas antes del código, con los datos de ejemplo.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cargarDatosDeEjemplo } from "../../../scripts/datos-de-ejemplo";
import { armarHojaVenta } from "../../dominio/hoja-venta";
import { armarInventario } from "../../dominio/inventario";
import { puede } from "../../dominio/permisos";
import { CATEGORIA_COMPRA_ANIMALES_ID, CATEGORIA_VENTA_ANIMALES_ID } from "../../dominio/traspasos";
import { OPERARIO, PROPIETARIO } from "../ayudas-pruebas";
import { crearBaseDePrueba, type ConexionMemoria } from "../conexion-memoria";
import { ErrorDeRegistro } from "../errores";
import { animalExternoVacio, animalVacio, contarAnimales, guardarAnimal, listarAnimales, listarExternos, obtenerAnimal } from "./animales";
import { guardarContacto, contactoVacio, retirarContacto } from "./contactos";
import { listarMovimientos, resumenFinanciero } from "./finanzas";
import { listarOrdeno } from "./leche";
import { consultarDescendientes } from "./genealogia";
import { emitirRegistro, registroVigenteDe } from "./registros";
import {
  crearMovimientoDeTraspaso,
  datosHojaVenta,
  datosInventario,
  listarTraspasos,
  registrarCompra,
  registrarVenta,
  traspasosDeAnimal,
  type DatosCompra,
  type DatosVenta,
} from "./traspasos";

const ADJUNTO = "documentos/adjunto-1b2c3d4e-0000-4000-8000-123456789abc.pdf";
const ADJUNTO_IMAGEN = "documentos/adjunto-1b2c3d4e-0000-4000-8000-123456789abd.jpg";

let db: ConexionMemoria;
let vendedor: string;
let comprador: string;
beforeEach(async () => {
  db = crearBaseDePrueba();
  await cargarDatosDeEjemplo(db, "2026-09-15");
  vendedor = await guardarContacto(db, { ...contactoVacio(), nombre: "Marta Vendedora", criadero: "Hato La Esperanza" }, PROPIETARIO);
  comprador = await guardarContacto(db, { ...contactoVacio(), nombre: "Pedro Comprador", municipio: "Rionegro" }, PROPIETARIO);
});
afterEach(() => db.cerrar());

const id = async (arete: string) => (await listarAnimales(db, { texto: arete, incluirSoloGenealogia: true }))[0].id;
const fallo = async (accion: Promise<unknown>) => {
  try {
    await accion;
  } catch (e) {
    if (e instanceof ErrorDeRegistro) return e.motivos;
    throw e;
  }
  throw new Error("Debía fallar y no falló");
};
const registroAsociacion = (valor: string) => ({ tipo: "registro_asociacion" as const, valor, fecha: null, vigente: true, principal: true });

/** Un animal de otra finca (R29), con su propietario y, si se indica, padre y madre. */
async function crearExterno(nombre: string, extra: Partial<Parameters<typeof guardarAnimal>[1]> = {}) {
  return guardarAnimal(
    db,
    { ...animalExternoVacio(), nombre, sexo: "hembra", fechaNacimiento: "2023-04-01", contactoId: vendedor, ...extra },
    PROPIETARIO,
  );
}

const compra = (cambios: Partial<DatosCompra> = {}): DatosCompra => ({
  animalId: null,
  nuevo: null,
  padreNuevo: null,
  madreNuevo: null,
  vendedorId: vendedor,
  fechaIngreso: "2026-09-20",
  precio: 1_500_000,
  registroAsociacion: null,
  adjuntos: [],
  observaciones: null,
  loteId: null,
  crearGasto: false,
  ...cambios,
});
const venta = (animalId: string, cambios: Partial<DatosVenta> = {}): DatosVenta => ({
  animalId,
  compradorId: comprador,
  fecha: "2026-09-30",
  precio: 900_000,
  observaciones: null,
  crearIngreso: false,
  ...cambios,
});

describe("CA-23 (R32): comprar un animal que ya existe como externo", () => {
  it("lo promueve a comprado conservando su id y su genealogía, y desde la fecha de ingreso cuenta en el inventario", async () => {
    const titan = await crearExterno("Titán", { sexo: "macho", fechaNacimiento: "2019-05-10" });
    const zeus = await id("EJ-01");
    const abril = await id("EJ-02");
    const lucero = await crearExterno("Lucero", { padreId: titan, madreId: abril, fechaNacimiento: "2024-02-02" });
    // Lucero tiene una cría en la finca: su genealogía hacia abajo también se conserva.
    const cria = await crearExterno("Cría de Lucero", { padreId: zeus, madreId: lucero, fechaNacimiento: "2025-06-01", sexo: "hembra" });
    expect((await listarExternos(db)).map((e) => e.nombre)).toContain("Lucero");
    const antes = await contarAnimales(db);

    const resultado = await registrarCompra(db, compra({ animalId: lucero, registroAsociacion: "ASOC-0042", adjuntos: [ADJUNTO, ADJUNTO_IMAGEN] }), PROPIETARIO);

    expect(resultado.animalId).toBe(lucero); // el mismo id: no se crea otro animal
    const a = (await obtenerAnimal(db, lucero))!;
    expect(a).toMatchObject({ origen: "comprado", enHato: true, estado: "activo", contactoId: vendedor, fechaIngreso: "2026-09-20" });
    expect([a.padre?.nombre, a.madre?.nombre]).toEqual(["Titán", "Abril"]);
    expect(a.identificadores.map((i) => [i.tipo, i.valor, i.principal])).toEqual([["registro_asociacion", "ASOC-0042", true]]);
    expect([...(await consultarDescendientes(db, lucero))]).toEqual([cria]);
    // Ya no figura entre los de otras fincas y sí en el inventario del hato.
    expect((await listarExternos(db)).map((e) => e.nombre)).not.toContain("Lucero");
    expect((await listarAnimales(db)).map((x) => x.nombre)).toContain("Lucero");
    expect((await contarAnimales(db)).total).toBe(antes.total + 1);
    const inventario = await datosInventario(db, "2026-09-20");
    expect(inventario.filas.map((f) => f.nombre)).toContain("Lucero");
    const antesDelIngreso = (await datosInventario(db, "2026-09-19")).filas.find((f) => f.nombre === "Lucero");
    expect(antesDelIngreso, JSON.stringify(antesDelIngreso)).toBeUndefined();
  });

  it("guarda vendedor, fecha, precio y adjuntos en el traspaso, y el cambio queda en el historial", async () => {
    const lucero = await crearExterno("Lucero");
    const { traspasoId } = await registrarCompra(db, compra({ animalId: lucero, observaciones: "Entregada con carnet", adjuntos: [ADJUNTO] }), PROPIETARIO);
    const [t] = await listarTraspasos(db);
    expect(t).toMatchObject({
      id: traspasoId,
      tipo: "compra",
      fecha: "2026-09-20",
      precio: 1_500_000,
      contactoId: vendedor,
      contacto: "Marta Vendedora · Hato La Esperanza",
      animalId: lucero,
      animal: "Lucero",
      observaciones: "Entregada con carnet",
      adjuntos: [ADJUNTO],
      movimientoId: null,
    });
    const cambios = await db.consultar<{ campo: string; valor_anterior: string | null; valor_nuevo: string | null }>(
      "SELECT campo, valor_anterior, valor_nuevo FROM historial_cambios WHERE entidad = 'animal' AND registro_id = ? AND campo IN ('origen', 'en_hato')",
      [lucero],
    );
    expect(cambios).toEqual(
      expect.arrayContaining([
        { campo: "origen", valor_anterior: "externo", valor_nuevo: "comprado" },
        { campo: "en_hato", valor_anterior: "0", valor_nuevo: "1" },
      ]),
    );
    expect((await traspasosDeAnimal(db, lucero)).map((x) => x.id)).toEqual([traspasoId]);
  });

  it("ofrece crear el gasto: si se acepta, queda en Finanzas como «Compra de animales» asignado al animal y enlazado", async () => {
    const lucero = await crearExterno("Lucero");
    const { movimientoId } = await registrarCompra(db, compra({ animalId: lucero, crearGasto: true }), PROPIETARIO);
    expect(movimientoId).not.toBeNull();
    const m = (await listarMovimientos(db, { categoriaId: CATEGORIA_COMPRA_ANIMALES_ID }))[0];
    expect(m).toMatchObject({ id: movimientoId, tipo: "gasto", categoriaId: CATEGORIA_COMPRA_ANIMALES_ID, categoria: "Compra de animales", valor: 1_500_000, fecha: "2026-09-20", animalId: lucero });
    expect((await listarTraspasos(db))[0].movimientoId).toBe(movimientoId);
  });

  it("si no se acepta el gasto, no se crea; después se puede crear desde el historial, una sola vez", async () => {
    const lucero = await crearExterno("Lucero");
    const { traspasoId, movimientoId } = await registrarCompra(db, compra({ animalId: lucero, crearGasto: false }), PROPIETARIO);
    expect(movimientoId).toBeNull();
    const gastos = async () => listarMovimientos(db, { categoriaId: CATEGORIA_COMPRA_ANIMALES_ID });
    expect(await gastos()).toHaveLength(0);
    const creado = await crearMovimientoDeTraspaso(db, traspasoId, PROPIETARIO);
    expect((await gastos())[0]).toMatchObject({ id: creado, tipo: "gasto", valor: 1_500_000, animalId: lucero });
    expect(await fallo(crearMovimientoDeTraspaso(db, traspasoId, PROPIETARIO))).toEqual([{ codigo: "traspaso_ya_con_movimiento" }]);
  });

  it("sin precio no hay gasto que crear", async () => {
    const lucero = await crearExterno("Lucero");
    const { traspasoId } = await registrarCompra(db, compra({ animalId: lucero, precio: null, crearGasto: true }), PROPIETARIO);
    expect(await listarMovimientos(db, { categoriaId: CATEGORIA_COMPRA_ANIMALES_ID })).toHaveLength(0);
    expect(await fallo(crearMovimientoDeTraspaso(db, traspasoId, PROPIETARIO))).toEqual([{ codigo: "traspaso_sin_precio" }]);
  });

  it("también se puede comprar un animal registrado solo para la genealogía", async () => {
    const abuelo = await guardarAnimal(db, { ...animalVacio(), nombre: "Abuelo", sexo: "macho", enHato: false }, PROPIETARIO);
    await registrarCompra(db, compra({ animalId: abuelo, precio: null }), PROPIETARIO);
    expect(await obtenerAnimal(db, abuelo)).toMatchObject({ origen: "comprado", enHato: true });
  });

  it("agrega el registro de asociación como identificador sin quitarle los que ya tenía (el principal sigue siendo el suyo)", async () => {
    const lucero = await crearExterno("Lucero", { identificadores: [{ tipo: "arete", valor: "L-1", fecha: null, vigente: true, principal: true }] });
    await registrarCompra(db, compra({ animalId: lucero, registroAsociacion: "ASOC-0042" }), PROPIETARIO);
    const a = (await obtenerAnimal(db, lucero))!;
    expect(a.identificadores.map((i) => [i.tipo, i.valor, i.principal])).toEqual([
      ["arete", "L-1", true],
      ["registro_asociacion", "ASOC-0042", false],
    ]);
  });

  it("rechaza un registro de asociación que ya tiene otro animal (R2)", async () => {
    const lucero = await crearExterno("Lucero");
    await registrarCompra(db, compra({ animalId: lucero, registroAsociacion: "ASOC-0042" }), PROPIETARIO);
    const otra = await crearExterno("Otra");
    const motivos = await fallo(registrarCompra(db, compra({ animalId: otra, registroAsociacion: "asoc-0042" }), PROPIETARIO));
    expect(motivos.map((m) => m.codigo)).toEqual(["identificador_duplicado"]);
    expect((await obtenerAnimal(db, otra))!.origen).toBe("externo"); // nada se cambió
  });
});

describe("CA-23 (R32): comprar un animal nuevo", () => {
  const nuevo = (cambios: Partial<ReturnType<typeof animalVacio>> = {}) => ({
    ...animalVacio(),
    nombre: "Margarita",
    sexo: "hembra" as const,
    fechaNacimiento: "2025-01-10",
    identificadores: [{ tipo: "arete" as const, valor: "M-77", fecha: null, vigente: true, principal: true }],
    ...cambios,
  });

  it("lo crea con origen comprado, del hato y con el vendedor y la fecha de ingreso", async () => {
    const { animalId } = await registrarCompra(db, compra({ nuevo: nuevo(), registroAsociacion: "ASOC-9" }), PROPIETARIO);
    const a = (await obtenerAnimal(db, animalId))!;
    expect(a).toMatchObject({ nombre: "Margarita", origen: "comprado", enHato: true, estado: "activo", contactoId: vendedor, fechaIngreso: "2026-09-20" });
    expect(a.identificadores.map((i) => [i.tipo, i.valor, i.principal])).toEqual([
      ["arete", "M-77", true],
      ["registro_asociacion", "ASOC-9", false],
    ]);
    expect((await contarAnimales(db)).hembras).toBeGreaterThan(0);
    expect((await listarTraspasos(db))[0]).toMatchObject({ animalId, tipo: "compra" });
  });

  it("si trae padre y madre que no están en la finca, permite cargarlos como animales de otras fincas (R29)", async () => {
    const { animalId } = await registrarCompra(
      db,
      compra({
        nuevo: nuevo(),
        padreNuevo: { ...animalExternoVacio(), nombre: "Hércules", sexo: "macho", fechaNacimiento: "2021-03-03", identificadores: [registroAsociacion("ASOC-P1")] },
        madreNuevo: { ...animalExternoVacio(), nombre: "Perla", sexo: "hembra", fechaNacimiento: "2021-04-04" },
      }),
      PROPIETARIO,
    );
    const a = (await obtenerAnimal(db, animalId))!;
    expect([a.padre?.nombre, a.madre?.nombre]).toEqual(["Hércules", "Perla"]);
    const padre = (await obtenerAnimal(db, a.padreId!))!;
    expect(padre).toMatchObject({ origen: "externo", enHato: false, sexo: "macho", contactoId: vendedor });
    // Los padres no son del hato: no cuentan en el inventario ni salen entre los animales de la finca.
    const nombres = (await listarAnimales(db)).map((x) => x.nombre);
    expect(nombres).toContain("Margarita");
    expect(nombres).not.toContain("Hércules");
    expect((await listarExternos(db)).map((x) => x.nombre)).toEqual(expect.arrayContaining(["Hércules", "Perla"]));
  });

  it("al comprar un externo sin padre registrado, también se puede cargar el padre como externo", async () => {
    const lucero = await crearExterno("Lucero");
    await registrarCompra(db, compra({ animalId: lucero, padreNuevo: { ...animalExternoVacio(), nombre: "Hércules", sexo: "macho" } }), PROPIETARIO);
    expect((await obtenerAnimal(db, lucero))!.padre?.nombre).toBe("Hércules");
  });

  it("rechaza cargar un padre cuando el animal ya tiene uno registrado", async () => {
    const lucero = await crearExterno("Lucero", { padreId: await crearExterno("Titán", { sexo: "macho", fechaNacimiento: "2019-01-01" }) });
    const motivos = await fallo(registrarCompra(db, compra({ animalId: lucero, padreNuevo: { ...animalExternoVacio(), nombre: "Otro", sexo: "macho" } }), PROPIETARIO));
    expect(motivos).toEqual([{ codigo: "compra_ancestro_ya_registrado", campo: "padre" }]);
  });

  it("valida a los padres nuevos: nombre y sexo, que no hayan nacido después de la cría, y que no repitan identificadores", async () => {
    const totalAntes = await contarAnimales(db);
    const sinNombre = { ...animalExternoVacio(), nombre: null, sexo: "macho" as const };
    expect((await fallo(registrarCompra(db, compra({ nuevo: nuevo(), padreNuevo: sinNombre }), PROPIETARIO))).map((m) => m.codigo)).toContain("dato_obligatorio");
    const tarde = { ...animalExternoVacio(), nombre: "Joven", sexo: "macho" as const, fechaNacimiento: "2026-01-01" };
    expect(await fallo(registrarCompra(db, compra({ nuevo: nuevo(), padreNuevo: tarde }), PROPIETARIO))).toEqual([{ codigo: "padre_nacio_despues", otro: "Joven" }]);
    const mismo = (nombre: string, sexo: "macho" | "hembra") => ({ ...animalExternoVacio(), nombre, sexo, identificadores: [registroAsociacion("ASOC-IGUAL")] });
    const motivos = await fallo(registrarCompra(db, compra({ nuevo: nuevo(), padreNuevo: mismo("P", "macho"), madreNuevo: mismo("M", "hembra") }), PROPIETARIO));
    expect(motivos.map((m) => m.codigo)).toEqual(["identificador_duplicado"]);
    // Nada quedó a medias: ni el animal ni los padres se crearon.
    expect(await contarAnimales(db)).toEqual(totalAntes);
    expect((await listarExternos(db)).map((e) => e.nombre)).not.toContain("P");
  });

  it("aplica R1, R2 y R3 al animal nuevo (por ejemplo, un arete repetido)", async () => {
    const motivos = await fallo(registrarCompra(db, compra({ nuevo: nuevo({ identificadores: [{ tipo: "arete", valor: "EJ-01", fecha: null, vigente: true, principal: true }] }) }), PROPIETARIO));
    expect(motivos.map((m) => m.codigo)).toEqual(["identificador_duplicado"]);
  });
});

describe("CA-23 (R32): reglas y permisos de la compra", () => {
  it("no se compra un animal que ya es del hato", async () => {
    expect(await fallo(registrarCompra(db, compra({ animalId: await id("EJ-10") }), PROPIETARIO))).toEqual([{ codigo: "compra_animal_del_hato", otro: "Estrella" }]);
  });

  it("exige un vendedor que exista, una fecha que no sea futura y adjuntos de la carpeta de documentos", async () => {
    const lucero = await crearExterno("Lucero");
    expect((await fallo(registrarCompra(db, compra({ animalId: lucero, vendedorId: null }), PROPIETARIO))).map((m) => m.codigo)).toEqual(["traspaso_sin_contacto"]);
    expect(await fallo(registrarCompra(db, compra({ animalId: lucero, vendedorId: "no-existe-0000-0000-0000-000000000000" }), PROPIETARIO))).toEqual([{ codigo: "no_encontrado" }]);
    expect((await fallo(registrarCompra(db, compra({ animalId: lucero, fechaIngreso: "2999-01-01" }), PROPIETARIO))).map((m) => m.codigo)).toEqual(["fecha_futura"]);
    expect((await fallo(registrarCompra(db, compra({ animalId: lucero, adjuntos: ["/etc/passwd"] }), PROPIETARIO))).map((m) => m.codigo)).toEqual(["adjunto_no_admitido"]);
    expect((await obtenerAnimal(db, lucero))!.origen).toBe("externo");
  });

  it("no se compra dos veces el mismo animal", async () => {
    const lucero = await crearExterno("Lucero");
    await registrarCompra(db, compra({ animalId: lucero }), PROPIETARIO);
    expect((await fallo(registrarCompra(db, compra({ animalId: lucero }), PROPIETARIO))).map((m) => m.codigo)).toEqual(["compra_animal_del_hato"]);
  });

  it("el operario no puede registrar compras (R23)", async () => {
    const lucero = await crearExterno("Lucero");
    expect(await fallo(registrarCompra(db, compra({ animalId: lucero }), OPERARIO))).toEqual([{ codigo: "sin_permiso" }]);
  });

  it("un contacto con compras o ventas no se puede retirar (el historial lo nombra)", async () => {
    await registrarVenta(db, venta(await id("EJ-12")), PROPIETARIO);
    expect(await fallo(retirarContacto(db, comprador, PROPIETARIO))).toEqual([{ codigo: "contacto_con_traspasos", cantidad: 1 }]);
    const otro = await guardarContacto(db, { ...contactoVacio(), nombre: "Sin traspasos" }, PROPIETARIO);
    await retirarContacto(db, otro, PROPIETARIO);
  });
});

describe("CA-24 (R20): vender un animal", () => {
  it("lo marca como vendido, conserva su historial y su genealogía, y lo quita del ordeño y del inventario", async () => {
    const dalia = await id("EJ-09");
    const antes = (await obtenerAnimal(db, dalia))!;
    const pesajes = (await db.consultar<{ n: number }>("SELECT count(*) AS n FROM pesaje_leche p JOIN lactancia l ON l.id = p.lactancia_id WHERE l.hembra_id = ?", [dalia]))[0].n;
    expect(pesajes).toBeGreaterThan(0);
    const descendientes = [...(await consultarDescendientes(db, dalia))];
    const totalAntes = (await contarAnimales(db)).total;
    expect((await listarOrdeno(db, "2026-09-14", "manana")).map((f) => f.nombre)).toContain("Dalia");

    await registrarVenta(db, venta(dalia), PROPIETARIO);

    const despues = (await obtenerAnimal(db, dalia))!;
    expect(despues.estado).toBe("vendido");
    // La genealogía no se modifica: mismo padre, misma madre, mismos descendientes y mismas razas.
    expect([despues.padreId, despues.madreId]).toEqual([antes.padreId, antes.madreId]);
    expect(despues.composicion).toEqual(antes.composicion);
    expect([...(await consultarDescendientes(db, dalia))]).toEqual(descendientes);
    // El historial se conserva: pesajes de leche y lactancias siguen ahí.
    const [{ n }] = await db.consultar<{ n: number }>("SELECT count(*) AS n FROM pesaje_leche p JOIN lactancia l ON l.id = p.lactancia_id WHERE l.hembra_id = ?", [dalia]);
    expect(n).toBe(pesajes);
    const cambios = await db.consultar<{ valor_anterior: string; valor_nuevo: string }>(
      "SELECT valor_anterior, valor_nuevo FROM historial_cambios WHERE entidad = 'animal' AND registro_id = ? AND campo = 'estado' AND valor_anterior IS NOT NULL",
      [dalia],
    );
    expect(cambios).toEqual([{ valor_anterior: "activo", valor_nuevo: "vendido" }]);
    // Sale del ordeño (R11) y del inventario, pero su ficha sigue existiendo.
    expect((await listarOrdeno(db, "2026-09-14", "manana")).map((f) => f.nombre)).not.toContain("Dalia");
    expect((await contarAnimales(db)).total).toBe(totalAntes - 1);
    expect((await datosInventario(db, "2026-10-02")).filas.map((f) => f.nombre)).not.toContain("Dalia");
    expect((await traspasosDeAnimal(db, dalia))[0]).toMatchObject({ tipo: "venta", contactoId: comprador, contacto: "Pedro Comprador", precio: 900_000, fecha: "2026-09-30" });
  });

  it("no anula su registro propio (R31): sigue emitido, con el mismo número", async () => {
    const estrella = await id("EJ-10");
    const emitido = await emitirRegistro(db, estrella, PROPIETARIO, { hoy: "2026-10-02" });
    await registrarVenta(db, venta(estrella), PROPIETARIO);
    const vigente = await registroVigenteDe(db, estrella);
    expect(vigente).toMatchObject({ estado: "emitido", numero: emitido.numero, version: 1 });
  });

  it("ofrece crear el ingreso: si se acepta, queda en Finanzas como «Venta de animales» asignado al animal y enlazado", async () => {
    const gema = await id("EJ-12");
    const { movimientoId } = await registrarVenta(db, venta(gema, { crearIngreso: true, observaciones: "Pagó en efectivo" }), PROPIETARIO);
    expect(movimientoId).not.toBeNull();
    const m = (await listarMovimientos(db)).find((x) => x.id === movimientoId)!;
    expect(m).toMatchObject({ tipo: "ingreso", categoriaId: CATEGORIA_VENTA_ANIMALES_ID, categoria: "Venta de animales", valor: 900_000, fecha: "2026-09-30", animalId: gema });
    // El ingreso cuenta para la rentabilidad del animal vendido (R19, S-74).
    const resumen = await resumenFinanciero(db);
    expect(resumen.animales.find((a) => a.animalId === gema)?.ingresos).toBe(900_000);
    expect((await traspasosDeAnimal(db, gema))[0]).toMatchObject({ movimientoId, observaciones: "Pagó en efectivo" });
  });

  it("sin aceptar el ingreso no se crea; se puede crear después, una sola vez", async () => {
    const gema = await id("EJ-12");
    const { traspasoId } = await registrarVenta(db, venta(gema), PROPIETARIO);
    const ventas = async () => listarMovimientos(db, { categoriaId: CATEGORIA_VENTA_ANIMALES_ID });
    expect(await ventas()).toHaveLength(0);
    const creado = await crearMovimientoDeTraspaso(db, traspasoId, PROPIETARIO);
    expect((await ventas())[0]).toMatchObject({ id: creado, valor: 900_000, animalId: gema });
    expect(await fallo(crearMovimientoDeTraspaso(db, traspasoId, PROPIETARIO))).toEqual([{ codigo: "traspaso_ya_con_movimiento" }]);
  });

  it("rechaza vender un animal de otra finca, uno ya vendido, sin comprador, con fecha futura o anterior al nacimiento", async () => {
    const titan = await crearExterno("Titán", { sexo: "macho" });
    expect((await fallo(registrarVenta(db, venta(titan), PROPIETARIO))).map((m) => m.codigo)).toEqual(["venta_animal_no_del_hato"]);
    const gema = await id("EJ-12");
    expect((await fallo(registrarVenta(db, venta(gema, { compradorId: null }), PROPIETARIO))).map((m) => m.codigo)).toEqual(["traspaso_sin_contacto"]);
    expect((await fallo(registrarVenta(db, venta(gema, { fecha: "2999-01-01" }), PROPIETARIO))).map((m) => m.codigo)).toEqual(["fecha_futura"]);
    expect((await fallo(registrarVenta(db, venta(gema, { fecha: "2022-03-09" }), PROPIETARIO))).map((m) => m.codigo)).toEqual(["fecha_anterior_al_nacimiento"]);
    expect((await obtenerAnimal(db, gema))!.estado).toBe("activo");
    await registrarVenta(db, venta(gema), PROPIETARIO);
    expect((await fallo(registrarVenta(db, venta(gema), PROPIETARIO))).map((m) => m.codigo)).toEqual(["venta_animal_no_activo"]);
  });

  it("un animal comprado no se vende antes de su ingreso", async () => {
    const lucero = await crearExterno("Lucero");
    await registrarCompra(db, compra({ animalId: lucero, fechaIngreso: "2026-09-20" }), PROPIETARIO);
    expect((await fallo(registrarVenta(db, venta(lucero, { fecha: "2026-09-10" }), PROPIETARIO))).map((m) => m.codigo)).toEqual(["venta_antes_del_ingreso"]);
    await registrarVenta(db, venta(lucero, { fecha: "2026-09-25" }), PROPIETARIO);
    expect((await traspasosDeAnimal(db, lucero)).map((t) => t.tipo)).toEqual(["venta", "compra"]);
  });

  it("el operario no puede registrar ventas (R23)", async () => {
    expect(await fallo(registrarVenta(db, venta(await id("EJ-12")), OPERARIO))).toEqual([{ codigo: "sin_permiso" }]);
    expect((await obtenerAnimal(db, await id("EJ-12")))!.estado).toBe("activo");
  });
});

describe("RF-50 y RF-16: historial de compras y ventas", () => {
  beforeEach(async () => {
    const lucero = await crearExterno("Lucero");
    await registrarCompra(db, compra({ animalId: lucero, fechaIngreso: "2026-08-10", precio: 1_000_000 }), PROPIETARIO);
    await registrarVenta(db, venta(await id("EJ-12"), { fecha: "2026-09-05", precio: 600_000 }), PROPIETARIO);
    await registrarVenta(db, venta(await id("EJ-11"), { fecha: "2026-09-25", compradorId: vendedor, precio: null }), PROPIETARIO);
  });

  it("lista del más reciente al más antiguo", async () => {
    expect((await listarTraspasos(db)).map((t) => [t.fecha, t.tipo, t.animal])).toEqual([
      ["2026-09-25", "venta", "Faro"],
      ["2026-09-05", "venta", "Gema"],
      ["2026-08-10", "compra", "Lucero"],
    ]);
  });

  it("filtra por periodo (los dos extremos cuentan), por tipo y por contacto", async () => {
    const nombres = async (filtro: Parameters<typeof listarTraspasos>[1]) => (await listarTraspasos(db, filtro)).map((t) => t.animal);
    expect(await nombres({ desde: "2026-09-05", hasta: "2026-09-25" })).toEqual(["Faro", "Gema"]);
    expect(await nombres({ desde: "2026-09-06" })).toEqual(["Faro"]);
    expect(await nombres({ hasta: "2026-08-10" })).toEqual(["Lucero"]);
    expect(await nombres({ tipo: "compra" })).toEqual(["Lucero"]);
    expect(await nombres({ tipo: "venta" })).toEqual(["Faro", "Gema"]);
    expect(await nombres({ contactoId: comprador })).toEqual(["Gema"]);
    expect(await nombres({ contactoId: vendedor, tipo: "venta" })).toEqual(["Faro"]);
    expect(await nombres({ desde: "2026-09-10", tipo: "compra" })).toEqual([]);
  });

  it("rechaza un periodo al revés", async () => {
    expect((await fallo(listarTraspasos(db, { desde: "2026-10-01", hasta: "2026-01-01" }))).map((m) => m.codigo)).toEqual(["periodo_invalido"]);
  });
});

describe("R23: el operario no ve compras, ventas ni finanzas", () => {
  it("las acciones de traspasos y de finanzas son solo del propietario", () => {
    for (const accion of ["ver_traspasos", "gestionar_traspasos", "ver_finanzas", "gestionar_finanzas"] as const) {
      expect(puede("propietario", accion), accion).toBe(true);
      expect(puede("operario", accion), accion).toBe(false);
    }
    // El inventario y la hoja de venta son documentos: los emite quien puede emitir documentos (el propietario).
    expect(puede("operario", "emitir_documento")).toBe(false);
  });
});

describe("RF-36 (R21): inventario y datos de la hoja de venta", () => {
  it("el inventario cuenta los animales activos del hato y coincide con el contador de Inicio", async () => {
    await registrarVenta(db, venta(await id("EJ-12")), PROPIETARIO);
    const inventario = await datosInventario(db, "2026-10-02");
    expect(inventario.totales.total).toBe((await contarAnimales(db)).total);
    expect(inventario.filas.every((f) => f.estado === "activo")).toBe(true);
    expect(inventario.filas.map((f) => f.nombre)).not.toContain("Gema");
    // Es lo mismo que arma el dominio con esos animales: una sola regla.
    expect(armarInventario(inventario.filas, "2026-10-02").totales).toEqual(inventario.totales);
    const estrella = inventario.filas.find((f) => f.nombre === "Estrella")!;
    expect(estrella).toMatchObject({ identificador: "EJ-10", libro: "Pureza por pedigrí", lote: "Levante", sexo: "hembra", razas: [{ raza: "Saanen", fraccion: 1 }] });
  });

  it("la hoja de Estrella trae identificadores, composición, libro y árbol de tres generaciones", async () => {
    const entrada = await datosHojaVenta(db, await id("EJ-10"), { hoy: "2026-10-02" });
    const hoja = armarHojaVenta(entrada, { incluirProduccion: false });
    expect(hoja.animal).toMatchObject({
      nombre: "Estrella",
      identificadores: [{ tipo: "arete", valor: "EJ-10" }],
      composicion: [{ raza: "Saanen", fraccion: 1 }],
      libro: "Pureza por pedigrí",
      registroPropio: null,
    });
    expect(hoja.arbol.map((c) => c.map((a) => a?.nombre ?? null))).toEqual([
      ["Bruno", "Bella"],
      ["Zeus", "Abril", "Zeus", "Abril"],
      [null, null, null, null, null, null, null, null],
    ]);
    expect(hoja.arbol[1][0]?.registroAsociacion).toBe("EJEMPLO-0001");
  });

  it("trae el número del registro propio cuando el animal lo tiene, incluso después de venderlo", async () => {
    const estrella = await id("EJ-10");
    const emitido = await emitirRegistro(db, estrella, PROPIETARIO, { hoy: "2026-10-02" });
    await registrarVenta(db, venta(estrella), PROPIETARIO);
    const entrada = await datosHojaVenta(db, estrella, { hoy: "2026-10-02" });
    expect(entrada.animal.registroPropio).toBe(emitido.numero);
    expect(entrada.animal.estado).toBe("vendido");
  });

  it("la producción de una hembra sale de sus lactancias", async () => {
    const entrada = await datosHojaVenta(db, await id("EJ-09"), { hoy: "2026-09-15" });
    expect(entrada.lactancias.length).toBeGreaterThan(0);
    const l = entrada.lactancias.find((x) => x.acumuladoKg !== null)!;
    expect(l.acumuladoKg).toBeGreaterThan(0);
    expect(l.promedioDiarioKg).toBeGreaterThan(0);
    expect((await datosHojaVenta(db, await id("EJ-10"), { hoy: "2026-09-15" })).lactancias).toEqual([]);
  });

  it("una hoja de venta pide un animal que exista", async () => {
    expect(await fallo(datosHojaVenta(db, "no-existe-0000-0000-0000-000000000000", { hoy: "2026-10-02" }))).toEqual([{ codigo: "no_encontrado" }]);
  });
});
