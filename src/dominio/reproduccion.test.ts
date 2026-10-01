// R4, R5 (CA-03) y R9.
import { describe, expect, it } from "vitest";
import {
  fechaProbableParto,
  intervalosEntrePartos,
  padreDelParto,
  planificarCrias,
  promedio,
  type CriaAnotada,
  type ServicioResumido,
} from "./reproduccion";

describe("R4: fecha probable de parto", () => {
  it("suma los días de gestación de la finca a la fecha del servicio", () => {
    expect(fechaProbableParto("2026-03-10", 150)).toBe("2026-08-07");
  });

  it("cruza años y respeta los bisiestos", () => {
    expect(fechaProbableParto("2027-10-01", 150)).toBe("2028-02-28");
    expect(fechaProbableParto("2027-10-02", 150)).toBe("2028-02-29");
  });

  it("usa los días de gestación configurados", () => {
    expect(fechaProbableParto("2026-01-01", 145)).toBe("2026-05-26");
  });
});

const servicio = (s: Partial<ServicioResumido> & Pick<ServicioResumido, "id" | "fecha">): ServicioResumido => ({
  tipo: "monta",
  machoId: "Zeus",
  resultado: "prenada",
  ...s,
});

describe("R5: padre de las crías", () => {
  it("toma el macho del último servicio «preñada» anterior al parto", () => {
    const servicios = [
      servicio({ id: "s1", fecha: "2025-01-10", machoId: "Viejo" }),
      servicio({ id: "s2", fecha: "2026-03-10", machoId: "Zeus" }),
      servicio({ id: "s3", fecha: "2026-04-01", machoId: "Otro", resultado: "vacia" }),
    ];
    expect(padreDelParto(servicios, "2026-08-07")).toEqual({
      servicioId: "s2",
      padreId: "Zeus",
      padreSinVerificar: false,
      formaConcepcion: "monta_natural",
    });
  });

  it("ignora servicios posteriores al parto y los que no quedaron preñada", () => {
    const servicios = [
      servicio({ id: "s1", fecha: "2026-03-10", resultado: "pendiente" }),
      servicio({ id: "s2", fecha: "2026-09-01" }),
    ];
    expect(padreDelParto(servicios, "2026-08-07")).toEqual({
      servicioId: null,
      padreId: null,
      padreSinVerificar: true,
      formaConcepcion: null,
    });
  });

  it("una inseminación sin macho registrado deja el padre vacío y «sin verificar»", () => {
    const servicios = [servicio({ id: "s1", fecha: "2026-03-10", tipo: "inseminacion", machoId: null })];
    expect(padreDelParto(servicios, "2026-08-07")).toEqual({
      servicioId: "s1",
      padreId: null,
      padreSinVerificar: true,
      formaConcepcion: "inseminacion_artificial",
    });
  });
});

describe("CA-03 (dominio): un parto de tres crías planifica tres fichas con la madre asignada", () => {
  const crias: CriaAnotada[] = [
    { sexo: "hembra", nombre: "Uno", arete: "C-1", pesoNacimiento: 3.2, nacioMuerta: false },
    { sexo: "macho", nombre: null, arete: null, pesoNacimiento: null, nacioMuerta: false },
    { sexo: "hembra", nombre: "Tres", arete: null, pesoNacimiento: 2.1, nacioMuerta: true },
  ];

  it("crea una ficha por cría con madre, padre, fecha, libro vacío y estado", () => {
    const padre = { servicioId: "s2", padreId: "Zeus", padreSinVerificar: false, formaConcepcion: "monta_natural" as const };
    const fichas = planificarCrias("Bella", "2026-08-07", padre, crias);
    expect(fichas).toHaveLength(3);
    for (const f of fichas) {
      expect(f).toMatchObject({
        madreId: "Bella",
        padreId: "Zeus",
        padreSinVerificar: false,
        madreSinVerificar: false,
        fechaNacimiento: "2026-08-07",
        libroId: null,
        formaConcepcion: "monta_natural",
      });
    }
    expect(fichas.map((f) => [f.sexo, f.estado])).toEqual([
      ["hembra", "activo"],
      ["macho", "activo"],
      ["hembra", "muerto"],
    ]);
  });

  it("sin servicio, el padre queda vacío y «sin verificar»", () => {
    const padre = { servicioId: null, padreId: null, padreSinVerificar: true, formaConcepcion: null };
    const [ficha] = planificarCrias("Bella", "2026-08-07", padre, crias.slice(0, 1));
    expect(ficha).toMatchObject({ padreId: null, padreSinVerificar: true });
  });
});

describe("R9: intervalo entre partos", () => {
  it("da los días entre partos consecutivos, aunque vengan desordenados", () => {
    expect(intervalosEntrePartos(["2026-08-07", "2024-07-01", "2025-08-01"])).toEqual([396, 371]);
  });

  it("con un solo parto no hay intervalo", () => {
    expect(intervalosEntrePartos(["2026-08-07"])).toEqual([]);
  });

  it("calcula el promedio, o null si no hay datos", () => {
    expect(promedio([396, 371])).toBe(383.5);
    expect(promedio([])).toBeNull();
  });
});
