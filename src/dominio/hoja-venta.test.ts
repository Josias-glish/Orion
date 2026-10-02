// R21 (especificación 2): lo que lleva la hoja de venta. Esta es la parte pura; CA-25 (PDF y Excel con los mismos
// datos) se prueba en src/documentos/hoja-venta.test.ts y con la base en src/datos/repositorios/traspasos.test.ts.
import { describe, expect, it } from "vitest";
import { armarHojaVenta, type EntradaHojaVenta } from "./hoja-venta";
import { caminosDeGeneracion } from "./pedigri";
import type { AncestroInstantanea } from "./registros";

const ancestro = (camino: string, extra: Partial<AncestroInstantanea> = {}): AncestroInstantanea => ({
  camino,
  nombre: `Ancestro ${camino}`,
  sexo: camino.endsWith("P") ? "macho" : "hembra",
  identificador: `ID-${camino}`,
  registroAsociacion: null,
  externo: false,
  propietario: null,
  sinVerificar: false,
  fechaNacimiento: null,
  ...extra,
});

function entrada(cambios: Partial<EntradaHojaVenta> = {}): EntradaHojaVenta {
  return {
    fecha: "2026-10-02",
    finca: { nombre: "Aprisco El Paraíso", criadero: "El Paraíso", municipio: "Rionegro" },
    animal: {
      nombre: "Estrella",
      sexo: "hembra",
      fechaNacimiento: "2021-02-22",
      colorSenas: "Blanca",
      libro: "Pureza por pedigrí",
      estado: "activo",
      identificadores: [
        { tipo: "registro_asociacion", valor: "EJEMPLO-0110", principal: false, vigente: true },
        { tipo: "arete", valor: "EJ-10", principal: true, vigente: true },
        { tipo: "tatuaje", valor: "T-OLD", principal: false, vigente: false },
      ],
      composicion: [
        { raza: "Saanen", fraccion: 0.75 },
        { raza: "Alpina", fraccion: 0.25 },
      ],
      registroPropio: "PPE-0003",
    },
    pedigri: [1, 2, 3, 4].flatMap((g) => caminosDeGeneracion(g)).map((c) => ancestro(c)),
    lactancias: [
      { fechaInicio: "2025-03-01", fechaSecado: "2026-01-10", acumuladoKg: 812.5, promedioDiarioKg: 2.7 },
      { fechaInicio: "2026-08-01", fechaSecado: null, acumuladoKg: 120, promedioDiarioKg: 3.1 },
    ],
    ...cambios,
  };
}

describe("R21: hoja de venta", () => {
  it("trae los datos del animal, sus identificadores vigentes (el principal primero), la raza, la composición y el libro", () => {
    const { animal } = armarHojaVenta(entrada(), { incluirProduccion: false });
    expect(animal.nombre).toBe("Estrella");
    expect(animal.identificadores).toEqual([
      { tipo: "arete", valor: "EJ-10" },
      { tipo: "registro_asociacion", valor: "EJEMPLO-0110" },
    ]);
    expect(animal.composicion).toEqual([
      { raza: "Saanen", fraccion: 0.75 },
      { raza: "Alpina", fraccion: 0.25 },
    ]);
    expect(animal.composicionCompleta).toBe(true);
    expect(animal.libro).toBe("Pureza por pedigrí");
    expect(animal.registroPropio).toBe("PPE-0003");
    expect(animal.edadMeses).toBe(67); // 5 años y 7 meses
  });

  it("avisa si la composición racial no suma 100 %", () => {
    const e = entrada();
    e.animal.composicion = [{ raza: "Saanen", fraccion: 0.5 }];
    expect(armarHojaVenta(e, { incluirProduccion: false }).animal.composicionCompleta).toBe(false);
  });

  it("el árbol tiene tres generaciones (2, 4 y 8 lugares) y deja vacío el lugar del ancestro que no se conoce", () => {
    const e = entrada({ pedigri: entrada().pedigri.filter((a) => a.camino !== "PM" && !a.camino.startsWith("PM")) });
    const { arbol } = armarHojaVenta(e, { incluirProduccion: false });
    expect(arbol.map((c) => c.length)).toEqual([2, 4, 8]);
    expect(arbol[0].map((a) => a?.camino)).toEqual(["P", "M"]);
    expect(arbol[1].map((a) => a?.camino ?? null)).toEqual(["PP", null, "MP", "MM"]);
    expect(arbol[2].map((a) => a?.camino ?? null)).toEqual(["PPP", "PPM", null, null, "MPP", "MPM", "MMP", "MMM"]);
  });

  it("la cuarta generación guardada no entra en la hoja", () => {
    const { arbol } = armarHojaVenta(entrada(), { incluirProduccion: false });
    expect(arbol.flat().some((a) => (a?.camino.length ?? 0) > 3)).toBe(false);
  });

  it("la producción de leche es opcional: solo va si el vendedor la elige", () => {
    expect(armarHojaVenta(entrada(), { incluirProduccion: false }).produccion).toBeNull();
    const con = armarHojaVenta(entrada(), { incluirProduccion: true }).produccion;
    expect(con).toHaveLength(2);
    expect(con![0].acumuladoKg).toBe(812.5);
  });

  it("un macho nunca lleva producción de leche, aunque se pida", () => {
    const e = entrada();
    e.animal.sexo = "macho";
    expect(armarHojaVenta(e, { incluirProduccion: true }).produccion).toBeNull();
  });

  it("una hembra que no ha producido sale con la lista vacía, no sin el apartado", () => {
    expect(armarHojaVenta(entrada({ lactancias: [] }), { incluirProduccion: true }).produccion).toEqual([]);
  });
});
