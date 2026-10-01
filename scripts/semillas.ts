// npm run semillas: carga los datos de ejemplo en la base de DESARROLLO (la de `npm run tauri dev`).
// Nunca toca la base del programa instalado. Ver sección 12 de docs/ESPECIFICACION.md.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { abrirConexionMemoria, archivosDeMigracion } from "../src/datos/conexion-memoria";
import { URL_BASE_DATOS_DESARROLLO } from "../src/datos/bases";
import { calcularConsanguinidad } from "../src/datos/repositorios/genealogia";
import { listarAnimales } from "../src/datos/repositorios/animales";
import { formatearPorcentaje } from "../src/textos/es";
import { cargarDatosDeEjemplo } from "./datos-de-ejemplo";

/** Carpeta de configuración del programa, igual que la que usa Tauri (app_config_dir). */
function carpetaDeDatos(): string {
  const configuracion = JSON.parse(readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
  const identificador: string = configuracion.identifier;
  switch (process.platform) {
    case "win32":
      return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), identificador);
    case "darwin":
      return join(homedir(), "Library", "Application Support", identificador);
    default:
      return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), identificador);
  }
}

async function principal() {
  const archivo = join(carpetaDeDatos(), URL_BASE_DATOS_DESARROLLO.replace(/^sqlite:/, ""));
  console.log(`Base de desarrollo: ${archivo}`);
  // «npm run semillas -- --donde» solo muestra la ruta (lo usa GitHub Actions para comprobar que el script carga).
  if (process.argv.includes("--donde")) return;
  if (!existsSync(archivo)) {
    console.error("No existe todavía. Abra una vez el programa con «npm run tauri dev», ciérrelo y vuelva a intentar.");
    process.exit(1);
  }

  const conexion = abrirConexionMemoria(archivo);
  try {
    const [{ n }] = await conexion.consultar<{ n: number }>(
      "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = '_sqlx_migrations'",
    );
    const aplicadas = n ? (await conexion.consultar<{ v: number }>("SELECT count(*) AS v FROM _sqlx_migrations WHERE success = 1"))[0].v : 0;
    if (aplicadas < archivosDeMigracion().length) {
      console.error("La base no tiene todas las migraciones. Abra el programa con «npm run tauri dev», ciérrelo y vuelva a intentar.");
      process.exit(1);
    }

    const resultado = await cargarDatosDeEjemplo(conexion);
    if (resultado.yaCargados) {
      console.log("Los datos de ejemplo ya estaban cargados. No se cambió nada.");
      return;
    }
    if (resultado.creoFinca) console.log("Se creó la finca «Aprisco de ejemplo» y el usuario «Propietario de ejemplo» (sin PIN).");
    console.log(`Se crearon ${resultado.creados} animales de ejemplo. Consanguinidad calculada:`);
    for (const arete of ["EJ-10", "EJ-11", "EJ-12"]) {
      const [animal] = await listarAnimales(conexion, { texto: arete });
      const { coeficiente } = await calcularConsanguinidad(conexion, animal.id);
      console.log(`  ${animal.nombre} (${arete}): ${formatearPorcentaje(coeficiente * 100)}`);
    }
    console.log("Abra el programa con «npm run tauri dev» para verlos.");
  } finally {
    conexion.cerrar();
  }
}

principal().catch((error: unknown) => {
  console.error("No se pudieron cargar los datos de ejemplo:", error);
  process.exit(1);
});
