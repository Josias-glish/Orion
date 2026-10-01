// Ayudas mínimas para manejar el programa real con tauri-driver (protocolo WebDriver: HTTP + JSON).
// Solo Linux (WebKitWebDriver). Ver docs/PRUEBA_TECNICA.md.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { setTimeout as esperar } from "node:timers/promises";

const SERVIDOR = "http://127.0.0.1:4444";
const ELEMENTO = "element-6066-11e4-a52e-4f735466cecf";

export { esperar };

export async function iniciarDriver() {
  const driver = spawn("tauri-driver", [], { stdio: ["ignore", "ignore", "inherit"] });
  await esperar(1500);
  return driver;
}

export async function wd(metodo, ruta, cuerpo) {
  const r = await fetch(SERVIDOR + ruta, {
    method: metodo,
    headers: { "content-type": "application/json" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const json = await r.json();
  if (!r.ok) throw new Error(`${metodo} ${ruta}: ${JSON.stringify(json.value)}`);
  return json.value;
}

/** Abre el programa y devuelve un objeto con las acciones de la prueba. */
export async function abrirPrograma(aplicacion, carpetaCapturas) {
  const { sessionId: s } = await wd("POST", "/session", {
    capabilities: { alwaysMatch: { browserName: "wry", "tauri:options": { application: aplicacion } } },
  });
  await wd("POST", `/session/${s}/timeouts`, { script: 120000 });

  const js = (script, args = []) => wd("POST", `/session/${s}/execute/sync`, { script, args });
  const jsAsync = (script, args = []) => wd("POST", `/session/${s}/execute/async`, { script, args });

  /** Espera hasta que `condicion(texto)` se cumpla en el primer elemento que coincide con el selector. */
  async function buscar(css, { tiempo = 15000, condicion = () => true } = {}) {
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
      await esperar(150);
    }
    throw new Error(`No apareció ${css} con la condición esperada. Último texto: «${ultimo}»`);
  }

  async function clic(css, opciones) {
    const { el } = await buscar(css, opciones);
    await js("arguments[0].scrollIntoView({block: 'center'})", [{ [ELEMENTO]: el }]);
    await wd("POST", `/session/${s}/element/${el}/click`, {});
  }

  /** Escribe en un campo controlado por React (input, select o textarea). */
  async function escribir(css, valor, indice = 0) {
    await buscar(css);
    const ok = await js(
      `const el = document.querySelectorAll(arguments[0])[arguments[2]];
       if (!el) return false;
       const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
       Object.getOwnPropertyDescriptor(proto, "value").set.call(el, arguments[1]);
       el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
       return true;`,
      [css, valor, indice],
    );
    if (!ok) throw new Error(`No existe ${css}[${indice}]`);
  }

  /** Elige en un <select> la opción cuyo texto es `texto`. */
  async function elegirOpcion(css, texto, indice = 0) {
    await buscar(css);
    const valor = await js(
      `const el = document.querySelectorAll(arguments[0])[arguments[2]];
       const o = [...el.options].find((o) => o.textContent.trim() === arguments[1]);
       return o ? o.value : null;`,
      [css, texto, indice],
    );
    if (valor === null) throw new Error(`No hay opción «${texto}» en ${css}`);
    await escribir(css, valor, indice);
  }

  async function captura(nombre) {
    const png = await wd("GET", `/session/${s}/screenshot`);
    writeFileSync(`${carpetaCapturas}/${nombre}.png`, Buffer.from(png, "base64"));
  }

  /** Teclea en el elemento que tiene el foco, como una persona (dispara keydown; "\uE007" es Enter). */
  async function teclear(texto) {
    const el = (await wd("GET", `/session/${s}/element/active`))[ELEMENTO];
    await wd("POST", `/session/${s}/element/${el}/value`, { text: texto });
  }

  const cerrar = () => wd("DELETE", `/session/${s}`);
  return { s, js, jsAsync, buscar, clic, escribir, elegirOpcion, teclear, captura, cerrar };
}

/** Registro de comprobaciones con resumen final. */
export function crearRegistro() {
  const resultados = [];
  return {
    comprobar(nombre, ok, detalle) {
      resultados.push({ nombre, ok });
      console.log(`${ok ? "✔" : "✘"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
    },
    terminar() {
      const fallos = resultados.filter((r) => !r.ok).length;
      console.log(`\n${resultados.length - fallos} de ${resultados.length} comprobaciones correctas.`);
      return fallos;
    },
  };
}
