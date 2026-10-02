// Etapa 7 (especificación 2): R31 con la base de datos. CA-16 a CA-18 y CA-20, permisos (R23) y configuración.
// Escritas antes del código, con los datos de ejemplo.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cargarDatosDeEjemplo } from "../../../scripts/datos-de-ejemplo";
import { filasDelLibro } from "../../dominio/libro-genealogico";
import { OPERARIO, PROPIETARIO } from "../ayudas-pruebas";
import { crearBaseDePrueba, type ConexionMemoria } from "../conexion-memoria";
import { ErrorDeRegistro } from "../errores";
import { guardarAnimal, listarAnimales, obtenerAnimal, type DatosAnimal } from "./animales";
import { listarCatalogo } from "./catalogos";
import { listarDocumentos } from "./documentos";
import { actualizarFinca, obtenerFinca } from "./finca";
import {
  anularRegistro,
  crearBorrador,
  datosPedigri,
  descartarBorrador,
  editarBorrador,
  emitirEnLote,
  emitirRegistro,
  guardarConfigLibro,
  guardarDatosDeRegistro,
  historialDeRegistro,
  listarConfigLibros,
  listarRegistros,
  listarRegistrosDelLibro,
  listarVerificaciones,
  obtenerDatosDeRegistro,
  obtenerRegistro,
  reemitirRegistro,
  registrarDocumentoDeRegistro,
  registroVigenteDe,
  verificarAnimal,
} from "./registros";

const HOY = "2026-10-02";
let db: ConexionMemoria;
beforeEach(async () => {
  db = crearBaseDePrueba();
  await cargarDatosDeEjemplo(db, "2026-09-15");
});
afterEach(() => db.cerrar());

const id = async (arete: string) => (await listarAnimales(db, { texto: arete, incluirSoloGenealogia: true }))[0].id;
const libro = async (nombre: string) => (await listarCatalogo(db, "libro")).find((l) => l.nombre === nombre)!.id;
const emitir = async (arete: string, extra: { fechaRegistro?: string } = {}) =>
  emitirRegistro(db, await id(arete), PROPIETARIO, { hoy: HOY, ...extra });
const fallo = async (accion: Promise<unknown>) => {
  try {
    await accion;
  } catch (e) {
    if (e instanceof ErrorDeRegistro) return e.motivos;
    throw e;
  }
  throw new Error("Debía fallar y no falló");
};
/** Cambia datos de un animal con el repositorio (pasa por R1, R2 y R3 como en la pantalla). */
async function cambiar(arete: string, cambio: (a: DatosAnimal) => Partial<DatosAnimal> | Promise<Partial<DatosAnimal>>) {
  const animal = (await obtenerAnimal(db, await id(arete)))!;
  await guardarAnimal(db, { ...animal, ...(await cambio(animal)) }, PROPIETARIO, animal.id);
}

describe("configuración de los libros (R31: prefijo y formato del número)", () => {
  it("los cinco libros precargados traen un prefijo propio y empiezan en 1", async () => {
    const libros = await listarConfigLibros(db);
    expect(Object.fromEntries(libros.map((l) => [l.nombre, l.prefijo]))).toEqual({
      Fundadores: "FUN",
      Mestizo: "MES",
      "Pureza de origen": "POR",
      "Pureza por cruzamiento": "PCR",
      "Pureza por pedigrí": "PPE",
    });
    expect(libros.every((l) => l.siguienteNumero === 1 && l.registros === 0 && l.digitos === 4 && l.separador === "-")).toBe(true);
    expect(libros.find((l) => l.nombre === "Mestizo")!.ejemplo).toBe("MES-0001");
  });

  it("el propietario cambia el prefijo, el formato y el número inicial mientras el libro no tenga registros", async () => {
    const mestizo = await libro("Mestizo");
    await guardarConfigLibro(db, mestizo, { prefijo: "mz", separador: "", digitos: 3, siguienteNumero: 120 }, PROPIETARIO);
    const config = (await listarConfigLibros(db)).find((l) => l.id === mestizo)!;
    expect(config).toMatchObject({ prefijo: "mz", separador: "", digitos: 3, siguienteNumero: 120, ejemplo: "mz120" });
    expect((await emitir("EJ-08")).numero).toBe("mz120");
    expect((await emitir("EJ-09")).numero).toBe("mz121");
  });

  it("rechaza un prefijo con símbolos, uno repetido en otro libro, dígitos fuera de rango y un inicio inválido", async () => {
    const mestizo = await libro("Mestizo");
    const base = { prefijo: "MES", separador: "-" as const, digitos: 4, siguienteNumero: 1 };
    expect(await fallo(guardarConfigLibro(db, mestizo, { ...base, prefijo: "ME S" }, PROPIETARIO))).toEqual([{ codigo: "formato_numero_invalido", campo: "prefijo" }]);
    expect(await fallo(guardarConfigLibro(db, mestizo, { ...base, prefijo: "ppe" }, PROPIETARIO))).toEqual([{ codigo: "prefijo_repetido", prefijo: "ppe" }]);
    expect(await fallo(guardarConfigLibro(db, mestizo, { ...base, digitos: 12 }, PROPIETARIO))).toEqual([{ codigo: "formato_numero_invalido", campo: "digitos" }]);
    expect(await fallo(guardarConfigLibro(db, mestizo, { ...base, siguienteNumero: 0 }, PROPIETARIO))).toEqual([{ codigo: "numero_inicial_invalido" }]);
  });

  it("después de emitir, el prefijo, el formato y el número inicial de ese libro ya no cambian (los números no se reordenan)", async () => {
    await emitir("EJ-08");
    const mestizo = await libro("Mestizo");
    expect(await fallo(guardarConfigLibro(db, mestizo, { prefijo: "OTRO", separador: "-", digitos: 4, siguienteNumero: 2 }, PROPIETARIO))).toEqual([
      { codigo: "libro_con_registros" },
    ]);
    // Guardar lo mismo que ya tiene no es un cambio.
    await guardarConfigLibro(db, mestizo, { prefijo: "MES", separador: "-", digitos: 4, siguienteNumero: 2 }, PROPIETARIO);
  });

  it("solo el propietario configura (R23)", async () => {
    expect(await fallo(guardarConfigLibro(db, await libro("Mestizo"), { prefijo: "MES", separador: "-", digitos: 4, siguienteNumero: 1 }, OPERARIO))).toEqual([{ codigo: "sin_permiso" }]);
    expect(await fallo(guardarDatosDeRegistro(db, { criador: "A", propietario: "B", responsable: "C" }, OPERARIO))).toEqual([{ codigo: "sin_permiso" }]);
  });

  it("criador y propietario son, si no se escriben otros, el propietario de la finca; el responsable, el que emite", async () => {
    expect(await obtenerDatosDeRegistro(db)).toMatchObject({
      criador: "Propietario de ejemplo",
      propietario: "Propietario de ejemplo",
      responsable: null,
      criadero: "Criadero de ejemplo",
    });
    await guardarDatosDeRegistro(db, { criador: "Aprisco El Paraíso", propietario: "Familia Pérez", responsable: "Ana Pérez" }, PROPIETARIO);
    expect(await obtenerDatosDeRegistro(db)).toMatchObject({ criador: "Aprisco El Paraíso", propietario: "Familia Pérez", responsable: "Ana Pérez" });
    const { registroId } = await emitir("EJ-10");
    const registro = (await obtenerRegistro(db, registroId))!;
    expect(registro.responsable).toBe("Ana Pérez");
    expect(registro.instantanea).toMatchObject({ criador: "Aprisco El Paraíso", propietario: "Familia Pérez", responsable: "Ana Pérez" });
  });
});

describe("CA-16 (R31): no se emite un registro al que le falta un requisito, y se muestra cuál", () => {
  it("un animal completo cumple la lista de verificación", async () => {
    const v = await verificarAnimal(db, await id("EJ-10"));
    expect(v.elegible).toBe(true);
    expect(v.lista.cumple).toBe(true);
    expect(v.libro).toBe("Pureza por pedigrí");
  });

  it("un fundador (libro «Fundadores») cumple sin padres", async () => {
    const v = await verificarAnimal(db, await id("EJ-01"));
    expect(v.lista.cumple).toBe(true);
    expect(v.lista.items.find((i) => i.requisito === "padre")?.exento).toBe(true);
  });

  it("una cría recién nacida no tiene libro (R5): no se emite y la lista dice que falta el libro", async () => {
    const cria = await id("EJ-13");
    const v = await verificarAnimal(db, cria);
    expect(v.lista.cumple).toBe(false);
    expect(v.lista.faltantes).toEqual(["libro"]);
    const motivos = await fallo(emitirRegistro(db, cria, PROPIETARIO, { hoy: HOY }));
    expect(motivos).toEqual([{ codigo: "registro_incompleto", faltantes: ["libro"] }]);
    expect(await registroVigenteDe(db, cria)).toBeNull();
    expect(await listarRegistros(db, {})).toEqual([]);
  });

  it("señala todo lo que falta, no solo lo primero", async () => {
    await cambiar("EJ-10", () => ({ nombre: null, madreId: null, libroId: null }));
    // El nombre no es obligatorio para guardar el animal si tiene identificador, pero sí para el registro.
    expect((await verificarAnimal(db, await id("EJ-10"))).lista.faltantes).toEqual(["nombre", "libro", "madre"]);
  });

  it("si falta el criadero de la finca, ningún animal se puede emitir hasta completarlo", async () => {
    const finca = (await obtenerFinca(db))!;
    const { id: _id, ...datos } = finca;
    await actualizarFinca(db, { ...datos, criadero: null }, PROPIETARIO);
    expect((await verificarAnimal(db, await id("EJ-10"))).lista.faltantes).toEqual(["criadero"]);
    expect(await fallo(emitir("EJ-10"))).toEqual([{ codigo: "registro_incompleto", faltantes: ["criadero"] }]);
    await actualizarFinca(db, { ...datos, criadero: "Criadero de ejemplo" }, PROPIETARIO);
    expect((await emitir("EJ-10")).numero).toBe("PPE-0001");
  });

  it("el prefijo del libro es un requisito: sin prefijo no hay número", async () => {
    // Un libro nuevo, sin prefijo (como los que cree el usuario).
    const { crearElemento } = await import("./catalogos");
    const nuevo = await crearElemento(db, "libro", "Libro experimental", PROPIETARIO);
    await cambiar("EJ-10", () => ({ libroId: nuevo }));
    const v = await verificarAnimal(db, await id("EJ-10"));
    expect(v.lista.faltantes).toEqual(["prefijo"]);
    expect(await fallo(emitir("EJ-10"))).toEqual([{ codigo: "registro_incompleto", faltantes: ["prefijo"] }]);
  });

  it("solo los animales del hato tienen registro: un externo o uno «solo genealogía» no", async () => {
    const titan = await id("EJEMPLO-EXT-01");
    expect(await fallo(emitirRegistro(db, titan, PROPIETARIO, { hoy: HOY }))).toEqual([{ codigo: "animal_no_elegible" }]);
    expect((await verificarAnimal(db, titan)).elegible).toBe(false);
  });

  it("la lista de todos los animales del hato dice quién está listo y qué le falta a los demás", async () => {
    const lista = await listarVerificaciones(db, {});
    const por = (arete: string) => lista.find((f) => f.identificador === arete)!;
    expect(por("EJ-10").lista.cumple).toBe(true);
    expect(por("EJ-13").lista.faltantes).toEqual(["libro"]);
    // Ni Titán (otra finca) ni los registrados solo para la genealogía aparecen.
    expect(lista.some((f) => f.identificador === "EJEMPLO-EXT-01")).toBe(false);
    expect(lista.every((f) => f.registro === null)).toBe(true);
  });
});

describe("CA-17 (R31): numeración consecutiva por libro", () => {
  it("cada libro numera aparte, de uno en uno, con el prefijo del libro", async () => {
    expect((await emitir("EJ-06")).numero).toBe("PPE-0001");
    expect((await emitir("EJ-07")).numero).toBe("PPE-0002");
    expect((await emitir("EJ-10")).numero).toBe("PPE-0003");
    expect((await emitir("EJ-08")).numero).toBe("MES-0001");
    expect((await emitir("EJ-01")).numero).toBe("FUN-0001");
    expect((await emitir("EJ-09")).numero).toBe("MES-0002");
    const libros = await listarConfigLibros(db);
    expect(libros.find((l) => l.nombre === "Pureza por pedigrí")).toMatchObject({ siguienteNumero: 4, registros: 3 });
    expect(libros.find((l) => l.nombre === "Mestizo")).toMatchObject({ siguienteNumero: 3, registros: 2 });
  });

  it("un registro anulado conserva su número y ese número no se reutiliza", async () => {
    await emitir("EJ-06");
    const segundo = await emitir("EJ-07");
    await emitir("EJ-10");
    await anularRegistro(db, segundo.registroId, "Se registró por error", PROPIETARIO);

    const anulado = (await obtenerRegistro(db, segundo.registroId))!;
    expect(anulado).toMatchObject({ estado: "anulado", numero: "PPE-0002", motivoAnulacion: "Se registró por error" });
    // El animal puede recibir otro registro, pero con un número nuevo: el 2 queda para siempre como anulado.
    expect((await emitir("EJ-07")).numero).toBe("PPE-0004");
    const numeros = (await listarRegistros(db, { libroId: await libro("Pureza por pedigrí") })).map((r) => `${r.numero}:${r.estado}`);
    expect(numeros.sort()).toEqual(["PPE-0001:emitido", "PPE-0002:anulado", "PPE-0003:emitido", "PPE-0004:emitido"]);
  });

  it("un animal tiene un solo registro vigente", async () => {
    await emitir("EJ-06");
    expect(await fallo(emitir("EJ-06"))).toEqual([{ codigo: "registro_ya_vigente" }]);
  });

  it("la emisión en lote emite a los que cumplen, muestra a los demás con lo que les falta y no deja saltos", async () => {
    const resultado = await emitirEnLote(
      db,
      [await id("EJ-06"), await id("EJ-13"), await id("EJ-07"), await id("EJEMPLO-EXT-01"), await id("EJ-10"), await id("EJ-01")],
      PROPIETARIO,
      { hoy: HOY },
    );
    expect(resultado.emitidos.map((e) => e.numero)).toEqual(["PPE-0001", "PPE-0002", "PPE-0003", "FUN-0001"]);
    expect(resultado.emitidos.map((e) => e.nombre)).toEqual(["Bruno", "Bella", "Estrella", "Zeus"]);
    expect(resultado.rechazados).toEqual([
      expect.objectContaining({ nombre: expect.any(String), motivo: "incompleto", faltantes: ["libro"] }),
      expect.objectContaining({ motivo: "no_elegible", faltantes: [] }),
    ]);
    // El contador del libro sigue donde corresponde: el siguiente registro continúa sin hueco.
    expect((await emitir("EJ-12")).numero).toBe("MES-0001");
    expect((await listarConfigLibros(db)).find((l) => l.nombre === "Pureza por pedigrí")!.siguienteNumero).toBe(4);
  });

  it("un lote donde ya hay registrados no los repite ni gasta números", async () => {
    await emitir("EJ-06");
    const resultado = await emitirEnLote(db, [await id("EJ-06"), await id("EJ-07")], PROPIETARIO, { hoy: HOY });
    expect(resultado.emitidos.map((e) => e.numero)).toEqual(["PPE-0002"]);
    expect(resultado.rechazados).toEqual([expect.objectContaining({ motivo: "ya_registrado" })]);
  });

  it("un lote sin ningún animal que cumpla no emite nada ni mueve el contador", async () => {
    const resultado = await emitirEnLote(db, [await id("EJ-13"), await id("EJ-14")], PROPIETARIO, { hoy: HOY });
    expect(resultado.emitidos).toEqual([]);
    expect(resultado.rechazados).toHaveLength(2);
    expect((await listarConfigLibros(db)).every((l) => l.siguienteNumero === 1)).toBe(true);
  });

  it("el borrador no tiene número: descartarlo no deja un salto, y emitirlo toma el siguiente", async () => {
    const borrador = await crearBorrador(db, await id("EJ-06"), { observaciones: "Pendiente de revisar" }, PROPIETARIO, HOY);
    const otro = await crearBorrador(db, await id("EJ-07"), {}, PROPIETARIO, HOY);
    expect((await obtenerRegistro(db, borrador))).toMatchObject({ estado: "borrador", numero: null, consecutivo: null, instantanea: null, observaciones: "Pendiente de revisar" });
    await descartarBorrador(db, borrador, PROPIETARIO);
    expect(await registroVigenteDe(db, await id("EJ-06"))).toBeNull();
    const emitido = await emitirRegistro(db, await id("EJ-07"), PROPIETARIO, { hoy: HOY });
    expect(emitido.registroId).toBe(otro);
    expect(emitido.numero).toBe("PPE-0001");
    expect(await obtenerRegistro(db, otro)).toMatchObject({ estado: "emitido", numero: "PPE-0001", version: 1 });
  });

  it("el borrador se edita; uno emitido ya no", async () => {
    const borrador = await crearBorrador(db, await id("EJ-06"), {}, PROPIETARIO, HOY);
    await editarBorrador(db, borrador, { observaciones: "Con nota", fechaRegistro: "2026-09-30" }, PROPIETARIO);
    expect(await obtenerRegistro(db, borrador)).toMatchObject({ observaciones: "Con nota", fechaRegistro: "2026-09-30" });
    const { registroId } = await emitirRegistro(db, await id("EJ-06"), PROPIETARIO, { hoy: HOY, fechaRegistro: "2026-09-30" });
    expect(await fallo(editarBorrador(db, registroId, { observaciones: "x" }, PROPIETARIO))).toEqual([{ codigo: "registro_no_borrador" }]);
    expect(await fallo(descartarBorrador(db, registroId, PROPIETARIO))).toEqual([{ codigo: "registro_no_borrador" }]);
  });

  it("anular exige un motivo y no se puede repetir; un anulado no se reemite", async () => {
    const { registroId } = await emitir("EJ-06");
    expect(await fallo(anularRegistro(db, registroId, "  ", PROPIETARIO))).toEqual([{ codigo: "motivo_anulacion_obligatorio" }]);
    await anularRegistro(db, registroId, "Duplicado", PROPIETARIO);
    expect(await fallo(anularRegistro(db, registroId, "Otra vez", PROPIETARIO))).toEqual([{ codigo: "registro_anulado" }]);
    expect(await fallo(reemitirRegistro(db, registroId, PROPIETARIO, { hoy: HOY }))).toEqual([{ codigo: "registro_anulado" }]);
    expect(await registroVigenteDe(db, await id("EJ-06"))).toBeNull();
  });
});

describe("CA-18 (R31): la instantánea y la reemisión", () => {
  it("cambiar el padre después de emitir no altera el registro emitido", async () => {
    const { registroId } = await emitir("EJ-10");
    const antes = (await obtenerRegistro(db, registroId))!;
    expect(antes.instantanea!.pedigri.find((a) => a.camino === "P")?.nombre).toBe("Bruno");

    await cambiar("EJ-10", async () => ({ padreId: await id("EJ-05") }));

    const despues = (await obtenerRegistro(db, registroId))!;
    expect(despues.instantanea).toEqual(antes.instantanea);
    expect(despues.instantanea!.pedigri.find((a) => a.camino === "P")?.nombre).toBe("Bruno");
    expect(despues.version).toBe(1);
    expect(despues.numero).toBe(antes.numero);
  });

  it("reemitir crea una versión nueva con el mismo número y la instantánea actual", async () => {
    const { registroId, numero } = await emitir("EJ-10");
    await cambiar("EJ-10", async () => ({ padreId: await id("EJ-05") }));

    const resultado = await reemitirRegistro(db, registroId, PROPIETARIO, { hoy: "2026-10-05" });
    expect(resultado).toMatchObject({ registroId, numero, version: 2 });
    const nuevo = (await obtenerRegistro(db, registroId))!;
    expect(nuevo.version).toBe(2);
    expect(nuevo.numero).toBe(numero);
    expect(nuevo.fechaRegistro).toBe(HOY); // la fecha de registro es la primera; la de emisión es de esta versión
    expect(nuevo.instantanea!.fechaEmision).toBe("2026-10-05");
    expect(nuevo.instantanea!.version).toBe(2);
    expect(nuevo.instantanea!.pedigri.find((a) => a.camino === "P")?.nombre).toBe("Duque");
    expect(nuevo.estado).toBe("emitido");
  });

  it("la versión anterior queda en el historial como reemplazada", async () => {
    const { registroId } = await emitir("EJ-10");
    await cambiar("EJ-10", async () => ({ padreId: await id("EJ-05") }));
    await reemitirRegistro(db, registroId, PROPIETARIO, { hoy: HOY });
    const historial = await historialDeRegistro(db, registroId);
    const cambioDeInstantanea = historial.find((h) => h.campo === "instantanea" && h.valorAnterior !== null)!;
    expect(cambioDeInstantanea.valorAnterior).toContain("Bruno");
    expect(cambioDeInstantanea.valorNuevo).toContain("Duque");
    expect(historial.find((h) => h.campo === "version" && h.valorAnterior !== null)).toMatchObject({ valorAnterior: "1", valorNuevo: "2" });
  });

  it("no se reemite un registro al que ahora le falta un requisito", async () => {
    const { registroId } = await emitir("EJ-10");
    await cambiar("EJ-10", () => ({ madreId: null }));
    expect(await fallo(reemitirRegistro(db, registroId, PROPIETARIO, { hoy: HOY }))).toEqual([{ codigo: "registro_incompleto", faltantes: ["madre"] }]);
    expect((await obtenerRegistro(db, registroId))!.version).toBe(1);
  });

  it("si el animal cambió de libro, no se reemite: se anula y se emite uno nuevo en el otro libro", async () => {
    const { registroId } = await emitir("EJ-10");
    await cambiar("EJ-10", async () => ({ libroId: await libro("Pureza por cruzamiento") }));
    expect(await fallo(reemitirRegistro(db, registroId, PROPIETARIO, { hoy: HOY }))).toEqual([{ codigo: "registro_libro_distinto" }]);
    await anularRegistro(db, registroId, "Cambió de libro", PROPIETARIO);
    expect((await emitir("EJ-10")).numero).toBe("PCR-0001");
  });

  it("cada versión emitida tiene su propio documento en «certificado» (sin duplicar)", async () => {
    const { registroId } = await emitir("EJ-10");
    await registrarDocumentoDeRegistro(db, registroId, "documentos/PPE-0001-v1.pdf", PROPIETARIO, HOY);
    await registrarDocumentoDeRegistro(db, registroId, "documentos/PPE-0001-v1.pdf", PROPIETARIO, HOY);
    await reemitirRegistro(db, registroId, PROPIETARIO, { hoy: HOY });
    await registrarDocumentoDeRegistro(db, registroId, "documentos/PPE-0001-v2.pdf", PROPIETARIO, HOY);
    const documentos = (await listarDocumentos(db, { animalId: await id("EJ-10") })).filter((d) => d.tipo === "registro_propio");
    expect(documentos.map((d) => d.numero).sort()).toEqual(["PPE-0001-v1", "PPE-0001-v2"]);
    expect(documentos.map((d) => d.archivo).sort()).toEqual(["documentos/PPE-0001-v1.pdf", "documentos/PPE-0001-v2.pdf"]);
  });
});

describe("R31: pedigrí de la instantánea, con ancestros de otras fincas", () => {
  it("guarda cuatro generaciones y el ancestro externo con su propietario y su número de asociación", async () => {
    // Roble: hijo de Titán (otra finca) y Canela. Las crías nacen sin libro: se le asigna uno.
    await cambiar("EJ-17", async () => ({ libroId: await libro("Mestizo") }));
    const { registroId, numero } = await emitir("EJ-17");
    expect(numero).toBe("MES-0001");
    const { instantanea } = (await obtenerRegistro(db, registroId))!;
    const padre = instantanea!.pedigri.find((a) => a.camino === "P")!;
    expect(padre).toMatchObject({
      nombre: "Titán",
      externo: true,
      registroAsociacion: "EJEMPLO-EXT-01",
      propietario: "Criador vecino (ejemplo) · Hato El Roble (ejemplo)",
    });
    expect(instantanea!.pedigri.find((a) => a.camino === "M")).toMatchObject({ nombre: "Canela", externo: false });
    expect(instantanea!.animal).toMatchObject({ nombre: "Roble", libro: "Mestizo", origen: "nacido_aqui" });
    expect(instantanea!.animal.identificadores).toEqual([{ tipo: "arete", valor: "EJ-17", principal: true }]);
  });

  it("incluye hasta los tatarabuelos y la consanguinidad", async () => {
    // Estrella (EJ-10): Bruno y Bella son hermanos completos (Zeus × Abril) → 25 %.
    const { registroId } = await emitir("EJ-10");
    const { instantanea } = (await obtenerRegistro(db, registroId))!;
    expect(instantanea!.animal.consanguinidad).toBeCloseTo(0.25, 6);
    const caminos = instantanea!.pedigri.map((a) => a.camino);
    expect(caminos).toEqual(expect.arrayContaining(["P", "M", "PP", "PM", "MP", "MM"]));
    expect(Math.max(...caminos.map((c) => c.length))).toBeLessThanOrEqual(4);
    expect(instantanea!.pedigri.find((a) => a.camino === "PP")).toMatchObject({ nombre: "Zeus", registroAsociacion: "EJEMPLO-0001" });
  });
});

describe("R23 (R31): solo el propietario crea, emite y anula registros", () => {
  it("el operario no puede crear borradores, emitir, reemitir, anular ni emitir en lote", async () => {
    const { registroId } = await emitir("EJ-10");
    const sinPermiso = [{ codigo: "sin_permiso" }];
    expect(await fallo(crearBorrador(db, await id("EJ-06"), {}, OPERARIO, HOY))).toEqual(sinPermiso);
    expect(await fallo(emitirRegistro(db, await id("EJ-06"), OPERARIO, { hoy: HOY }))).toEqual(sinPermiso);
    expect(await fallo(reemitirRegistro(db, registroId, OPERARIO, { hoy: HOY }))).toEqual(sinPermiso);
    expect(await fallo(anularRegistro(db, registroId, "x", OPERARIO))).toEqual(sinPermiso);
    expect(await fallo(emitirEnLote(db, [await id("EJ-06")], OPERARIO, { hoy: HOY }))).toEqual(sinPermiso);
    expect(await fallo(registrarDocumentoDeRegistro(db, registroId, "documentos/PPE-0001-v1.pdf", OPERARIO, HOY))).toEqual(sinPermiso);
  });
});

describe("CA-20 (R31): el libro genealógico exportado coincide con los registros emitidos", () => {
  it("las filas salen de los registros emitidos y no cambian aunque el animal cambie después", async () => {
    await emitir("EJ-06", { fechaRegistro: "2026-02-01" });
    const bella = await emitir("EJ-07", { fechaRegistro: "2026-03-01" });
    await emitir("EJ-10", { fechaRegistro: "2026-04-01" });
    await emitir("EJ-08", { fechaRegistro: "2026-05-01" });
    await anularRegistro(db, bella.registroId, "Error", PROPIETARIO);
    // Un cambio posterior en la ficha no cambia lo emitido.
    await cambiar("EJ-10", () => ({ nombre: "Estrella (renombrada)" }));

    const registros = await listarRegistrosDelLibro(db);
    const filas = filasDelLibro(registros, {});
    expect(filas.map((f) => f.numero)).toEqual(["MES-0001", "PPE-0001", "PPE-0003"]);
    expect(filas.find((f) => f.numero === "PPE-0003")).toMatchObject({
      nombre: "Estrella",
      identificador: "EJ-10",
      nacimiento: "2021-02-22",
      padre: "Bruno",
      madre: "Bella",
      libro: "Pureza por pedigrí",
    });
    // Los mismos que muestra la lista de emitidos de la pantalla.
    const emitidos = (await listarRegistros(db, { estado: "emitido" })).map((r) => r.numero).sort();
    expect(filas.map((f) => f.numero).sort()).toEqual(emitidos);
    // Y los filtros por libro y periodo.
    expect(filasDelLibro(registros, { libroId: await libro("Pureza por pedigrí") }).map((f) => f.numero)).toEqual(["PPE-0001", "PPE-0003"]);
    expect(filasDelLibro(registros, { desde: "2026-04-01", hasta: "2026-04-30" }).map((f) => f.numero)).toEqual(["PPE-0003"]);
    // Cacique es mestizo: 50 % Saanen y 50 % Alpina.
    expect(filasDelLibro(registros, { raza: "Alpina" }).map((f) => f.numero)).toEqual(["MES-0001"]);
    expect(filasDelLibro(registros, { raza: "Boer" })).toEqual([]);
    expect(filasDelLibro(registros, { incluirAnulados: true }).map((f) => f.numero)).toContain("PPE-0002");
  });

  it("tras reemitir, el libro muestra la versión nueva (una sola fila por número)", async () => {
    const { registroId } = await emitir("EJ-10");
    await cambiar("EJ-10", () => ({ nombre: "Estrella II" }));
    await reemitirRegistro(db, registroId, PROPIETARIO, { hoy: HOY });
    const filas = filasDelLibro(await listarRegistrosDelLibro(db), {});
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ numero: "PPE-0001", nombre: "Estrella II", version: 2 });
  });
});

describe("listar registros: filtros por libro, raza, periodo y estado", () => {
  beforeEach(async () => {
    await emitir("EJ-06", { fechaRegistro: "2026-02-01" });
    await emitir("EJ-08", { fechaRegistro: "2026-03-01" });
    await crearBorrador(db, await id("EJ-09"), {}, PROPIETARIO, HOY);
  });

  it("sin filtros trae borradores, emitidos y anulados", async () => {
    expect((await listarRegistros(db, {})).map((r) => `${r.numero ?? "—"}:${r.estado}`).sort()).toEqual(["MES-0001:emitido", "PPE-0001:emitido", "—:borrador"]);
  });

  it("filtra por libro, raza (la composición del animal), periodo y estado", async () => {
    expect((await listarRegistros(db, { libroId: await libro("Mestizo") })).map((r) => r.numero).sort()).toEqual(["MES-0001", null]);
    expect((await listarRegistros(db, { raza: "Alpina" })).map((r) => r.numero).sort()).toEqual(["MES-0001", null]);
    expect((await listarRegistros(db, { raza: "Saanen" })).map((r) => r.numero).sort()).toEqual(["MES-0001", "PPE-0001", null]);
    expect((await listarRegistros(db, { desde: "2026-02-15", hasta: "2026-03-31" })).map((r) => r.numero)).toEqual(["MES-0001"]);
    expect((await listarRegistros(db, { estado: "borrador" })).map((r) => r.estado)).toEqual(["borrador"]);
  });

  it("cada fila trae el animal, su identificador, el libro y la versión", async () => {
    const [fila] = await listarRegistros(db, { estado: "emitido", libroId: await libro("Pureza por pedigrí") });
    expect(fila).toMatchObject({ animal: "Bruno", identificador: "EJ-06", libro: "Pureza por pedigrí", numero: "PPE-0001", version: 1, fechaRegistro: "2026-02-01" });
  });
});

describe("pedigrí imprimible de cualquier animal (R31)", () => {
  it("sirve para un animal sin registro: trae sus ancestros, con los de otras fincas y su propietario", async () => {
    const d = await datosPedigri(db, await id("EJ-17"), HOY);
    expect(d.fecha).toBe(HOY);
    expect(d.finca).toMatchObject({ criadero: "Criadero de ejemplo" });
    expect(d.animal).toMatchObject({ nombre: "Roble", identificador: "EJ-17", origen: "nacido_aqui", registro: null });
    expect(d.pedigri.find((a) => a.camino === "P")).toMatchObject({
      nombre: "Titán",
      externo: true,
      registroAsociacion: "EJEMPLO-EXT-01",
      propietario: "Criador vecino (ejemplo) · Hato El Roble (ejemplo)",
    });
    expect(d.pedigri.find((a) => a.camino === "M")).toMatchObject({ nombre: "Canela", externo: false });
  });

  it("si el animal tiene un registro emitido, anota su número; un borrador no cuenta", async () => {
    await crearBorrador(db, await id("EJ-10"), {}, PROPIETARIO, HOY);
    expect((await datosPedigri(db, await id("EJ-10"), HOY)).animal.registro).toBeNull();
    await emitir("EJ-10");
    expect((await datosPedigri(db, await id("EJ-10"), HOY)).animal.registro).toEqual({ numero: "PPE-0001", estado: "emitido" });
  });

  it("sirve para un animal de otra finca (muestra a su propietario) y falla con uno que no existe", async () => {
    const d = await datosPedigri(db, await id("EJEMPLO-EXT-01"), HOY);
    expect(d.animal).toMatchObject({ nombre: "Titán", origen: "externo", propietario: "Criador vecino (ejemplo) · Hato El Roble (ejemplo)", registroAsociacion: "EJEMPLO-EXT-01" });
    expect(await fallo(datosPedigri(db, "00000000-0000-4000-8000-000000000000", HOY))).toEqual([{ codigo: "no_encontrado" }]);
  });

  it("incluye hasta cuatro generaciones", async () => {
    const d = await datosPedigri(db, await id("EJ-10"), HOY);
    expect(d.pedigri.map((a) => a.camino)).toEqual(expect.arrayContaining(["P", "M", "PP", "PM", "MP", "MM"]));
    expect(Math.max(...d.pedigri.map((a) => a.camino.length))).toBeLessThanOrEqual(4);
  });
});
