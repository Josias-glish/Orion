// RF-36 (especificación 2): inventario del hato. Cuenta solo animales del hato que siguen activos (R11 y R29).
import { describe, expect, it } from "vitest";
import { armarInventario, type AnimalDeInventario } from "./inventario";

const animal = (id: string, cambios: Partial<AnimalDeInventario> = {}): AnimalDeInventario => ({
  id,
  nombre: id,
  identificador: `ID-${id}`,
  registroAsociacion: null,
  sexo: "hembra",
  fechaNacimiento: "2024-01-15",
  estado: "activo",
  origen: "nacido_aqui",
  enHato: true,
  fechaIngreso: null,
  lote: null,
  libro: null,
  razas: [{ raza: "Saanen", fraccion: 1 }],
  ...cambios,
});

describe("RF-36: inventario del hato", () => {
  it("cuenta los animales activos del hato, ordenados por nombre sin distinguir mayúsculas ni tildes", () => {
    const inv = armarInventario([animal("Óscar"), animal("ana"), animal("Beto")], "2026-10-02");
    expect(inv.filas.map((f) => f.nombre)).toEqual(["ana", "Beto", "Óscar"]);
    expect(inv.totales.total).toBe(3);
  });

  it("deja fuera a los vendidos, a los muertos y a los de otras fincas (R11 y R29)", () => {
    const inv = armarInventario(
      [
        animal("Ana"),
        animal("Vendida", { estado: "vendido" }),
        animal("Muerta", { estado: "muerto" }),
        animal("Titán", { origen: "externo", enHato: false, sexo: "macho" }),
        animal("Abuelo", { enHato: false }),
      ],
      "2026-10-02",
    );
    expect(inv.filas.map((f) => f.nombre)).toEqual(["Ana"]);
  });

  it("un animal comprado cuenta desde su fecha de ingreso (R32)", () => {
    const comprada = animal("Luna", { origen: "comprado", fechaIngreso: "2026-10-02" });
    expect(armarInventario([comprada], "2026-10-01").filas).toHaveLength(0);
    expect(armarInventario([comprada], "2026-10-02").filas).toHaveLength(1);
    expect(armarInventario([animal("Sin fecha", { origen: "comprado", fechaIngreso: null })], "2026-10-01").filas).toHaveLength(1);
  });

  it("totales por sexo, por origen y por lote (los sin lote al final)", () => {
    const inv = armarInventario(
      [
        animal("A", { lote: "Ordeño" }),
        animal("B", { lote: "Ordeño" }),
        animal("C", { sexo: "macho", lote: "Machos" }),
        animal("D", { origen: "comprado", fechaIngreso: "2026-01-01" }),
      ],
      "2026-10-02",
    );
    expect(inv.totales).toEqual({
      total: 4,
      hembras: 3,
      machos: 1,
      nacidosAqui: 3,
      comprados: 1,
      porLote: [
        { lote: "Machos", cantidad: 1 },
        { lote: "Ordeño", cantidad: 2 },
        { lote: null, cantidad: 1 },
      ],
    });
  });

  it("calcula la edad en meses a la fecha del inventario y deja vacía la de quien no tiene nacimiento", () => {
    const inv = armarInventario([animal("A", { fechaNacimiento: "2024-01-15" }), animal("B", { fechaNacimiento: null })], "2026-10-02");
    expect(inv.filas.map((f) => f.edadMeses)).toEqual([32, null]);
  });

  it("un inventario vacío tiene todos los totales en cero", () => {
    expect(armarInventario([], "2026-10-02").totales).toEqual({ total: 0, hembras: 0, machos: 0, nacidosAqui: 0, comprados: 0, porLote: [] });
  });
});
