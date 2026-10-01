import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nuevoId } from "../dominio/identidad";
import { archivosDeMigracion, crearBaseDePrueba, leerMigracion, type ConexionMemoria } from "./conexion-memoria";
import { URL_BASE_DATOS_DESARROLLO, URL_BASE_DATOS_INSTALADA } from "./conexion-tauri";
import huellas from "./migraciones/huellas.json";

const leerRaiz = (ruta: string) => readFileSync(new URL(`../../${ruta}`, import.meta.url), "utf8");
const AHORA = "2026-10-01T12:00:00.000Z";

describe("registro de migraciones", () => {
  it("ninguna migración publicada cambió (compara su huella SHA-256)", () => {
    const registradas = huellas as Record<string, string>;
    for (const archivo of archivosDeMigracion()) {
      const huella = createHash("sha256").update(leerMigracion(archivo)).digest("hex");
      expect(
        registradas[archivo],
        `Falta la huella de ${archivo}. Si es una migración nueva, agrega a huellas.json: "${archivo}": "${huella}"`,
      ).toBeDefined();
      expect(
        huella,
        `${archivo} cambió después de publicarse. No edites migraciones aplicadas: crea una nueva con el número siguiente.`,
      ).toBe(registradas[archivo]);
    }
    expect(Object.keys(registradas).sort()).toEqual(archivosDeMigracion());
  });

  it("Rust registra todas las migraciones, en orden y con su número", () => {
    const libRs = leerRaiz("src-tauri/src/lib.rs");
    const registradas = [
      ...libRs.matchAll(/version:\s*(\d+),[\s\S]*?include_str!\("\.\.\/\.\.\/src\/datos\/migraciones\/([^"]+)"\)/g),
    ].map(([, version, archivo]) => ({ version: Number(version), archivo }));
    const esperadas = archivosDeMigracion().map((archivo) => ({ version: Number(archivo.slice(0, 4)), archivo }));
    expect(registradas).toEqual(esperadas);
  });

  it("la interfaz y Rust usan los mismos nombres de base de datos", () => {
    const libRs = leerRaiz("src-tauri/src/lib.rs");
    expect(libRs).toContain(`"${URL_BASE_DATOS_INSTALADA}"`);
    expect(libRs).toContain(`"${URL_BASE_DATOS_DESARROLLO}"`);
  });
});

describe("migración 0001: esquema inicial", () => {
  let db: ConexionMemoria;
  beforeEach(() => {
    db = crearBaseDePrueba();
  });
  afterEach(() => db.cerrar());

  /** Inserta un animal mínimo; devuelve su id. */
  async function animal(datos: Record<string, string | number | null> = {}): Promise<string> {
    const fila = { id: nuevoId(), sexo: "hembra", creado_en: AHORA, modificado_en: AHORA, ...datos };
    const columnas = Object.keys(fila);
    await db.ejecutar(
      `INSERT INTO animal (${columnas.join(", ")}) VALUES (${columnas.map(() => "?").join(", ")})`,
      Object.values(fila),
    );
    return String(fila.id);
  }

  async function identificador(datos: Record<string, string | number | null>): Promise<void> {
    const fila = { id: nuevoId(), tipo: "arete", vigente: 1, principal: 0, creado_en: AHORA, modificado_en: AHORA, ...datos };
    const columnas = Object.keys(fila);
    await db.ejecutar(
      `INSERT INTO identificador (${columnas.join(", ")}) VALUES (${columnas.map(() => "?").join(", ")})`,
      Object.values(fila),
    );
  }

  it("crea las seis tablas con los campos comunes", async () => {
    const tablas = ["finca", "raza", "libro", "animal", "identificador", "historial_cambios"];
    for (const tabla of tablas) {
      const columnas = (await db.consultar<{ name: string }>(`SELECT name FROM pragma_table_info('${tabla}')`)).map(
        (c) => c.name,
      );
      expect(columnas, tabla).toEqual(expect.arrayContaining(["id", "creado_en", "modificado_en", "eliminado_en"]));
    }
  });

  it("precarga las siete razas de ANCO y los cinco libros", async () => {
    const razas = await db.consultar<{ nombre: string }>("SELECT nombre FROM raza ORDER BY nombre");
    expect(razas.map((r) => r.nombre)).toEqual([
      "Alpina",
      "Anglonubiana",
      "Boer",
      "Lamancha",
      "Saanen",
      "Santandereana",
      "Toggenburg",
    ]);
    const libros = await db.consultar<{ nombre: string }>("SELECT nombre FROM libro ORDER BY nombre");
    expect(libros.map((l) => l.nombre)).toEqual([
      "Fundadores",
      "Mestizo",
      "Pureza de origen",
      "Pureza por cruzamiento",
      "Pureza por pedigrí",
    ]);
  });

  it("la finca toma 150 días de gestación y 305 de lactancia por defecto", async () => {
    await db.ejecutar("INSERT INTO finca (id, nombre, creado_en, modificado_en) VALUES (?, ?, ?, ?)", [
      nuevoId(),
      "Aprisco de prueba",
      AHORA,
      AHORA,
    ]);
    const [finca] = await db.consultar<{ dias_gestacion: number; dias_lactancia: number }>(
      "SELECT dias_gestacion, dias_lactancia FROM finca",
    );
    expect(finca).toEqual({ dias_gestacion: 150, dias_lactancia: 305 });
  });

  it("rechaza sexos, estados, fechas y marcas de tiempo inválidos", async () => {
    await expect(animal({ sexo: "otro" })).rejects.toThrow(/CHECK/);
    await expect(animal({ estado: "perdido" })).rejects.toThrow(/CHECK/);
    await expect(animal({ fecha_nacimiento: "2023-02-29" })).rejects.toThrow(/CHECK/);
    await expect(animal({ fecha_nacimiento: "01/10/2026" })).rejects.toThrow(/CHECK/);
    await expect(animal({ creado_en: "2026-10-01 12:00:00" })).rejects.toThrow(/CHECK/);
    await expect(animal({ fecha_nacimiento: "2024-02-29" })).resolves.toBeTypeOf("string");
  });

  it("exige que padre y madre existan y no sean el mismo animal", async () => {
    await expect(animal({ padre_id: nuevoId() })).rejects.toThrow(/FOREIGN KEY/);
    const unico = await animal({ sexo: "macho" });
    await expect(animal({ padre_id: unico, madre_id: unico })).rejects.toThrow(/CHECK/);
    const id = nuevoId();
    await expect(animal({ id, padre_id: id })).rejects.toThrow();
  });

  it("no permite borrar filas: solo borrado lógico", async () => {
    const id = await animal();
    await expect(db.ejecutar("DELETE FROM animal WHERE id = ?", [id])).rejects.toThrow(/borrado lógico/);
    await expect(db.ejecutar("DELETE FROM raza")).rejects.toThrow(/borrado lógico/);
    await db.ejecutar("UPDATE animal SET eliminado_en = ? WHERE id = ?", [AHORA, id]);
    const [fila] = await db.consultar<{ eliminado_en: string }>("SELECT eliminado_en FROM animal WHERE id = ?", [id]);
    expect(fila.eliminado_en).toBe(AHORA);
  });

  it("el historial no se borra ni se modifica", async () => {
    const id = nuevoId();
    await db.ejecutar(
      `INSERT INTO historial_cambios (id, entidad, registro_id, campo, valor_nuevo, marca_tiempo, creado_en, modificado_en)
       VALUES (?, 'animal', ?, 'nombre', 'Luna', ?, ?, ?)`,
      [id, nuevoId(), AHORA, AHORA, AHORA],
    );
    await expect(db.ejecutar("UPDATE historial_cambios SET valor_nuevo = 'Sol'")).rejects.toThrow(/no se puede modificar/);
    await expect(db.ejecutar("DELETE FROM historial_cambios")).rejects.toThrow(/no se puede borrar/);
  });

  it("R2 en la base: un valor vigente por tipo, sin importar mayúsculas", async () => {
    const a = await animal();
    const b = await animal();
    await identificador({ animal_id: a, valor: "AR-100", principal: 1 });
    await expect(identificador({ animal_id: b, valor: "ar-100" })).rejects.toThrow(/UNIQUE/);
    // Con otro tipo sí se puede repetir el valor.
    await identificador({ animal_id: b, tipo: "tatuaje", valor: "AR-100" });
    // Si el anterior deja de estar vigente, el valor queda libre.
    await db.ejecutar("UPDATE identificador SET vigente = 0, principal = 0 WHERE animal_id = ? AND tipo = 'arete'", [a]);
    await identificador({ animal_id: b, valor: "AR-100" });
  });

  it("R2 en la base: a lo sumo un principal por animal, y debe estar vigente", async () => {
    const a = await animal();
    await identificador({ animal_id: a, valor: "1", principal: 1 });
    await expect(identificador({ animal_id: a, valor: "2", principal: 1 })).rejects.toThrow(/UNIQUE/);
    await expect(identificador({ animal_id: a, valor: "3", principal: 1, vigente: 0 })).rejects.toThrow(/CHECK/);
  });

  it("las tablas son estrictas: no aceptan un tipo de dato equivocado", async () => {
    await expect(animal({ padre_sin_verificar: 0.5 })).rejects.toThrow();
    // El plugin envía los números como decimales; 1.0 se guarda como entero 1.
    const id = await animal({ padre_sin_verificar: 1.0 });
    const [fila] = await db.consultar<{ t: string }>("SELECT typeof(padre_sin_verificar) AS t FROM animal WHERE id = ?", [id]);
    expect(fila.t).toBe("integer");
  });
});
