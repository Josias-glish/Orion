// Prueba de extremo a extremo de la Etapa 3 sobre el programa real en Linux: Flujo 1 (parto con fichas de crías),
// Flujo 2 (ordeño en lote con Enter), R11, pesos y metas, y CA-09 con 500 animales.
// Pensada para correr SIN RED (ver docs/PRUEBA_TECNICA.md, Etapa 3):
//   npx tauri build --debug --no-bundle
//   rm -f ~/.config/co.registrocaprino.escritorio/registro-caprino.db*
//   unshare -rn sh -c 'ip link set lo up; xvfb-run -a node pruebas-e2e/etapa3.mjs "$PWD/src-tauri/target/debug/registro-caprino" capturas'
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { abrirPrograma, crearRegistro, esperar, iniciarDriver } from "./webdriver.mjs";

const [APLICACION, CAPTURAS] = process.argv.slice(2);
const BASE = join(homedir(), ".config", "co.registrocaprino.escritorio", "registro-caprino.db");
mkdirSync(CAPTURAS, { recursive: true });
const registro = crearRegistro();
const { comprobar } = registro;
const driver = await iniciarDriver();

const cargarDatos = (...extra) =>
  execFileSync("npx", ["tsx", "pruebas-e2e/cargar-datos.ts", BASE, ...extra], { encoding: "utf8" }).trim();

/** Texto visible de todas las filas de una tabla. */
const filas = (p, css) => p.js(`return [...document.querySelectorAll(arguments[0] + " tbody tr")].map((f) => f.innerText);`, [css]);

async function entrar(p) {
  await p.clic('[data-usuario="Propietario de ejemplo"]');
  await p.buscar('[data-prueba="usuario-actual"]', { condicion: (t) => t.includes("Propietario de ejemplo") });
}

/** Escribe kilos en la casilla con foco y presiona Enter; mide hasta que la fila dice «Guardado». */
async function anotarConEnter(p, kilos) {
  const fila = await p.js(`return document.activeElement.closest("tr").dataset.cabra;`);
  const inicio = Date.now();
  await p.teclear(`${kilos}`);
  await p.buscar(`[data-cabra="${fila}"] [data-prueba="estado-fila"]`, { condicion: (t) => t.toLowerCase().includes("guardado"), tiempo: 10000 });
  return { fila, ms: Date.now() - inicio };
}

try {
  // ---------- Preparación: el programa crea la base con sus migraciones; luego se cargan los datos de ejemplo ----------
  let p = await abrirPrograma(APLICACION, CAPTURAS);
  await p.buscar('[data-prueba="asistente-siguiente"]');
  await p.cerrar();
  await esperar(1000);
  console.log(`Datos de ejemplo: ${cargarDatos()}`);

  p = await abrirPrograma(APLICACION, CAPTURAS);
  await entrar(p);

  // ---------- Inicio (punto 5) ----------
  const proximos = await filas(p, '[data-prueba="tabla-proximos"]');
  comprobar("Inicio: muestra los partos próximos (Estrella)", proximos.length === 1 && proximos[0].includes("Estrella"), proximos.join(" | "));
  const enLactancia = (await p.buscar('[data-prueba="total-lactancia"]', { condicion: (t) => /^\d+$/.test(t) })).texto;
  comprobar("Inicio: cuenta las hembras en lactancia", enLactancia === "3", `en lactancia = ${enLactancia}`);
  await p.captura("e3-01-inicio");

  // ---------- Flujo 1: parto de Estrella desde el Inicio ----------
  await p.clic('[data-prueba="tabla-proximos"] [data-prueba="registrar-parto"]');
  const padre = (await p.buscar('[data-prueba="padre-propuesto"]', { condicion: (t) => t.length > 0 })).texto;
  comprobar("Flujo 1: propone como padre el macho del servicio «preñada» (Duque)", padre.includes("Duque"), padre);
  await p.escribir('[data-prueba="parto-numero"]', "2");
  await p.buscar('[data-cria="2"]');
  await p.escribir('[data-prueba="cria-nombre"]', "Aurora", 0);
  await p.escribir('[data-prueba="cria-arete"]', "EJ-20", 0);
  await p.escribir('[data-prueba="cria-peso"]', "3,4", 0);
  await p.elegirOpcion('[data-prueba="cria-sexo"]', "Macho", 1);
  await p.escribir('[data-prueba="cria-nombre"]', "Bóreas", 1);
  await p.escribir('[data-prueba="cria-arete"]', "EJ-21", 1);
  await p.captura("e3-02-parto");
  await p.clic('[data-prueba="guardar-parto"]');
  const creadas = (await p.buscar('[data-prueba="crias-creadas"]')).texto;
  comprobar("Flujo 1: el parto crea una ficha por cría", creadas.includes("Aurora") && creadas.includes("Bóreas"), creadas.replace(/\n/g, " | "));
  await p.clic('[data-prueba="crias-creadas"] li:nth-child(2) .enlace');
  const madre = (await p.buscar('[data-prueba="madre"]')).texto;
  const padreCria = (await p.buscar('[data-prueba="padre"]')).texto;
  comprobar("Flujo 1: la cría tiene madre (Estrella) y padre (Duque)", madre.includes("Estrella") && padreCria.includes("Duque"), `${madre} / ${padreCria}`);
  await p.captura("e3-03-ficha-cria");

  // ---------- Flujo 2: ordeño en lote ----------
  await p.clic('[data-pantalla="leche"]');
  await p.elegirOpcion('[data-prueba="ordeno-jornada"]', "Tarde");
  await p.buscar('[data-prueba="ordeno-progreso"]', { condicion: (t) => t.startsWith("0 de 4") });
  const cabras = await filas(p, '[data-prueba="tabla-ordeno"]');
  comprobar("Flujo 2: el ordeño lista las 4 hembras en lactancia (incluida Estrella)", cabras.length === 4 && cabras.some((c) => c.includes("Estrella")), `${cabras.length} filas`);
  const enfocada = await p.js(`return document.activeElement?.dataset.prueba ?? null;`);
  comprobar("Flujo 2: el cursor empieza en la casilla de kilos de la primera cabra", enfocada === "kilos");
  const tiempos = [];
  for (const kilos of ["1,8", "2.1", "1,5", "0,9"]) tiempos.push(await anotarConEnter(p, kilos));
  const progreso = (await p.buscar('[data-prueba="ordeno-progreso"]')).texto;
  comprobar("Flujo 2: Enter guarda y pasa a la siguiente; las 4 quedan anotadas", progreso.startsWith("4 de 4"), progreso);
  comprobar("Flujo 2: el total suma 6,3 kg", progreso.includes("6,3 kg"), progreso);
  comprobar(
    "CA-09 (programa real, datos de ejemplo): cada pesaje tarda menos de 1 s",
    tiempos.every((x) => x.ms < 1000),
    tiempos.map((x) => `${x.ms} ms`).join(", "),
  );
  const columnaRetiro = await p.js(`return document.querySelectorAll('[data-prueba="retiro"]').length;`);
  comprobar("El lugar del aviso de leche retenida está preparado (una celda por cabra)", columnaRetiro === 4);
  await p.captura("e3-04-ordeno");
  // Corregir un valor: vuelve a la primera fila, escribe otro y Enter.
  await p.clic('[data-prueba="tabla-ordeno"] tbody tr:first-child [data-prueba="kilos"]');
  // WebDriver escribe al final del texto; se borra antes, como haría una persona.
  const correccion = await anotarConEnter(p, "\uE003\uE003\uE003\uE0032,0");
  comprobar("Flujo 2: un pesaje se puede corregir", correccion.ms < 1000, `${correccion.fila}: ${correccion.ms} ms`);
  // Kilos inválidos: no se guarda y avisa en la fila.
  await p.clic('[data-prueba="tabla-ordeno"] tbody tr:nth-child(2) [data-prueba="kilos"]');
  await p.teclear("abc");
  const errorFila = (await p.buscar('[data-prueba="tabla-ordeno"] tbody tr:nth-child(2) [data-prueba="estado-fila"]', { condicion: (t) => t.length > 0 })).texto;
  comprobar("Flujo 2: un valor que no es número se rechaza con un mensaje claro", errorFila.includes("número"), errorFila);

  // Persistencia: volver a abrir la jornada muestra lo guardado.
  await p.clic('[data-pantalla="inicio"]');
  await p.clic('[data-pantalla="leche"]');
  await p.elegirOpcion('[data-prueba="ordeno-jornada"]', "Tarde");
  const guardado = await p.buscar('[data-prueba="ordeno-progreso"]', { condicion: (t) => t.startsWith("4 de 4") });
  comprobar("Flujo 2: al volver, la jornada conserva lo anotado (con la corrección)", guardado.texto.includes("6,5 kg"), guardado.texto);

  // ---------- Lactancias, curva y proyección ----------
  await p.clic('[data-pestana="lactancias"]');
  await p.clic('[data-lactancia="Bella"] .enlace');
  await p.buscar('[data-prueba="curva-lactancia"]');
  const proyeccion = (await p.buscar('[data-prueba="proyeccion"]')).texto;
  comprobar("Lactancia: muestra la curva y la proyección", /kg$/.test(proyeccion), proyeccion);
  await p.js(`document.querySelector('[data-prueba="curva-lactancia"]').scrollIntoView()`);
  await p.captura("e3-05-lactancia");

  // ---------- R11: una hembra vendida sale del ordeño y de los servicios ----------
  await p.clic('[data-pantalla="animales"]');
  await p.escribir('[data-prueba="buscar"]', "Dalia");
  await p.buscar('[data-prueba="cantidad"]', { condicion: (t) => t === "1 animal" });
  await p.clic('[data-prueba="tabla-animales"] tbody tr .enlace');
  await p.clic('[data-prueba="editar"]');
  await p.elegirOpcion('[data-prueba="estado"]', "Vendido");
  await p.clic('[data-prueba="guardar"]');
  await p.buscar('[data-prueba="titulo-animal"]', { condicion: (t) => t.startsWith("Dalia") });
  await p.clic('[data-pantalla="leche"]');
  await p.elegirOpcion('[data-prueba="ordeno-jornada"]', "Mañana");
  await p.buscar('[data-prueba="ordeno-progreso"]', { condicion: (t) => / de 3/.test(t) });
  const sinDalia = await filas(p, '[data-prueba="tabla-ordeno"]');
  comprobar("R11: Dalia vendida ya no aparece en el ordeño", !sinDalia.some((f) => f.includes("Dalia")), `${sinDalia.length} filas`);
  await p.clic('[data-pantalla="reproduccion"]');
  await p.escribir('[data-prueba="servicio-hembra"]', "Dal");
  const opciones = await p.js(`return document.querySelector(".selector__resultados")?.innerText ?? "";`);
  comprobar("R11: Dalia vendida ya no aparece para un servicio", !opciones.includes("Dalia"), opciones.replace(/\n/g, " | "));
  await p.escribir('[data-prueba="servicio-hembra"]', "");
  await p.clic('[data-pestana="intervalos"]');
  await p.buscar('[data-prueba="tabla-intervalos"]');
  await p.buscar('[data-prueba="tabla-abortos"]');
  const intervalos = await filas(p, '[data-prueba="tabla-intervalos"]');
  comprobar("R11: Dalia conserva su historial (sigue en el intervalo entre partos)", intervalos.some((f) => f.includes("Dalia")));
  const abortos = await filas(p, '[data-prueba="tabla-abortos"]');
  comprobar("Reproducción: lista los abortos (Canela)", abortos.some((f) => f.includes("Canela")));

  // ---------- Servicio y diagnóstico ----------
  await p.clic('[data-pestana="servicios"]');
  await p.escribir('[data-prueba="servicio-hembra"]', "Brisa");
  await p.clic(".selector__resultados button");
  await p.escribir('[data-prueba="servicio-macho"]', "Bruno");
  await p.clic(".selector__resultados button");
  await p.clic('[data-prueba="guardar-servicio"]');
  const exitoServicio = (await p.buscar('[data-prueba="aviso-exito"]')).texto;
  comprobar("Servicio: se guarda y muestra la fecha probable de parto (R4)", exitoServicio.includes("Fecha probable de parto"), exitoServicio);
  await p.clic('[data-servicio="Brisa"] [data-prueba="diagnosticar"]');
  await p.clic('[data-prueba="guardar-diagnostico"]');
  // Las insignias se ven en mayúsculas (CSS), por eso se compara sin distinguir.
  const fila = (await p.buscar('[data-servicio="Brisa"]', { condicion: (t) => t.toLowerCase().includes("preñada") })).texto;
  comprobar("Diagnóstico de preñez: queda «Preñada»", fila.toLowerCase().includes("preñada"), fila);

  // ---------- Pesos: ganancia diaria y metas ----------
  await p.clic('[data-pantalla="pesos"]');
  await p.escribir('[data-prueba="pesaje-animal"]', "Aurora");
  await p.clic(".selector__resultados button");
  await p.escribir('[data-prueba="pesaje-kilos"]', "4,1");
  await p.clic('[data-prueba="guardar-pesaje"]');
  await p.buscar('[data-prueba="aviso-exito"]', { condicion: (t) => t.includes("Pesaje guardado") });
  const pesajes = await filas(p, '[data-prueba="tabla-pesajes-animal"]');
  comprobar("Pesos: el animal muestra sus pesajes con la meta para la edad", pesajes.length === 2 && pesajes.every((f) => f.includes("kg")), pesajes.join(" | "));
  await p.clic('[data-pestana="metas"]');
  await p.buscar('[data-prueba="tabla-metas"]');
  const metas = await filas(p, '[data-prueba="tabla-metas"]');
  comprobar("Pesos: las metas por edad definidas por el usuario se listan", metas.length === 8, `${metas.length} metas`);
  await p.captura("e3-06-pesos");
  await p.cerrar();

  // ---------- CA-09 con 500 animales en el programa real ----------
  await esperar(1000);
  console.log(`Datos de rendimiento: ${cargarDatos("--rendimiento").split("\n").pop()}`);
  p = await abrirPrograma(APLICACION, CAPTURAS);
  await entrar(p);
  const inicioOrdeno = Date.now();
  await p.clic('[data-pantalla="leche"]');
  await p.elegirOpcion('[data-prueba="ordeno-jornada"]', "Mañana");
  await p.buscar('[data-prueba="ordeno-progreso"]', { condicion: (t) => / de 2(3\d)/.test(t), tiempo: 30000 });
  const msLista = Date.now() - inicioOrdeno;
  const cantidad = (await filas(p, '[data-prueba="tabla-ordeno"]')).length;
  const medidas = [];
  for (const kilos of ["1,2", "1,4", "1,6", "1,8", "2,0"]) medidas.push((await anotarConEnter(p, kilos)).ms);
  comprobar(
    `CA-09 (programa real, ${cantidad} cabras en ordeño, 500 animales de prueba): guardar un pesaje tarda menos de 1 s`,
    medidas.every((ms) => ms < 1000),
    `${medidas.map((ms) => `${ms} ms`).join(", ")}; abrir la lista: ${msLista} ms`,
  );
  await p.captura("e3-07-ordeno-500");
  await p.cerrar();
} catch (error) {
  comprobar(`Error inesperado: ${error.message}`, false);
} finally {
  driver.kill();
}
process.exit(registro.terminar() === 0 ? 0 : 1);
