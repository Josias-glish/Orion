// R7 y CA-04: retiros de leche y carne; calendario de próximas aplicaciones (RF-22); validaciones de salud.
import { describe, expect, it } from "vitest";
import {
  alertasDeRetiro,
  finDeRetiro,
  proximasAplicaciones,
  retiroVigente,
  validarEventoSalud,
  type DatosEventoSalud,
  type EventoParaCalendario,
  type EventoConRetiro,
} from "./salud";

const tratamiento = (cambios: Partial<EventoConRetiro> = {}): EventoConRetiro => ({
  id: "t1",
  animalId: "a1",
  producto: "Oxitetraciclina",
  fechaInicio: "2026-09-10",
  fechaFin: null,
  retiroLecheDias: 5,
  retiroCarneDias: null,
  ...cambios,
});

describe("R7: fecha de fin del retiro", () => {
  it("es la fecha de inicio más los días de retiro si no hay fecha de fin", () => {
    expect(finDeRetiro("2026-09-10", null, 5)).toBe("2026-09-15");
  });

  it("cuenta desde la fecha de fin del tratamiento si la hay", () => {
    expect(finDeRetiro("2026-09-10", "2026-09-12", 5)).toBe("2026-09-17");
  });

  it("cruza meses y años", () => {
    expect(finDeRetiro("2026-12-29", null, 5)).toBe("2027-01-03");
  });

  it("sin días de retiro (vacío o cero) no hay retiro", () => {
    expect(finDeRetiro("2026-09-10", null, null)).toBeNull();
    expect(finDeRetiro("2026-09-10", null, 0)).toBeNull();
  });
});

describe("CA-04 (R7): con retiro de 5 días, la alerta se muestra hasta el quinto día después del tratamiento", () => {
  const t = tratamiento();
  const dias = ["2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14", "2026-09-15"];

  it("está vigente desde el día del tratamiento (D) hasta D+5, inclusive", () => {
    for (const hoy of dias) expect(retiroVigente(t, "leche", hoy), hoy).toEqual({ hasta: "2026-09-15" });
  });

  it("desaparece al vencer: el día D+6 ya no hay alerta", () => {
    expect(retiroVigente(t, "leche", "2026-09-16")).toBeNull();
    expect(alertasDeRetiro([t], "2026-09-16")).toEqual([]);
  });

  it("no hay alerta antes del tratamiento", () => {
    expect(retiroVigente(t, "leche", "2026-09-09")).toBeNull();
  });

  it("leche y carne se cuentan por separado", () => {
    const ambos = tratamiento({ retiroLecheDias: 5, retiroCarneDias: 28 });
    expect(retiroVigente(ambos, "carne", "2026-10-08")).toEqual({ hasta: "2026-10-08" });
    expect(retiroVigente(ambos, "leche", "2026-10-08")).toBeNull();
    expect(retiroVigente(ambos, "carne", "2026-10-09")).toBeNull();
  });
});

describe("alertas de retiro vigentes (RF-24)", () => {
  it("lista leche y carne de cada evento, del vencimiento más próximo al más lejano", () => {
    const alertas = alertasDeRetiro(
      [
        tratamiento({ id: "t1", retiroLecheDias: 5, retiroCarneDias: 20 }),
        tratamiento({ id: "t2", animalId: "a2", producto: "Ivermectina", fechaInicio: "2026-09-12", retiroLecheDias: 2 }),
        tratamiento({ id: "t3", animalId: "a3", fechaInicio: "2026-08-01", retiroLecheDias: 3 }), // ya venció
      ],
      "2026-09-13",
    );
    expect(alertas.map((a) => [a.eventoId, a.tipo, a.hasta])).toEqual([
      ["t2", "leche", "2026-09-14"],
      ["t1", "leche", "2026-09-15"],
      ["t1", "carne", "2026-09-30"],
    ]);
  });
});

describe("RF-22: calendario de próximas vacunas y desparasitaciones", () => {
  const aplicacion = (cambios: Partial<EventoParaCalendario>): EventoParaCalendario => ({
    id: "v1",
    animalId: "a1",
    tipo: "vacuna",
    producto: "Clostridial",
    fechaInicio: "2026-03-01",
    proximaFecha: "2026-09-01",
    ...cambios,
  });

  it("muestra las próximas fechas que vencen dentro del plazo y las ya vencidas", () => {
    const lista = proximasAplicaciones(
      [
        aplicacion({ id: "v1", proximaFecha: "2026-10-20" }), // dentro de 30 días
        aplicacion({ id: "v2", animalId: "a2", proximaFecha: "2026-09-25" }), // vencida hace 5 días
        aplicacion({ id: "v3", animalId: "a3", proximaFecha: "2026-12-01" }), // muy lejos
      ],
      "2026-09-30",
      30,
    );
    expect(lista.map((p) => [p.eventoId, p.vencida])).toEqual([
      ["v2", true],
      ["v1", false],
    ]);
  });

  it("una aplicación posterior del mismo producto al mismo animal reemplaza la fecha pendiente", () => {
    const lista = proximasAplicaciones(
      [
        aplicacion({ id: "vieja", fechaInicio: "2026-03-01", proximaFecha: "2026-09-01" }),
        aplicacion({ id: "nueva", fechaInicio: "2026-09-02", proximaFecha: "2027-03-01" }),
        aplicacion({ id: "otra", producto: "Rabia", fechaInicio: "2025-10-01", proximaFecha: "2026-10-01" }),
      ],
      "2026-09-30",
      30,
    );
    expect(lista.map((p) => p.eventoId)).toEqual(["otra"]);
  });

  it("ignora tratamientos y condición corporal", () => {
    expect(
      proximasAplicaciones([aplicacion({ tipo: "tratamiento" }), aplicacion({ tipo: "condicion_corporal" })], "2026-09-30", 30),
    ).toEqual([]);
  });
});

describe("validaciones de un evento de salud", () => {
  const datos = (cambios: Partial<DatosEventoSalud> = {}): DatosEventoSalud => ({
    tipo: "tratamiento",
    producto: "Oxitetraciclina",
    numeroRegistroIca: null,
    loteProducto: null,
    dosis: "10 ml",
    via: "intramuscular",
    fechaInicio: "2026-09-10",
    fechaFin: null,
    retiroLecheDias: 5,
    retiroCarneDias: 28,
    aplicador: null,
    veterinario: null,
    condicionCorporal: null,
    proximaFecha: null,
    observaciones: null,
    ...cambios,
  });
  const codigos = (d: DatosEventoSalud) => validarEventoSalud(d, "2026-09-30").map((m) => m.codigo);

  it("acepta un tratamiento completo", () => {
    expect(codigos(datos())).toEqual([]);
  });

  it("exige el producto en vacunas, desparasitaciones y tratamientos", () => {
    expect(codigos(datos({ producto: "  " }))).toEqual(["dato_obligatorio"]);
  });

  it("la fecha de fin no es anterior al inicio y ninguna fecha aplicada es futura", () => {
    expect(codigos(datos({ fechaFin: "2026-09-09" }))).toEqual(["fin_antes_del_inicio"]);
    expect(codigos(datos({ fechaInicio: "2026-10-05" }))).toEqual(["fecha_futura"]);
  });

  it("la próxima fecha va después de la aplicación", () => {
    expect(codigos(datos({ tipo: "vacuna", proximaFecha: "2026-09-10" }))).toEqual(["proxima_antes_del_inicio"]);
    expect(codigos(datos({ tipo: "vacuna", proximaFecha: "2027-03-10" }))).toEqual([]);
  });

  it("los días de retiro son enteros de 0 en adelante", () => {
    expect(codigos(datos({ retiroLecheDias: -1 }))).toEqual(["retiro_invalido"]);
    expect(codigos(datos({ retiroCarneDias: 2.5 }))).toEqual(["retiro_invalido"]);
  });

  it("la condición corporal va de 1 a 5 en pasos de medio punto (SUPOSICION)", () => {
    const cc = (valor: number | null) => datos({ tipo: "condicion_corporal", producto: null, retiroLecheDias: null, retiroCarneDias: null, condicionCorporal: valor });
    expect(codigos(cc(3.5))).toEqual([]);
    expect(codigos(cc(5.5))).toEqual(["condicion_invalida"]);
    expect(codigos(cc(2.3))).toEqual(["condicion_invalida"]);
    expect(codigos(cc(null))).toEqual(["condicion_invalida"]);
  });
});
