// Prueba de extremo a extremo de la Etapa 9 sobre el programa real en Linux, SIN RED: compra y venta de animales
// (R32 y R20), inventario del hato y hoja de venta con pedigrí (R21). CA-23 (comprar un animal que ya era de otra finca
// lo promueve a comprado conservando su id y su genealogía, y la compra crea el gasto si se acepta), CA-24 (la venta
// marca al animal como vendido, conserva su historial y su registro propio, y lo quita del ordeño), CA-25 (la hoja de
// venta en PDF y en Excel trae los identificadores, la composición racial, el libro y el árbol correctos), los adjuntos
// de la compra, el historial con filtros y lo que ve el operario (R23).
// Uso (ver docs/PRUEBA_TECNICA.md):
//   npx tauri build --debug --no-bundle
//   rm -rf ~/.config/co.registrocaprino.escritorio/{registro-caprino.db*,documentos,fotos}
//   unshare -n sh -c 'ip link set lo up; xvfb-run -a node pruebas-e2e/etapa9.mjs "$PWD/src-tauri/target/debug/registro-caprino" capturas'
// Necesita pdftotext (paquete poppler-utils) para revisar los PDF.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { abrirPrograma, crearRegistro, esperar, iniciarDriver } from "./webdriver.mjs";

const [APLICACION, CAPTURAS_RELATIVAS] = process.argv.slice(2);
const CAPTURAS = resolve(CAPTURAS_RELATIVAS);
const SALIDA = join(CAPTURAS, "archivos");
rmSync(SALIDA, { recursive: true, force: true });
mkdirSync(SALIDA, { recursive: true });
const DATOS = join(homedir(), ".config", "co.registrocaprino.escritorio");
const BASE = join(DATOS, "registro-caprino.db");
const registro = crearRegistro();
const { comprobar } = registro;
const driver = await iniciarDriver();

const normalizar = (t) => t.replace(/\s+/g, " ").trim();
const fechaLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const HOY = fechaLocal();
const haceDias = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return fechaLocal(d);
};
/** Número de serie de Excel de una fecha AAAA-MM-DD (los días desde 1899-12-30). */
const serial = (fecha) => Date.parse(`${fecha}T00:00:00Z`) / 86400000 + 25569;

/** Consulta la base del programa con Python (trae SQLite); la ventana puede seguir abierta (modo WAL). */
const consultar = (sql) =>
  JSON.parse(
    execFileSync(
      "python3",
      ["-c", "import sqlite3, json, sys\ndb = sqlite3.connect(sys.argv[1]); db.row_factory = sqlite3.Row\nprint(json.dumps([dict(r) for r in db.execute(sys.argv[2])]))", BASE, sql],
      { encoding: "utf8" },
    ),
  );

/** Texto de un PDF (con pdftotext), con los espacios y saltos de línea normalizados. */
const textoPdf = (ruta) => normalizar(execFileSync("pdftotext", [ruta, "-"], { encoding: "utf8" }));

/** Las hojas de un .xlsx: [{ nombre, filas: [[celda, …], …] }]; fechas como número de serie. */
const PY_XLSX = String.raw`
import sys, zipfile, re, json, html
z = zipfile.ZipFile(sys.argv[1])
nombres = re.findall(r'<sheet [^>]*name="([^"]+)"', z.read('xl/workbook.xml').decode())
comp = []
if 'xl/sharedStrings.xml' in z.namelist():
    comp = [html.unescape(''.join(re.findall(r'<t[^>]*>(.*?)</t>', m, re.S))) for m in re.findall(r'<si>(.*?)</si>', z.read('xl/sharedStrings.xml').decode(), re.S)]
def col(ref):
    n = 0
    for c in re.sub(r'\d+', '', ref):
        n = n * 26 + ord(c) - 64
    return n - 1
hojas = []
for i, nombre in enumerate(nombres, 1):
    xml = z.read('xl/worksheets/sheet%d.xml' % i).decode()
    filas = []
    for fila in re.findall(r'<row [^>]*>(.*?)</row>', xml, re.S):
        celdas = {}
        for ref, attrs, cuerpo in re.findall(r'<c r="([A-Z]+\d+)"([^>]*?)(?:/>|>(.*?)</c>)', fila, re.S):
            m = re.search(r'<v>(.*?)</v>', cuerpo or '', re.S)
            if not m:
                continue
            celdas[col(ref)] = comp[int(m.group(1))] if 't="s"' in attrs else float(m.group(1))
        ancho = max(celdas) + 1 if celdas else 0
        filas.append([celdas.get(j) for j in range(ancho)])
    hojas.append({'nombre': html.unescape(nombre), 'filas': filas})
print(json.dumps(hojas))
`;
const leerXlsx = (ruta) => JSON.parse(execFileSync("python3", ["-c", PY_XLSX, ruta], { encoding: "utf8" }));

/** Archivos y tablas de un .zip de respaldo (con Python). */
const contenidoDeRespaldo = (zip) =>
  JSON.parse(
    execFileSync(
      "python3",
      ["-c", "import sys,zipfile,json;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps({'archivos':z.namelist(),'tablas':json.loads(z.read('datos.json'))['tablas']}))", zip],
      { encoding: "utf8", maxBuffer: 1 << 30 },
    ),
  );

/** Hace clic en un botón que abre el diálogo «Guardar» o «Abrir» del sistema y lo responde con `ruta` (dialogo.py). */
async function conDialogo(p, css, ruta) {
  await p.clic(css);
  console.log(execFileSync("python3", ["pruebas-e2e/dialogo.py", ruta], { encoding: "utf8" }).trim());
}

/** Guarda una copia con el botón número `indice` de los «Guardar una copia…» (puede haber dos de PDF). */
async function guardarCopia(p, extension, indice, ruta) {
  await p.js(`document.querySelectorAll('[data-prueba="copia-${extension}"]')[${indice}].click()`);
  console.log(execFileSync("python3", ["pruebas-e2e/dialogo.py", ruta], { encoding: "utf8" }).trim());
  await p.buscar('[data-prueba="copia-guardada"]', { condicion: (t) => t.includes(basename(ruta)) });
}

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

async function irADocumentos(p, seccion) {
  await p.clic('[data-pantalla="documentos"]');
  await p.clic(`[data-pestana="${seccion}"]`);
}

const animal = (nombre) => consultar(`SELECT * FROM animal WHERE nombre = '${nombre}' AND eliminado_en IS NULL`)[0];
const filasDe = (p, css) => p.js(`return [...document.querySelectorAll(arguments[0] + " tbody tr")].map((f) => f.innerText.replace(/\\s+/g, " ").trim())`, [css]);

try {
  // ---------- Preparación: base creada por el programa y datos de ejemplo ----------
  let p = await abrirPrograma(APLICACION, CAPTURAS);
  await p.buscar('[data-prueba="asistente-siguiente"]');
  await p.cerrar();
  await esperar(1000);
  console.log(`Datos de ejemplo: ${execFileSync("npx", ["tsx", "pruebas-e2e/cargar-datos.ts", BASE], { encoding: "utf8" }).trim()}`);
  p = await abrirPrograma(APLICACION, CAPTURAS);
  await entrar(p);
  const menu = await p.js("return [...document.querySelectorAll('[data-pantalla]')].map((b) => b.dataset.pantalla)");
  comprobar("R23: el propietario ve «Compras y ventas» en el menú", menu.includes("traspasos"), menu.join(", "));
  const activosAntes = consultar("SELECT count(*) AS n FROM animal WHERE en_hato = 1 AND origen <> 'externo' AND estado = 'activo' AND eliminado_en IS NULL")[0].n;

  // ---------- RF-36: el inventario de partida coincide con la base ----------
  await irADocumentos(p, "inventario");
  const totalInicial = (await p.buscar('[data-prueba="inventario-totales"]')).texto;
  comprobar("RF-36: el inventario cuenta los animales activos del hato (no los de otras fincas)", totalInicial.startsWith(`${activosAntes} animales`), totalInicial);

  // ---------- CA-23: comprar a Titán, que ya estaba registrado como animal de otra finca ----------
  const titanAntes = animal("Titán");
  const hijoAntes = animal("Roble");
  const montasAntes = consultar(`SELECT count(*) AS n FROM evento_reproductivo WHERE macho_id = '${titanAntes.id}'`)[0].n;
  comprobar("CA-23: antes de comprarlo, Titán es de otra finca y no cuenta en el hato", titanAntes.origen === "externo" && titanAntes.en_hato === 0 && hijoAntes.padre_id === titanAntes.id && montasAntes >= 3);
  const factura = join(SALIDA, "factura-titan.pdf");
  writeFileSync(factura, "%PDF-1.4\n% Factura de la compra de Titán (prueba)\n%%EOF\n");

  await p.clic('[data-pantalla="animales"]');
  await p.clic('[data-pestana="externos"]');
  await p.buscar('[data-prueba="tabla-externos"]', { condicion: (t) => t.includes("Titán") });
  await p.js(`[...document.querySelectorAll('[data-prueba="tabla-externos"] tbody tr')].find((f) => f.innerText.includes("Titán")).querySelector('[data-prueba="comprar-externo"]').click()`);
  const tituloCompra = (await p.buscar("h1", { condicion: (t) => t.includes("compra") })).texto;
  comprobar("CA-23: «Comprar» abre la compra con Titán ya elegido", tituloCompra === "Registrar la compra de Titán" && (await p.js("return document.querySelector('[data-prueba=compra-existente]').checked")), tituloCompra);
  await p.elegirOpcion('[data-prueba="compra-vendedor"]', "Criador vecino (ejemplo) · Hato El Roble (ejemplo)");
  await p.escribir('[data-prueba="compra-fecha"]', haceDias(3));
  await p.escribir('[data-prueba="compra-precio"]', "1.500.000");
  await p.escribir('[data-prueba="compra-registro"]', "ASOC-TITAN-2");
  await p.escribir('[data-prueba="compra-observaciones"]', "Se compró con su certificado (prueba)");
  const ofreceGasto = await p.js("return document.querySelector('[data-prueba=compra-crear-gasto]')?.checked");
  comprobar("R32: con precio, la compra ofrece anotar el gasto (marcado por defecto)", ofreceGasto === true);
  await conDialogo(p, '[data-prueba="compra-agregar-adjunto"]', factura);
  const adjuntoEnPantalla = (await p.buscar('[data-prueba="compra-adjuntos"]', { condicion: (t) => t.includes("adjunto-") })).texto;
  comprobar("R32: el adjunto (PDF) se copia a la carpeta de datos y aparece en la lista", /adjunto-[0-9a-f-]{36}\.pdf/.test(adjuntoEnPantalla), normalizar(adjuntoEnPantalla));
  await p.captura("e9-01-compra-de-titan");
  await p.clic('[data-prueba="guardar-compra"]');
  const listoTitan = (await p.buscar('[data-prueba="compra-registrada"]', { tiempo: 30000 })).texto;
  comprobar("CA-23: la compra queda registrada y dice que el gasto se anotó en Finanzas", listoTitan.includes("Compra de Titán registrada.") && listoTitan.includes("Gasto de $ 1.500.000 anotado en Finanzas."), normalizar(listoTitan));
  await p.captura("e9-02-compra-registrada");

  const titanDespues = animal("Titán");
  const vendedor = consultar("SELECT id FROM contacto WHERE nombre = 'Criador vecino (ejemplo)'")[0].id;
  comprobar(
    "CA-23: Titán conserva su id y pasa a «comprado», del hato, con su vendedor y su fecha de ingreso",
    titanDespues.id === titanAntes.id && titanDespues.origen === "comprado" && titanDespues.en_hato === 1 && titanDespues.contacto_id === vendedor && titanDespues.fecha_ingreso === haceDias(3),
    `${titanDespues.origen} / en_hato ${titanDespues.en_hato} / ${titanDespues.fecha_ingreso}`,
  );
  const hijoDespues = animal("Roble");
  const montasDespues = consultar(`SELECT count(*) AS n FROM evento_reproductivo WHERE macho_id = '${titanAntes.id}'`)[0].n;
  comprobar("CA-23: su genealogía y sus montas se conservan: Roble sigue siendo su hijo", hijoDespues.padre_id === titanAntes.id && montasDespues === montasAntes);
  const identificadoresTitan = consultar(`SELECT tipo, valor FROM identificador WHERE animal_id = '${titanAntes.id}' AND eliminado_en IS NULL AND tipo = 'registro_asociacion' ORDER BY valor`).map((i) => i.valor);
  comprobar("R32: el número de registro de la asociación queda como identificador, junto al anterior", identificadoresTitan.join() === "ASOC-TITAN-2,EJEMPLO-EXT-01", identificadoresTitan.join());
  const traspasoTitan = consultar(`SELECT * FROM traspaso WHERE animal_id = '${titanAntes.id}'`)[0];
  const adjuntos = JSON.parse(traspasoTitan.adjuntos ?? "[]");
  comprobar(
    "R32: el traspaso guarda tipo, vendedor, fecha, precio y el adjunto, copiado a la carpeta de datos",
    traspasoTitan.tipo === "compra" && traspasoTitan.contacto_id === vendedor && traspasoTitan.fecha === haceDias(3) && traspasoTitan.precio === 1500000 && adjuntos.length === 1 && existsSync(join(DATOS, adjuntos[0])) && readFileSync(join(DATOS, adjuntos[0]), "latin1").includes("Factura de la compra"),
    JSON.stringify(adjuntos),
  );
  const gastoTitan = consultar(`SELECT m.valor, m.fecha, m.tipo, m.animal_id, c.nombre AS categoria FROM movimiento_economico AS m JOIN categoria_economica AS c ON c.id = m.categoria_id WHERE m.id = '${traspasoTitan.movimiento_id}'`)[0];
  comprobar(
    "CA-23: el gasto «Compra de animales» quedó en Finanzas, asignado a Titán, por el precio y en la fecha de ingreso",
    gastoTitan?.categoria === "Compra de animales" && gastoTitan.tipo === "gasto" && gastoTitan.valor === 1500000 && gastoTitan.fecha === haceDias(3) && gastoTitan.animal_id === titanAntes.id,
    JSON.stringify(gastoTitan),
  );

  // ---------- Compra de un animal nuevo, con su padre cargado como animal de otra finca ----------
  await p.clic('[data-pantalla="animales"]');
  await p.clic('[data-pestana="hato"]');
  await p.clic('[data-prueba="registrar-compra"]');
  await p.buscar('[data-prueba="pantalla-compra"]');
  comprobar("R32: «Registrar compra» sin animal elegido propone crear uno nuevo", await p.js("return document.querySelector('[data-prueba=compra-nuevo]').checked"));
  await p.escribir('[data-prueba="compra-nombre"]', "Lucero");
  await p.escribir('[data-prueba="compra-nacimiento"]', haceDias(400));
  await p.escribir('[data-prueba="compra-arete"]', "EJ-90");
  await p.elegirOpcion('[data-prueba="compra-libro"]', "Pureza por pedigrí");
  await p.clic('[data-prueba="compra-agregar-raza"]');
  await p.elegirOpcion('[data-prueba="compra-raza"]', "Saanen");
  await p.clic('[data-prueba="cargar-padre"]');
  await p.escribir('[data-prueba="padre-nombre"]', "Sultán de Altagracia");
  await p.escribir('[data-prueba="padre-registro"]', "ASOC-SUL-1");
  await p.escribir('[data-prueba="compra-registro"]', "ASOC-LUC-1");
  await p.escribir('[data-prueba="compra-fecha"]', haceDias(1));
  const sinPrecioOfreceGasto = await p.js("return document.querySelectorAll('[data-prueba=compra-crear-gasto]').length");
  comprobar("R32: sin precio no se ofrece el gasto", sinPrecioOfreceGasto === 0);
  await p.clic('[data-prueba="guardar-compra"]');
  const sinVendedor = (await p.buscar('[data-prueba="errores"]')).texto;
  comprobar("R32: sin vendedor no se guarda y se dice qué falta", sinVendedor.includes("Elija el vendedor o agréguelo como contacto nuevo.") && !animal("Lucero"), normalizar(sinVendedor));
  await p.clic('[data-prueba="compra-agregar-vendedor"]');
  await p.escribir('[data-prueba="contacto-nombre"]', "Criadora Altagracia (prueba)");
  await p.escribir('[data-prueba="contacto-criadero"]', "Finca Altagracia (prueba)");
  await p.clic('[data-prueba="guardar-contacto"]');
  await p.buscar('[data-prueba="compra-vendedor"]', { condicion: (t) => t.includes("Criadora Altagracia (prueba) · Finca Altagracia (prueba)") });
  await p.captura("e9-03-compra-nueva");
  await p.clic('[data-prueba="guardar-compra"]');
  const listoLucero = (await p.buscar('[data-prueba="compra-listo"]', { tiempo: 30000 })).texto;
  comprobar("R32: se registra la compra de Lucero", listoLucero === "Compra de Lucero registrada.", listoLucero);
  const lucero = consultar(
    `SELECT a.origen, a.en_hato, a.estado, a.fecha_ingreso, a.sexo, a.libro_id IS NOT NULL AS con_libro, p.nombre AS padre, p.origen AS padre_origen, p.en_hato AS padre_en_hato, p.contacto_id AS padre_contacto, a.contacto_id AS vendedor
     FROM animal AS a LEFT JOIN animal AS p ON p.id = a.padre_id WHERE a.nombre = 'Lucero'`,
  )[0];
  const altagracia = consultar("SELECT id FROM contacto WHERE nombre = 'Criadora Altagracia (prueba)'")[0].id;
  comprobar(
    "R29 y R32: Lucero entra al hato como comprada y su padre se carga como animal de otra finca, del mismo vendedor",
    lucero.origen === "comprado" && lucero.en_hato === 1 && lucero.fecha_ingreso === haceDias(1) && lucero.padre === "Sultán de Altagracia" && lucero.padre_origen === "externo" && lucero.padre_en_hato === 0 && lucero.padre_contacto === altagracia && lucero.vendedor === altagracia,
    JSON.stringify(lucero),
  );
  const traspasoLucero = consultar(`SELECT precio, movimiento_id, adjuntos FROM traspaso WHERE animal_id = '${animal("Lucero").id}'`)[0];
  comprobar("R32: sin precio no hay gasto ni adjuntos", traspasoLucero.precio === null && traspasoLucero.movimiento_id === null && traspasoLucero.adjuntos === null);
  const registroLucero = consultar(`SELECT valor FROM identificador WHERE animal_id = '${animal("Lucero").id}' AND tipo = 'registro_asociacion' AND eliminado_en IS NULL`).map((i) => i.valor);
  comprobar("R32: el registro de la asociación de Lucero también queda como identificador", registroLucero.join() === "ASOC-LUC-1", registroLucero.join());

  // ---------- Preparar la venta: Bella necesita su registro propio emitido (R31) ----------
  await p.clic('[data-pantalla="registros"]');
  await p.clic('[data-pestana="configuracion"]');
  await p.escribir('[data-prueba="config-criador"]', "Aprisco El Paraíso");
  await p.escribir('[data-prueba="config-responsable"]', "Ana Pérez");
  await p.clic('[data-prueba="guardar-datos-certificado"]');
  await p.buscar('[data-prueba="datos-certificado"] .aviso--exito');
  await abrirFicha(p, "Bella");
  await p.clic('[data-pestana="registro"]');
  await p.buscar('[data-prueba="pestana-registro"]');
  await p.clic('[data-prueba="emitir-registro"]');
  const emision = (await p.buscar('[data-prueba="mensaje-emision"]', { tiempo: 60000 })).texto;
  comprobar("R31: Bella tiene su registro propio emitido (PPE-0001) antes de venderla", emision.includes("PPE-0001"), emision);

  // El ordeño de la mañana cuenta a Bella antes de la venta.
  await p.clic('[data-pantalla="leche"]');
  await p.clic('[data-pestana="ordeno"]');
  await p.elegirOpcion('[data-prueba="ordeno-jornada"]', "Mañana");
  await p.buscar('[data-prueba="ordeno-progreso"]', { condicion: (t) => t.startsWith("0 de 3") });
  const bellaEnOrdeno = await p.js("return document.querySelectorAll('[data-cabra=Bella]').length");
  comprobar("CA-24: antes de la venta, Bella está en el ordeño (0 de 3)", bellaEnOrdeno === 1);

  // ---------- CA-24: vender a Bella ----------
  const bellaAntes = animal("Bella");
  const hijasAntes = consultar(`SELECT nombre FROM animal WHERE madre_id = '${bellaAntes.id}' AND eliminado_en IS NULL ORDER BY nombre`).map((h) => h.nombre);
  await abrirFicha(p, "Bella");
  await p.clic('[data-prueba="registrar-venta"]');
  const tituloVenta = (await p.buscar("h1", { condicion: (t) => t.includes("venta") })).texto;
  comprobar("CA-24: la ficha ofrece «Registrar venta»", tituloVenta === "Registrar la venta de Bella", tituloVenta);
  await p.clic('[data-prueba="guardar-venta"]');
  const sinComprador = (await p.buscar('[data-prueba="errores"]')).texto;
  comprobar("R20: sin comprador no se guarda y se dice qué falta", sinComprador.includes("Elija el comprador o agréguelo como contacto nuevo.") && animal("Bella").estado === "activo", normalizar(sinComprador));
  await p.clic('[data-prueba="venta-agregar-comprador"]');
  await p.escribir('[data-prueba="contacto-nombre"]', "Comprador de prueba");
  await p.escribir('[data-prueba="contacto-criadero"]', "Finca Los Alpes (prueba)");
  await p.clic('[data-prueba="guardar-contacto"]');
  await p.buscar('[data-prueba="venta-comprador"]', { condicion: (t) => t.includes("Comprador de prueba · Finca Los Alpes (prueba)") });
  await p.escribir('[data-prueba="venta-precio"]', "900.000");
  await p.escribir('[data-prueba="venta-observaciones"]', "Vendida con su registro (prueba)");
  const ofreceIngreso = await p.js("return document.querySelector('[data-prueba=venta-crear-ingreso]')?.checked");
  comprobar("R20: con precio, la venta ofrece anotar el ingreso (marcado por defecto)", ofreceIngreso === true);
  await p.captura("e9-04-venta-de-bella");
  await p.clic('[data-prueba="guardar-venta"]');
  const listoVenta = (await p.buscar('[data-prueba="venta-registrada"]', { tiempo: 30000 })).texto;
  comprobar("CA-24: la venta queda registrada, dice que el animal quedó como vendido y que el ingreso se anotó", listoVenta.includes("Venta de Bella registrada. El animal quedó como vendido.") && listoVenta.includes("Ingreso de $ 900.000 anotado en Finanzas."), normalizar(listoVenta));
  await p.captura("e9-05-venta-registrada");

  const bellaDespues = animal("Bella");
  comprobar("CA-24: Bella queda «vendido» y no se retira su ficha", bellaDespues.estado === "vendido" && bellaDespues.eliminado_en === null, bellaDespues.estado);
  comprobar("CA-24: su genealogía no cambia (mismos padres y mismas hijas)", bellaDespues.padre_id === bellaAntes.padre_id && bellaDespues.madre_id === bellaAntes.madre_id && consultar(`SELECT nombre FROM animal WHERE madre_id = '${bellaAntes.id}' AND eliminado_en IS NULL ORDER BY nombre`).map((h) => h.nombre).join() === hijasAntes.join(), hijasAntes.join());
  const registroBella = consultar(`SELECT numero, estado FROM registro_genealogico WHERE animal_id = '${bellaAntes.id}' AND eliminado_en IS NULL`);
  comprobar("CA-24: su registro propio no se anula: sigue emitido con el mismo número", registroBella.length === 1 && registroBella[0].numero === "PPE-0001" && registroBella[0].estado === "emitido", JSON.stringify(registroBella));
  const cambioDeEstado = consultar(`SELECT valor_anterior, valor_nuevo FROM historial_cambios WHERE entidad = 'animal' AND registro_id = '${bellaAntes.id}' AND campo = 'estado'`);
  comprobar("CA-24: el cambio de estado queda en su historial", cambioDeEstado.some((c) => c.valor_anterior === "activo" && c.valor_nuevo === "vendido"), JSON.stringify(cambioDeEstado));
  const ventaBella = consultar(`SELECT t.tipo, t.fecha, t.precio, t.observaciones, c.nombre AS comprador, m.valor, m.tipo AS tipo_mov, k.nombre AS categoria, m.animal_id FROM traspaso AS t JOIN contacto AS c ON c.id = t.contacto_id LEFT JOIN movimiento_economico AS m ON m.id = t.movimiento_id LEFT JOIN categoria_economica AS k ON k.id = m.categoria_id WHERE t.animal_id = '${bellaAntes.id}'`)[0];
  comprobar(
    "R20: el traspaso guarda comprador, fecha, precio y observaciones, y el ingreso «Venta de animales» queda asignado a Bella",
    ventaBella?.tipo === "venta" && ventaBella.fecha === HOY && ventaBella.precio === 900000 && ventaBella.comprador === "Comprador de prueba" && ventaBella.observaciones === "Vendida con su registro (prueba)" && ventaBella.categoria === "Venta de animales" && ventaBella.tipo_mov === "ingreso" && ventaBella.valor === 900000 && ventaBella.animal_id === bellaAntes.id,
    JSON.stringify(ventaBella),
  );

  // La ficha sigue abierta, con su historial y su genealogía, pero ya no se puede vender otra vez.
  await abrirFicha(p, "Bella");
  const insignia = (await p.buscar(".encabezado .insignia")).texto;
  const otraVenta = await p.js("return document.querySelectorAll('[data-prueba=registrar-venta]').length");
  comprobar("CA-24: la ficha de Bella sigue ahí, marcada «Vendido», y ya no ofrece vender otra vez", /vendido/i.test(insignia) && otraVenta === 0, insignia);
  await p.clic('[data-pestana="genealogia"]');
  const genealogia = (await p.buscar(".contenido", { condicion: (t) => t.includes("Zeus") })).texto;
  comprobar("CA-24: su genealogía sigue visible (Zeus y Abril)", genealogia.includes("Zeus") && genealogia.includes("Abril"));
  await p.clic('[data-pestana="historial"]');
  const historial = (await p.buscar(".contenido", { condicion: (t) => /vendido/i.test(t) && /estado/i.test(t) })).texto;
  comprobar("CA-24: su historial conserva el cambio de estado a «vendido»", /vendido/i.test(historial));
  await p.clic('[data-pestana="ficha"]');
  const fichaTraspasos = (await p.buscar('[data-prueba="traspasos-animal"]')).texto;
  comprobar("RF-16: la ficha del propietario muestra la venta de este animal", fichaTraspasos.includes("Venta") && fichaTraspasos.includes("Comprador de prueba"), normalizar(fichaTraspasos));

  // Sale del ordeño (R11).
  await p.clic('[data-pantalla="leche"]');
  await p.clic('[data-pestana="ordeno"]');
  await p.elegirOpcion('[data-prueba="ordeno-jornada"]', "Mañana");
  await p.buscar('[data-prueba="ordeno-progreso"]', { condicion: (t) => t.startsWith("0 de 2") });
  const bellaEnOrdenoDespues = await p.js("return document.querySelectorAll('[data-cabra=Bella]').length");
  comprobar("CA-24: la venta quita a Bella del ordeño (0 de 2)", bellaEnOrdenoDespues === 0);

  // ---------- CA-25: la hoja de venta, en PDF y en Excel, con el pedigrí y, si se quiere, el certificado ----------
  await abrirFicha(p, "Bella");
  await p.clic('[data-prueba="hoja-de-venta"]');
  await p.buscar('[data-prueba="hoja-venta"]');
  const vendidoNota = (await p.buscar('[data-prueba="hoja-venta"]', { condicion: (t) => t.includes("Este animal ya figura como vendido.") })).texto;
  comprobar("R21: la hoja se puede entregar después de la venta (el animal ya figura como vendido)", vendidoNota.includes("Este animal ya figura como vendido."));
  await p.clic('[data-prueba="hoja-produccion"]');
  await p.clic('[data-prueba="hoja-certificado"]');
  await p.captura("e9-06-hoja-de-venta");
  await p.clic('[data-prueba="generar-hoja-venta"]');
  const generada = (await p.buscar('[data-prueba="documento-generado"]', { tiempo: 60000 })).texto;
  comprobar("R21: la hoja de venta se genera e incluye el certificado de registro propio", generada.includes("Hoja de venta de Bella generada.") && !!(await p.buscar(".aviso--exito", { condicion: (t) => t.includes("PPE-0001") })), generada);
  const hojaPdf = join(SALIDA, "hoja-venta-Bella.pdf");
  const hojaXlsx = join(SALIDA, "hoja-venta-Bella.xlsx");
  const certificadoPdf = join(SALIDA, "certificado-Bella.pdf");
  await guardarCopia(p, "pdf", 0, hojaPdf);
  await guardarCopia(p, "xlsx", 0, hojaXlsx);
  await guardarCopia(p, "pdf", 1, certificadoPdf);

  const textoHoja = textoPdf(hojaPdf);
  comprobar("CA-25: el PDF de la hoja es un PDF y dice que es un documento informativo, no un certificado oficial", readFileSync(hojaPdf).subarray(0, 5).toString("latin1") === "%PDF-" && textoHoja.includes("Documento informativo del criadero. No es un certificado oficial."));
  comprobar(
    "CA-25: el PDF trae el nombre, los identificadores, la composición racial, el libro y el registro propio",
    ["Hoja de venta: Bella", "Hembra", "Arete EJ-07", "Tatuaje T-1907", "100 % Saanen", "Pureza por pedigrí", "PPE-0001"].every((d) => textoHoja.includes(d)),
    textoHoja.slice(0, 400),
  );
  comprobar("CA-25: el PDF trae el árbol de tres generaciones: sus padres Zeus y Abril", textoHoja.includes("Pedigrí de tres generaciones") && ["Zeus", "EJ-01", "EJEMPLO-0001", "Abril", "EJ-02"].every((d) => textoHoja.includes(d)));
  comprobar("CA-25: el PDF trae la producción de leche porque se eligió", textoHoja.includes("Producción de leche") && textoHoja.includes("Leche acumulada (kg)"));
  comprobar("R28: la hoja no lleva precios ni datos del comprador", !textoHoja.includes("900.000") && !textoHoja.includes("Comprador de prueba") && !textoHoja.includes("Los Alpes"));

  const hojasExcel = leerXlsx(hojaXlsx);
  comprobar("CA-25: el Excel tiene las hojas «Hoja de venta», «Pedigrí» y «Producción»", hojasExcel.map((h) => h.nombre).join() === "Hoja de venta,Pedigrí,Producción", hojasExcel.map((h) => h.nombre).join());
  const datosXlsx = Object.fromEntries(hojasExcel[0].filas.filter((f) => f.length >= 2 && f[0]).map((f) => [f[0], f[1]]));
  comprobar(
    "CA-25: el Excel trae los mismos identificadores, composición, libro y registro propio que el PDF",
    datosXlsx["Nombre"] === "Bella" && datosXlsx["Sexo"] === "Hembra" && datosXlsx["Identificadores"] === "Arete EJ-07, Tatuaje T-1907" && datosXlsx["Raza y composición"] === "100 % Saanen" && datosXlsx["Libro"] === "Pureza por pedigrí" && datosXlsx["Registro propio"] === "PPE-0001" && datosXlsx["Nacimiento"] === serial("2019-02-10"),
    JSON.stringify(datosXlsx),
  );
  const pedigri = hojasExcel[1].filas;
  const lugar = (parentesco) => pedigri.find((f) => f[1] === parentesco);
  comprobar(
    "CA-25: el pedigrí del Excel tiene una fila por lugar del árbol (14) y los padres correctos",
    pedigri.length === 15 && pedigri[0][1] === "Parentesco" && lugar("Padre")?.[2] === "Zeus" && lugar("Padre")?.[3] === "EJ-01" && lugar("Padre")?.[4] === "EJEMPLO-0001" && lugar("Madre")?.[2] === "Abril" && lugar("Madre")?.[3] === "EJ-02" && (lugar("Abuelo paterno")?.[2] ?? null) === null,
    JSON.stringify(pedigri.slice(0, 3)),
  );
  comprobar("CA-25: la hoja de producción del Excel tiene una lactancia en curso con su leche acumulada", hojasExcel[2].filas.length >= 2 && hojasExcel[2].filas.slice(1).some((f) => f[2] === "En curso" && f[3] > 0), JSON.stringify(hojasExcel[2].filas.slice(0, 3)));

  const textoCertificado = textoPdf(certificadoPdf);
  comprobar("R20 y R31: el certificado de registro propio acompaña la hoja (PPE-0001, sin imitar a ANCO)", textoCertificado.includes("PPE-0001") && textoCertificado.includes("Registro propio del criadero. No es el certificado oficial de ANCO.") && textoCertificado.includes("Bella"));

  // Sin producción y sin certificado: la hoja del Excel solo trae las dos primeras hojas.
  await abrirFicha(p, "Bella");
  await p.clic('[data-prueba="hoja-de-venta"]');
  await p.buscar('[data-prueba="hoja-certificado"]');
  await p.clic('[data-prueba="generar-hoja-venta"]');
  await p.buscar('[data-prueba="documento-generado"]', { tiempo: 60000 });
  const sinOpcionales = await p.js("return document.querySelectorAll('[data-prueba=copia-pdf]').length + document.querySelectorAll('[data-prueba=copia-xlsx]').length");
  const xlsxSimple = join(SALIDA, "hoja-venta-Bella-simple.xlsx");
  await guardarCopia(p, "xlsx", 0, xlsxSimple);
  comprobar("R21: la producción y el certificado son opcionales: sin elegirlos solo hay PDF y Excel, y el Excel sin hoja de producción", sinOpcionales === 2 && leerXlsx(xlsxSimple).map((h) => h.nombre).join() === "Hoja de venta,Pedigrí");

  // Un animal sin registro propio lo dice y no ofrece el certificado.
  await p.clic('[data-pantalla="documentos"]');
  await p.clic('[data-pestana="hojaVenta"]');
  await p.escribir('[data-prueba="hoja-animal"]', "Faro");
  await p.js(`document.querySelector('.selector__resultados button').click()`);
  await p.buscar('[data-prueba="hoja-sin-registro"]');
  const ofreceCertificado = await p.js("return document.querySelectorAll('[data-prueba=hoja-certificado]').length");
  comprobar("R21: un animal sin registro propio no ofrece el certificado y lo dice", ofreceCertificado === 0);

  // ---------- RF-36: el inventario del hato en PDF y en Excel ----------
  await irADocumentos(p, "inventario");
  const totales = (await p.buscar('[data-prueba="inventario-totales"]')).texto;
  const esperado = activosAntes + 2 - 1; // Titán y Lucero entran; Bella sale.
  comprobar("RF-36: el inventario suma a los comprados (Titán y Lucero) y quita a la vendida (Bella)", totales.startsWith(`${esperado} animales`) && /2 comprados/.test(totales), totales);
  await p.clic('[data-prueba="generar-inventario"]');
  await p.buscar('[data-prueba="documento-generado"]', { tiempo: 60000 });
  const inventarioPdf = join(SALIDA, "inventario.pdf");
  const inventarioXlsx = join(SALIDA, "inventario.xlsx");
  await guardarCopia(p, "pdf", 0, inventarioPdf);
  await guardarCopia(p, "xlsx", 0, inventarioXlsx);
  await p.captura("e9-07-inventario");
  const textoInventario = textoPdf(inventarioPdf);
  comprobar("RF-36: el PDF del inventario nombra a Titán y a Lucero (comprados) y no a Bella (vendida)", textoInventario.includes("Inventario del hato") && textoInventario.includes("Titán") && textoInventario.includes("Lucero") && !/\bBella\b/.test(textoInventario) && textoInventario.includes("Documento informativo del criadero. No es un certificado oficial."));
  const hojasInventario = leerXlsx(inventarioXlsx);
  const filasInventario = hojasInventario[0].filas;
  const nombresInventario = filasInventario.slice(1).map((f) => f[0]);
  comprobar("RF-36: el Excel tiene una fila por animal, igual que el total, con los comprados y sin la vendida", hojasInventario.map((h) => h.nombre).join() === "Inventario,Resumen" && filasInventario.length === 1 + esperado && nombresInventario.includes("Titán") && nombresInventario.includes("Lucero") && !nombresInventario.includes("Bella"), `${filasInventario.length - 1} filas`);
  const filaTitan = filasInventario.find((f) => f[0] === "Titán");
  comprobar("RF-36: la fila de Titán dice que fue comprado y trae su registro de asociación", filaTitan?.includes("Comprado") && filaTitan.some((c) => typeof c === "string" && c.startsWith("EJEMPLO-EXT-01") || c === "ASOC-TITAN-2"), JSON.stringify(filaTitan));

  // ---------- Historial de compras y ventas con filtros (RF-50, RF-16) ----------
  await p.clic('[data-pantalla="traspasos"]');
  await p.buscar('[data-prueba="tabla-traspasos"]');
  let filas = await filasDe(p, '[data-prueba="tabla-traspasos"]');
  comprobar("RF-50: el historial lista las dos compras y la venta, de la más reciente a la más antigua", filas.length === 3 && /venta/i.test(filas[0]) && filas[0].includes("Bella") && /compra/i.test(filas[1]) && filas[1].includes("Lucero") && /compra/i.test(filas[2]) && filas[2].includes("Titán"), filas.join(" | "));
  const resumen = normalizar((await p.buscar('[data-prueba="traspasos-totales"]')).texto);
  comprobar("RF-50: el resumen suma lo comprado y lo vendido por separado", resumen.includes("2 compras: $ 1.500.000") && resumen.includes("1 venta: $ 900.000") && /Vendido menos comprado: −\$ 600\.000/.test(resumen), resumen);
  await p.captura("e9-08-historial");
  await p.elegirOpcion('[data-prueba="filtro-tipo"]', "Venta");
  await p.buscar('[data-prueba="tabla-traspasos"]', { condicion: (t) => !t.includes("Titán") });
  filas = await filasDe(p, '[data-prueba="tabla-traspasos"]');
  comprobar("RF-50: el filtro por tipo «Venta» deja solo la venta de Bella", filas.length === 1 && filas[0].includes("Bella"), filas.join(" | "));
  await p.elegirOpcion('[data-prueba="filtro-tipo"]', "Todos");
  await p.elegirOpcion('[data-prueba="filtro-contacto"]', "Criador vecino (ejemplo) · Hato El Roble (ejemplo)");
  await p.buscar('[data-prueba="tabla-traspasos"]', { condicion: (t) => t.includes("Titán") && !t.includes("Lucero") });
  filas = await filasDe(p, '[data-prueba="tabla-traspasos"]');
  comprobar("RF-50: el filtro por contacto deja solo lo que tuvo que ver con ese vendedor (Titán)", filas.length === 1 && filas[0].includes("Titán"), filas.join(" | "));
  await p.clic('[data-prueba="quitar-filtros"]');
  await p.escribir('[data-prueba="filtro-desde"]', haceDias(2));
  await p.buscar('[data-prueba="tabla-traspasos"]', { condicion: (t) => !t.includes("Titán") });
  filas = await filasDe(p, '[data-prueba="tabla-traspasos"]');
  comprobar("RF-50: el filtro por periodo (últimos dos días) deja a Lucero y a Bella", filas.length === 2 && filas.some((f) => f.includes("Lucero")) && filas.some((f) => f.includes("Bella")), filas.join(" | "));
  await p.clic('[data-prueba="quitar-filtros"]');
  await p.buscar('[data-prueba="tabla-traspasos"]', { condicion: (t) => t.includes("Titán") });

  // El adjunto de la compra se puede guardar otra vez donde se quiera.
  const copiaAdjunto = join(SALIDA, "factura-titan-copia.pdf");
  await p.js(`[...document.querySelectorAll('[data-prueba="tabla-traspasos"] tbody tr')].find((f) => f.innerText.includes("Titán")).querySelector('[data-prueba="guardar-adjunto"]').click()`);
  console.log(execFileSync("python3", ["pruebas-e2e/dialogo.py", copiaAdjunto], { encoding: "utf8" }).trim());
  await p.buscar(".aviso--exito", { condicion: (t) => t.includes("factura-titan-copia.pdf") });
  comprobar("R32: el adjunto se puede guardar de nuevo desde el historial, igual al original", existsSync(copiaAdjunto) && readFileSync(copiaAdjunto, "latin1") === readFileSync(factura, "latin1"));

  // ---------- Copia de respaldo: lleva los traspasos y los adjuntos ----------
  await irADocumentos(p, "respaldo");
  const zip = join(SALIDA, "respaldo.zip");
  await conDialogo(p, '[data-prueba="crear-respaldo"]', zip);
  await p.buscar('[data-prueba="aviso-exito"]', { tiempo: 60000 });
  const respaldo = contenidoDeRespaldo(zip);
  comprobar("RF-43: el respaldo trae los 3 traspasos y el archivo adjunto", (respaldo.tablas.traspaso ?? []).length === 3 && respaldo.archivos.includes(adjuntos[0]), `${(respaldo.tablas.traspaso ?? []).length} traspasos`);

  // ---------- R23: el operario no ve compras, ventas ni finanzas ----------
  await p.clic('[data-pantalla="ajustes"]');
  await p.clic('[data-pestana="usuarios"]');
  await p.escribir('[data-prueba="usuario-nombre"]', "Luis");
  await p.elegirOpcion('[data-prueba="usuario-rol"]', "Operario");
  await p.clic('[data-prueba="agregar-usuario"]');
  await p.buscar("table", { condicion: (t) => t.includes("Luis") });
  await p.clic('[data-prueba="cambiar-usuario"]');
  await entrar(p, "Luis");
  const menuOperario = await p.js("return [...document.querySelectorAll('[data-pantalla]')].map((b) => b.dataset.pantalla)");
  comprobar("R23: el operario no ve «Compras y ventas» ni «Finanzas» en el menú", !menuOperario.includes("traspasos") && !menuOperario.includes("finanzas") && menuOperario.includes("animales"), menuOperario.join(", "));
  await p.clic('[data-pantalla="animales"]');
  await p.clic('[data-pestana="hato"]');
  await p.buscar('[data-prueba="tabla-animales"]');
  const botonCompra = await p.js("return document.querySelectorAll('[data-prueba=registrar-compra]').length");
  await p.clic('[data-pestana="externos"]');
  await p.buscar('[data-prueba="tabla-externos"]');
  const botonesComprar = await p.js("return document.querySelectorAll('[data-prueba=registrar-compra], [data-prueba=comprar-externo]').length");
  comprobar("R23: el operario no ve los botones para registrar compras", botonCompra === 0 && botonesComprar === 0);
  await abrirFicha(p, "Estrella");
  const botonVenta = await p.js("return document.querySelectorAll('[data-prueba=registrar-venta], [data-prueba=hoja-de-venta], [data-prueba=traspasos-animal]').length");
  comprobar("R23: el operario no ve «Registrar venta», ni la hoja de venta, ni las compras y ventas en la ficha", botonVenta === 0);
  await p.clic('[data-pantalla="animales"]');
  await p.clic('[data-pestana="hato"]');
  await p.escribir('[data-prueba="buscar"]', "Titán");
  await p.buscar('[data-prueba="cantidad"]', { condicion: (t) => t === "1 animal" });
  await p.clic('[data-prueba="tabla-animales"] tbody tr .enlace');
  await p.buscar('[data-prueba="titulo-animal"]', { condicion: (t) => t.startsWith("Titán") });
  const origenTitan = (await p.buscar('[data-prueba="origen"]')).texto;
  const vendedorVisible = await p.js("return document.querySelectorAll('[data-prueba=propietario]').length");
  comprobar("R23: Titán figura como comprado, pero el operario no ve a quién se le compró", origenTitan === "Comprado" && vendedorVisible === 0, origenTitan);
  await irADocumentos(p, "inventario");
  const soloPropietario = (await p.buscar(".aviso--info", { condicion: (t) => t.includes("Solo el propietario") })).texto;
  const botonesDocumento = await p.js("return document.querySelectorAll('[data-prueba=generar-inventario]').length");
  comprobar("R23: el inventario y la hoja de venta son documentos del propietario", soloPropietario.includes("Solo el propietario puede emitir documentos.") && botonesDocumento === 0);
  await p.captura("e9-09-operario");
  await p.cerrar();
} catch (error) {
  comprobar("La prueba terminó sin errores", false, String(error?.stack ?? error));
} finally {
  driver.kill();
}
process.exit(registro.terminar() === 0 ? 0 : 1);
