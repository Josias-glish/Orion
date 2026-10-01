// Etapa 5: que ningún criterio de aceptación quede sin prueba, y usabilidad que se puede medir (contraste y tamaño
// de letra, sección 9: «letra grande, buen contraste»).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const raiz = new URL("../", import.meta.url);
const leer = (ruta: string) => readFileSync(new URL(ruta, raiz), "utf8");

function archivos(carpeta: string, patron: RegExp): string[] {
  const resultado: string[] = [];
  for (const nombre of readdirSync(new URL(`${carpeta}/`, raiz))) {
    const ruta = `${carpeta}/${nombre}`;
    if (statSync(new URL(ruta, raiz)).isDirectory()) resultado.push(...archivos(ruta, patron));
    else if (patron.test(nombre)) resultado.push(ruta);
  }
  return resultado;
}

describe("criterios de aceptación CA-01 a CA-11 (sección 11)", () => {
  const vitest = [...archivos("src", /\.test\.ts$/), ...archivos("scripts", /\.test\.ts$/)].map((r) => leer(r)).join("\n");
  const programaReal = archivos("pruebas-e2e", /^etapa\d\.mjs$/).map((r) => leer(r)).join("\n");

  for (let n = 1; n <= 11; n++) {
    const ca = `CA-${String(n).padStart(2, "0")}`;
    it(`${ca} tiene pruebas automáticas en Vitest`, () => {
      expect(vitest.includes(ca), ca).toBe(true);
    });
  }

  it("CA-10 y CA-11 también se prueban con el programa real (pruebas-e2e, sin red)", () => {
    expect(programaReal).toMatch(/CA-11/);
    expect(leer("pruebas-e2e/todas.sh")).toMatch(/unshare -n/);
  });

  it("la matriz de docs/PRUEBAS.md nombra cada criterio, CA-12 incluido", () => {
    const matriz = leer("docs/PRUEBAS.md");
    for (let n = 1; n <= 12; n++) expect(matriz).toContain(`CA-${String(n).padStart(2, "0")}`);
  });
});

// ---------------------------------------------------------------- Contraste (WCAG 2.2)

const css = leer("src/estilos.css");
const variables = Object.fromEntries([...css.matchAll(/--(color-[a-z-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]));
const color = (nombre: string) => (nombre.startsWith("#") ? nombre : variables[nombre]);

function luminancia(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(a: string, b: string): number {
  const [l1, l2] = [luminancia(color(a)), luminancia(color(b))].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

describe("usabilidad: contraste del texto (WCAG AA: 4,5 a 1 para texto normal)", () => {
  // [texto, fondo, dónde se ve]
  const pares: [string, string, string][] = [
    ["color-texto", "color-fondo", "texto general"],
    ["color-texto", "color-superficie", "tarjetas y tablas"],
    ["color-texto-suave", "color-fondo", "notas y ayudas"],
    ["color-texto-suave", "color-superficie", "etiquetas en tarjetas y ejes de la curva"],
    ["color-texto", "color-exito-fondo", "avisos de éxito"],
    ["color-texto", "color-error-fondo", "avisos de error"],
    ["color-texto", "color-info-fondo", "avisos informativos"],
    ["color-error-borde", "color-error-fondo", "leche retenida y errores de una fila"],
    ["color-error-borde", "#fff4f2", "fila del ordeño con retiro"],
    ["color-error-borde", "color-superficie", "texto de error"],
    ["color-sobre-primario", "color-primario", "botones"],
    ["color-sobre-primario", "color-primario-oscuro", "barra lateral"],
    ["color-primario", "color-fondo", "enlaces"],
    ["color-primario", "color-superficie", "enlaces en tarjetas"],
    ["color-texto", "#e6e2d6", "insignias"],
    ["color-texto", "color-macho", "árbol: machos"],
    ["color-texto", "color-hembra", "árbol: hembras"],
  ];
  for (const [texto, fondo, donde] of pares) {
    it(`${donde}: ${texto} sobre ${fondo}`, () => {
      expect(contraste(texto, fondo)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("el borde de foco del teclado se distingue del fondo (3 a 1 para elementos no textuales)", () => {
    expect(contraste("color-foco", "color-primario-oscuro")).toBeGreaterThanOrEqual(3);
    expect(contraste("color-foco", "color-texto")).toBeGreaterThanOrEqual(3);
  });

  it("la letra base es de 18 px y los campos miden al menos 48 px de alto (fáciles de tocar)", () => {
    expect(css).toMatch(/--letra-base:\s*18px/);
    expect(css).toMatch(/min-height:\s*48px/);
  });
});

describe("usabilidad: mensajes en español sencillo (sección 9)", () => {
  it("los textos de la pantalla no usan códigos de reglas, rutas de archivos del proyecto ni jerga técnica", () => {
    // Sin comentarios: solo lo que puede llegar a la pantalla.
    const textosVisibles = leer("src/textos/es.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const jerga = /\((R|RF|CA)-?\d+|\bR\d+:|docs\/|SUPOSICION|\bhash\b|\bnull\b|undefined|\bSQL\b(?! ?ite)|\bexception\b/gi;
    expect(textosVisibles.match(jerga) ?? []).toEqual([]);
  });

  it("ningún componente escribe textos propios: todos salen de src/textos/es.ts", () => {
    const componentes = archivos("src", /\.tsx$/);
    /** Quita todo lo que va entre llaves (expresiones de JSX y bloques de código), de adentro hacia afuera. */
    const sinLlaves = (texto: string) => {
      let anterior = "";
      while (anterior !== texto) [anterior, texto] = [texto, texto.replace(/\{[^{}]*\}/g, "")];
      return texto;
    };
    // Texto con palabras entre etiquetas JSX en una misma línea («>Guardar<»).
    const conTexto = componentes.filter((r) => />[ \t]*[A-Za-zÁÉÍÓÚáéíóúñ]{3,}[^<>{}\n]*</.test(sinLlaves(leer(r))));
    expect(conTexto).toEqual([]);
  });
});

describe("docs/SUPOSICIONES.md está completo (Etapa 5)", () => {
  const doc = leer("docs/SUPOSICIONES.md");
  const filas = doc.split("\n").filter((l) => l.startsWith("| S-"));
  const ids = filas.map((l) => l.split("|")[1].trim());

  it("agrupa por quién debe confirmar: ANCO, ICA y el aprisco", () => {
    expect(doc).toMatch(/## 1\. Para confirmar con ANCO/);
    expect(doc).toMatch(/## 2\. Para confirmar con el ICA/);
    expect(doc).toMatch(/## 3\. Para confirmar con el aprisco/);
  });

  it("cada suposición aparece una sola vez y tiene tema, texto, pregunta, lugar y estado", () => {
    expect(new Set(ids).size).toBe(ids.length);
    for (const fila of filas) {
      const celdas = fila.split("|").slice(1, -1).map((c) => c.trim());
      expect(celdas, fila.slice(0, 40)).toHaveLength(6);
      expect(celdas.every((c) => c.length > 0), fila.slice(0, 40)).toBe(true);
    }
    expect(doc).toContain(`**Total: ${ids.length} suposiciones abiertas**`);
  });

  it("toda suposición citada en el código o en la documentación existe en el documento", () => {
    const fuentes = [...archivos("src", /\.(ts|tsx|sql)$/), ...archivos("docs", /\.md$/), "CLAUDE.md", "README.md"].map(leer).join("\n");
    const citadas = new Set(fuentes.match(/\bS-\d{2}\b/g));
    expect([...citadas].filter((s) => !ids.includes(s))).toEqual([]);
  });
});

describe("publicación (Etapa 5)", () => {
  it("la versión es la misma en package.json, package-lock.json, Cargo.toml y tauri.conf.json", () => {
    const paquete = JSON.parse(leer("package.json")).version;
    const bloqueo = JSON.parse(leer("package-lock.json"));
    const cargo = /^version = "([^"]+)"/m.exec(leer("src-tauri/Cargo.toml"))![1];
    const tauri = JSON.parse(leer("src-tauri/tauri.conf.json")).version;
    expect([bloqueo.version, bloqueo.packages[""].version, cargo, tauri]).toEqual([paquete, paquete, paquete, paquete]);
    expect(paquete).toBe("0.1.0");
  });
});
