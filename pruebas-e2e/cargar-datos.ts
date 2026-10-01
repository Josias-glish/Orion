// Solo para las pruebas de extremo a extremo: carga los datos de ejemplo (y, con --rendimiento, los 500 animales)
// en el archivo de base que se indique. `npm run semillas` no sirve aquí porque solo escribe en la base de desarrollo.
// Uso: npx tsx pruebas-e2e/cargar-datos.ts <archivo.db> [--rendimiento]
import { fechaLocal } from "../src/dominio/fechas";
import { abrirConexionMemoria } from "../src/datos/conexion-memoria";
import { cargarDatosDeEjemplo } from "../scripts/datos-de-ejemplo";
import { cargarDatosDeRendimiento } from "../scripts/datos-de-rendimiento";

const [archivo] = process.argv.slice(2);
const conexion = abrirConexionMemoria(archivo);
try {
  console.log(JSON.stringify(await cargarDatosDeEjemplo(conexion, fechaLocal())));
  if (process.argv.includes("--rendimiento")) console.log(JSON.stringify(await cargarDatosDeRendimiento(conexion, fechaLocal())));
} finally {
  conexion.cerrar();
}
