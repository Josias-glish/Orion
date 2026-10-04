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
const SOLO_NODE = new Set([
  "src/datos/conexion-memoria.ts",
  "src/datos/ayudas-pruebas.ts",
  "src/datos/sincronizacion/ayudas-pruebas.ts",
  "src/sincronizacion/red-simulada.ts",
  "src/sincronizacion/equipos-de-prueba.ts",
  "src/documentos/pdf-node.ts",
]);

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

  it("la librería de Excel (write-excel-file) y la que usa (fflate) no hacen llamadas de red (D-046)", () => {
    const prohibido = /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/;
    const revisar = (carpeta: string) =>
      readdirSync(new URL(`node_modules/${carpeta}/`, raiz))
        .filter((nombre) => /\.(js|mjs|cjs)$/.test(nombre))
        .filter((nombre) => prohibido.test(leer(`node_modules/${carpeta}/${nombre}`)))
        .map((nombre) => `${carpeta}/${nombre}`);
    expect([...revisar("write-excel-file/universal"), ...revisar("write-excel-file/browser"), ...revisar("fflate/esm")]).toEqual([]);
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
      // Etapa 10 (D-057): red solo con el plugin HTTP oficial de Tauri, con una sola dirección declarada.
      "@tauri-apps/plugin-http",
      "@tauri-apps/plugin-sql",
      "pdfmake",
      "react",
      "react-dom",
      // Etapa 7 (D-046): archivos de Excel (.xlsx). MIT, una sola dependencia (fflate, MIT); no usa red (ver la prueba siguiente).
      "write-excel-file",
    ]);
    const cargo = leer("src-tauri/Cargo.toml");
    const dependencias = cargo
      .split("[dependencies]")[1]
      .split(/\n\[/)[0]
      .split("\n")
      .map((l) => l.split("=")[0].trim())
      .filter((l) => l && !l.startsWith("#"));
    expect(dependencias.sort()).toEqual([
      // Etapa 10 (sección 10 del diseño): llavero del sistema para la sesión. Núcleo de `keyring` (MIT o Apache-2.0); los
      // almacenes de Windows y macOS están en las dependencias por sistema (más abajo) y en Linux no hay almacén.
      "keyring-core",
      "serde",
      "serde_json",
      // Etapa 10 (D-004): `ejecutar_lote` usa la misma versión de sqlx que el plugin SQL, solo con SQLite.
      "sqlx",
      "tauri",
      "tauri-plugin-dialog",
      // Etapa 10 (D-057): red solo con el plugin HTTP oficial, con una sola dirección permitida (capabilities/sincronizacion.json).
      "tauri-plugin-http",
      "tauri-plugin-sql",
      "zip",
    ]);
    // Dependencias que solo se compilan en un sistema: los almacenes nativos del llavero.
    const porSistema: Record<string, string[]> = {};
    let seccion = "";
    for (const linea of cargo.split("\n")) {
      const titulo = linea.match(/^\[target\.'(.+)'\.dependencies\]$/);
      if (linea.startsWith("[")) seccion = titulo ? titulo[1] : "";
      else if (seccion && linea.trim() && !linea.trim().startsWith("#")) (porSistema[seccion] ??= []).push(linea.split("=")[0].trim());
    }
    expect(porSistema).toEqual({
      'cfg(target_os = "macos")': ["apple-native-keyring-store"],
      "cfg(windows)": ["windows-native-keyring-store"],
    });
    // El plugin SQL solo con SQLite (MySQL y PostgreSQL abrirían conexiones de red).
    expect(cargo).toMatch(/tauri-plugin-sql = \{ version = "2", features = \["sqlite"\] \}/);
    // sqlx directo: sin características por defecto y solo SQLite con el motor asíncrono de Tokio.
    expect(cargo).toMatch(/\nsqlx = \{ version = "0\.8", default-features = false, features = \["sqlite", "runtime-tokio"\] \}/);
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
    // Etapa 10: la red es otra capacidad aparte, con un solo permiso y una sola dirección.
    expect(readdirSync(new URL("src-tauri/capabilities/", raiz)).sort()).toEqual(["default.json", "sincronizacion.json"]);
  });

  it("la única red permitida es el plugin HTTP con una sola dirección https (Etapa 10, D-057)", () => {
    const capacidad = JSON.parse(leer("src-tauri/capabilities/sincronizacion.json"));
    expect(capacidad.identifier).toBe("sincronizacion");
    expect(capacidad.windows).toEqual(["main"]);
    expect(capacidad.permissions).toHaveLength(1);
    const [permiso] = capacidad.permissions;
    expect(Object.keys(permiso).sort()).toEqual(["allow", "identifier"]); // sin «deny» ni otros campos
    expect(permiso.identifier).toBe("http:default");
    expect(permiso.allow).toHaveLength(1);
    expect(Object.keys(permiso.allow[0])).toEqual(["url"]);
    expect(permiso.allow[0].url).toMatch(/^https:\/\/[a-z0-9.-]+\/\*$/);
    // La política de seguridad de la ventana no cambia: la red la hace Rust, no la ventana.
    const conf = JSON.parse(leer("src-tauri/tauri.conf.json"));
    expect(conf.app.security.csp["connect-src"]).toBe("ipc: http://ipc.localhost");
    // Sin esto el plugin sigue una redirección del servidor hacia cualquier otra dirección (la lista de direcciones
    // solo se revisaría en la primera). Con `scopeRedirects`, cada salto debe estar también en la lista.
    expect(conf.plugins?.http).toEqual({ scopeRedirects: true });
  });

  it("solo src/sincronizacion/red.ts importa el plugin HTTP: toda la red del programa pasa por ahí", () => {
    const usan = archivosDelPrograma().filter((ruta) => /@tauri-apps\/plugin-http/.test(leer(ruta)));
    expect(usan).toEqual(["src/sincronizacion/red.ts"]);
    // Las pruebas tampoco tocan la red real: la red simulada y las pruebas del cliente usan `fetchPropio` o `RedSimulada`.
    const rutasDeRed = ["src/sincronizacion/red.ts"];
    expect(rutasDeRed.every((r) => /\bfetchDeTauri\b/.test(leer(r)))).toBe(true);
  });

  it("la dirección permitida en la capacidad es la misma que declara el programa en servidor.json (mismo servidor)", () => {
    const declarada = new URL(JSON.parse(leer("src/sincronizacion/servidor.json")).url);
    const permitida = new URL(JSON.parse(leer("src-tauri/capabilities/sincronizacion.json")).permissions[0].allow[0].url.replace("/*", "/"));
    expect(permitida.protocol).toBe("https:");
    expect(permitida.host).toBe(declarada.host);
    // Un `.invalid` (la dirección de ejemplo) nunca resuelve; una dirección real solo se pone al construir el instalador (docs/SERVIDOR.md).
    if (declarada.hostname.endsWith(".invalid")) expect(JSON.parse(leer("src/sincronizacion/servidor.json")).claveAnonima).toBe("");
  });

  it("el plugin HTTP va sin cookies y sin características peligrosas", () => {
    const cargo = leer("src-tauri/Cargo.toml");
    const linea = cargo.split("\n").find((l) => l.startsWith("tauri-plugin-http")) ?? "";
    expect(linea).toContain("default-features = false"); // las de por defecto traen «cookies»
    const caracteristicas = (linea.match(/features = \[([^\]]*)\]/)?.[1] ?? "").split(",").map((c) => c.trim().replace(/"/g, ""));
    expect(caracteristicas.sort()).toEqual(["rustls-tls", "system-proxy"]);
    for (const peligrosa of ["cookies", "dangerous-settings", "unsafe-headers", "native-tls"]) {
      expect(caracteristicas).not.toContain(peligrosa);
    }
  });

  it("los comandos propios de Rust de la Etapa 10 están registrados en lib.rs", () => {
    const rust = leer("src-tauri/src/lib.rs");
    const lista = rust.match(/generate_handler!\[([^\]]*)\]/)?.[1] ?? "";
    for (const comando of ["ejecutar_lote", "guardar_secreto", "leer_secreto", "borrar_secreto"]) {
      expect(lista, comando).toMatch(new RegExp(`\\b${comando}\\b`));
    }
    expect(rust).toMatch(/\.plugin\(tauri_plugin_http::init\(\)\)/);
    // Solo se pueden usar las bases que declara el programa (D-054).
    expect(rust).toMatch(/BASES_DE_DATOS\.contains\(&db\.as_str\(\)\)/);
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
