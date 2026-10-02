// Prueba de extremo a extremo de la Etapa 4 sobre el programa real en Linux, SIN RED: alertas de retiro (Inicio, ordeño
// y ficha), Flujo 3 (tratamiento a un animal y a un lote), Flujo 5 (expediente PDF y CSV), certificado interno (R12),
// copia de respaldo y CA-11 (cerrar, «otro computador» vacío, restaurar y comparar).
// Los diálogos «Guardar» y «Abrir» del sistema (GTK) no se manejan con WebDriver: pruebas-e2e/dialogo.py los responde
// con el teclado, como una persona. Así el camino es el real de punta a punta.
// Uso (ver docs/PRUEBA_TECNICA.md):
//   npx tauri build --debug --no-bundle
//   rm -rf ~/.config/co.registrocaprino.escritorio/{registro-caprino.db*,documentos,fotos}
//   unshare -n sh -c 'ip link set lo up; xvfb-run -a node pruebas-e2e/etapa4.mjs "$PWD/src-tauri/target/debug/registro-caprino" capturas'
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { abrirPrograma, crearRegistro, esperar, iniciarDriver } from "./webdriver.mjs";

const [APLICACION, CAPTURAS_RELATIVAS] = process.argv.slice(2);
const CAPTURAS = resolve(CAPTURAS_RELATIVAS);
const DATOS = join(homedir(), ".config", "co.registrocaprino.escritorio");
const BASE = join(DATOS, "registro-caprino.db");
const SALIDA = join(CAPTURAS, "archivos");
rmSync(SALIDA, { recursive: true, force: true });
mkdirSync(SALIDA, { recursive: true });
const registro = crearRegistro();
const { comprobar } = registro;
const driver = await iniciarDriver();

const filas = (p, css) => p.js(`return [...document.querySelectorAll(arguments[0] + " tbody tr")].map((f) => f.innerText);`, [css]);
const minusculas = (t) => t.toLowerCase();

/** Hace clic en un botón que abre el diálogo «Guardar» o «Abrir» del sistema y lo responde con `ruta` (dialogo.py). */
async function conDialogo(p, css, ruta) {
  await p.clic(css);
  console.log(execFileSync("python3", ["pruebas-e2e/dialogo.py", ruta], { encoding: "utf8" }).trim());
}

async function entrar(p) {
  await p.clic('[data-usuario="Propietario de ejemplo"]');
  await p.buscar('[data-prueba="usuario-actual"]', { condicion: (t) => t.includes("Propietario de ejemplo") });
}

/** Tablas de datos.json dentro de un .zip de respaldo (con Python, que viene en el equipo). */
const tablasDe = (zip) =>
  JSON.parse(
    execFileSync("python3", ["-c", "import sys,zipfile,json;print(json.dumps(json.loads(zipfile.ZipFile(sys.argv[1]).read('datos.json'))['tablas']))", zip], {
      encoding: "utf8",
      maxBuffer: 1 << 30,
    }),
  );

try {
  // ---------- Preparación: base con migraciones creada por el programa y datos de ejemplo ----------
  let p = await abrirPrograma(APLICACION, CAPTURAS);
  await p.buscar('[data-prueba="asistente-siguiente"]');
  await p.cerrar();
  await esperar(1000);
  console.log(`Datos de ejemplo: ${execFileSync("npx", ["tsx", "pruebas-e2e/cargar-datos.ts", BASE], { encoding: "utf8" }).trim()}`);

  p = await abrirPrograma(APLICACION, CAPTURAS);
  await entrar(p);

  // ---------- Permisos mínimos (Etapa 5): lo que no está en capabilities/default.json queda bloqueado ----------
  const bloqueados = await p.jsAsync(
    `const listo = arguments[arguments.length - 1];
     const probar = (cmd, args) => window.__TAURI_INTERNALS__.invoke(cmd, args).then(() => "permitido", (e) => String(e));
     Promise.all([
       probar("plugin:dialog|message", { message: "x" }),
       probar("plugin:sql|close", {}),
       probar("plugin:window|close", { label: "main" }),
       probar("plugin:app|version", {}),
     ]).then(listo);`,
  );
  comprobar(
    "Permisos mínimos: mensajes del sistema, cerrar la base y cerrar la ventana quedan bloqueados; la versión sí se lee",
    bloqueados.slice(0, 3).every((r) => /not allowed|denied/i.test(r)) && bloqueados[3] === "permitido",
    bloqueados.join(" | "),
  );

  // ---------- RF-24: alertas de retiro en el Inicio, el ordeño y la ficha ----------
  const retirosInicio = await filas(p, '[data-prueba="tabla-retiros"]');
  comprobar("Inicio: muestra el retiro vigente de Bella (leche y carne)", retirosInicio.length === 2 && retirosInicio.every((f) => f.includes("Bella")), retirosInicio.join(" | "));
  const vacunas = await filas(p, '[data-prueba="tabla-proximas"]');
  comprobar("Inicio: muestra las vacunas y desparasitaciones por vencer (9 animales)", vacunas.length === 9, `${vacunas.length} filas`);
  await p.captura("e4-01-inicio");

  await p.clic('[data-pantalla="leche"]');
  await p.elegirOpcion('[data-prueba="ordeno-jornada"]', "Mañana");
  const avisoBella = (await p.buscar('[data-cabra="Bella"] [data-prueba="leche-retenida"]')).texto;
  comprobar("Flujo 2: el ordeño avisa que la leche de Bella está retenida", avisoBella.includes("Leche retenida hasta"), avisoBella);
  const otrasConAviso = await p.js(`return document.querySelectorAll('[data-prueba="leche-retenida"]').length;`);
  comprobar("Flujo 2: solo Bella tiene el aviso", otrasConAviso === 1, `${otrasConAviso} avisos`);
  await p.clic('[data-cabra="Bella"] [data-prueba="kilos"]');
  await p.teclear("1,7");
  const guardadaBella = (await p.buscar('[data-cabra="Bella"] [data-prueba="estado-fila"]', { condicion: (t) => minusculas(t).includes("guardado") })).texto;
  comprobar("Flujo 2: la leche retenida se pesa y se guarda igual", minusculas(guardadaBella).includes("guardado"));
  await p.captura("e4-02-ordeno-retiro");

  // ---------- Flujo 3: tratamiento a un animal con todos los campos del ICA ----------
  await p.clic('[data-pantalla="salud"]');
  await p.escribir('[data-prueba="salud-animal"]', "Abril");
  await p.clic(".selector__resultados button");
  await p.escribir('[data-prueba="salud-producto"]', "Oxitetraciclina (prueba)");
  await p.escribir('[data-prueba="salud-ica"]', "PRUEBA-ICA-77");
  await p.escribir('[data-prueba="salud-dosis"]', "10 ml");
  await p.escribir('[data-prueba="salud-via"]', "Intramuscular");
  await p.escribir('[data-prueba="salud-retiro-leche"]', "5");
  await p.escribir('[data-prueba="salud-retiro-carne"]', "28");
  await p.escribir('[data-prueba="salud-veterinario"]', "Dra. Prueba");
  await p.captura("e4-03-tratamiento");
  await p.clic('[data-prueba="guardar-salud"]');
  const guardado = (await p.buscar('[data-prueba="aviso-exito"]')).texto;
  comprobar("Flujo 3: el tratamiento se guarda", guardado.includes("Guardado"), guardado);
  await p.clic('[data-pestana="retiros"]');
  await p.buscar('[data-prueba="tabla-retiros"]');
  const retiros = await filas(p, '[data-prueba="tabla-retiros"]');
  comprobar("Flujo 3: la alerta de Abril queda activa (leche y carne)", retiros.filter((f) => f.includes("Abril")).length === 2, retiros.join(" | "));

  // A un lote: desparasitación del lote de levante.
  await p.clic('[data-pestana="registrar"]');
  await p.elegirOpcion('[data-prueba="salud-tipo"]', "Desparasitación");
  await p.clic('[data-prueba="destino-lote"]');
  await p.elegirOpcion('[data-prueba="salud-lote"]', "Levante");
  await p.escribir('[data-prueba="salud-producto"]', "Antiparasitario (prueba)");
  await p.clic('[data-prueba="guardar-salud"]');
  const lote = (await p.buscar('[data-prueba="aviso-exito"]', { condicion: (t) => t.includes("animales") })).texto;
  comprobar("Flujo 3: a un lote se anota en cada animal activo del lote", /Guardado en \d+ animales/.test(lote), lote);

  // Ficha de Abril: alerta arriba y el evento en la pestaña Salud.
  await p.clic('[data-pantalla="animales"]');
  await p.escribir('[data-prueba="buscar"]', "Abril");
  await p.buscar('[data-prueba="cantidad"]', { condicion: (t) => t === "1 animal" });
  await p.clic('[data-prueba="tabla-animales"] tbody tr .enlace');
  const alertaFicha = (await p.buscar('[data-prueba="alerta-retiro-ficha"]')).texto;
  comprobar("RF-24: la ficha de Abril muestra el retiro vigente", alertaFicha.includes("Oxitetraciclina (prueba)"), alertaFicha.replace(/\n/g, " | "));
  await p.clic('[data-pestana="salud"]');
  await p.buscar('[data-prueba="tabla-eventos-salud"]');
  const eventos = await filas(p, '[data-prueba="tabla-eventos-salud"]');
  comprobar("Flujo 3: la ficha guarda el registro ICA, la dosis, la vía y el veterinario", eventos.some((f) => f.includes("PRUEBA-ICA-77") && f.includes("10 ml") && f.includes("Intramuscular") && f.includes("Dra. Prueba")));
  await p.captura("e4-04-ficha-salud");

  // ---------- Flujo 5: expediente para ANCO de Zeus (con campos que faltan) ----------
  await p.clic('[data-pantalla="documentos"]');
  await p.clic('[data-pestana="expediente"]');
  await p.escribir('[data-prueba="documento-animal"]', "Zeus");
  await p.clic(".selector__resultados button");
  const faltantes = (await p.buscar('[data-prueba="faltantes"]', { condicion: (t) => t.length > 0 })).texto;
  comprobar("Flujo 5: muestra los campos que faltan antes de generar", faltantes.includes("Campos que faltan") && faltantes.includes("Abuela materna"), faltantes.replace(/\n/g, " | "));
  await p.captura("e4-05-expediente");
  await p.clic('[data-prueba="generar-expediente"]');
  const generado = (await p.buscar('[data-prueba="documento-generado"]', { tiempo: 30000 })).texto;
  comprobar("Flujo 5: genera el expediente y lo registra", /EX-\d{4}-0001/.test(generado), generado);
  await conDialogo(p, '[data-prueba="copia-pdf"]', join(SALIDA, "expediente-Zeus.pdf"));
  await p.buscar('[data-prueba="copia-guardada"]', { condicion: (t) => t.includes("expediente-Zeus.pdf") });
  await conDialogo(p, '[data-prueba="copia-csv"]', join(SALIDA, "expediente-Zeus.csv"));
  await p.buscar('[data-prueba="copia-guardada"]', { condicion: (t) => t.includes("expediente-Zeus.csv") });
  const pdfExpediente = readFileSync(join(SALIDA, "expediente-Zeus.pdf"));
  comprobar("Flujo 5: el PDF guardado es un PDF", pdfExpediente.subarray(0, 5).toString("latin1") === "%PDF-", `${pdfExpediente.length} bytes`);
  const csv = readFileSync(join(SALIDA, "expediente-Zeus.csv"), "utf8");
  comprobar("Flujo 5: el CSV trae el encabezado y la fila de Zeus", csv.startsWith("﻿Nombre;") && csv.includes("\r\nZeus;EJEMPLO-0001;"), csv.split("\r\n")[1]);
  const textoExpediente = execFileSync("pdftotext", [join(SALIDA, "expediente-Zeus.pdf"), "-"], { encoding: "utf8" });
  comprobar("Flujo 5: el PDF lista los campos que faltan", textoExpediente.includes("Campos que faltan") && textoExpediente.includes("Abuelo paterno"));

  // ---------- RF-14 (R12): certificado interno de Estrella ----------
  await p.clic('[data-pestana="certificado"]');
  await p.escribir('[data-prueba="documento-animal"]', "Estrella");
  await p.clic(".selector__resultados button");
  await p.clic('[data-prueba="generar-certificado"]');
  const cert = (await p.buscar('[data-prueba="documento-generado"]', { tiempo: 30000 })).texto;
  comprobar("Certificado interno: se genera con su número", /CI-\d{4}-0001/.test(cert), cert);
  await conDialogo(p, '[data-prueba="copia-pdf"]', join(SALIDA, "certificado-Estrella.pdf"));
  await p.buscar('[data-prueba="copia-guardada"]', { condicion: (t) => t.includes("certificado-Estrella.pdf") });
  const textoCert = execFileSync("pdftotext", [join(SALIDA, "certificado-Estrella.pdf"), "-"], { encoding: "utf8" });
  comprobar("R12: el PDF dice «Registro interno del criadero. No es el certificado oficial de ANCO»", textoCert.includes("Registro interno del criadero. No es el certificado oficial de ANCO."));
  const imagenes = execFileSync("pdfimages", ["-list", join(SALIDA, "certificado-Estrella.pdf")], { encoding: "utf8" }).trim().split("\n").length - 2;
  comprobar("R12: el PDF no lleva código QR (ni ninguna imagen) ni la sigla CRG", imagenes === 0 && !/CRG/.test(textoCert), `${imagenes} imágenes`);
  comprobar("R12: trae padres y abuelos", ["Bruno", "Bella", "Zeus", "Abril"].every((n) => textoCert.includes(n)));
  await p.captura("e4-06-certificado");
  await p.clic('[data-pestana="emitidos"]');
  await p.buscar('[data-prueba="tabla-emitidos"]');
  const emitidos = await filas(p, '[data-prueba="tabla-emitidos"]');
  comprobar("Cada documento queda registrado en la tabla certificado", emitidos.length === 2, emitidos.join(" | "));
  const enCarpeta = readdirSync(join(DATOS, "documentos")).sort();
  comprobar("Los documentos quedan en la carpeta de datos del programa", enCarpeta.length === 3, enCarpeta.join(", "));

  // ---------- RF-43: copia de respaldo ----------
  await p.clic('[data-pestana="respaldo"]');
  const zip1 = join(SALIDA, "respaldo-1.zip");
  await conDialogo(p, '[data-prueba="crear-respaldo"]', zip1);
  const hecho = (await p.buscar('[data-prueba="aviso-exito"]', { tiempo: 60000 })).texto;
  comprobar("Respaldo: crea el .zip", existsSync(zip1) && hecho.includes("respaldo-1.zip"), hecho);
  await p.captura("e4-07-respaldo");
  await p.cerrar();
  await esperar(1000);

  // ---------- CA-11: «otro computador»: se aparta la base y la carpeta de documentos, y se restaura ----------
  const aparte = join(SALIDA, "datos-originales");
  mkdirSync(aparte, { recursive: true });
  for (const nombre of readdirSync(DATOS)) if (nombre.startsWith("registro-caprino.db") || nombre === "documentos") renameSync(join(DATOS, nombre), join(aparte, nombre));
  p = await abrirPrograma(APLICACION, CAPTURAS);
  await p.buscar('[data-prueba="restaurar-respaldo"]');
  comprobar("CA-11: con la base vacía, el programa ofrece restaurar en la primera pantalla", true);
  await conDialogo(p, '[data-prueba="restaurar-respaldo"]', zip1);
  const restaurado = (await p.buscar('[data-prueba="aviso-restaurado"]', { tiempo: 120000 })).texto;
  comprobar("CA-11: restaura la copia y vuelve a pedir el usuario", restaurado.includes("Aprisco de ejemplo"), restaurado);
  await entrar(p);
  const total = (await p.buscar('[data-prueba="total-animales"]')).texto;
  // 16 de la sección 12 más Roble, la cría del semental de otra finca (Etapa 6); Titán no cuenta (R29).
  comprobar("CA-11: los 17 animales del hato vuelven a estar", total === "17", `activos = ${total}`);
  comprobar("CA-11: también vuelven los documentos emitidos", readdirSync(join(DATOS, "documentos")).sort().join() === enCarpeta.join());
  await p.clic('[data-pantalla="documentos"]');
  await p.clic('[data-pestana="respaldo"]');
  const zip2 = join(SALIDA, "respaldo-2.zip");
  await conDialogo(p, '[data-prueba="crear-respaldo"]', zip2);
  await p.buscar('[data-prueba="aviso-exito"]', { tiempo: 60000 });
  await p.cerrar();
  const [antes, despues] = [tablasDe(zip1), tablasDe(zip2)];
  const iguales = JSON.stringify(antes) === JSON.stringify(despues);
  const conteo = Object.entries(antes)
    .filter(([, v]) => v.length > 0)
    .map(([k, v]) => `${k} ${v.length}`)
    .join(", ");
  comprobar("CA-11: restaurar reproduce los mismos datos (todas las tablas, fila por fila)", iguales, conteo);
} catch (error) {
  comprobar(`Error inesperado: ${error.message}`, false);
} finally {
  driver.kill();
}
process.exit(registro.terminar() === 0 ? 0 : 1);
