// Prueba de extremo a extremo de la Etapa 6 sobre el programa real en Linux, SIN RED: animales de otras fincas (R29),
// contactos, montas con un macho de otra finca (R30), parto con ese padre y su pedigrí (CA-14), paternidad incierta
// (CA-15), externos fuera del inventario, el ordeño y los servicios propios (CA-13) y lo que ve el operario (R23).
// Uso (ver docs/PRUEBA_TECNICA.md):
//   npx tauri build --debug --no-bundle
//   rm -rf ~/.config/co.registrocaprino.escritorio/{registro-caprino.db*,documentos,fotos}
//   unshare -n sh -c 'ip link set lo up; xvfb-run -a node pruebas-e2e/etapa6.mjs "$PWD/src-tauri/target/debug/registro-caprino" capturas'
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { abrirPrograma, crearRegistro, esperar, iniciarDriver } from "./webdriver.mjs";

const [APLICACION, CAPTURAS_RELATIVAS] = process.argv.slice(2);
const CAPTURAS = resolve(CAPTURAS_RELATIVAS);
mkdirSync(CAPTURAS, { recursive: true });
const BASE = join(homedir(), ".config", "co.registrocaprino.escritorio", "registro-caprino.db");
const registro = crearRegistro();
const { comprobar } = registro;
const driver = await iniciarDriver();

const filas = (p, css) => p.js(`return [...document.querySelectorAll(arguments[0] + " tbody tr")].map((f) => f.innerText);`, [css]);
/** Fecha local de hace `dias` días, como la escribe el campo de fecha (AAAA-MM-DD). */
const haceDias = (dias) => {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

async function entrar(p, usuario = "Propietario de ejemplo") {
  await p.clic(`[data-usuario="${usuario}"]`);
  await p.buscar('[data-prueba="usuario-actual"]', { condicion: (t) => t.includes(usuario) });
}

async function abrirFicha(p, nombre) {
  await p.clic('[data-pantalla="animales"]');
  await p.clic('[data-pestana="hato"]');
  await p.escribir('[data-prueba="buscar"]', nombre);
  await p.buscar('[data-prueba="cantidad"]', { condicion: (t) => t === "1 animal" });
  await p.clic('[data-prueba="tabla-animales"] tbody tr .enlace');
  await p.buscar('[data-prueba="titulo-animal"]', { condicion: (t) => t.startsWith(nombre) });
}

async function abrirExterno(p, nombre) {
  await p.clic('[data-pantalla="animales"]');
  await p.clic('[data-pestana="externos"]');
  await p.escribir('[data-prueba="buscar-externo"]', nombre);
  await p.buscar('[data-prueba="tabla-externos"]', { condicion: (t) => t.includes(nombre) });
  await p.clic('[data-prueba="tabla-externos"] tbody tr .enlace');
  await p.buscar('[data-prueba="titulo-animal"]', { condicion: (t) => t.startsWith(nombre) });
}

/** Registra un animal de otra finca con el propietario indicado (texto de la opción). */
async function registrarExterno(p, { nombre, sexo, propietario }) {
  await p.clic('[data-pantalla="animales"]');
  await p.clic('[data-pestana="externos"]');
  await p.clic('[data-prueba="registrar-externo"]');
  await p.escribir('[data-prueba="nombre"]', nombre);
  await p.clic(`[data-prueba="sexo-${sexo}"]`);
  await p.elegirOpcion('[data-prueba="propietario"]', propietario);
  await p.clic('[data-prueba="guardar"]');
  await p.buscar('[data-prueba="titulo-animal"]', { condicion: (t) => t.startsWith(nombre) });
}

/** Registra un servicio desde Reproducción. `procedencia`: hato | otra_finca. */
async function registrarServicio(p, { hembra, macho, procedencia, fecha, costo, condiciones }) {
  await p.clic('[data-pantalla="reproduccion"]');
  await p.clic('[data-pestana="servicios"]');
  await p.escribir('[data-prueba="servicio-hembra"]', hembra);
  await p.clic(".selector__resultados button");
  await p.clic(`[data-prueba="procedencia-${procedencia}"]`);
  await p.escribir('[data-prueba="servicio-macho"]', macho);
  await p.clic(".selector__resultados button");
  await p.escribir('[data-prueba="servicio-fecha"]', fecha);
  if (costo) await p.escribir('[data-prueba="servicio-costo"]', costo);
  if (condiciones) await p.escribir('[data-prueba="servicio-condiciones"]', condiciones);
  await p.clic('[data-prueba="guardar-servicio"]');
  return (await p.buscar('[data-prueba="aviso-exito"]')).texto;
}

async function registrarParto(p, hembra, { nombre, arete }) {
  await abrirFicha(p, hembra);
  await p.clic('[data-pestana="reproduccion"]');
  await p.clic('[data-prueba="registrar-parto"]');
  await p.buscar('[data-prueba="parto-hembra-elegido"]');
  await p.escribir('[data-prueba="cria-nombre"]', nombre, 0);
  await p.escribir('[data-prueba="cria-arete"]', arete, 0);
}

try {
  // ---------- Preparación: base creada por el programa y datos de ejemplo (con el semental de otra finca) ----------
  let p = await abrirPrograma(APLICACION, CAPTURAS);
  await p.buscar('[data-prueba="asistente-siguiente"]');
  await p.cerrar();
  await esperar(1000);
  console.log(`Datos de ejemplo: ${execFileSync("npx", ["tsx", "pruebas-e2e/cargar-datos.ts", BASE], { encoding: "utf8" }).trim()}`);
  p = await abrirPrograma(APLICACION, CAPTURAS);
  await entrar(p);

  // ---------- R29: la lista «De otras fincas» y el inventario ----------
  await p.clic('[data-pantalla="animales"]');
  await p.clic('[data-pestana="externos"]');
  await p.buscar('[data-prueba="tabla-externos"]', { condicion: (t) => t.includes("Titán") });
  const externos = await filas(p, '[data-prueba="tabla-externos"]');
  comprobar(
    "De otras fincas: Titán aparece con su propietario",
    externos.length === 1 && externos[0].includes("Titán") && externos[0].includes("Criador vecino (ejemplo)"),
    externos.join(" | "),
  );
  await p.captura("e6-01-otras-fincas");
  await p.clic('[data-pestana="hato"]');
  await p.escribir('[data-prueba="buscar"]', "");
  const inventario = await filas(p, '[data-prueba="tabla-animales"]');
  comprobar("CA-13: Titán no está en el inventario del hato", inventario.length === 21 && !inventario.some((f) => f.includes("Titán")), `${inventario.length} animales`);

  // ---------- Contactos (R28: solo el nombre es obligatorio) ----------
  await p.clic('[data-pestana="contactos"]');
  await p.clic('[data-prueba="nuevo-contacto"]');
  await p.clic('[data-prueba="guardar-contacto"]');
  const sinNombre = (await p.buscar('[data-prueba="formulario-contacto"]', { condicion: (t) => t.includes("Falta el dato") })).texto;
  comprobar("Contactos: sin nombre no se guarda y dice qué falta", sinNombre.includes("Falta el dato: nombre"));
  await p.escribir('[data-prueba="contacto-nombre"]', "Ramiro Prueba");
  await p.escribir('[data-prueba="contacto-criadero"]', "Hato Prueba");
  await p.escribir('[data-prueba="contacto-telefono"]', "300 000 0000");
  await p.clic('[data-prueba="guardar-contacto"]');
  const contactos = (await p.buscar('[data-prueba="tabla-contactos"]', { condicion: (t) => t.includes("Ramiro Prueba") })).texto;
  comprobar("Contactos: se crea el propietario", contactos.includes("Hato Prueba") && contactos.includes("300 000 0000"));
  await p.captura("e6-02-contactos");

  // ---------- RF-47: registrar un macho y una hembra de otra finca ----------
  await registrarExterno(p, { nombre: "Sultán", sexo: "macho", propietario: "Ramiro Prueba · Hato Prueba" });
  const insignia = (await p.buscar('[data-prueba="insignia-origen"]')).texto;
  const propietario = (await p.buscar('[data-prueba="propietario"]')).texto;
  comprobar("RF-47: la ficha del macho externo dice «De otra finca» y muestra su propietario", /otra finca/i.test(insignia) && propietario.includes("Ramiro Prueba"), propietario);
  const pestanas = await p.js("return [...document.querySelectorAll('[data-pestana]')].map((b) => b.dataset.pestana)");
  comprobar("La ficha de un externo no tiene pesos, salud ni documentos; sí servicios", pestanas.includes("servicios") && !pestanas.includes("salud") && !pestanas.includes("pesos"), pestanas.join(", "));
  await p.captura("e6-03-ficha-externo");
  await registrarExterno(p, { nombre: "Reina", sexo: "hembra", propietario: "Ramiro Prueba · Hato Prueba" });

  // ---------- CA-13: la hembra externa no recibe servicios propios ni entra al ordeño ----------
  await p.clic('[data-pantalla="reproduccion"]');
  await p.clic('[data-pestana="servicios"]');
  await p.escribir('[data-prueba="servicio-hembra"]', "Reina");
  await esperar(300);
  const ofrecidas = await p.js(`return document.querySelector(".selector__resultados")?.innerText ?? "";`);
  comprobar("CA-13: la hembra de otra finca no aparece para registrarle un servicio", !ofrecidas.includes("Reina"), ofrecidas || "(sin resultados)");
  await p.escribir('[data-prueba="servicio-hembra"]', "");
  await p.clic('[data-pantalla="leche"]');
  const ordeno = await p.js(`return document.querySelector('[data-prueba="tabla-ordeno"]')?.innerText ?? "";`);
  comprobar("CA-13: ni Reina ni Titán aparecen en el ordeño", !ordeno.includes("Reina") && !ordeno.includes("Titán"));
  await p.clic('[data-pantalla="inicio"]');
  const inicio = (await p.buscar("main")).texto;
  comprobar("CA-13: el Inicio no menciona a los externos en sus alertas", !inicio.includes("Reina") && !inicio.includes("Sultán") && !inicio.includes("Titán"));

  // ---------- RF-48 y CA-14: monta de Brisa con Sultán, preñada y parto ----------
  const exito = await registrarServicio(p, {
    hembra: "Brisa",
    macho: "Sultán",
    procedencia: "otra_finca",
    fecha: haceDias(150),
    costo: "120.000",
    condiciones: "Pago al confirmar la preñez",
  });
  comprobar("RF-48: la monta con un macho de otra finca se guarda (con costo y condiciones)", exito.includes("Servicio guardado"), exito);
  const filaServicio = (await p.buscar('[data-servicio="Brisa"][data-macho="Sultán"]')).texto;
  comprobar("Servicios: la fila marca el macho como de otra finca", /otra finca/i.test(filaServicio), filaServicio);
  await p.clic('[data-servicio="Brisa"][data-macho="Sultán"] [data-prueba="diagnosticar"]');
  await p.escribir('[data-prueba="fecha-diagnostico"]', haceDias(110));
  await p.clic('[data-prueba="guardar-diagnostico"]');
  await p.buscar('[data-servicio="Brisa"][data-macho="Sultán"]', { condicion: (t) => t.toLowerCase().includes("preñada") });
  await p.captura("e6-04-servicios");

  await registrarParto(p, "Brisa", { nombre: "Hija de Sultán", arete: "E6-01" });
  const propuesto = (await p.buscar('[data-prueba="padre-propuesto"]', { condicion: (t) => t.includes("Sultán") })).texto;
  comprobar("CA-14: el parto propone como padre al macho de otra finca, con su propietario", propuesto.includes("de otra finca: Ramiro Prueba"), propuesto);
  await p.clic('[data-prueba="guardar-parto"]');
  await p.buscar('[data-prueba="crias-creadas"]');
  await p.clic('[data-prueba="crias-creadas"] li:nth-child(1) .enlace');
  const padreCria = (await p.buscar('[data-prueba="padre"]')).texto;
  comprobar("CA-14: la cría tiene a Sultán como padre", padreCria.startsWith("Sultán"), padreCria);
  await p.clic('[data-pestana="genealogia"]');
  const nodoPadre = (await p.buscar('[data-camino="P"]', { condicion: (t) => t.includes("Sultán") })).texto;
  comprobar("CA-14: el pedigrí muestra el nombre y el propietario del padre de otra finca", nodoPadre.includes("Propietario: Ramiro Prueba · Hato Prueba"), nodoPadre.replace(/\n/g, " | "));
  await p.captura("e6-05-pedigri");

  // ---------- CA-15: dos machos dentro de la ventana de gestación ----------
  await registrarServicio(p, { hembra: "Canela", macho: "Duque", procedencia: "hato", fecha: haceDias(152) });
  await registrarServicio(p, { hembra: "Canela", macho: "Sultán", procedencia: "otra_finca", fecha: haceDias(147) });
  await registrarParto(p, "Canela", { nombre: "Duda", arete: "E6-02" });
  const incierta = (await p.buscar('[data-prueba="paternidad-incierta"]')).texto;
  comprobar("CA-15: avisa la paternidad incierta y ofrece los dos machos", /incierta/i.test(incierta) && incierta.includes("Duque") && incierta.includes("Sultán"), incierta.replace(/\n/g, " | "));
  const marcada = await p.js("return document.querySelector('[data-prueba=\"padre-sin-verificar\"]').checked");
  comprobar("CA-15: el padre queda marcado «sin verificar» por defecto", marcada === true);
  await p.js(
    `const label = [...document.querySelectorAll('[data-prueba="paternidad-incierta"] label')].find((l) => l.innerText.includes("Duque") && !l.innerText.includes("Sultán"));
     label.querySelector("input").click();`,
  );
  await p.captura("e6-06-paternidad-incierta");
  await p.clic('[data-prueba="guardar-parto"]');
  await p.buscar('[data-prueba="crias-creadas"]');
  await p.clic('[data-prueba="crias-creadas"] li:nth-child(1) .enlace');
  const padreDuda = (await p.buscar('[data-prueba="padre"]')).texto;
  comprobar("CA-15: la cría queda con el padre elegido (Duque) y «sin verificar»", padreDuda.startsWith("Duque") && /sin verificar/i.test(padreDuda), padreDuda);

  // ---------- R30: historial de servicios del macho externo; R29: no se retira si es ancestro ----------
  await abrirExterno(p, "Sultán");
  await p.clic('[data-pestana="servicios"]');
  const resumen = (await p.buscar('[data-prueba="resumen-macho"]')).texto;
  comprobar("R30: la ficha de Sultán trae su historial de servicios y resultados", resumen.startsWith("2 servicios") && resumen.includes("1 parto con 1 cría"), resumen);
  await p.captura("e6-07-servicios-macho");
  await p.clic('[data-pestana="ficha"]');
  await p.js(`[...document.querySelectorAll(".tarjeta--peligro button")].find((b) => b.innerText.includes("Retirar")).click();`);
  await p.clic(".boton--peligro");
  const rechazo = (await p.buscar(".aviso--error", { condicion: (t) => t.includes("No se puede retirar") })).texto;
  comprobar("CA-13: un externo que es ancestro de un animal del hato no se puede retirar", rechazo.includes("Hija de Sultán"), rechazo);

  // ---------- Ajustes: margen de la ventana de gestación ----------
  await p.clic('[data-pantalla="ajustes"]');
  const margen = await p.js("return document.querySelector('[data-prueba=\"finca-margen\"]')?.value ?? null");
  comprobar("Ajustes: el margen de la gestación se puede configurar (10 días por defecto)", margen === "10", `margen = ${margen}`);

  // ---------- R23: el operario ve los externos, pero no los crea ni ve los contactos ----------
  await p.clic('[data-pestana="usuarios"]');
  await p.escribir('[data-prueba="usuario-nombre"]', "Luis");
  await p.elegirOpcion('[data-prueba="usuario-rol"]', "Operario");
  await p.clic('[data-prueba="agregar-usuario"]');
  await p.buscar("table", { condicion: (t) => t.includes("Luis") });
  await p.clic('[data-prueba="cambiar-usuario"]');
  await entrar(p, "Luis");
  await p.clic('[data-pantalla="animales"]');
  const pestanasOperario = await p.js("return [...document.querySelectorAll('[data-pestana]')].map((b) => b.dataset.pestana)");
  comprobar("R23: el operario no ve la pestaña de contactos", !pestanasOperario.includes("contactos"), pestanasOperario.join(", "));
  await p.clic('[data-pestana="externos"]');
  await p.buscar('[data-prueba="tabla-externos"]', { condicion: (t) => t.includes("Titán") });
  const botonExterno = await p.js("return !!document.querySelector('[data-prueba=registrar-externo]')");
  comprobar("R23: el operario ve los animales de otras fincas pero no puede registrarlos", !botonExterno);
  await abrirExterno(p, "Sultán");
  const telefono = (await p.buscar('[data-prueba="propietario"]')).texto;
  const editar = await p.js("return !!document.querySelector('[data-prueba=editar]')");
  comprobar("R23 y R28: el operario ve el propietario sin su teléfono, y no puede editar", !telefono.includes("300") && !editar, telefono);
  await p.captura("e6-08-operario");
  await p.cerrar();
} catch (error) {
  comprobar("La prueba terminó sin errores", false, String(error?.stack ?? error));
} finally {
  driver.kill();
}
process.exit(registro.terminar() === 0 ? 0 : 1);
