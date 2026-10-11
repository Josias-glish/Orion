// Calcula el SHA-256 de cada migración de servidor/migraciones/ y lo escribe en servidor/migraciones/huellas.json.
//
// Cuándo usarlo: solo cuando agregas una migración NUEVA (se suma su huella) o, mientras ninguna migración esté aplicada en un servidor
// real, cuando corriges una existente. Una migración ya aplicada en un servidor NO se edita: se crea otra con el número siguiente.
//
//   Comando:        node servidor/regenerar-huellas.mjs
//   Solo comprobar: node servidor/regenerar-huellas.mjs --comprobar   (sale con error si hay diferencias; no escribe nada)
//
// No necesita instalar nada: usa solo módulos de Node. Lo comprueba también la prueba servidor/pruebas/huellas.test.ts.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const carpeta = new URL("./migraciones/", import.meta.url);
const archivos = readdirSync(carpeta)
  .filter((nombre) => /^\d{4}_.+\.sql$/.test(nombre))
  .sort();

const huellas = {};
for (const archivo of archivos) {
  huellas[archivo] = createHash("sha256").update(readFileSync(new URL(archivo, carpeta), "utf8")).digest("hex");
}
const texto = JSON.stringify(huellas, null, 2) + "\n";
const destino = new URL("huellas.json", carpeta);

if (process.argv.includes("--comprobar")) {
  let actual = "";
  try {
    actual = readFileSync(destino, "utf8");
  } catch {
    // no existe: se trata como diferente
  }
  if (actual !== texto) {
    console.error("servidor/migraciones/huellas.json no coincide con las migraciones. Corre: node servidor/regenerar-huellas.mjs");
    process.exit(1);
  }
  console.log(`Las ${archivos.length} huellas coinciden.`);
} else {
  writeFileSync(destino, texto);
  console.log(`Escribí ${archivos.length} huellas en servidor/migraciones/huellas.json`);
}
