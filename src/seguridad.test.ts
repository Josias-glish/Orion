// Etapa 5: CA-10 (sin red), permisos mínimos de Tauri, privacidad (PIN con hash, sin telemetría, datos en la
// carpeta del usuario). Son revisiones del código y de la configuración: si alguien agrega una llamada de red,
// una dependencia que la haga o un permiso que no se usa, `npm test` falla y obliga a revisarlo.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { crearBaseDePrueba } from "./datos/conexion-memoria";
import { crearUsuario } from "./datos/repositorios/usuarios";
import { exportarRespaldo } from "./datos/respaldo";
import { PROPIETARIO } from "./datos/ayudas-pruebas";

const raiz = new URL("../", import.meta.url);
const leer = (ruta: string) => readFileSync(new URL(ruta, raiz), "utf8");

/** Archivos del programa (lo que entra al instalador): src sin pruebas ni ayudas que solo corren en Node. */
function archivosDelPrograma(carpeta = "src"): string[] {
  const resultado: string[] = [];
  for (const nombre of readdirSync(new URL(`${carpeta}/`, raiz))) {
    const ruta = `${carpeta}/${nombre}`;
    if (statSync(new URL(ruta, raiz)).isDirectory()) resultado.push(...archivosDelPrograma(ruta));
    else if (/\.(ts|tsx)$/.test(nombre) && !/\.test\.ts$/.test(nombre)) resultado.push(ruta);
  }
  return resultado;
}
/** Solo para pruebas y scripts (Node): nunca los importa la ventana del programa. */
const SOLO_NODE = new Set(["src/datos/conexion-memoria.ts", "src/datos/ayudas-pruebas.ts", "src/documentos/pdf-node.ts"]);

describe("CA-10: el programa no hace llamadas de red", () => {
  it("ningún archivo del programa usa fetch, XMLHttpRequest, WebSocket, EventSource, sendBeacon ni direcciones web", () => {
    const prohibido = /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|https?:\/\//;
    const hallazgos = archivosDelPrograma()
      .filter((ruta) => prohibido.test(leer(ruta)))
      .map((ruta) => ruta);
    expect(hallazgos).toEqual([]);
  });

  it("los archivos que solo corren en Node no los importa la ventana", () => {
    const importan = archivosDelPrograma()
      .filter((ruta) => !SOLO_NODE.has(ruta))
      .filter((ruta) => /conexion-memoria|ayudas-pruebas|pdf-node|node:/.test(leer(ruta)));
    expect(importan).toEqual([]);
  });

  it("la política de seguridad (CSP) de la ventana no permite conectarse a ningún servidor", () => {
    const { csp } = JSON.parse(leer("src-tauri/tauri.conf.json")).app.security;
    expect(csp["default-src"]).toBe("'self'");
    // Solo el puente interno de Tauri (ipc); ningún http(s) externo.
    expect(csp["connect-src"]).toBe("ipc: http://ipc.localhost");
    for (const [directiva, valor] of Object.entries(csp)) {
      const externos = String(valor)
        .split(/\s+/)
        .filter((o) => /^https?:/.test(o) && !/^http:\/\/(ipc|asset)\.localhost$/.test(o));
      expect(externos, directiva).toEqual([]);
    }
  });

  it("las dependencias son solo las conocidas: ninguna de red, análisis o telemetría", () => {
    const paquete = JSON.parse(leer("package.json"));
    expect(Object.keys(paquete.dependencies).sort()).toEqual([
      "@noble/hashes",
      "@tauri-apps/api",
      "@tauri-apps/plugin-dialog",
      "@tauri-apps/plugin-sql",
      "pdfmake",
      "react",
      "react-dom",
    ]);
    const cargo = leer("src-tauri/Cargo.toml");
    const dependencias = cargo
      .split("[dependencies]")[1]
      .split(/\n\[/)[0]
      .split("\n")
      .map((l) => l.split("=")[0].trim())
      .filter((l) => l && !l.startsWith("#"));
    expect(dependencias.sort()).toEqual(["serde", "serde_json", "tauri", "tauri-plugin-dialog", "tauri-plugin-sql", "zip"]);
    // El plugin SQL solo con SQLite (MySQL y PostgreSQL abrirían conexiones de red).
    expect(cargo).toMatch(/tauri-plugin-sql = \{ version = "2", features = \["sqlite"\] \}/);
  });
});

describe("permisos mínimos de Tauri (Etapa 5)", () => {
  it("la ventana solo tiene los permisos que el programa usa", () => {
    const capacidad = JSON.parse(leer("src-tauri/capabilities/default.json"));
    expect(capacidad.permissions).toEqual([
      "core:app:allow-version",
      "core:path:allow-resolve-directory",
      "core:path:allow-join",
      "sql:allow-load",
      "sql:allow-select",
      "sql:allow-execute",
      "dialog:allow-open",
      "dialog:allow-save",
    ]);
    expect(readdirSync(new URL("src-tauri/capabilities/", raiz))).toEqual(["default.json"]);
  });

  it("el protocolo asset solo puede leer la carpeta de fotos", () => {
    const { assetProtocol } = JSON.parse(leer("src-tauri/tauri.conf.json")).app.security;
    expect(assetProtocol.scope).toEqual(["$APPCONFIG/fotos/**/*"]);
  });

  it("la ventana no expone el objeto global de Tauri", () => {
    const conf = JSON.parse(leer("src-tauri/tauri.conf.json"));
    expect(conf.app.withGlobalTauri ?? false).toBe(false);
  });
});

describe("privacidad", () => {
  it("el PIN nunca queda en texto plano en ninguna tabla, tampoco en el historial ni en la copia de respaldo", async () => {
    const db = crearBaseDePrueba();
    try {
      await crearUsuario(db, { nombre: "Ana", rol: "propietario", contacto: null }, "739182", PROPIETARIO);
      const respaldo = JSON.stringify(await exportarRespaldo(db, PROPIETARIO));
      expect(respaldo).not.toContain("739182");
      expect(respaldo).toMatch(/pbkdf2-sha256\$600000\$/);
    } finally {
      db.cerrar();
    }
  });

  it("los datos y archivos quedan en la carpeta de datos del usuario (app_config_dir), sin rutas fijas", () => {
    const rust = leer("src-tauri/src/lib.rs");
    expect(rust).toMatch(/app_config_dir\(\)/);
    expect(rust).not.toMatch(/"\/(home|Users|tmp)|C:\\\\/);
  });
});
