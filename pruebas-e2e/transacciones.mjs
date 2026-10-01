// Experimento: ¿BEGIN / INSERT / ROLLBACK enviados por separado al plugin SQL caen en la misma conexión?
// Escribe en la base de DESARROLLO (necesita `npx vite` corriendo y el binario de `npm run tauri dev`).
// Uso: xvfb-run -a node pruebas-e2e/transacciones.mjs "$PWD/src-tauri/target/debug/registro-caprino"
import { spawn } from "node:child_process";
import { setTimeout as esperar } from "node:timers/promises";
const APLICACION = process.argv[2];
const driver = spawn("tauri-driver", [], { stdio: "ignore" });
await esperar(1500);
async function wd(m, r, c) {
  const res = await fetch("http://127.0.0.1:4444" + r, { method: m, headers: { "content-type": "application/json" }, body: c ? JSON.stringify(c) : undefined });
  const j = await res.json(); if (!res.ok) throw new Error(JSON.stringify(j.value)); return j.value;
}
try {
  const { sessionId: s } = await wd("POST", "/session", { capabilities: { alwaysMatch: { browserName: "wry", "tauri:options": { application: APLICACION } } } });
  await esperar(3000);
  const script = `
    const done = arguments[arguments.length - 1];
    const db = "sqlite:registro-caprino-desarrollo.db";
    const inv = (cmd, args) => window.__TAURI_INTERNALS__.invoke("plugin:sql|" + cmd, { db, ...args });
    (async () => {
      const resultados = [];
      for (let ronda = 1; ronda <= 20; ronda++) {
        // Consultas simultáneas: obligan al pool a abrir varias conexiones, como pasará cuando varias pantallas lean a la vez.
        await Promise.all(Array.from({ length: 4 }, () => inv("select", { query: "SELECT count(*) AS n FROM raza", values: [] })));
        const nombre = "PRUEBA-TX-" + ronda + "-" + Date.now();
        let error = null;
        try {
          await inv("execute", { query: "BEGIN", values: [] });
          await inv("execute", { query: "INSERT INTO raza (id, nombre, creado_en, modificado_en) VALUES (lower(hex(randomblob(4))) || '-0000-4000-8000-' || lower(hex(randomblob(6))), ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))", values: [nombre] });
          await inv("execute", { query: "ROLLBACK", values: [] });
        } catch (e) { error = String(e); }
        const filas = await inv("select", { query: "SELECT count(*) AS n FROM raza WHERE nombre = ?", values: [nombre] });
        resultados.push({ ronda, quedoGuardada: filas[0].n > 0, error });
      }
      return resultados;
    })().then(done, (e) => done({ fallo: String(e) }));`;
  await wd("POST", `/session/${s}/timeouts`, { script: 120000 });
  const r = await wd("POST", `/session/${s}/execute/async`, { script, args: [] });
  if (r.fallo) { console.log("Fallo:", r.fallo); }
  else {
    const mal = r.filter((x) => x.quedoGuardada || x.error);
    console.log(`Rondas: ${r.length}. Rondas en que el ROLLBACK no deshizo el INSERT o hubo error: ${mal.length}`);
    for (const x of mal.slice(0, 5)) console.log("  ", JSON.stringify(x));
  }
  await wd("DELETE", `/session/${s}`);
} finally { driver.kill(); }
