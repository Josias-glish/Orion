// Pone la dirección del servidor de sincronización y su clave PÚBLICA en el programa, justo antes de construirlo.
//   SERVIDOR_URL=https://xxxx.supabase.co SERVIDOR_CLAVE_PUBLICA=... node scripts/configurar-servidor.mjs
// Cambia dos archivos del árbol de trabajo (no los sube a git): src/sincronizacion/servidor.json y
// src-tauri/capabilities/sincronizacion.json (la única dirección que la ventana puede usar). Sin SERVIDOR_URL no cambia nada y el
// programa queda sin sincronización. Rechaza lo que no sea https y cualquier clave secreta (service_role / sb_secret_).
// docs/SERVIDOR.md explica de dónde salen los dos valores. Nunca imprime la clave.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const raiz = new URL("../", import.meta.url);

function rolDeLaClave(clave) {
  const partes = clave.split(".");
  if (partes.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(partes[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")).role ?? null;
  } catch {
    return null;
  }
}

/** Valida los dos valores y devuelve lo que se escribe en cada archivo. Lanza un Error con el motivo en español. */
export function prepararConfiguracion({ url, clave }) {
  let direccion;
  try {
    direccion = new URL(url);
  } catch {
    throw new Error("SERVIDOR_URL no es una dirección válida.");
  }
  if (direccion.protocol !== "https:") throw new Error("SERVIDOR_URL debe empezar con https://.");
  if (direccion.hostname.endsWith(".invalid") || !direccion.hostname.includes(".")) throw new Error("SERVIDOR_URL no parece un servidor real.");
  if (direccion.username || direccion.password || direccion.port) throw new Error("SERVIDOR_URL no debe llevar usuario, contraseña ni puerto.");
  if (!clave || clave.length < 20) throw new Error("Falta SERVIDOR_CLAVE_PUBLICA (la clave pública, nunca la secreta).");
  if (clave.startsWith("sb_secret_") || rolDeLaClave(clave) === "service_role") {
    throw new Error("Esa es una clave SECRETA. En el programa solo va la clave pública (anon / publishable). No la use ni la vuelva a pegar en ningún sitio.");
  }
  const origen = `https://${direccion.host}`;
  return {
    servidor: { url: origen, claveAnonima: clave },
    permiso: `${origen}/*`,
  };
}

export function configurar(entorno = process.env) {
  if (!entorno.SERVIDOR_URL) return { configurado: false };
  const { servidor, permiso } = prepararConfiguracion({ url: entorno.SERVIDOR_URL, clave: entorno.SERVIDOR_CLAVE_PUBLICA ?? "" });
  writeFileSync(new URL("src/sincronizacion/servidor.json", raiz), `${JSON.stringify(servidor, null, 2)}\n`);
  const rutaCapacidad = new URL("src-tauri/capabilities/sincronizacion.json", raiz);
  const capacidad = JSON.parse(readFileSync(rutaCapacidad, "utf8"));
  capacidad.permissions[0].allow[0].url = permiso;
  writeFileSync(rutaCapacidad, `${JSON.stringify(capacidad, null, 2)}\n`);
  return { configurado: true, direccion: servidor.url };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const r = configurar();
    console.log(r.configurado ? `Servidor configurado: ${r.direccion}` : "SERVIDOR_URL no está definida: el programa se construye sin sincronización.");
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exit(1);
  }
}
