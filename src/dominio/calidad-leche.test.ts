import { describe, expect, it } from "vitest";
import {
  barrasDeComparacion,
  leerMuestra,
  ordenarComparacion,
  promediarIgnorandoVacios,
  resumirCalidad,
  tieneCalidad,
  validarMuestra,
  type FilaComparacion,
  type MuestraCalidad,
} from "./calidad-leche";

const muestra = (grasaPct: number | null, proteinaPct: number | null, celulasSomaticas: number | null): MuestraCalidad => ({
  grasaPct,
  proteinaPct,
  celulasSomaticas,
});

describe("leerMuestra: lo que se escribe en el ordeño (RF-32)", () => {
  const leer = (grasa: string, proteina: string, celulas: string) => leerMuestra({ grasa, proteina, celulas });

  it("acepta coma o punto decimal en la grasa y la proteína, y deja vacío lo que no se escribe", () => {
    expect(leer("3,8", "3.2", "")).toEqual({ muestra: muestra(3.8, 3.2, null), errores: [] });
    expect(leer("  ", "", "")).toEqual({ muestra: muestra(null, null, null), errores: [] });
  });

  it("las células somáticas son un número entero; el punto separa miles, como en los pesos", () => {
    expect(leer("", "", "450000").muestra.celulasSomaticas).toBe(450000);
    expect(leer("", "", "450.000").muestra.celulasSomaticas).toBe(450000);
    expect(leer("", "", "1.250.000").muestra.celulasSomaticas).toBe(1250000);
    expect(leer("", "", "0").muestra.celulasSomaticas).toBe(0);
  });

  it("rechaza lo que no es un número, y dice cuál campo falló", () => {
    expect(leer("abc", "", "").errores).toEqual([{ codigo: "grasa_invalida" }]);
    expect(leer("", "-1", "").errores).toEqual([{ codigo: "proteina_invalida" }]);
    expect(leer("", "", "4,5").errores).toEqual([{ codigo: "celulas_invalidas" }]);
    expect(leer("x", "y", "z").errores.map((e) => e.codigo)).toEqual(["grasa_invalida", "proteina_invalida", "celulas_invalidas"]);
  });

  it("un valor que no se pudo leer queda vacío (no se guarda un número a medias)", () => {
    expect(leer("abc", "3", "").muestra).toEqual(muestra(null, 3, null));
  });

  it("rechaza porcentajes fuera de 0 a 100", () => {
    expect(leer("101", "", "").errores).toEqual([{ codigo: "grasa_invalida" }]);
    expect(leer("100", "0", "").errores).toEqual([]);
  });
});

describe("validarMuestra", () => {
  it("acepta una muestra vacía o completa", () => {
    expect(validarMuestra(muestra(null, null, null))).toEqual([]);
    expect(validarMuestra(muestra(3.5, 3.1, 520000))).toEqual([]);
  });

  it("los porcentajes van de 0 a 100 y las células son un entero de 0 o más", () => {
    expect(validarMuestra(muestra(-0.1, null, null))).toEqual([{ codigo: "grasa_invalida" }]);
    expect(validarMuestra(muestra(null, 100.01, null))).toEqual([{ codigo: "proteina_invalida" }]);
    expect(validarMuestra(muestra(Number.NaN, null, null))).toEqual([{ codigo: "grasa_invalida" }]);
    expect(validarMuestra(muestra(null, null, 1.5))).toEqual([{ codigo: "celulas_invalidas" }]);
    expect(validarMuestra(muestra(null, null, -5))).toEqual([{ codigo: "celulas_invalidas" }]);
    expect(validarMuestra(muestra(null, null, Number.POSITIVE_INFINITY))).toEqual([{ codigo: "celulas_invalidas" }]);
  });

  it("tieneCalidad: basta un valor", () => {
    expect(tieneCalidad(muestra(null, null, null))).toBe(false);
    expect(tieneCalidad(muestra(null, null, 0))).toBe(true);
    expect(tieneCalidad(muestra(0, null, null))).toBe(true);
  });
});

describe("R18: promedios por lactancia que ignoran los valores vacíos", () => {
  it("promediarIgnorandoVacios no cuenta los vacíos como cero", () => {
    expect(promediarIgnorandoVacios([400000, null, 600000, null, 800000, 200000])).toEqual({ promedio: 500000, muestras: 4 });
    expect(promediarIgnorandoVacios([null, undefined, null])).toEqual({ promedio: null, muestras: 0 });
    expect(promediarIgnorandoVacios([])).toEqual({ promedio: null, muestras: 0 });
    // Un cero es un valor real (por ejemplo, 0 células): sí cuenta.
    expect(promediarIgnorandoVacios([0, 100])).toEqual({ promedio: 50, muestras: 2 });
  });

  it("CA-21: el promedio de células somáticas de una lactancia coincide con el cálculo manual y no cuenta los vacíos", () => {
    // Seis pesajes de una misma lactancia; solo cuatro llevan células somáticas.
    const pesajes = [
      muestra(3.0, null, 400000),
      muestra(3.5, null, null),
      muestra(null, null, 600000),
      muestra(null, null, null),
      muestra(null, null, 800000),
      muestra(null, null, 200000),
    ];
    // A mano: (400 000 + 600 000 + 800 000 + 200 000) / 4 = 500 000. Contando los vacíos como cero daría 333 333.
    const resumen = resumirCalidad(pesajes);
    expect(resumen.celulas).toEqual({ promedio: 500000, muestras: 4 });
    expect(resumen.celulas.promedio).not.toBeCloseTo(2000000 / 6, 0);
    // Grasa: (3,0 + 3,5) / 2 = 3,25 con 2 muestras. La proteína no tiene ninguna: sin dato, no cero.
    expect(resumen.grasa).toEqual({ promedio: 3.25, muestras: 2 });
    expect(resumen.proteina).toEqual({ promedio: null, muestras: 0 });
  });

  it("CA-21: una lactancia sin muestras no inventa promedios", () => {
    expect(resumirCalidad([])).toEqual({
      grasa: { promedio: null, muestras: 0 },
      proteina: { promedio: null, muestras: 0 },
      celulas: { promedio: null, muestras: 0 },
    });
    expect(resumirCalidad([muestra(null, null, null)]).celulas.promedio).toBeNull();
  });
});

describe("comparación entre cabras (tabla ordenable)", () => {
  const fila = (id: string, hembra: string, fechaInicio: string, grasa: number | null, celulas: number | null): FilaComparacion => ({
    id,
    hembra,
    fechaInicio,
    enCurso: true,
    resumen: {
      grasa: { promedio: grasa, muestras: grasa === null ? 0 : 3 },
      proteina: { promedio: null, muestras: 0 },
      celulas: { promedio: celulas, muestras: celulas === null ? 0 : 3 },
    },
  });
  const filas = [
    fila("a", "Luna", "2025-08-01", 3.6, 700000),
    fila("b", "Bella", "2025-09-10", null, null),
    fila("c", "Sol", "2025-07-15", 4.1, 300000),
    fila("d", "Alba", "2025-09-01", 3.2, null),
  ];
  const ids = (f: FilaComparacion[]) => f.map((x) => x.id);

  it("ordena por una columna de calidad, de menor a mayor o al revés", () => {
    expect(ids(ordenarComparacion(filas, "grasa", "asc"))).toEqual(["d", "a", "c", "b"]);
    expect(ids(ordenarComparacion(filas, "grasa", "desc"))).toEqual(["c", "a", "d", "b"]);
  });

  it("las cabras sin dato van siempre al final, sea cual sea el sentido", () => {
    expect(ids(ordenarComparacion(filas, "celulas", "asc"))).toEqual(["c", "a", "b", "d"]);
    expect(ids(ordenarComparacion(filas, "celulas", "desc"))).toEqual(["a", "c", "b", "d"]);
  });

  it("ordena por nombre de la hembra y por fecha de parto", () => {
    expect(ids(ordenarComparacion(filas, "hembra", "asc"))).toEqual(["d", "b", "a", "c"]);
    expect(ids(ordenarComparacion(filas, "inicio", "desc"))).toEqual(["b", "d", "a", "c"]);
  });

  it("no cambia la lista original", () => {
    const copia = [...filas];
    ordenarComparacion(filas, "grasa", "desc");
    expect(filas).toEqual(copia);
  });

  it("barrasDeComparacion: solo las cabras con dato, de mayor a menor", () => {
    expect(barrasDeComparacion(filas, "celulas").map((b) => [b.id, b.valor])).toEqual([
      ["a", 700000],
      ["c", 300000],
    ]);
    expect(barrasDeComparacion(filas, "proteina")).toEqual([]);
  });
});
