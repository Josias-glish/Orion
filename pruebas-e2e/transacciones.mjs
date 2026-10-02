// D-004 (D-054): ¿el programa real aplica un lote de sentencias dentro de una sola transacción?
// Historia: en la Etapa 1 este experimento enviaba BEGIN / INSERT / ROLLBACK por separado al plugin SQL y en 19 de 20
// rondas el ROLLBACK no deshizo el INSERT o hubo errores («cannot rollback - no transaction is active», «database is
// locked»), porque el plugin reparte las órdenes entre varias conexiones (plugins-workspace#886). Ahora el lote entero va
// al comando Rust `ejecutar_lote`, que usa una sola conexión del mismo pool.
// Qué hace: 20 rondas; en cada una, 4 consultas simultáneas (obligan al pool a abrir varias conexiones) y después un lote
// que falla a mitad (dos INSERT con el mismo id): no debe quedar NINGUNA fila. Luego un lote correcto (quedan las dos filas)
// y 4 lotes correctos simultáneos (ninguno debe fallar con «database is locked»).
// Escribe en la base del programa instalado, así que usa una carpeta de datos temporal:
//   npx tauri build --debug --no-bundle
//   XDG_CONFIG_HOME=$(mktemp -d) xvfb-run -a node pruebas-e2e/transacciones.mjs "$PWD/src-tauri/target/debug/registro-caprino"
import { setTimeout as esperar } from "node:timers/promises";
import { iniciarDriver, wd } from "./webdriver.mjs";

const APLICACION = process.argv[2];
const driver = await iniciarDriver();
let fallos = 0;
const comprobar = (condicion, texto) => {
  console.log(`${condicion ? "✔" : "✘"} ${texto}`);
  if (!condicion) fallos++;
};

try {
  const { sessionId: s } = await wd("POST", "/session", { capabilities: { alwaysMatch: { browserName: "wry", "tauri:options": { application: APLICACION } } } });
  await wd("POST", `/session/${s}/timeouts`, { script: 120000 });
  const script = `
    const done = arguments[arguments.length - 1];
    const db = "sqlite:registro-caprino.db";
    const invocar = (orden, args) => window.__TAURI_INTERNALS__.invoke(orden, args);
    const consultar = (query, values = []) => invocar("plugin:sql|select", { db, query, values });
    const lote = (sentencias) => invocar("ejecutar_lote", { db, sentencias });
    const ahora = () => new Date().toISOString();
    const insertar = (id, nombre) => ({
      sql: "INSERT INTO raza (id, nombre, creado_en, modificado_en) VALUES (?, ?, ?, ?)",
      parametros: [id, nombre, ahora(), ahora()],
    });
    const filas = async (nombre) => (await consultar("SELECT count(*) AS n FROM raza WHERE nombre LIKE ?", [nombre + "%"]))[0].n;
    (async () => {
      // El programa abre la base al arrancar: se espera a que responda.
      for (let i = 0; i < 100; i++) {
        try { await consultar("SELECT count(*) AS n FROM raza"); break; } catch { await new Promise((r) => setTimeout(r, 200)); }
      }
      const rondas = [];
      for (let ronda = 1; ronda <= 20; ronda++) {
        await Promise.all(Array.from({ length: 4 }, () => consultar("SELECT count(*) AS n FROM raza")));
        const nombre = "PRUEBA-TX-" + ronda + "-" + Date.now();
        const id = crypto.randomUUID();
        let error = null;
        try { await lote([insertar(id, nombre), insertar(id, nombre + "-repetida")]); } catch (e) { error = String(e); }
        rondas.push({ ronda, error, filas: await filas(nombre) });
      }
      // Un lote correcto deja todas sus filas.
      const buenoNombre = "PRUEBA-OK-" + Date.now();
      let errorBueno = null;
      try { await lote([insertar(crypto.randomUUID(), buenoNombre + "-a"), insertar(crypto.randomUUID(), buenoNombre + "-b")]); } catch (e) { errorBueno = String(e); }
      const quedanBueno = await filas(buenoNombre);
      // Cuatro lotes correctos a la vez: ninguno debe fallar por bloqueo.
      const simNombre = "PRUEBA-SIM-" + Date.now();
      const simultaneos = await Promise.allSettled(
        Array.from({ length: 4 }, (_, i) => lote([insertar(crypto.randomUUID(), simNombre + "-" + i + "-a"), insertar(crypto.randomUUID(), simNombre + "-" + i + "-b")])),
      );
      return { rondas, errorBueno, quedanBueno, simultaneos: simultaneos.map((r) => (r.status === "fulfilled" ? null : String(r.reason))), quedanSim: await filas(simNombre) };
    })().then(done, (e) => done({ fallo: String(e) }));`;
  const r = await wd("POST", `/session/${s}/execute/async`, { script, args: [] });
  if (r.fallo) {
    comprobar(false, `la prueba no pudo correr: ${r.fallo}`);
  } else {
    const dejaronFilas = r.rondas.filter((x) => x.filas > 0);
    const sinError = r.rondas.filter((x) => x.error === null);
    comprobar(dejaronFilas.length === 0, `20 rondas con consultas simultáneas: ${dejaronFilas.length} lotes fallidos dejaron filas (en la Etapa 1, sin transacción: 19 de 20 rondas fallaban)`);
    comprobar(sinError.length === 0, `cada lote con un id repetido fue rechazado (${r.rondas.length - sinError.length} de ${r.rondas.length}); error de ejemplo: ${r.rondas[0].error}`);
    comprobar(r.errorBueno === null && r.quedanBueno === 2, `un lote correcto deja sus 2 filas (quedaron ${r.quedanBueno}, error: ${r.errorBueno})`);
    comprobar(r.simultaneos.every((e) => e === null) && r.quedanSim === 8, `4 lotes correctos a la vez dejan sus 8 filas (quedaron ${r.quedanSim}; errores: ${JSON.stringify(r.simultaneos.filter(Boolean))})`);
  }
  await wd("DELETE", `/session/${s}`);
} finally {
  driver.kill();
}
console.log(fallos === 0 ? "Todo bien: los lotes son transacciones reales en el programa." : `Hubo ${fallos} fallos.`);
process.exit(fallos === 0 ? 0 : 1);
