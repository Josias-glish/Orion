// R4, R5 (CA-03), R9 y, desde la Etapa 6, R30 (CA-15): montas con machos de otras fincas y paternidad incierta.
import { describe, expect, it } from "vitest";
import {
  analizarPaternidad,
  elegirPadre,
  fechaProbableParto,
  intervalosEntrePartos,
  MARGEN_GESTACION_POR_DEFECTO,
  padreDelParto,
  planificarCrias,
  promedio,
  validarServicio,
  ventanaDeGestacion,
  type AnimalDelServicio,
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

// ---------------------------------------------------------------- Etapa 6 (especificación 2)

describe("R5 con partos anteriores", () => {
  it("no usa un servicio «preñada» que ya dio un parto anterior", () => {
    const servicios = [servicio({ id: "viejo", fecha: "2025-01-10", machoId: "Viejo" })];
    // El parto de junio de 2025 vino de ese servicio; el de 2026 no tiene servicio confirmado.
    expect(padreDelParto(servicios, "2026-08-07", "2025-06-09")).toEqual({
      servicioId: null,
      padreId: null,
      padreSinVerificar: true,
      formaConcepcion: null,
    });
    expect(padreDelParto(servicios, "2025-06-09").servicioId).toBe("viejo");
  });
});

describe("R30: servicios con machos propios, de otras fincas o pajillas", () => {
  const hembra: AnimalDelServicio = { nombre: "Bella", sexo: "hembra", estado: "activo", origen: "nacido_aqui", enHato: true };
  const propio: AnimalDelServicio = { nombre: "Duque", sexo: "macho", estado: "activo", origen: "nacido_aqui", enHato: true };
  const externo: AnimalDelServicio = { nombre: "Titán", sexo: "macho", estado: "activo", origen: "externo", enHato: false };
  const datos = { tipo: "monta" as const, pajilla: null, costo: null, condiciones: null };

  it("acepta una monta con un macho propio o con uno de otra finca", () => {
    expect(validarServicio(datos, hembra, propio)).toEqual([]);
    expect(validarServicio(datos, hembra, externo)).toEqual([]);
  });

  it("acepta una inseminación solo con la pajilla, pero una monta necesita el macho", () => {
    expect(validarServicio({ ...datos, tipo: "inseminacion", pajilla: "PJ-778" }, hembra, null)).toEqual([]);
    expect(validarServicio({ ...datos, pajilla: "PJ-778" }, hembra, null)).toEqual([{ codigo: "monta_sin_macho" }]);
    expect(validarServicio({ ...datos, tipo: "inseminacion" }, hembra, null)).toEqual([{ codigo: "inseminacion_sin_dato" }]);
  });

  it("guarda costo y condiciones solo con un macho de otra finca", () => {
    const acordado = { ...datos, costo: 150000, condiciones: "Se paga al confirmar la preñez" };
    expect(validarServicio(acordado, hembra, externo)).toEqual([]);
    expect(validarServicio(acordado, hembra, propio)).toEqual([{ codigo: "costo_solo_externo" }]);
    expect(validarServicio({ ...datos, condiciones: "Algo" }, hembra, propio)).toEqual([{ codigo: "costo_solo_externo" }]);
  });

  it("el costo es un número entero de pesos, 0 o más", () => {
    expect(validarServicio({ ...datos, costo: -1 }, hembra, externo)).toEqual([{ codigo: "costo_invalido" }]);
    expect(validarServicio({ ...datos, costo: 1500.5 }, hembra, externo)).toEqual([{ codigo: "costo_invalido" }]);
    expect(validarServicio({ ...datos, costo: 0 }, hembra, externo)).toEqual([]);
  });

  it("R29: una hembra de otra finca no recibe servicios; R11: un macho vendido o muerto no sirve", () => {
    expect(validarServicio(datos, { ...hembra, origen: "externo", enHato: false }, propio)).toEqual([
      { codigo: "animal_no_disponible", otro: "Bella" },
    ]);
    expect(validarServicio(datos, hembra, { ...externo, estado: "muerto" })).toEqual([{ codigo: "animal_no_disponible", otro: "Titán" }]);
  });

  it("comprueba el sexo de cada uno", () => {
    expect(validarServicio(datos, propio, hembra)).toEqual([
      { codigo: "debe_ser_hembra", otro: "Duque" },
      { codigo: "debe_ser_macho", otro: "Bella" },
    ]);
  });
});

describe("R30: ventana de gestación", () => {
  it("SUPOSICION: el margen por defecto es de 10 días", () => {
    expect(MARGEN_GESTACION_POR_DEFECTO).toBe(10);
  });

  it("va desde el parto menos (gestación + margen) hasta el parto menos (gestación − margen)", () => {
    expect(ventanaDeGestacion("2026-08-07", 150, 10)).toEqual({ desde: "2026-02-28", hasta: "2026-03-20" });
    expect(ventanaDeGestacion("2026-08-07", 150, 0)).toEqual({ desde: "2026-03-10", hasta: "2026-03-10" });
  });
});

describe("R30 y CA-15: paternidad incierta", () => {
  const analizar = (servicios: ServicioResumido[], anterior: string | null = null) =>
    analizarPaternidad(servicios, "2026-08-07", 150, 10, anterior);

  it("CA-15: dos servicios con machos distintos dentro de la ventana hacen incierta la paternidad", () => {
    const a = analizar([
      servicio({ id: "propio", fecha: "2026-03-01", machoId: "Duque", resultado: "pendiente" }),
      servicio({ id: "externo", fecha: "2026-03-12", machoId: "Titán" }),
    ]);
    expect(a.incierta).toBe(true);
    expect(a.candidatos.map((c) => [c.servicioId, c.machoId])).toEqual([
      ["externo", "Titán"],
      ["propio", "Duque"],
    ]);
    // R5 sigue proponiendo el último servicio confirmado.
    expect(a.propuesto.padreId).toBe("Titán");
  });

  it("dos servicios con el mismo macho no hacen incierta la paternidad", () => {
    const a = analizar([
      servicio({ id: "s1", fecha: "2026-03-01", resultado: "pendiente" }),
      servicio({ id: "s2", fecha: "2026-03-12" }),
    ]);
    expect(a.incierta).toBe(false);
    expect(a.candidatos.map((c) => c.servicioId)).toEqual(["s2"]);
  });

  it("no cuentan los servicios fuera de la ventana, los «vacía», los abortos ni los anteriores al parto previo", () => {
    const a = analizar(
      [
        servicio({ id: "lejos", fecha: "2026-02-20", machoId: "Lejano", resultado: "pendiente" }),
        servicio({ id: "vacia", fecha: "2026-03-02", machoId: "Vacío", resultado: "vacia" }),
        servicio({ id: "aborto", fecha: "2026-03-04", machoId: "Aborto", resultado: "aborto" }),
        servicio({ id: "bueno", fecha: "2026-03-12", machoId: "Titán" }),
      ],
      "2026-03-03",
    );
    expect(a.incierta).toBe(false);
    expect(a.candidatos.map((c) => c.servicioId)).toEqual(["bueno"]);
  });

  it("una pajilla de un donante sin registrar cuenta como otro padre posible", () => {
    const a = analizar([
      servicio({ id: "pajilla", fecha: "2026-03-01", tipo: "inseminacion", machoId: null, pajilla: "PJ-778", resultado: "pendiente" }),
      servicio({ id: "monta", fecha: "2026-03-12", machoId: "Titán" }),
    ]);
    expect(a.incierta).toBe(true);
    expect(a.candidatos.map((c) => c.servicioId)).toEqual(["monta", "pajilla"]);
  });

  it("CA-15: deja elegir al padre entre los posibles y marcarlo «sin verificar»", () => {
    const a = analizar([
      servicio({ id: "propio", fecha: "2026-03-01", machoId: "Duque", resultado: "pendiente" }),
      servicio({ id: "externo", fecha: "2026-03-12", machoId: "Titán" }),
    ]);
    expect(elegirPadre(a, { servicioId: "propio", sinVerificar: true })).toEqual({
      padre: { servicioId: "propio", padreId: "Duque", padreSinVerificar: true, formaConcepcion: "monta_natural" },
      motivos: [],
    });
    expect(elegirPadre(a, { servicioId: "externo", sinVerificar: false }).padre).toMatchObject({ padreId: "Titán", padreSinVerificar: false });
    // «Padre desconocido»: queda vacío y sin verificar.
    expect(elegirPadre(a, { servicioId: null, sinVerificar: false }).padre).toEqual({
      servicioId: null,
      padreId: null,
      padreSinVerificar: true,
      formaConcepcion: null,
    });
  });

  it("no acepta como padre un servicio que no es posible", () => {
    const a = analizar([servicio({ id: "s2", fecha: "2026-03-12" })]);
    expect(elegirPadre(a, { servicioId: "otro", sinVerificar: false }).motivos).toEqual([{ codigo: "padre_no_candidato" }]);
  });
});
