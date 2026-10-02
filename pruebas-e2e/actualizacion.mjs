// CA-33 (especificación 2) con el programa real en Linux, SIN RED: instalar una versión nueva sobre la 0.1.0 conserva
// todos los datos. La base la crea el programa de la versión 0.1.0 (con sus migraciones) y se llena con los datos de
// ejemplo de esa misma versión; después se abre con el programa nuevo, que aplica sus migraciones, y se compara
// tabla por tabla. Nunca usa datos reales.
// Uso (ver docs/PRUEBA_TECNICA.md):
//   git worktree add ../v010 v0.1.0 && ln -s "$PWD/node_modules" ../v010/node_modules
//   (cd ../v010 && npx tauri build --debug --no-bundle)          # programa de la 0.1.0
//   npx tauri build --debug --no-bundle                           # programa nuevo
//   rm -rf ~/.config/co.registrocaprino.escritorio/{registro-caprino.db*,documentos,fotos}
//   unshare -n sh -c 'ip link set lo up; xvfb-run -a node pruebas-e2e/actualizacion.mjs \
//     ../v010/src-tauri/target/debug/registro-caprino "$PWD/src-tauri/target/debug/registro-caprino" ../v010 capturas'
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { abrirPrograma, crearRegistro, esperar, iniciarDriver } from "./webdriver.mjs";

const [PROGRAMA_010, PROGRAMA_NUEVO, CODIGO_010, CAPTURAS_RELATIVAS] = process.argv.slice(2);
const CAPTURAS = resolve(CAPTURAS_RELATIVAS);
mkdirSync(CAPTURAS, { recursive: true });
const BASE = join(homedir(), ".config", "co.registrocaprino.escritorio", "registro-caprino.db");
const registro = crearRegistro();
const { comprobar } = registro;
const driver = await iniciarDriver();

/** Todas las tablas de la base, fila por fila (con Python, que trae SQLite). */
const leerBase = () =>
  JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        `import sqlite3, json, sys
db = sqlite3.connect(sys.argv[1])
db.row_factory = sqlite3.Row
tablas = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '_sqlx_migrations'")]
print(json.dumps({t: [dict(r) for r in db.execute(f"SELECT * FROM {t} ORDER BY id")] for t in tablas}))`,
        BASE,
      ],
      { encoding: "utf8", maxBuffer: 1 << 30 },
    ),
  );
const migraciones = () =>
  execFileSync("python3", ["-c", "import sqlite3,sys;print(sqlite3.connect(sys.argv[1]).execute('SELECT group_concat(version) FROM _sqlx_migrations WHERE success = 1').fetchone()[0])", BASE], {
    encoding: "utf8",
  }).trim();

async function entrar(p) {
  await p.clic('[data-usuario="Propietario de ejemplo"]');
  await p.buscar('[data-prueba="usuario-actual"]', { condicion: (t) => t.includes("Propietario de ejemplo") });
}

try {
  // ---------- 1. Versión 0.1.0: crea la base y se llena con sus datos de ejemplo ----------
  let p = await abrirPrograma(PROGRAMA_010, CAPTURAS);
  await p.buscar('[data-prueba="asistente-siguiente"]');
  await p.cerrar();
  await esperar(1000);
  const carga = execFileSync("npx", ["tsx", "pruebas-e2e/cargar-datos.ts", BASE], { cwd: CODIGO_010, encoding: "utf8" }).trim();
  console.log(`Datos de ejemplo de la 0.1.0: ${carga}`);
  p = await abrirPrograma(PROGRAMA_010, CAPTURAS);
  await entrar(p);
  const version010 = (await p.buscar(".barra-lateral", { condicion: (t) => /Versión 0\.1\.0/.test(t) })).texto;
  comprobar("La base la creó y la usó el programa de la versión 0.1.0", /Versión 0\.1\.0/.test(version010));
  await p.clic('[data-pantalla="animales"]');
  const cantidad010 = (await p.buscar('[data-prueba="cantidad"]')).texto;
  await p.captura("ca33-01-version-0.1.0");
  await p.cerrar();
  await esperar(1000);
  const antes = leerBase();
  comprobar("Migraciones de la 0.1.0 aplicadas", migraciones() === "1,2,3,4", migraciones());

  // ---------- 2. Versión nueva sobre la misma carpeta de datos ----------
  p = await abrirPrograma(PROGRAMA_NUEVO, CAPTURAS);
  const pideUsuario = await p.buscar('[data-usuario="Propietario de ejemplo"]').then(
    () => true,
    () => false,
  );
  comprobar("CA-33: la versión nueva abre sin pedir el asistente: la finca y los usuarios siguen ahí", pideUsuario);
  await entrar(p);
  await p.clic('[data-pantalla="animales"]');
  const cantidadNueva = (await p.buscar('[data-prueba="cantidad"]')).texto;
  comprobar("CA-33: el inventario tiene los mismos animales", cantidadNueva === cantidad010, `${cantidad010} → ${cantidadNueva}`);
  await p.clic('[data-pestana="externos"]');
  const externos = (await p.buscar("main")).texto;
  comprobar("Las funciones nuevas están disponibles («De otras fincas»)", externos.includes("Registrar animal de otra finca"));
  await p.captura("ca33-02-version-nueva");
  await p.cerrar();
  await esperar(1000);

  // ---------- 3. Comparación tabla por tabla ----------
  const despues = leerBase();
  comprobar("CA-33: el programa nuevo aplicó sus migraciones", migraciones().startsWith("1,2,3,4,5,6"), migraciones());
  const diferencias = [];
  for (const [tabla, filas] of Object.entries(antes)) {
    if (despues[tabla].length !== filas.length) diferencias.push(`${tabla}: ${filas.length} → ${despues[tabla].length}`);
    filas.forEach((fila, i) => {
      for (const [columna, valor] of Object.entries(fila)) {
        if (despues[tabla][i]?.[columna] !== valor) diferencias.push(`${tabla}.${columna} (${fila.id})`);
      }
    });
  }
  const resumen = Object.entries(antes)
    .filter(([, f]) => f.length > 0)
    .map(([t, f]) => `${t} ${f.length}`)
    .join(", ");
  comprobar("CA-33: ninguna fila ni ningún valor de la 0.1.0 se perdió ni cambió", diferencias.length === 0, diferencias.slice(0, 5).join("; ") || resumen);
  comprobar(
    "CA-33: los documentos emitidos con la 0.1.0 siguen en «certificado» (la tabla se reconstruyó en la migración 0006)",
    despues.certificado.length === antes.certificado.length, // con documentos de verdad lo prueba actualizacion.test.ts (la base de estos datos de ejemplo no tiene ninguno)
    `${despues.certificado.length} documentos`,
  );
  comprobar(
    "CA-33: los cinco libros recibieron su prefijo y ninguno tiene registros",
    despues.libro.filter((l) => l.prefijo).length === 5 && despues.registro_genealogico.length === 0,
  );
  comprobar(
    "CA-33: los animales existentes quedan «nacido_aqui»",
    despues.animal.every((a) => a.origen === "nacido_aqui"),
    `${despues.animal.length} animales`,
  );
} catch (error) {
  comprobar("La prueba terminó sin errores", false, String(error?.stack ?? error));
} finally {
  driver.kill();
}
process.exit(registro.terminar() === 0 ? 0 : 1);
