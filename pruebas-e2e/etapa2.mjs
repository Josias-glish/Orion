// Prueba de extremo a extremo de la Etapa 2 (Flujo 0) sobre el programa real en Linux.
// Uso (desde una base vacía):
//   npx tauri build --debug --no-bundle
//   rm -f ~/.config/co.registrocaprino.escritorio/registro-caprino.db*
//   xvfb-run -a node pruebas-e2e/etapa2.mjs "$PWD/src-tauri/target/debug/registro-caprino" capturas
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { abrirPrograma, crearRegistro, esperar, iniciarDriver } from "./webdriver.mjs";

const [APLICACION, CAPTURAS] = process.argv.slice(2);
mkdirSync(CAPTURAS, { recursive: true });
const registro = crearRegistro();
const { comprobar } = registro;
const driver = await iniciarDriver();

/** Registra un animal desde el formulario. Devuelve el texto de error si no se pudo guardar. */
async function registrarAnimal(p, a) {
  await p.clic('[data-pantalla="animales"]');
  await p.clic('[data-prueba="registrar-animal"]');
  await p.escribir('[data-prueba="nombre"]', a.nombre);
  await p.clic(`[data-prueba="sexo-${a.sexo}"]`);
  if (a.fecha) await p.escribir('[data-prueba="fecha-nacimiento"]', a.fecha);
  if (a.arete) {
    await p.clic('[data-prueba="agregar-identificador"]');
    await p.escribir('[data-prueba="identificador-valor"]', a.arete);
  }
  for (const [i, [raza, porcentaje]] of (a.razas ?? []).entries()) {
    await p.clic('[data-prueba="agregar-raza"]');
    await p.elegirOpcion('[data-prueba="raza"]', raza, i);
    await p.escribir('[data-prueba="porcentaje"]', porcentaje, i);
  }
  for (const rol of ["padre", "madre"]) {
    if (!a[rol]) continue;
    await p.escribir(`[data-prueba="${rol}"]`, a[rol]);
    await p.clic(".selector__resultados button");
    if (a[`${rol}SinVerificar`]) await p.clic(`[data-prueba="${rol}-sin-verificar"]`);
  }
  await p.clic('[data-prueba="guardar"]');
  // O se abre la ficha o aparecen los motivos del rechazo.
  const limite = Date.now() + 15000;
  while (Date.now() < limite) {
    const estado = await p.js(
      `const e = document.querySelector('[data-prueba="errores"]'); if (e) return { error: e.innerText };
       const t = document.querySelector('[data-prueba="titulo-animal"]'); return t ? { ok: t.innerText } : null;`,
    );
    if (estado?.error) return estado.error;
    if (estado?.ok) return null;
    await esperar(150);
  }
  throw new Error(`No terminó de guardar ${a.nombre}`);
}

async function abrirFicha(p, nombre) {
  await p.clic('[data-pantalla="animales"]');
  await p.escribir('[data-prueba="buscar"]', nombre);
  await p.buscar('[data-prueba="cantidad"]', { condicion: (t) => t === "1 animal" });
  await p.clic('[data-prueba="tabla-animales"] tbody tr .enlace');
  await p.buscar('[data-prueba="titulo-animal"]', { condicion: (t) => t.startsWith(nombre) });
}

try {
  // ---------- Primer arranque: asistente ----------
  let p = await abrirPrograma(APLICACION, CAPTURAS);
  await p.buscar("h1", { condicion: (t) => t.includes("Bienvenida") });
  comprobar("Primer arranque: aparece el asistente", true);
  await p.escribir('[data-prueba="finca-nombre"]', "Aprisco de prueba");
  await p.captura("01-asistente");
  await p.clic('[data-prueba="asistente-siguiente"]');
  await p.escribir('[data-prueba="usuario-nombre"]', "Ana");
  await p.clic('[data-prueba="usar-pin"]');
  await p.escribir('[data-prueba="pin"]', "2468");
  await p.escribir('[data-prueba="pin-confirmacion"]', "2468");
  await p.clic('[data-prueba="asistente-terminar"]');
  await p.buscar(".pantalla h1", { condicion: (t) => t === "Aprisco de prueba", tiempo: 30000 });
  comprobar("El asistente crea la finca y el propietario y entra al programa", true);

  // ---------- Flujo 0: cargar el hato desde el formulario ----------
  const animales = [
    { nombre: "Zeus", sexo: "macho", fecha: "2017-03-12", arete: "A-1", razas: [["Saanen", "100"]] },
    { nombre: "Abril", sexo: "hembra", fecha: "2017-04-02", arete: "A-2", razas: [["Saanen", "100"]] },
    { nombre: "Bruno", sexo: "macho", fecha: "2019-02-10", arete: "A-3", padre: "Zeus", madre: "Abril" },
    { nombre: "Bella", sexo: "hembra", fecha: "2019-02-10", arete: "A-4", padre: "Zeus", madre: "Abril", madreSinVerificar: true },
    { nombre: "Estrella", sexo: "hembra", fecha: "2021-02-22", arete: "A-5", padre: "Bruno", madre: "Bella", razas: [["Saanen", "75"], ["Alpina", "25"]] },
  ];
  for (const a of animales) {
    const error = await registrarAnimal(p, a);
    comprobar(`Registrar ${a.nombre}${a.padre ? ` (hijo de ${a.padre} × ${a.madre})` : " (fundador)"}`, error === null, error ?? undefined);
  }
  await p.captura("02-ficha");

  // CA-06: arete repetido
  const errorArete = await registrarAnimal(p, { nombre: "Copia", sexo: "hembra", arete: "a-1" });
  comprobar("CA-06 en pantalla: rechaza un arete que ya tiene otro animal", errorArete?.includes("ya lo tiene «Zeus»"), errorArete);
  await p.captura("03-error-arete");

  // CA-07: composición que no suma 100 %
  const errorRaza = await registrarAnimal(p, { nombre: "Mitad", sexo: "hembra", razas: [["Saanen", "50"]] });
  comprobar("CA-07 en pantalla: rechaza una composición que no suma 100 %", errorRaza?.includes("Ahora suman 50 %"), errorRaza);

  // CA-01: un descendiente como padre y una cría nacida antes que su padre
  await abrirFicha(p, "Zeus");
  await p.clic('[data-prueba="editar"]');
  await p.escribir('[data-prueba="padre"]', "Bruno");
  await p.clic(".selector__resultados button");
  await p.clic('[data-prueba="guardar"]');
  const errorCiclo = (await p.buscar('[data-prueba="errores"]')).texto;
  comprobar("CA-01 en pantalla: rechaza a un descendiente como padre", errorCiclo.includes("«Bruno» no puede ser el padre: es descendiente"), errorCiclo);
  await p.captura("04-error-ciclo");
  const errorFecha = await registrarAnimal(p, { nombre: "Precoz", sexo: "hembra", fecha: "2018-01-01", padre: "Bruno" });
  comprobar("CA-01 en pantalla: rechaza un padre nacido después que la cría", errorFecha?.includes("nació el mismo día o después"), errorFecha);

  // Genealogía de Estrella: árbol, consanguinidad y «sin verificar»
  await abrirFicha(p, "Estrella");
  await p.clic('[data-pestana="genealogia"]');
  const consanguinidad = (await p.buscar('[data-prueba="consanguinidad"]')).texto;
  comprobar("CA-02 en pantalla: consanguinidad de la hija de hermanos completos = 25 %", consanguinidad === "25 %", consanguinidad);
  const arbol = await p.js(
    `return Object.fromEntries([...document.querySelectorAll('.nodo[data-camino]')].map(n => [n.dataset.camino || "animal", n.innerText.replace(/\\n/g, " | ")]))`,
  );
  comprobar(
    "Árbol: padres y abuelos en su lugar",
    arbol.P.includes("Bruno") && arbol.M.includes("Bella") && arbol.PP.includes("Zeus") && arbol.MM.includes("Abril"),
    `P=${arbol.P} · MM=${arbol.MM}`,
  );
  comprobar("Árbol: tres generaciones (14 casillas de ancestros)", Object.keys(arbol).length === 15);
  // La insignia se muestra en mayúsculas (CSS), por eso se compara sin distinguir mayúsculas.
  const sinVerificar = (texto) => /sin verificar/i.test(texto);
  comprobar("Árbol: la marca «sin verificar» aparece solo en el vínculo marcado", sinVerificar(arbol.MM) && !sinVerificar(arbol.PM) && !sinVerificar(arbol.M));
  await p.captura("05-genealogia");
  await p.js("document.querySelector('[data-prueba=arbol]').scrollIntoView()");
  await esperar(300);
  await p.captura("05b-arbol");
  await p.clic('[data-pestana="historial"]');
  await p.buscar('[data-prueba="tabla-historial"] tbody tr');
  const filasHistorial = await p.js("return document.querySelectorAll('[data-prueba=tabla-historial] tbody tr').length");
  comprobar("Historial: la creación quedó registrada campo por campo", filasHistorial >= 10, `${filasHistorial} filas`);

  // Búsqueda y filtros (RF-07)
  await p.clic('[data-pantalla="animales"]');
  await p.escribir('[data-prueba="buscar"]', "a-3");
  const busqueda = (await p.buscar('[data-prueba="tabla-animales"] tbody tr')).texto;
  comprobar("Buscar por identificador", busqueda.includes("Bruno"), busqueda.replace(/\s+/g, " "));
  await p.escribir('[data-prueba="buscar"]', "");
  await p.captura("06-lista");

  // Foto: el comando Rust copia el archivo y la ventana la muestra por el protocolo asset (con la CSP activa)
  execFileSync("convert", ["-size", "64x48", "xc:#2a7", "/tmp/foto-prueba.png"]);
  const foto = await p.jsAsync(
    `const listo = arguments[arguments.length - 1];
     (async () => {
       const ruta = await window.__TAURI_INTERNALS__.invoke("copiar_foto", { origen: "/tmp/foto-prueba.png", nombre: "prueba-foto" });
       const base = await window.__TAURI_INTERNALS__.invoke("plugin:path|resolve_directory", { directory: 13 });
       const img = new Image();
       img.src = window.__TAURI_INTERNALS__.convertFileSrc(base + "/" + ruta);
       img.onload = () => listo({ ruta, ancho: img.naturalWidth });
       img.onerror = () => listo({ ruta, error: "no cargó" });
     })().catch((e) => listo({ error: String(e) }));`,
  );
  comprobar("Foto: se copia a la carpeta de datos y se muestra", foto.ruta === "fotos/prueba-foto.png" && foto.ancho === 64, JSON.stringify(foto));

  // R14: crear un operario y entrar con él
  await p.clic('[data-pantalla="ajustes"]');
  await p.clic('[data-pestana="usuarios"]');
  await p.escribir('[data-prueba="usuario-nombre"]', "Luis");
  await p.elegirOpcion('[data-prueba="usuario-rol"]', "Operario");
  await p.clic('[data-prueba="agregar-usuario"]');
  await p.buscar("table", { condicion: (t) => t.includes("Luis") });
  await p.clic('[data-prueba="cambiar-usuario"]');
  await p.clic('[data-usuario="Luis"]');
  await p.buscar('[data-prueba="usuario-actual"]', { condicion: (t) => t.includes("Luis") });
  const menu = await p.js("return [...document.querySelectorAll('[data-pantalla]')].map(b => b.dataset.pantalla)");
  comprobar("R14: el operario no ve Ajustes", !menu.includes("ajustes"), menu.join(", "));
  await abrirFicha(p, "Bruno");
  const botonEditar = await p.js("return !!document.querySelector('[data-prueba=editar]')");
  comprobar("R14: el operario ve la ficha pero no puede editarla", !botonEditar);
  await p.clic('[data-pantalla="animales"]');
  const botonRegistrar = await p.js("return !!document.querySelector('[data-prueba=registrar-animal]')");
  comprobar("R14: el operario no registra animales", !botonRegistrar);
  await p.captura("07-operario");
  await p.cerrar();
  await esperar(1500);

  // ---------- Segunda apertura: elegir usuario con PIN y comprobar que todo sigue ----------
  p = await abrirPrograma(APLICACION, CAPTURAS);
  await p.buscar("h2", { condicion: (t) => t.includes("¿Quién va a usar") });
  await p.clic('[data-usuario="Ana"]');
  await p.escribir('[data-prueba="pin-entrada"]', "1111");
  await p.clic('[data-prueba="entrar"]');
  const errorPin = (await p.buscar('[role="alert"]', { tiempo: 20000 })).texto;
  comprobar("PIN incorrecto: no deja entrar", errorPin.includes("no es correcto"));
  await p.escribir('[data-prueba="pin-entrada"]', "2468");
  const inicio = Date.now();
  await p.clic('[data-prueba="entrar"]');
  await p.buscar(".pantalla h1", { condicion: (t) => t === "Aprisco de prueba", tiempo: 20000 });
  comprobar("PIN correcto: entra al programa", true, `comprobación del PIN: ${Date.now() - inicio} ms`);
  const total = (await p.buscar('[data-prueba="total-animales"]')).texto;
  comprobar("CA-11: los 5 animales siguen tras cerrar y abrir el programa", total === "5", `activos = ${total}`);
  await abrirFicha(p, "Estrella");
  await p.clic('[data-pestana="genealogia"]');
  const despues = (await p.buscar('[data-prueba="consanguinidad"]')).texto;
  comprobar("CA-11: el pedigrí y la consanguinidad siguen iguales tras cerrar y abrir", despues === "25 %");
  await p.cerrar();
} catch (error) {
  comprobar("Ejecución sin errores", false, String(error));
} finally {
  driver.kill();
}
process.exit(registro.terminar() ? 1 : 0);
