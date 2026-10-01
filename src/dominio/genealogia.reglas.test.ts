// R1 y CA-01: integridad de la genealogía.
import { describe, expect, it } from "vitest";
import { descendientesDe, validarGenealogia, type AnimalGenealogico, type EntradaGenealogia } from "./genealogia";

const animal = (id: string, sexo: "hembra" | "macho", fechaNacimiento: string | null = null): AnimalGenealogico => ({
  id,
  nombre: id,
  sexo,
  fechaNacimiento,
});

const cria = animal("Cría", "hembra", "2023-03-01");
const padre = animal("Padre", "macho", "2020-01-10");
const madre = animal("Madre", "hembra", "2020-02-20");

function validar(cambios: Partial<EntradaGenealogia>) {
  return validarGenealogia({
    animal: cria,
    padre: null,
    madre: null,
    descendientes: new Set(),
    hijosComoPadre: [],
    hijosComoMadre: [],
    ...cambios,
  });
}

describe("R1: padres válidos", () => {
  it("acepta un padre macho y una madre hembra nacidos antes", () => {
    expect(validar({ padre, madre })).toEqual([]);
  });

  it("acepta un fundador sin padres", () => {
    expect(validar({})).toEqual([]);
  });

  it("acepta fechas desconocidas sin rechazar (SUPOSICION)", () => {
    expect(validar({ animal: animal("Cría", "hembra", null), padre, madre })).toEqual([]);
    expect(validar({ padre: animal("Padre", "macho", null) })).toEqual([]);
  });
});

describe("CA-01: rechaza padres imposibles y explica el motivo", () => {
  it("rechaza una hembra como padre", () => {
    const hembra = animal("Luna", "hembra", "2019-01-01");
    expect(validar({ padre: hembra })).toEqual([{ codigo: "padre_no_es_macho", otro: "Luna" }]);
  });

  it("rechaza un macho como madre", () => {
    const macho = animal("Zeus", "macho", "2019-01-01");
    expect(validar({ madre: macho })).toEqual([{ codigo: "madre_no_es_hembra", otro: "Zeus" }]);
  });

  it("rechaza como padre a un descendiente del animal (ciclo)", () => {
    const nieto = animal("Nieto", "macho", "2018-01-01");
    expect(validar({ padre: nieto, descendientes: new Set(["Hijo", "Nieto"]) })).toEqual([
      { codigo: "padre_es_descendiente", otro: "Nieto" },
    ]);
  });

  it("rechaza como madre a una descendiente del animal (ciclo)", () => {
    const hija = animal("Hija", "hembra", "2018-01-01");
    expect(validar({ madre: hija, descendientes: new Set(["Hija"]) })).toEqual([
      { codigo: "madre_es_descendiente", otro: "Hija" },
    ]);
  });

  it("rechaza que el animal sea su propio padre o madre", () => {
    expect(validar({ animal: animal("X", "macho", "2020-01-01"), padre: animal("X", "macho", "2020-01-01") })).toEqual([
      { codigo: "padre_es_el_mismo_animal" },
    ]);
    expect(validar({ madre: { ...cria } })).toEqual([{ codigo: "madre_es_el_mismo_animal" }]);
  });

  it("rechaza un padre nacido después que el animal", () => {
    const joven = animal("Joven", "macho", "2024-05-01");
    expect(validar({ padre: joven })).toEqual([{ codigo: "padre_nacio_despues", otro: "Joven" }]);
  });

  it("rechaza una madre nacida el mismo día que la cría", () => {
    const misma = animal("Gemela", "hembra", "2023-03-01");
    expect(validar({ madre: misma })).toEqual([{ codigo: "madre_nacio_despues", otro: "Gemela" }]);
  });

  it("informa todos los motivos a la vez", () => {
    const hembraJoven = animal("Brisa", "hembra", "2024-01-01");
    expect(validar({ padre: hembraJoven })).toEqual([
      { codigo: "padre_no_es_macho", otro: "Brisa" },
      { codigo: "padre_nacio_despues", otro: "Brisa" },
    ]);
  });
});

describe("R1: cambios en un animal que ya tiene hijos", () => {
  it("rechaza cambiar a hembra un macho que es padre", () => {
    const comoHembra = animal("Padre", "hembra", "2020-01-10");
    expect(validar({ animal: comoHembra, hijosComoPadre: [cria] })).toEqual([
      { codigo: "sexo_no_coincide_con_hijos", otro: "Cría" },
    ]);
  });

  it("rechaza cambiar a macho una hembra que es madre", () => {
    const comoMacho = animal("Madre", "macho", "2020-02-20");
    expect(validar({ animal: comoMacho, hijosComoMadre: [cria] })).toEqual([
      { codigo: "sexo_no_coincide_con_hijos", otro: "Cría" },
    ]);
  });

  it("rechaza una fecha de nacimiento posterior a la de un hijo", () => {
    const tarde = animal("Padre", "macho", "2023-06-01");
    expect(validar({ animal: tarde, hijosComoPadre: [cria] })).toEqual([{ codigo: "hijo_nacio_antes", otro: "Cría" }]);
  });
});

describe("descendientesDe", () => {
  const padres = new Map([
    ["A", { padreId: null, madreId: null }],
    ["B", { padreId: "A", madreId: null }],
    ["C", { padreId: null, madreId: "B" }],
    ["D", { padreId: "C", madreId: null }],
    ["E", { padreId: null, madreId: null }],
  ]);

  it("encuentra hijos, nietos y bisnietos", () => {
    expect(descendientesDe("A", padres)).toEqual(new Set(["B", "C", "D"]));
    expect(descendientesDe("E", padres)).toEqual(new Set());
  });

  it("termina aunque los datos tengan un ciclo", () => {
    const conCiclo = new Map([
      ["A", { padreId: "B", madreId: null }],
      ["B", { padreId: "A", madreId: null }],
    ]);
    expect(descendientesDe("A", conCiclo)).toEqual(new Set(["A", "B"]));
  });
});
