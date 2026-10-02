// npm run semillas: carga los datos de ejemplo en la base de DESARROLLO (la de `npm run tauri dev`).
// Nunca toca la base del programa instalado. Ver sección 12 de docs/ESPECIFICACION.md.
//   npm run semillas                    animales de ejemplo con reproducción, leche, pesos, salud y un semental de otra finca
//   npm run semillas -- --rendimiento   además, 500 animales de prueba y la medición de CA-09
//   npm run semillas -- --donde         solo muestra la ruta de la base de desarrollo
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { abrirConexionMemoria, archivosDeMigracion } from "../src/datos/conexion-memoria";
import { URL_BASE_DATOS_DESARROLLO } from "../src/datos/bases";
import { calcularConsanguinidad } from "../src/datos/repositorios/genealogia";
import { listarAnimales, listarExternos } from "../src/datos/repositorios/animales";
import { listarLactancias } from "../src/datos/repositorios/leche";
import { listarPartosProximos, serviciosComoMacho } from "../src/datos/repositorios/reproduccion";
import { listarAlertasRetiro } from "../src/datos/repositorios/salud";
import { fechaLocal, marcaDeTiempo } from "../src/dominio/fechas";
import { formatearPorcentaje } from "../src/textos/es";
import { asegurarFinca, cargarDatosDeEjemplo } from "./datos-de-ejemplo";
import { cargarDatosDeRendimiento, medirOrdeno } from "./datos-de-rendimiento";

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

    const hoy = fechaLocal();
    const resultado = await cargarDatosDeEjemplo(conexion, hoy);
    if (resultado.yaCargados) {
      console.log("Los datos de ejemplo ya estaban cargados. No se cambió nada.");
    } else {
      if (resultado.creoFinca) console.log("Se creó la finca «Aprisco de ejemplo» y el usuario «Propietario de ejemplo» (sin PIN).");
      console.log(`Se crearon ${resultado.creados} animales de ejemplo. Consanguinidad calculada:`);
      for (const arete of ["EJ-10", "EJ-11", "EJ-12"]) {
        const [animal] = await listarAnimales(conexion, { texto: arete });
        const { coeficiente } = await calcularConsanguinidad(conexion, animal.id);
        console.log(`  ${animal.nombre} (${arete}): ${formatearPorcentaje(coeficiente * 100)}`);
      }
      const lactancias = await listarLactancias(conexion);
      console.log(`Lactancias en curso: ${lactancias.map((l) => `${l.hembra} (${l.pesajes} pesajes)`).join(", ")}.`);
      const proximos = await listarPartosProximos(conexion, hoy);
      console.log(`Partos próximos: ${proximos.map((s) => `${s.hembra} (${s.fechaProbableParto})`).join(", ") || "ninguno"}.`);
      const retiros = await listarAlertasRetiro(conexion, hoy);
      console.log(`Retiros vigentes: ${retiros.map((r) => `${r.animal} (${r.tipo} hasta ${r.hasta})`).join(", ") || "ninguno"}.`);
    }
    if (resultado.externos) {
      for (const externo of await listarExternos(conexion)) {
        const { resumen } = await serviciosComoMacho(conexion, externo.id);
        console.log(
          `De otras fincas: ${externo.nombre} (${externo.propietario}), ${resumen.servicios} servicios, ` +
            `${resumen.partos} parto con ${resumen.crias} cría.`,
        );
      }
    }

    if (process.argv.includes("--rendimiento")) {
      console.log("Cargando 500 animales de prueba de rendimiento (CA-09)…");
      const inicio = performance.now();
      const r = await cargarDatosDeRendimiento(conexion, hoy);
      if (r.yaCargados) console.log("Los animales de prueba de rendimiento ya estaban cargados.");
      else {
        console.log(
          `Se crearon ${r.animales} animales, ${r.lactancias} lactancias y ${r.pesajesLeche} pesajes de leche ` +
            `en ${((performance.now() - inicio) / 1000).toFixed(1)} s.`,
        );
      }
      const { contexto } = await asegurarFinca(conexion);
      const m = await medirOrdeno(conexion, hoy, { ...contexto(), marcaTiempo: marcaDeTiempo() });
      const ms = (v: number) => `${v.toFixed(1)} ms`;
      console.log(`CA-09 en esta base: lista del ordeño ${ms(m.listarMs)}, guardar un pesaje ${ms(m.guardarNuevoMs)}, corregirlo ${ms(m.corregirMs)}.`);
      console.log(m.guardarNuevoMs < 1000 && m.corregirMs < 1000 ? "CA-09 cumple: menos de un segundo." : "CA-09 NO cumple.");
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
