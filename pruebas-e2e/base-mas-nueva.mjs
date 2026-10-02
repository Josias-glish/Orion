// Prueba con el programa real en Linux, SIN RED: abrir datos que guardó una versión MÁS NUEVA.
// Contexto: el programa 0.1.0 (migraciones 1 a 4) abriendo una base de la 0.5.0 (1 a 8) muestra «No se pudo abrir la base de
// datos» con el detalle `migration 5 was previously applied but is missing in the resolved migrations`. Aquí se simula lo
// mismo con el programa nuevo: se crea la base, se le agrega una migración que el programa no trae (la 99) y se abre otra vez.
// Debe: explicar en español qué pasó y qué hacer, conservar el detalle técnico, NO tocar la base, y abrir normal en cuanto
// la base vuelve a ser compatible.
// Uso (necesita una carpeta de datos vacía; usa una temporal para no tocar la tuya):
//   npx tauri build --debug --no-bundle
//   XDG_CONFIG_HOME=$(mktemp -d) xvfb-run -a node pruebas-e2e/base-mas-nueva.mjs "$PWD/src-tauri/target/debug/registro-caprino" capturas
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { abrirPrograma, crearRegistro, esperar, iniciarDriver } from "./webdriver.mjs";

const [APLICACION, CAPTURAS_RELATIVAS] = process.argv.slice(2);
const CAPTURAS = resolve(CAPTURAS_RELATIVAS);
mkdirSync(CAPTURAS, { recursive: true });
const CARPETA = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "co.registrocaprino.escritorio");
const BASE = join(CARPETA, "registro-caprino.db");
const registro = crearRegistro();
const { comprobar } = registro;
const driver = await iniciarDriver();

const sql = (consulta) =>
  execFileSync("python3", ["-c", "import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);r=c.execute(sys.argv[2]).fetchall();c.commit();print(r[0][0] if r else '')", BASE, consulta], { encoding: "utf8" }).trim();
const estado = () => `${sql("SELECT group_concat(version) FROM (SELECT version FROM _sqlx_migrations ORDER BY version)")} | razas ${sql("SELECT count(*) FROM raza")}`;

/** Abre el programa, espera a que dibuje algo, devuelve el texto de la pantalla y lo cierra. */
async function abrirYLeer(captura) {
  const p = await abrirPrograma(APLICACION, CAPTURAS);
  await esperar(4000);
  const texto = await p.js("return document.body.textContent");
  await p.captura(captura);
  await p.cerrar();
  await esperar(1500); // que el programa termine de cerrarse antes de tocar la base
  return texto.replace(/\s+/g, " ");
}

try {
  rmSync(CARPETA, { recursive: true, force: true });

  const primera = await abrirYLeer("1-base-nueva");
  comprobar("el programa crea su base y muestra la bienvenida", primera.includes("Bienvenida a Registro Caprino"));
  const antes = estado();
  comprobar("la base queda con las migraciones del programa", /^1,2,3,4,5,6,7,8/.test(antes), antes);

  // Una migración que este programa no trae: como si la hubiera aplicado una versión más nueva.
  sql("INSERT INTO _sqlx_migrations (version, description, success, checksum, execution_time) VALUES (99, 'de_una_version_mas_nueva', 1, x'00', 1)");
  const conFutura = estado();

  const rechazada = await abrirYLeer("2-version-mas-nueva");
  comprobar("dice que no se pudo abrir la base de datos", rechazada.includes("No se pudo abrir la base de datos del programa."));
  comprobar("explica que los datos son de una versión más nueva y que no se perdió nada", rechazada.includes("versión más nueva") && rechazada.includes("No se perdió nada"));
  comprobar("dice qué hacer: instalar la versión más reciente y desinstalar la vieja sin borrar los datos", rechazada.includes("versión más reciente") && rechazada.includes("Eliminar los datos de aplicación"));
  comprobar("conserva el detalle técnico para quien da soporte", rechazada.includes("migration 99 was previously applied but is missing in the resolved migrations"));
  comprobar("no entra al programa ni muestra la bienvenida", !rechazada.includes("Bienvenida a Registro Caprino"));
  comprobar("la base no se tocó: mismas migraciones y mismos datos", estado() === conFutura, `${estado()}`);

  sql("DELETE FROM _sqlx_migrations WHERE version = 99");
  const recuperada = await abrirYLeer("3-recuperada");
  comprobar("al quitar la migración «del futuro», el programa abre normal", recuperada.includes("Bienvenida a Registro Caprino") && !recuperada.includes("No se pudo abrir"));
  comprobar("y la base quedó como al principio", estado() === antes, estado());
} finally {
  driver.kill();
}

process.exit(registro.terminar() === 0 ? 0 : 1);
