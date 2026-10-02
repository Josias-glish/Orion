import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nuevoId } from "../dominio/identidad";
import {
  abrirConexionMemoria,
  archivosDeMigracion,
  crearBaseDePrueba,
  leerMigracion,
  type ConexionMemoria,
} from "./conexion-memoria";
import { URL_BASE_DATOS_DESARROLLO, URL_BASE_DATOS_INSTALADA } from "./bases";
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

  it("crea las tablas con los campos comunes", async () => {
    const tablas = [
      "finca",
      "raza",
      "libro",
      "animal",
      "identificador",
      "historial_cambios",
      "usuario",
      "lote",
      "composicion_racial",
    ];
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
    // Desde la migración 0002, el disparador de R1 actúa antes que la clave foránea.
    await expect(animal({ padre_id: nuevoId() })).rejects.toThrow(/FOREIGN KEY|R1/);
    const unico = await animal({ sexo: "macho" });
    await expect(animal({ padre_id: unico, madre_id: unico })).rejects.toThrow(/CHECK|R1/);
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

describe("migración 0002: núcleo y genealogía", () => {
  let db: ConexionMemoria;
  beforeEach(() => {
    db = crearBaseDePrueba();
  });
  afterEach(() => db.cerrar());

  async function animal(datos: Record<string, string | number | null>): Promise<string> {
    const fila = { id: nuevoId(), sexo: "hembra", creado_en: AHORA, modificado_en: AHORA, ...datos };
    const columnas = Object.keys(fila);
    await db.ejecutar(
      `INSERT INTO animal (${columnas.join(", ")}) VALUES (${columnas.map(() => "?").join(", ")})`,
      Object.values(fila),
    );
    return String(fila.id);
  }

  it("R1 en la base: el padre debe ser macho y la madre hembra", async () => {
    const hembra = await animal({ sexo: "hembra" });
    const macho = await animal({ sexo: "macho" });
    await expect(animal({ padre_id: hembra })).rejects.toThrow(/el padre debe ser macho/);
    await expect(animal({ madre_id: macho })).rejects.toThrow(/la madre debe ser hembra/);
    const cria = await animal({ padre_id: macho, madre_id: hembra });
    await expect(db.ejecutar("UPDATE animal SET padre_id = ? WHERE id = ?", [hembra, cria])).rejects.toThrow(/macho/);
  });

  it("R1 en la base: no cambia el sexo de quien ya es padre", async () => {
    const macho = await animal({ sexo: "macho" });
    await animal({ padre_id: macho });
    await expect(db.ejecutar("UPDATE animal SET sexo = 'hembra' WHERE id = ?", [macho])).rejects.toThrow(/sexo/);
  });

  it("R1 en la base: la cría nace después de sus padres y antes no", async () => {
    const madre = await animal({ fecha_nacimiento: "2020-01-01" });
    await expect(animal({ madre_id: madre, fecha_nacimiento: "2019-12-31" })).rejects.toThrow(/después/);
    const cria = await animal({ madre_id: madre, fecha_nacimiento: "2022-01-01" });
    await expect(db.ejecutar("UPDATE animal SET fecha_nacimiento = '2023-01-01' WHERE id = ?", [madre])).rejects.toThrow(
      /antes que sus hijos/,
    );
    // Fechas desconocidas: no se puede comparar y no se rechaza.
    await db.ejecutar("UPDATE animal SET fecha_nacimiento = NULL WHERE id = ?", [cria]);
  });

  it("la composición no admite fracciones fuera de (0, 1] ni la misma raza dos veces", async () => {
    const id = await animal({});
    const [raza] = await db.consultar<{ id: string }>("SELECT id FROM raza LIMIT 1");
    const insertar = (fraccion: number) =>
      db.ejecutar(
        "INSERT INTO composicion_racial (id, animal_id, raza_id, fraccion, creado_en, modificado_en) VALUES (?, ?, ?, ?, ?, ?)",
        [nuevoId(), id, raza.id, fraccion, AHORA, AHORA],
      );
    await expect(insertar(0)).rejects.toThrow(/CHECK/);
    await expect(insertar(1.5)).rejects.toThrow(/CHECK/);
    await insertar(0.5);
    await expect(insertar(0.5)).rejects.toThrow(/UNIQUE/);
  });

  it("no permite borrar usuarios, lotes ni composiciones", async () => {
    const id = await animal({});
    const [raza] = await db.consultar<{ id: string }>("SELECT id FROM raza LIMIT 1");
    await db.ejecutar("INSERT INTO usuario (id, nombre, rol, creado_en, modificado_en) VALUES (?, 'Ana', 'propietario', ?, ?)", [
      nuevoId(),
      AHORA,
      AHORA,
    ]);
    await db.ejecutar("INSERT INTO lote (id, nombre, creado_en, modificado_en) VALUES (?, 'Ordeño', ?, ?)", [nuevoId(), AHORA, AHORA]);
    await db.ejecutar(
      "INSERT INTO composicion_racial (id, animal_id, raza_id, fraccion, creado_en, modificado_en) VALUES (?, ?, ?, 1, ?, ?)",
      [nuevoId(), id, raza.id, AHORA, AHORA],
    );
    for (const tabla of ["usuario", "lote", "composicion_racial"]) {
      await expect(db.ejecutar(`DELETE FROM ${tabla}`)).rejects.toThrow(/borrado lógico/);
    }
  });

  it("los animales existentes quedan en el hato y sin lote", async () => {
    const id = await animal({});
    const [fila] = await db.consultar<{ en_hato: number; lote_id: string | null }>(
      "SELECT en_hato, lote_id FROM animal WHERE id = ?",
      [id],
    );
    expect(fila).toEqual({ en_hato: 1, lote_id: null });
  });
});

describe("actualizar una base de la Etapa 1", () => {
  it("la migración 0002 se aplica sobre datos existentes sin perderlos", async () => {
    const db = abrirConexionMemoria();
    try {
      db.ejecutarScript(leerMigracion("0001_esquema_inicial.sql"));
      const padre = nuevoId();
      const cria = nuevoId();
      for (const [id, sexo, padreId] of [
        [padre, "macho", null],
        [cria, "hembra", padre],
      ] as const) {
        await db.ejecutar(
          "INSERT INTO animal (id, nombre, sexo, padre_id, observaciones, creado_en, modificado_en) VALUES (?, ?, ?, ?, '[diagnóstico]', ?, ?)",
          [id, `Animal ${sexo}`, sexo, padreId, AHORA, AHORA],
        );
      }
      db.ejecutarScript(leerMigracion("0002_nucleo_y_genealogia.sql"));
      const filas = await db.consultar<{ id: string; en_hato: number; padre_id: string | null }>(
        "SELECT id, en_hato, padre_id FROM animal ORDER BY sexo",
      );
      expect(filas).toEqual([
        { id: cria, en_hato: 1, padre_id: padre },
        { id: padre, en_hato: 1, padre_id: null },
      ]);
    } finally {
      db.cerrar();
    }
  });
});

describe("migración 0004: salud y documentos", () => {
  let db: ConexionMemoria;
  let animalId: string;
  beforeEach(async () => {
    db = crearBaseDePrueba();
    animalId = nuevoId();
    await db.ejecutar("INSERT INTO animal (id, nombre, sexo, creado_en, modificado_en) VALUES (?, 'Bella', 'hembra', ?, ?)", [animalId, AHORA, AHORA]);
  });
  afterEach(() => db.cerrar());

  const evento = (datos: Record<string, string | number | null>) => {
    const fila = { id: nuevoId(), animal_id: animalId, tipo: "tratamiento", producto: "X", fecha_inicio: "2026-09-10", creado_en: AHORA, modificado_en: AHORA, ...datos };
    const columnas = Object.keys(fila);
    return db.ejecutar(`INSERT INTO evento_salud (${columnas.join(", ")}) VALUES (${columnas.map(() => "?").join(", ")})`, Object.values(fila));
  };

  it("acepta un tratamiento con los campos del ICA", async () => {
    await evento({ numero_registro_ica: "ICA-1", lote_producto: "L", dosis: "5 ml", via: "oral", retiro_leche_dias: 5, retiro_carne_dias: 28 });
    const [{ n }] = await db.consultar<{ n: number }>("SELECT count(*) AS n FROM evento_salud");
    expect(n).toBe(1);
  });

  it("exige animal, producto (salvo en condición corporal), fechas en orden y retiros no negativos", async () => {
    await expect(evento({ animal_id: null })).rejects.toThrow(/NOT NULL/);
    await expect(evento({ producto: null })).rejects.toThrow(/CHECK/);
    await expect(evento({ fecha_fin: "2026-09-01" })).rejects.toThrow(/CHECK/);
    await expect(evento({ proxima_fecha: "2026-09-10" })).rejects.toThrow(/CHECK/);
    await expect(evento({ retiro_leche_dias: -1 })).rejects.toThrow(/CHECK/);
    await expect(evento({ tipo: "otro" })).rejects.toThrow(/CHECK/);
  });

  it("la condición corporal va de 1 a 5 en medios puntos y solo en su tipo de evento", async () => {
    await evento({ tipo: "condicion_corporal", producto: null, condicion_corporal: 2.5 });
    await expect(evento({ tipo: "condicion_corporal", producto: null, condicion_corporal: 2.3 })).rejects.toThrow(/CHECK/);
    await expect(evento({ tipo: "condicion_corporal", producto: null, condicion_corporal: 5.5 })).rejects.toThrow(/CHECK/);
    await expect(evento({ tipo: "condicion_corporal", producto: null })).rejects.toThrow(/CHECK/);
    await expect(evento({ condicion_corporal: 3 })).rejects.toThrow(/CHECK/);
  });

  it("los números de documento no se repiten y nada se borra físicamente", async () => {
    const documento = (numero: string) =>
      db.ejecutar("INSERT INTO certificado (id, animal_id, tipo, numero, fecha, creado_en, modificado_en) VALUES (?, ?, 'propio', ?, '2026-10-01', ?, ?)", [
        nuevoId(),
        animalId,
        numero,
        AHORA,
        AHORA,
      ]);
    await documento("CI-2026-0001");
    await expect(documento("CI-2026-0001")).rejects.toThrow(/UNIQUE/);
    await evento({});
    for (const tabla of ["evento_salud", "certificado"]) {
      await expect(db.ejecutar(`DELETE FROM ${tabla}`)).rejects.toThrow(/borrado lógico/);
    }
  });
});

describe("migración 0005: sementales y montas de otras fincas (R29, R30)", () => {
  let db: ConexionMemoria;
  let contacto: string;
  beforeEach(async () => {
    db = crearBaseDePrueba();
    contacto = nuevoId();
    await db.ejecutar("INSERT INTO contacto (id, nombre, creado_en, modificado_en) VALUES (?, 'Ramiro', ?, ?)", [contacto, AHORA, AHORA]);
  });
  afterEach(() => db.cerrar());

  const animal = (datos: Record<string, string | number | null>) => {
    const fila = { id: nuevoId(), sexo: "macho", creado_en: AHORA, modificado_en: AHORA, ...datos };
    return db
      .ejecutar(`INSERT INTO animal (${Object.keys(fila).join(", ")}) VALUES (${Object.keys(fila).map(() => "?").join(", ")})`, Object.values(fila))
      .then(() => fila.id);
  };

  it("los animales nuevos quedan «nacido_aqui» por defecto; el origen solo admite tres valores", async () => {
    const id = await animal({});
    const [fila] = await db.consultar<{ origen: string; contacto_id: string | null }>("SELECT origen, contacto_id FROM animal WHERE id = ?", [id]);
    expect(fila).toEqual({ origen: "nacido_aqui", contacto_id: null });
    await expect(animal({ origen: "prestado" })).rejects.toThrow(/CHECK/);
  });

  it("R29 en la base: un externo no es del hato ni está en un lote", async () => {
    await expect(animal({ origen: "externo", contacto_id: contacto })).rejects.toThrow(/R29/);
    const id = await animal({ origen: "externo", en_hato: 0, contacto_id: contacto });
    await expect(db.ejecutar("UPDATE animal SET en_hato = 1 WHERE id = ?", [id])).rejects.toThrow(/R29/);
  });

  it("R29 en la base: una hembra externa no recibe servicios ni abre lactancias", async () => {
    const hembra = await animal({ sexo: "hembra", origen: "externo", en_hato: 0, contacto_id: contacto });
    await expect(
      db.ejecutar(
        "INSERT INTO evento_reproductivo (id, hembra_id, tipo, fecha, creado_en, modificado_en) VALUES (?, ?, 'monta', '2025-03-10', ?, ?)",
        [nuevoId(), hembra, AHORA, AHORA],
      ),
    ).rejects.toThrow(/R29/);
  });

  it("el costo del servicio es un entero no negativo, y el margen de gestación va de 0 a 60", async () => {
    const hembra = await animal({ sexo: "hembra" });
    const servicio = (costo: number) =>
      db.ejecutar(
        "INSERT INTO evento_reproductivo (id, hembra_id, tipo, fecha, costo, creado_en, modificado_en) VALUES (?, ?, 'inseminacion', '2025-03-10', ?, ?, ?)",
        [nuevoId(), hembra, costo, AHORA, AHORA],
      );
    await expect(servicio(-1)).rejects.toThrow(/CHECK/);
    await expect(servicio(1.5)).rejects.toThrow();
    await servicio(150000);
    const finca = (margen: number) =>
      db.ejecutar("INSERT INTO finca (id, nombre, margen_gestacion, creado_en, modificado_en) VALUES (?, 'F', ?, ?, ?)", [nuevoId(), margen, AHORA, AHORA]);
    await expect(finca(61)).rejects.toThrow(/CHECK/);
    await finca(0);
  });

  it("los contactos no se borran: solo borrado lógico", async () => {
    await expect(db.ejecutar("DELETE FROM contacto")).rejects.toThrow(/borrado lógico/);
  });
});

describe("migración 0006: registro genealógico propio (R31)", () => {
  let db: ConexionMemoria;
  const PP = "0f42cb9a-2ddf-4c82-840b-547defbf17cd"; // Pureza por pedigrí
  const MESTIZO = "057da2b3-6aa1-484a-94ae-88de113e8aff";
  beforeEach(() => {
    db = crearBaseDePrueba();
  });
  afterEach(() => db.cerrar());

  const animal = async (datos: Record<string, string | number | null> = {}) => {
    const fila = { id: nuevoId(), sexo: "hembra", creado_en: AHORA, modificado_en: AHORA, ...datos };
    await db.ejecutar(`INSERT INTO animal (${Object.keys(fila).join(", ")}) VALUES (${Object.keys(fila).map(() => "?").join(", ")})`, Object.values(fila));
    return fila.id;
  };
  /** Inserta un registro con los datos mínimos del estado pedido; `datos` pisa cualquier valor. */
  const registro = async (animalId: string, datos: Record<string, string | number | null> = {}) => {
    const emitido = (datos.estado ?? "emitido") !== "borrador";
    const base: Record<string, string | number | null> = {
      id: nuevoId(),
      animal_id: animalId,
      fecha_registro: "2026-10-02",
      creado_en: AHORA,
      modificado_en: AHORA,
      ...(emitido ? { libro_id: PP, consecutivo: 1, numero: "PPE-0001", estado: "emitido", instantanea: "{}" } : { estado: "borrador" }),
      ...datos,
    };
    await db.ejecutar(`INSERT INTO registro_genealogico (${Object.keys(base).join(", ")}) VALUES (${Object.keys(base).map(() => "?").join(", ")})`, Object.values(base));
    return String(base.id);
  };

  it("los cinco libros precargados traen prefijo propio, formato PPE-0001 y empiezan en 1", async () => {
    const libros = await db.consultar<{ nombre: string; prefijo: string; siguiente_numero: number; digitos_numero: number; separador_numero: string }>(
      "SELECT nombre, prefijo, siguiente_numero, digitos_numero, separador_numero FROM libro ORDER BY nombre",
    );
    expect(libros.map((l) => [l.nombre, l.prefijo])).toEqual([
      ["Fundadores", "FUN"],
      ["Mestizo", "MES"],
      ["Pureza de origen", "POR"],
      ["Pureza por cruzamiento", "PCR"],
      ["Pureza por pedigrí", "PPE"],
    ]);
    expect(libros.every((l) => l.siguiente_numero === 1 && l.digitos_numero === 4 && l.separador_numero === "-")).toBe(true);
  });

  it("el prefijo es de 1 a 8 letras o números, único entre libros sin importar mayúsculas; el formato tiene límites", async () => {
    const libro = (id: string, cambio: string) => db.ejecutar(`UPDATE libro SET ${cambio} WHERE id = ?`, [id]);
    await expect(libro(MESTIZO, "prefijo = 'ME S'")).rejects.toThrow(/CHECK/);
    await expect(libro(MESTIZO, "prefijo = 'ME-S'")).rejects.toThrow(/CHECK/);
    await expect(libro(MESTIZO, "prefijo = 'ABCDEFGHI'")).rejects.toThrow(/CHECK/);
    await expect(libro(MESTIZO, "prefijo = ''")).rejects.toThrow(/CHECK/);
    await expect(libro(MESTIZO, "prefijo = 'ppe'")).rejects.toThrow(/UNIQUE/);
    await libro(MESTIZO, "prefijo = 'MZ1'");
    await expect(libro(MESTIZO, "digitos_numero = 0")).rejects.toThrow(/CHECK/);
    await expect(libro(MESTIZO, "digitos_numero = 9")).rejects.toThrow(/CHECK/);
    await expect(libro(MESTIZO, "separador_numero = '/'")).rejects.toThrow(/CHECK/);
    await expect(libro(MESTIZO, "siguiente_numero = 0")).rejects.toThrow(/CHECK/);
    await libro(MESTIZO, "separador_numero = ''");
  });

  it("un registro es borrador (sin número), emitido (con número, libro e instantánea) o anulado (con motivo)", async () => {
    const a = await animal();
    await registro(a, { estado: "borrador" });
    await expect(registro(await animal(), { estado: "borrador", numero: "PPE-0009" })).rejects.toThrow(/CHECK/);
    await expect(registro(await animal(), { estado: "borrador", instantanea: "{}" })).rejects.toThrow(/CHECK/);
    await expect(registro(await animal(), { numero: "PPE-0002", consecutivo: 2, instantanea: null })).rejects.toThrow(/CHECK/);
    await expect(registro(await animal(), { numero: "PPE-0002", consecutivo: 2, libro_id: null })).rejects.toThrow(/CHECK/);
    await expect(registro(await animal(), { numero: "PPE-0002", consecutivo: 2, instantanea: "no es json" })).rejects.toThrow(/CHECK/);
    await expect(registro(await animal(), { estado: "anulado", numero: "PPE-0002", consecutivo: 2 })).rejects.toThrow(/CHECK/);
    await expect(registro(await animal(), { numero: "PPE-0002", consecutivo: 2, motivo_anulacion: "x" })).rejects.toThrow(/CHECK/);
    await expect(registro(await animal(), { estado: "otro" })).rejects.toThrow(/CHECK/);
    await registro(await animal(), { estado: "anulado", numero: "PPE-0002", consecutivo: 2, motivo_anulacion: "Duplicado" });
  });

  it("un número nunca se reutiliza: ni entre libros, ni por un consecutivo repetido, ni aunque el registro se anule", async () => {
    const primero = await registro(await animal());
    await db.ejecutar("UPDATE registro_genealogico SET estado = 'anulado', motivo_anulacion = 'Error' WHERE id = ?", [primero]);
    await expect(registro(await animal(), { numero: "PPE-0001", consecutivo: 2 })).rejects.toThrow(/UNIQUE/);
    await expect(registro(await animal(), { numero: "PPE-0002", consecutivo: 1 })).rejects.toThrow(/UNIQUE|consecutivos/);
    // Un libro distinto sí puede tener su propio consecutivo 1, pero no el mismo texto.
    await expect(registro(await animal(), { libro_id: MESTIZO, numero: "PPE-0001", consecutivo: 1 })).rejects.toThrow(/UNIQUE/);
    await registro(await animal(), { libro_id: MESTIZO, numero: "MES-0001", consecutivo: 1 });
  });

  it("los consecutivos de un libro no tienen saltos", async () => {
    await registro(await animal());
    await expect(registro(await animal(), { numero: "PPE-0003", consecutivo: 3 })).rejects.toThrow(/sin saltos/);
    await registro(await animal(), { numero: "PPE-0002", consecutivo: 2 });
    // El primero de un libro puede empezar donde el usuario quiera (número inicial configurado).
    await registro(await animal(), { libro_id: MESTIZO, numero: "MES-0120", consecutivo: 120 });
    await registro(await animal(), { libro_id: MESTIZO, numero: "MES-0121", consecutivo: 121 });
    // Un borrador toma su número al emitirse: también debe ser el siguiente.
    const borrador = await registro(await animal(), { estado: "borrador" });
    await expect(
      db.ejecutar("UPDATE registro_genealogico SET estado = 'emitido', libro_id = ?, consecutivo = 130, numero = 'PPE-0130', instantanea = '{}' WHERE id = ?", [PP, borrador]),
    ).rejects.toThrow(/sin saltos/);
    await db.ejecutar("UPDATE registro_genealogico SET estado = 'emitido', libro_id = ?, consecutivo = 3, numero = 'PPE-0003', instantanea = '{}' WHERE id = ?", [PP, borrador]);
  });

  it("un animal tiene un solo registro vigente; uno anulado deja de contar; un borrador descartado también", async () => {
    const a = await animal();
    const primero = await registro(a);
    await expect(registro(a, { numero: "PPE-0002", consecutivo: 2 })).rejects.toThrow(/UNIQUE/);
    await expect(registro(a, { estado: "borrador" })).rejects.toThrow(/UNIQUE/);
    await db.ejecutar("UPDATE registro_genealogico SET estado = 'anulado', motivo_anulacion = 'Error' WHERE id = ?", [primero]);
    const borrador = await registro(a, { estado: "borrador" });
    await db.ejecutar("UPDATE registro_genealogico SET eliminado_en = ? WHERE id = ?", [AHORA, borrador]);
    await registro(a, { numero: "PPE-0002", consecutivo: 2 });
  });

  it("el número, el libro y el animal de un registro con número no cambian; la versión no baja; lo anulado no se reactiva", async () => {
    const a = await animal();
    const id = await registro(a);
    for (const cambio of ["numero = 'PPE-0099'", "consecutivo = 5", `libro_id = '${MESTIZO}'`, `animal_id = '${await animal()}'`]) {
      await expect(db.ejecutar(`UPDATE registro_genealogico SET ${cambio} WHERE id = ?`, [id]), cambio).rejects.toThrow(/R31/);
    }
    await db.ejecutar("UPDATE registro_genealogico SET version = 2 WHERE id = ?", [id]);
    await expect(db.ejecutar("UPDATE registro_genealogico SET version = 1 WHERE id = ?", [id])).rejects.toThrow(/versión/);
    await expect(db.ejecutar("UPDATE registro_genealogico SET estado = 'borrador', numero = NULL, consecutivo = NULL, instantanea = NULL WHERE id = ?", [id])).rejects.toThrow(/R31/);
    await db.ejecutar("UPDATE registro_genealogico SET estado = 'anulado', motivo_anulacion = 'Error' WHERE id = ?", [id]);
    await expect(db.ejecutar("UPDATE registro_genealogico SET estado = 'emitido', motivo_anulacion = NULL WHERE id = ?", [id])).rejects.toThrow(/R31/);
  });

  it("un animal de otra finca no tiene registro propio (R29) y las filas no se borran", async () => {
    const contacto = nuevoId();
    await db.ejecutar("INSERT INTO contacto (id, nombre, creado_en, modificado_en) VALUES (?, 'Ramiro', ?, ?)", [contacto, AHORA, AHORA]);
    const externo = await animal({ sexo: "macho", origen: "externo", en_hato: 0, contacto_id: contacto });
    await expect(registro(externo)).rejects.toThrow(/R31/);
    const id = await registro(await animal());
    await expect(db.ejecutar("DELETE FROM registro_genealogico WHERE id = ?", [id])).rejects.toThrow(/borrado lógico/);
  });

  it("el certificado admite el tipo «registro_propio», sigue sin admitir otros y conserva su número único y su protección", async () => {
    const a = await animal();
    const certificado = (tipo: string, numero: string) =>
      db.ejecutar("INSERT INTO certificado (id, animal_id, tipo, numero, fecha, creado_en, modificado_en) VALUES (?, ?, ?, ?, '2026-10-02', ?, ?)", [nuevoId(), a, tipo, numero, AHORA, AHORA]);
    await certificado("registro_propio", "PPE-0001-v1");
    await certificado("propio", "CI-2026-0001");
    await certificado("asociacion", "EX-2026-0001");
    await expect(certificado("otro", "X-1")).rejects.toThrow(/CHECK/);
    await expect(certificado("registro_propio", "PPE-0001-v1")).rejects.toThrow(/UNIQUE/);
    await expect(db.ejecutar("DELETE FROM certificado")).rejects.toThrow(/borrado lógico/);
  });

  it("los datos del criadero para el certificado son opcionales", async () => {
    await db.ejecutar("INSERT INTO finca (id, nombre, creado_en, modificado_en) VALUES (?, 'F', ?, ?)", [nuevoId(), AHORA, AHORA]);
    const [f] = await db.consultar<{ criador: string | null; propietario: string | null; responsable_registros: string | null }>("SELECT criador, propietario, responsable_registros FROM finca");
    expect(f).toEqual({ criador: null, propietario: null, responsable_registros: null });
  });
});
