// Prueba de extremo a extremo de la Etapa 1 sobre el binario real de Tauri (Linux, WebKitGTK),
// manejado con tauri-driver mediante el protocolo WebDriver (HTTP + JSON, sin dependencias).
// Uso (solo Linux, con WebKitWebDriver y tauri-driver instalados; ver docs/PRUEBA_TECNICA.md):
//   npx tauri build --debug --no-bundle
//   xvfb-run -a node pruebas-e2e/prueba-tecnica.mjs "$PWD/src-tauri/target/debug/registro-caprino" capturas
// Empieza desde una base vacía: borre antes ~/.config/co.registrocaprino.escritorio/registro-caprino.db*
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as esperar } from "node:timers/promises";

const APLICACION = process.argv[2];
const CARPETA_CAPTURAS = process.argv[3];
const SERVIDOR = "http://127.0.0.1:4444";
const ELEMENTO = "element-6066-11e4-a52e-4f735466cecf";
mkdirSync(CARPETA_CAPTURAS, { recursive: true });

const driver = spawn("tauri-driver", [], { stdio: ["ignore", "inherit", "inherit"] });
await esperar(1500);

async function wd(metodo, ruta, cuerpo) {
  const r = await fetch(SERVIDOR + ruta, {
    method: metodo,
    headers: { "content-type": "application/json" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const json = await r.json();
  if (!r.ok) throw new Error(`${metodo} ${ruta}: ${JSON.stringify(json.value)}`);
  return json.value;
}

async function abrirPrograma() {
  const sesion = await wd("POST", "/session", {
    capabilities: { alwaysMatch: { browserName: "wry", "tauri:options": { application: APLICACION } } },
  });
  return sesion.sessionId;
}

async function buscar(s, css, { tiempo = 15000, condicion = () => true } = {}) {
  const limite = Date.now() + tiempo;
  let ultimo = "";
  while (Date.now() < limite) {
    try {
      const el = (await wd("POST", `/session/${s}/element`, { using: "css selector", value: css }))[ELEMENTO];
      const texto = await wd("GET", `/session/${s}/element/${el}/text`);
      ultimo = texto;
      if (condicion(texto)) return { el, texto };
    } catch {
      /* todavía no existe */
    }
    await esperar(200);
  }
  throw new Error(`No apareció ${css} con la condición esperada. Último texto: «${ultimo}»`);
}

const clic = (s, el) => wd("POST", `/session/${s}/element/${el}/click`, {});
const ejecutarJs = (s, script, args = []) => wd("POST", `/session/${s}/execute/sync`, { script, args });

async function captura(s, nombre) {
  const png = await wd("GET", `/session/${s}/screenshot`);
  writeFileSync(`${CARPETA_CAPTURAS}/${nombre}.png`, Buffer.from(png, "base64"));
}

async function ir(s, pantalla) {
  const { el } = await buscar(s, `[data-pantalla="${pantalla}"]`);
  await clic(s, el);
}

const resultados = [];
function comprobar(nombre, ok, detalle) {
  resultados.push({ nombre, ok, detalle });
  console.log(`${ok ? "✔" : "✘"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

try {
  // ---------- Primera apertura ----------
  let s = await abrirPrograma();
  const inicio = await buscar(s, "h1", { condicion: (t) => t === "Inicio" });
  comprobar("La ventana abre en Inicio", inicio.texto === "Inicio");
  await esperar(500);
  await captura(s, "1-inicio");

  await ir(s, "diagnostico");
  const migraciones = await buscar(s, '[data-prueba="migraciones"]', { condicion: (t) => t.length > 0 && t !== "Cargando…" });
  comprobar("El plugin aplicó la migración 0001", migraciones.texto.includes("1 · esquema_inicial"), migraciones.texto);
  const fk = await ejecutarJs(s, "return [...document.querySelectorAll('.ficha dt')].map(dt => dt.textContent + ': ' + dt.nextElementSibling.textContent).join(' | ')");
  console.log("   Estado:", fk);
  comprobar("Claves foráneas activas en la conexión del plugin", fk.includes("Claves foráneas activas: Sí"));

  // (a)
  await clic(s, (await buscar(s, '[data-prueba="boton-a"]')).el);
  const ra = await buscar(s, '[data-prueba="resultado"]', { condicion: (t) => t.startsWith("Se creó") });
  comprobar("a) Crear un animal con su identificador", /Se creó «Prueba 1» con el arete DIAG-[0-9A-F]{8}\./.test(ra.texto), ra.texto);

  // (b)
  await clic(s, (await buscar(s, '[data-prueba="boton-b"]')).el);
  const rb = await buscar(s, '[data-prueba="resultado"]', { condicion: (t) => t.startsWith("Se crearon") });
  comprobar("b) Crear tres generaciones", rb.texto.includes("7 animales") && rb.texto.includes("Cría 1"), rb.texto);

  // (c)
  await clic(s, (await buscar(s, '[data-prueba="boton-c"]')).el);
  const rc = await buscar(s, '[data-prueba="resultado"]', { condicion: (t) => t.includes("ancestros encontrados") });
  const filas = await ejecutarJs(
    s,
    "return [...document.querySelectorAll('[data-prueba=tabla-ancestros] tbody tr')].map(tr => [...tr.cells].slice(0,2).map(td => td.textContent).join(': '))",
  );
  console.log("   Ancestros:", filas.join(" | "));
  const esperado = [
    "Padre: Padre 1",
    "Madre: Madre 1",
    "Abuelo paterno: Abuelo paterno 1",
    "Abuela paterna: Abuela paterna 1",
    "Abuelo materno: Abuelo materno 1",
    "Abuela materna: Abuela materna 1",
  ];
  comprobar("c) Consulta recursiva de ancestros", JSON.stringify(filas) === JSON.stringify(esperado), rc.texto);
  await ejecutarJs(s, "document.querySelector('[data-prueba=tabla-ancestros]').scrollIntoView()");
  await esperar(300);
  await captura(s, "2-ancestros");

  const antes = await buscar(s, '[data-prueba="cantidad-prueba"]', { condicion: (t) => t.startsWith("8") });
  const marcasAntes = await ejecutarJs(
    s,
    "return [...document.querySelectorAll('[data-prueba=tabla-prueba] tbody tr')].map(tr => tr.textContent)",
  );
  await wd("DELETE", `/session/${s}`); // cierra el programa
  await esperar(1500);

  // ---------- Segunda apertura: persistencia ----------
  s = await abrirPrograma();
  await buscar(s, "h1", { condicion: (t) => t === "Inicio" });
  const total = await buscar(s, '[data-prueba="total-animales"]', { condicion: (t) => /^\d+$/.test(t) });
  comprobar("d) Inicio muestra los animales guardados tras reabrir", total.texto === "8", `total = ${total.texto}`);
  await ir(s, "diagnostico");
  const despues = await buscar(s, '[data-prueba="cantidad-prueba"]', { condicion: (t) => /^\d/.test(t) });
  const marcasDespues = await ejecutarJs(
    s,
    "return [...document.querySelectorAll('[data-prueba=tabla-prueba] tbody tr')].map(tr => tr.textContent)",
  );
  comprobar(
    "d) Los datos persisten al cerrar y volver a abrir",
    despues.texto === antes.texto && JSON.stringify(marcasDespues) === JSON.stringify(marcasAntes),
    `${antes.texto} → ${despues.texto}`,
  );
  await ejecutarJs(s, "document.querySelector('[data-prueba=tabla-prueba]').scrollIntoView()");
  await esperar(300);
  await captura(s, "3-persistencia");

  await ir(s, "animales");
  await buscar(s, "h1", { condicion: (t) => t === "Animales" });
  await esperar(500);
  await captura(s, "4-animales");
  await wd("DELETE", `/session/${s}`);
} catch (error) {
  comprobar("Ejecución sin errores", false, String(error));
} finally {
  driver.kill();
}

const fallos = resultados.filter((r) => !r.ok).length;
console.log(`\n${resultados.length - fallos} de ${resultados.length} comprobaciones correctas.`);
process.exit(fallos ? 1 : 0);
