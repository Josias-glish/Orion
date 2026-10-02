// Etapa 9 (especificación 2): reglas R32 (compra) y R20 (venta) del dominio. Las pruebas con la base de datos
// (CA-23 y CA-24) están en src/datos/repositorios/traspasos.test.ts.
import { describe, expect, it } from "vitest";
import {
  CATEGORIA_COMPRA_ANIMALES_ID,
  CATEGORIA_VENTA_ANIMALES_ID,
  esRutaDeAdjunto,
  movimientoDeTraspaso,
  resumirTraspasos,
  validarCompra,
  validarVenta,
  type AnimalParaTraspaso,
} from "./traspasos";

const HOY = "2026-10-02";

const externo: AnimalParaTraspaso = { nombre: "Titán", origen: "externo", enHato: false, estado: "activo", fechaNacimiento: "2024-03-01", fechaIngreso: null };
const delHato: AnimalParaTraspaso = { nombre: "Ana", origen: "nacido_aqui", enHato: true, estado: "activo", fechaNacimiento: "2023-01-01", fechaIngreso: null };
const comprada: AnimalParaTraspaso = { ...delHato, nombre: "Luna", origen: "comprado", fechaIngreso: "2026-06-01" };

const compra = (cambios: Partial<Parameters<typeof validarCompra>[0]> = {}) =>
  validarCompra({ animal: externo, vendedorId: "c-1", fecha: "2026-10-01", precio: 1_500_000, adjuntos: [], hoy: HOY, ...cambios });
const venta = (cambios: Partial<Parameters<typeof validarVenta>[0]> = {}) =>
  validarVenta({ animal: delHato, compradorId: "c-2", fecha: "2026-10-01", precio: 900_000, hoy: HOY, ...cambios });
const codigos = (errores: readonly { codigo: string }[]) => errores.map((e) => e.codigo);

describe("R32: compra de un animal", () => {
  it("acepta comprar un animal de otra finca (se promueve a comprado) y uno nuevo", () => {
    expect(compra()).toEqual([]);
    expect(compra({ animal: null, precio: null })).toEqual([]);
  });

  it("también se puede comprar uno registrado solo para la genealogía en la versión 0.1.0", () => {
    const soloGenealogia: AnimalParaTraspaso = { ...delHato, nombre: "Abuelo", enHato: false };
    expect(compra({ animal: soloGenealogia })).toEqual([]);
  });

  it("no se compra un animal que ya es del hato", () => {
    expect(codigos(compra({ animal: delHato }))).toEqual(["compra_animal_del_hato"]);
    expect(codigos(compra({ animal: comprada }))).toEqual(["compra_animal_del_hato"]);
  });

  it("no se compra un animal vendido o muerto", () => {
    expect(codigos(compra({ animal: { ...externo, estado: "muerto" } }))).toEqual(["compra_animal_no_disponible"]);
    expect(codigos(compra({ animal: { ...externo, estado: "vendido" } }))).toEqual(["compra_animal_no_disponible"]);
  });

  it("exige el vendedor (un contacto)", () => {
    expect(codigos(compra({ vendedorId: null }))).toEqual(["traspaso_sin_contacto"]);
  });

  it("la fecha de ingreso es válida, no es futura y no es anterior al nacimiento", () => {
    expect(compra({ fecha: "2026-13-40" })).toEqual([{ codigo: "fecha_invalida", campo: "fecha" }]);
    expect(compra({ fecha: "2026-10-03" })).toEqual([{ codigo: "fecha_futura", campo: "fecha" }]);
    expect(compra({ fecha: "2024-02-28" })).toEqual([{ codigo: "fecha_anterior_al_nacimiento", otro: "Titán" }]);
    expect(compra({ fecha: HOY })).toEqual([]);
  });

  it("el precio es opcional; si se anota es un entero de pesos mayor que cero", () => {
    expect(compra({ precio: null })).toEqual([]);
    for (const precio of [0, -5, 1.5, Number.NaN]) expect(codigos(compra({ precio })), String(precio)).toEqual(["precio_invalido"]);
  });

  it("los adjuntos son solo PDF o imágenes copiadas a la carpeta de documentos", () => {
    const bueno = "documentos/adjunto-1b2c3d4e-0000-4000-8000-123456789abc.pdf";
    expect(compra({ adjuntos: [bueno, bueno.replace(".pdf", ".JPG")] })).toEqual([]);
    expect(codigos(compra({ adjuntos: ["../secreto.pdf"] }))).toEqual(["adjunto_no_admitido"]);
    expect(codigos(compra({ adjuntos: ["documentos/adjunto-1b2c3d4e-0000-4000-8000-123456789abc.exe"] }))).toEqual(["adjunto_no_admitido"]);
    expect(codigos(compra({ adjuntos: ["/etc/passwd"] }))).toEqual(["adjunto_no_admitido"]);
  });

  it("junta todos los motivos para mostrarlos a la vez", () => {
    expect(codigos(compra({ vendedorId: null, precio: 0, fecha: "2030-01-01" }))).toEqual(["traspaso_sin_contacto", "fecha_futura", "precio_invalido"]);
  });
});

describe("R20: venta de un animal", () => {
  it("acepta vender un animal activo del hato", () => {
    expect(venta()).toEqual([]);
    expect(venta({ animal: comprada, fecha: "2026-06-01" })).toEqual([]);
  });

  it("solo se vende un animal del hato: uno de otra finca no", () => {
    expect(codigos(venta({ animal: externo }))).toEqual(["venta_animal_no_del_hato"]);
    expect(codigos(venta({ animal: { ...delHato, enHato: false } }))).toEqual(["venta_animal_no_del_hato"]);
  });

  it("no se vende dos veces ni un animal muerto", () => {
    expect(codigos(venta({ animal: { ...delHato, estado: "vendido" } }))).toEqual(["venta_animal_no_activo"]);
    expect(codigos(venta({ animal: { ...delHato, estado: "muerto" } }))).toEqual(["venta_animal_no_activo"]);
  });

  it("exige el comprador (un contacto)", () => {
    expect(codigos(venta({ compradorId: null }))).toEqual(["traspaso_sin_contacto"]);
  });

  it("la fecha no es futura, ni anterior al nacimiento, ni anterior al ingreso de un animal comprado", () => {
    expect(venta({ fecha: "2026-10-03" })).toEqual([{ codigo: "fecha_futura", campo: "fecha" }]);
    expect(venta({ fecha: "2022-12-31" })).toEqual([{ codigo: "fecha_anterior_al_nacimiento", otro: "Ana" }]);
    expect(codigos(venta({ animal: comprada, fecha: "2026-05-31" }))).toEqual(["venta_antes_del_ingreso"]);
  });

  it("el precio es opcional y se valida igual que en la compra", () => {
    expect(venta({ precio: null })).toEqual([]);
    expect(codigos(venta({ precio: 0 }))).toEqual(["precio_invalido"]);
  });
});

describe("R32 y R20: el gasto o el ingreso que se ofrece crear en Finanzas", () => {
  it("una compra con precio ofrece un gasto de «Compra de animales» por el valor y en la fecha del ingreso", () => {
    expect(movimientoDeTraspaso({ tipo: "compra", precio: 1_500_000, fecha: "2026-10-01" })).toEqual({
      tipo: "gasto",
      categoriaId: CATEGORIA_COMPRA_ANIMALES_ID,
      valor: 1_500_000,
      fecha: "2026-10-01",
    });
  });

  it("una venta con precio ofrece un ingreso de «Venta de animales»", () => {
    expect(movimientoDeTraspaso({ tipo: "venta", precio: 900_000, fecha: "2026-10-01" })).toEqual({
      tipo: "ingreso",
      categoriaId: CATEGORIA_VENTA_ANIMALES_ID,
      valor: 900_000,
      fecha: "2026-10-01",
    });
  });

  it("sin precio no se ofrece nada", () => {
    expect(movimientoDeTraspaso({ tipo: "venta", precio: null, fecha: "2026-10-01" })).toBeNull();
  });
});

describe("rutas de adjuntos", () => {
  it("solo documentos/adjunto-<uuid>.<pdf|jpg|jpeg|png|webp>", () => {
    const uuid = "1b2c3d4e-0000-4000-8000-123456789abc";
    for (const ext of ["pdf", "jpg", "jpeg", "png", "webp", "PDF"]) expect(esRutaDeAdjunto(`documentos/adjunto-${uuid}.${ext}`), ext).toBe(true);
    for (const mala of ["", `fotos/adjunto-${uuid}.pdf`, `documentos/${uuid}.pdf`, `documentos/adjunto-${uuid}.pdf/../x.pdf`, `documentos/adjunto-${uuid}.gif`, `documentos/adjunto-x.pdf`]) {
      expect(esRutaDeAdjunto(mala), mala).toBe(false);
    }
  });
});

describe("historial de compras y ventas: totales", () => {
  it("suma lo comprado y lo vendido por separado; los traspasos sin precio cuentan pero no suman", () => {
    const resumen = resumirTraspasos([
      { tipo: "compra", precio: 1_000_000 },
      { tipo: "compra", precio: null },
      { tipo: "venta", precio: 600_000 },
      { tipo: "venta", precio: 400_000 },
    ]);
    expect(resumen).toEqual({
      compras: { cantidad: 2, total: 1_000_000 },
      ventas: { cantidad: 2, total: 1_000_000 },
      saldo: 0,
    });
  });

  it("sin traspasos todo es cero", () => {
    expect(resumirTraspasos([])).toEqual({ compras: { cantidad: 0, total: 0 }, ventas: { cantidad: 0, total: 0 }, saldo: 0 });
  });
});
