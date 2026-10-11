import { describe, expect, it } from "vitest";
import {
  acortarMarcaFutura,
  ahoraCorregida,
  calcularDesfase,
  codigoDeDispositivo,
  compararMarcas,
  fechaDeMarca,
  formatearMarca,
  leerMarca,
  nuevaMarca,
  recibirMarca,
  relojDesajustado,
  TOLERANCIA_FUTURO_MS,
} from "./hlc";

const A = codigoDeDispositivo("a1b2c3d4-0000-4000-8000-000000000000");
const B = codigoDeDispositivo("ffeeddcc-0000-4000-8000-000000000000");
const AHORA = Date.parse("2026-10-02T19:23:27.123Z");

describe("marcas (R17)", () => {
  it("tienen un formato fijo que se puede leer de vuelta", () => {
    const marca = formatearMarca({ fisico: AHORA, contador: 1, dispositivo: A });
    expect(marca).toBe("2026-10-02T19:23:27.123Z-0001-a1b2c3d4");
    expect(leerMarca(marca)).toEqual({ fisico: AHORA, contador: 1, dispositivo: A });
    expect(leerMarca("2026-10-02")).toBeNull();
    expect(fechaDeMarca(marca)).toBe("2026-10-02T19:23:27.123Z");
  });

  it("el código del equipo son los 8 primeros caracteres hexadecimales de su id", () => {
    expect(A).toBe("a1b2c3d4");
    expect(codigoDeDispositivo("ABCDEF12-3456-4000-8000-000000000000")).toBe("abcdef12");
  });

  it("el orden alfabético es el orden de las marcas: hora, contador y equipo", () => {
    const ordenadas = [
      formatearMarca({ fisico: AHORA, contador: 0, dispositivo: A }),
      formatearMarca({ fisico: AHORA, contador: 0, dispositivo: B }),
      formatearMarca({ fisico: AHORA, contador: 1, dispositivo: A }),
      formatearMarca({ fisico: AHORA, contador: 0x10, dispositivo: A }),
      formatearMarca({ fisico: AHORA + 1, contador: 0, dispositivo: A }),
    ];
    expect([...ordenadas].sort()).toEqual(ordenadas);
    expect(compararMarcas(ordenadas[0], ordenadas[1])).toBe(-1);
    expect(compararMarcas(ordenadas[1], ordenadas[1])).toBe(0);
    expect(compararMarcas(ordenadas[4], ordenadas[3])).toBe(1);
  });

  it("una marca nueva nunca retrocede, aunque el reloj del sistema se atrase", () => {
    const primera = nuevaMarca(null, AHORA, A);
    const segunda = nuevaMarca(primera, AHORA, A);
    const atrasada = nuevaMarca(segunda, AHORA - 60_000, A);
    expect(compararMarcas(primera, segunda)).toBe(-1);
    expect(compararMarcas(segunda, atrasada)).toBe(-1);
    expect(leerMarca(atrasada)?.fisico).toBe(AHORA);
    expect(leerMarca(atrasada)?.contador).toBe(2);
  });

  it("con el reloj adelantado, el contador vuelve a 0", () => {
    const primera = nuevaMarca(null, AHORA, A);
    expect(leerMarca(nuevaMarca(primera, AHORA + 5, A))).toMatchObject({ fisico: AHORA + 5, contador: 0 });
  });

  it("si el contador se llena, pasa al milisegundo siguiente", () => {
    const llena = formatearMarca({ fisico: AHORA, contador: 0xffff, dispositivo: A });
    expect(leerMarca(nuevaMarca(llena, AHORA, A))).toMatchObject({ fisico: AHORA + 1, contador: 0 });
  });

  it("recibir una marca ajena adelanta el reloj guardado, y lo hecho después queda posterior", () => {
    const propia = nuevaMarca(null, AHORA, A);
    const ajena = formatearMarca({ fisico: AHORA + 1000, contador: 3, dispositivo: B });
    const guardada = recibirMarca(propia, ajena, AHORA)!;
    expect(guardada).toBe(ajena);
    expect(compararMarcas(ajena, nuevaMarca(guardada, AHORA, A))).toBe(-1);
  });

  it("no adopta una marca ajena adelantada más de 10 minutos ni una que no se puede leer", () => {
    const propia = nuevaMarca(null, AHORA, A);
    const lejana = formatearMarca({ fisico: AHORA + TOLERANCIA_FUTURO_MS + 1, contador: 0, dispositivo: B });
    expect(recibirMarca(propia, lejana, AHORA)).toBe(propia);
    expect(recibirMarca(propia, "basura", AHORA)).toBe(propia);
    expect(recibirMarca(null, formatearMarca({ fisico: AHORA, contador: 0, dispositivo: B }), AHORA)).not.toBeNull();
  });
});

describe("corrección con la hora del servidor (R17)", () => {
  it("el desfase usa el punto medio de la petición", () => {
    // El equipo mandó la petición a las 1000 y recibió la respuesta a las 1200: el servidor contestó a las 1100 de su reloj.
    expect(calcularDesfase(1000, 1200, 1100)).toBe(0);
    // Reloj del equipo atrasado 2 días.
    const dosDias = 2 * 24 * 3600 * 1000;
    expect(calcularDesfase(1000 - dosDias, 1200 - dosDias, 1100)).toBe(dosDias);
    expect(ahoraCorregida(5000 - dosDias, dosDias)).toBe(5000);
  });

  it("avisa cuando el desfase pasa de 2 minutos, hacia adelante o hacia atrás", () => {
    expect(relojDesajustado(60_000)).toBe(false);
    expect(relojDesajustado(121_000)).toBe(true);
    expect(relojDesajustado(-121_000)).toBe(true);
  });

  it("el servidor acorta una marca adelantada más de 10 minutos a su hora, y no toca las demás", () => {
    const servidor = AHORA;
    const futura = formatearMarca({ fisico: Date.parse("2030-01-01T00:00:00.000Z"), contador: 7, dispositivo: A });
    const acortada = acortarMarcaFutura(futura, servidor);
    expect(acortada.corregida).toBe(true);
    expect(leerMarca(acortada.marca)).toEqual({ fisico: servidor, contador: 7, dispositivo: A });

    const casiFutura = formatearMarca({ fisico: servidor + TOLERANCIA_FUTURO_MS, contador: 0, dispositivo: A });
    expect(acortarMarcaFutura(casiFutura, servidor)).toEqual({ marca: casiFutura, corregida: false });
    const vieja = formatearMarca({ fisico: servidor - 3 * 24 * 3600 * 1000, contador: 0, dispositivo: A });
    expect(acortarMarcaFutura(vieja, servidor).corregida).toBe(false);
  });
});
