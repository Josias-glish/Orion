// R31 (especificación 2): registro genealógico propio. Reglas puras: lista de verificación, numeración, estados,
// instantánea, reemisión y lote. Cubre CA-16, CA-17 y CA-18 en el dominio (las pruebas con la base están en
// src/datos/repositorios/registros.test.ts).
import { describe, expect, it } from "vitest";
import {
  armarInstantanea,
  esLibroFundadores,
  formatearNumero,
  leerInstantanea,
  numeroDeDocumento,
  planificarLote,
  REQUISITOS,
  siguienteConsecutivo,
  validarAccion,
  validarElegibilidad,
  validarFormato,
  validarMotivoAnulacion,
  verificarRequisitos,
  type CandidatoLote,
  type EntradaInstantanea,
  type EntradaVerificacion,
  type FormatoNumero,
  type LibroNumeracion,
} from "./registros";

const FORMATO: FormatoNumero = { prefijo: "PPE", separador: "-", digitos: 4 };

/** Un animal que cumple todo: el punto de partida de cada prueba, a la que se le quita un dato. */
const completa = (cambios: Partial<EntradaVerificacion> = {}): EntradaVerificacion => ({
  nombre: "Estrella",
  sexo: "hembra",
  fechaNacimiento: "2021-02-22",
  identificadorPrincipal: "EJ-10",
  composicion: [{ fraccion: 1 }],
  libro: { nombre: "Pureza por pedigrí", prefijo: "PPE" },
  tienePadre: true,
  tieneMadre: true,
  erroresGenealogia: [],
  criador: "Ana Pérez",
  propietario: "Ana Pérez",
  criadero: "El Paraíso",
  ...cambios,
});

describe("R31: formato del número (prefijo del libro + consecutivo)", () => {
  it("une el prefijo, el separador y el consecutivo con ceros a la izquierda", () => {
    expect(formatearNumero(FORMATO, 1)).toBe("PPE-0001");
    expect(formatearNumero(FORMATO, 125)).toBe("PPE-0125");
    expect(formatearNumero({ prefijo: "FUN", separador: "", digitos: 3 }, 7)).toBe("FUN007");
  });

  it("no recorta un consecutivo más largo que los dígitos configurados", () => {
    expect(formatearNumero({ prefijo: "PPE", separador: "-", digitos: 2 }, 12345)).toBe("PPE-12345");
  });

  it("el número del documento agrega la versión: así cada versión emitida tiene su archivo", () => {
    expect(numeroDeDocumento("PPE-0001", 2)).toBe("PPE-0001-v2");
  });

  it("acepta un formato válido y rechaza prefijos vacíos, con espacios o símbolos, y dígitos fuera de 1 a 8", () => {
    expect(validarFormato(FORMATO)).toEqual([]);
    expect(validarFormato({ ...FORMATO, prefijo: "" })).toEqual([{ codigo: "formato_numero_invalido", campo: "prefijo" }]);
    expect(validarFormato({ ...FORMATO, prefijo: "P P" })).toEqual([{ codigo: "formato_numero_invalido", campo: "prefijo" }]);
    expect(validarFormato({ ...FORMATO, prefijo: "PP/E" })).toEqual([{ codigo: "formato_numero_invalido", campo: "prefijo" }]);
    expect(validarFormato({ ...FORMATO, prefijo: "ABCDEFGHI" })).toEqual([{ codigo: "formato_numero_invalido", campo: "prefijo" }]);
    expect(validarFormato({ ...FORMATO, digitos: 0 })).toEqual([{ codigo: "formato_numero_invalido", campo: "digitos" }]);
    expect(validarFormato({ ...FORMATO, digitos: 9 })).toEqual([{ codigo: "formato_numero_invalido", campo: "digitos" }]);
    expect(validarFormato({ ...FORMATO, digitos: 2.5 })).toEqual([{ codigo: "formato_numero_invalido", campo: "digitos" }]);
    // El prefijo puede estar sin configurar: lo exige la lista de verificación al emitir.
    expect(validarFormato({ ...FORMATO, prefijo: null })).toEqual([]);
  });
});

describe("CA-16 (R31): lista de verificación — no se emite con un requisito faltante y se muestra cuál", () => {
  it("un animal completo cumple todos los requisitos", () => {
    const lista = verificarRequisitos(completa());
    expect(lista.cumple).toBe(true);
    expect(lista.faltantes).toEqual([]);
    expect(lista.items.map((i) => i.requisito).sort()).toEqual([...REQUISITOS].sort());
  });

  const casos: [string, Partial<EntradaVerificacion>, string][] = [
    ["nombre", { nombre: null }, "nombre"],
    ["nombre en blanco", { nombre: "   " }, "nombre"],
    ["fecha de nacimiento", { fechaNacimiento: null }, "nacimiento"],
    ["identificador principal vigente", { identificadorPrincipal: null }, "identificador"],
    ["composición racial", { composicion: [] }, "composicion"],
    ["composición que no suma 100 %", { composicion: [{ fraccion: 0.5 }, { fraccion: 0.25 }] }, "composicion"],
    ["libro", { libro: null }, "libro"],
    ["prefijo del libro", { libro: { nombre: "Pureza por pedigrí", prefijo: null } }, "prefijo"],
    ["padre", { tienePadre: false }, "padre"],
    ["madre", { tieneMadre: false }, "madre"],
    ["criador", { criador: null }, "criador"],
    ["propietario", { propietario: "" }, "propietario"],
    ["criadero", { criadero: null }, "criadero"],
    ["genealogía que no pasa R1", { erroresGenealogia: [{ codigo: "padre_nacio_despues", otro: "Zeus" }] }, "genealogia"],
  ];
  for (const [nombre, cambio, requisito] of casos) {
    it(`si falta el ${nombre}, no cumple y señala «${requisito}»`, () => {
      const lista = verificarRequisitos(completa(cambio));
      expect(lista.cumple).toBe(false);
      expect(lista.faltantes).toEqual([requisito]);
      expect(lista.items.find((i) => i.requisito === requisito)?.cumple).toBe(false);
    });
  }

  it("junta todo lo que falta, no solo lo primero", () => {
    const lista = verificarRequisitos(completa({ nombre: null, libro: null, tienePadre: false, criadero: null }));
    expect(lista.faltantes.sort()).toEqual(["criadero", "libro", "nombre", "padre"]);
  });

  it("el libro «Fundadores» no exige padre ni madre (pero sí una genealogía correcta)", () => {
    const fundador = verificarRequisitos(completa({ libro: { nombre: "Fundadores", prefijo: "FUN" }, tienePadre: false, tieneMadre: false }));
    expect(fundador.cumple).toBe(true);
    expect(fundador.items.find((i) => i.requisito === "padre")).toMatchObject({ cumple: true, exento: true });
    expect(esLibroFundadores(" fundadores ")).toBe(true);
    expect(esLibroFundadores("Pureza por pedigrí")).toBe(false);
    expect(esLibroFundadores(null)).toBe(false);
    const roto = verificarRequisitos(
      completa({ libro: { nombre: "Fundadores", prefijo: "FUN" }, tienePadre: false, tieneMadre: false, erroresGenealogia: [{ codigo: "hijo_nacio_antes", otro: "Bruno" }] }),
    );
    expect(roto.faltantes).toEqual(["genealogia"]);
  });

  it("sin libro, el prefijo tampoco se puede comprobar y solo se señala el libro", () => {
    expect(verificarRequisitos(completa({ libro: null })).faltantes).toEqual(["libro"]);
  });
});

describe("R31: quién puede tener registro", () => {
  it("un animal del hato sí; uno de otra finca o registrado solo para la genealogía, no", () => {
    expect(validarElegibilidad({ origen: "nacido_aqui", enHato: true })).toEqual([]);
    expect(validarElegibilidad({ origen: "comprado", enHato: true })).toEqual([]);
    expect(validarElegibilidad({ origen: "externo", enHato: false })).toEqual([{ codigo: "animal_no_elegible" }]);
    expect(validarElegibilidad({ origen: "nacido_aqui", enHato: false })).toEqual([{ codigo: "animal_no_elegible" }]);
  });
});

describe("CA-17 (R31): numeración consecutiva por libro", () => {
  it("el siguiente consecutivo es el del libro, o el último usado más uno si el contador quedó atrás", () => {
    expect(siguienteConsecutivo(1, null)).toBe(1);
    expect(siguienteConsecutivo(5, null)).toBe(5);
    expect(siguienteConsecutivo(5, 4)).toBe(5);
    // Si el contador del libro se quedó atrás (una escritura a medias), nunca se repite un número.
    expect(siguienteConsecutivo(3, 7)).toBe(8);
  });

  const libros = (): Map<string, LibroNumeracion> =>
    new Map([
      ["pp", { formato: FORMATO, siguiente: 1 }],
      ["me", { formato: { prefijo: "MES", separador: "-", digitos: 3 }, siguiente: 40 }],
    ]);
  const candidato = (animalId: string, libroId: string | null, cambio: Partial<EntradaVerificacion> = {}, extra: Partial<CandidatoLote> = {}): CandidatoLote => ({
    animalId,
    libroId,
    lista: verificarRequisitos(completa({ libro: libroId ? { nombre: libroId, prefijo: "X" } : null, ...cambio })),
    ...extra,
  });

  it("emite los que cumplen con consecutivos seguidos, por libro, en el orden recibido", () => {
    const plan = planificarLote([candidato("a", "pp"), candidato("b", "me"), candidato("c", "pp"), candidato("d", "me")], libros());
    expect(plan.emitir).toEqual([
      { animalId: "a", libroId: "pp", consecutivo: 1, numero: "PPE-0001" },
      { animalId: "b", libroId: "me", consecutivo: 40, numero: "MES-040" },
      { animalId: "c", libroId: "pp", consecutivo: 2, numero: "PPE-0002" },
      { animalId: "d", libroId: "me", consecutivo: 41, numero: "MES-041" },
    ]);
    expect(plan.rechazados).toEqual([]);
    expect(plan.siguientePorLibro.get("pp")).toBe(3);
    expect(plan.siguientePorLibro.get("me")).toBe(42);
  });

  it("un animal rechazado no consume número: la numeración de los emitidos no deja saltos", () => {
    const plan = planificarLote(
      [candidato("a", "pp"), candidato("incompleto", "pp", { tienePadre: false }), candidato("c", "pp"), candidato("sin-libro", null), candidato("e", "pp")],
      libros(),
    );
    expect(plan.emitir.map((e) => e.numero)).toEqual(["PPE-0001", "PPE-0002", "PPE-0003"]);
    expect(plan.emitir.map((e) => e.animalId)).toEqual(["a", "c", "e"]);
    expect(plan.rechazados).toEqual([
      { animalId: "incompleto", motivo: "incompleto", faltantes: ["padre"] },
      { animalId: "sin-libro", motivo: "incompleto", faltantes: ["libro"] },
    ]);
    expect(plan.siguientePorLibro.get("pp")).toBe(4);
  });

  it("el que ya tiene un registro vigente se rechaza sin consumir número", () => {
    const plan = planificarLote([candidato("a", "pp", {}, { yaTieneRegistro: true }), candidato("b", "pp")], libros());
    expect(plan.emitir).toEqual([{ animalId: "b", libroId: "pp", consecutivo: 1, numero: "PPE-0001" }]);
    expect(plan.rechazados).toEqual([{ animalId: "a", motivo: "ya_registrado", faltantes: [] }]);
  });

  it("si nadie cumple, no emite nada y no mueve ningún contador", () => {
    const plan = planificarLote([candidato("a", "pp", { nombre: null })], libros());
    expect(plan.emitir).toEqual([]);
    expect(plan.siguientePorLibro.size).toBe(0);
  });

  it("un libro desconocido no emite", () => {
    const plan = planificarLote([candidato("a", "otro")], libros());
    expect(plan.emitir).toEqual([]);
    expect(plan.rechazados).toEqual([{ animalId: "a", motivo: "incompleto", faltantes: ["libro"] }]);
  });
});

describe("R31: estados y acciones", () => {
  it("un animal sin registro solo puede recibir uno nuevo (borrador o emisión directa)", () => {
    expect(validarAccion(null, "emitir")).toEqual([]);
    expect(validarAccion(null, "crear_borrador")).toEqual([]);
    expect(validarAccion(null, "reemitir")).toEqual([{ codigo: "registro_no_emitido" }]);
    expect(validarAccion(null, "anular")).toEqual([{ codigo: "registro_no_emitido" }]);
  });

  it("el borrador se edita, se descarta o se emite; no se reemite ni se anula (no tiene número)", () => {
    for (const accion of ["editar", "descartar", "emitir"] as const) expect(validarAccion("borrador", accion), accion).toEqual([]);
    expect(validarAccion("borrador", "reemitir")).toEqual([{ codigo: "registro_no_emitido" }]);
    expect(validarAccion("borrador", "anular")).toEqual([{ codigo: "registro_no_emitido" }]);
    expect(validarAccion("borrador", "crear_borrador")).toEqual([{ codigo: "registro_ya_vigente" }]);
  });

  it("el emitido se reemite o se anula; no se vuelve a emitir (un animal tiene un solo registro vigente)", () => {
    expect(validarAccion("emitido", "reemitir")).toEqual([]);
    expect(validarAccion("emitido", "anular")).toEqual([]);
    expect(validarAccion("emitido", "emitir")).toEqual([{ codigo: "registro_ya_vigente" }]);
    expect(validarAccion("emitido", "crear_borrador")).toEqual([{ codigo: "registro_ya_vigente" }]);
    expect(validarAccion("emitido", "descartar")).toEqual([{ codigo: "registro_no_borrador" }]);
    expect(validarAccion("emitido", "editar")).toEqual([{ codigo: "registro_no_borrador" }]);
  });

  it("el anulado no cambia más: conserva su número y su historial", () => {
    for (const accion of ["editar", "descartar", "reemitir", "anular"] as const) {
      expect(validarAccion("anulado", accion), accion).toEqual([{ codigo: "registro_anulado" }]);
    }
  });

  it("anular exige un motivo", () => {
    expect(validarMotivoAnulacion("Error de captura: era otro animal")).toEqual([]);
    expect(validarMotivoAnulacion(null)).toEqual([{ codigo: "motivo_anulacion_obligatorio" }]);
    expect(validarMotivoAnulacion("   ")).toEqual([{ codigo: "motivo_anulacion_obligatorio" }]);
  });
});

describe("CA-18 (R31): instantánea — cambiar el animal después de emitir no altera lo emitido", () => {
  const entrada = (): EntradaInstantanea => ({
    numero: "PPE-0001",
    version: 1,
    fechaRegistro: "2026-10-02",
    fechaEmision: "2026-10-02",
    responsable: "Ana Pérez",
    emitidoPor: "Ana Pérez",
    finca: { nombre: "Aprisco El Paraíso", criadero: "El Paraíso", municipio: "Rionegro" },
    criador: "Ana Pérez",
    propietario: "Ana Pérez",
    observaciones: null,
    animal: {
      id: "11111111-1111-4111-8111-111111111111",
      nombre: "Estrella",
      sexo: "hembra",
      fechaNacimiento: "2021-02-22",
      colorSenas: "Blanca",
      libro: "Pureza por pedigrí",
      formaConcepcion: "monta_natural",
      origen: "nacido_aqui",
      identificadores: [{ tipo: "arete", valor: "EJ-10", principal: true }],
      composicion: [{ raza: "Saanen", fraccion: 1 }],
      consanguinidad: 0.25,
    },
    pedigri: [
      { camino: "P", nombre: "Bruno", sexo: "macho", identificador: "EJ-06", registroAsociacion: null, externo: false, propietario: null, sinVerificar: false, fechaNacimiento: "2019-02-10" },
      { camino: "M", nombre: "Bella", sexo: "hembra", identificador: "EJ-07", registroAsociacion: null, externo: false, propietario: null, sinVerificar: false, fechaNacimiento: "2019-02-10" },
    ],
  });

  it("es una copia: cambiar los datos de origen después no la altera", () => {
    const origen = entrada();
    const instantanea = armarInstantanea(origen);
    origen.animal.nombre = "Otro nombre";
    origen.pedigri[0].nombre = "Otro padre";
    expect(instantanea.animal.nombre).toBe("Estrella");
    expect(instantanea.pedigri[0].nombre).toBe("Bruno");
  });

  it("se guarda como JSON y se lee igual (lo que se emitió es lo que se ve después)", () => {
    const instantanea = armarInstantanea(entrada());
    expect(leerInstantanea(JSON.stringify(instantanea))).toEqual(instantanea);
    expect(instantanea.esquema).toBe(1);
    expect(instantanea.numero).toBe("PPE-0001");
    expect(instantanea.version).toBe(1);
  });

  it("rechaza una instantánea ilegible o de un esquema que este programa no conoce", () => {
    expect(() => leerInstantanea("no es json")).toThrow();
    expect(() => leerInstantanea(JSON.stringify({ ...armarInstantanea(entrada()), esquema: 99 }))).toThrow(/esquema/);
    expect(() => leerInstantanea(JSON.stringify({ esquema: 1 }))).toThrow();
  });
});
