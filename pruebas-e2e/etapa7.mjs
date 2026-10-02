// Prueba de extremo a extremo de la Etapa 7 sobre el programa real en Linux, SIN RED: generador de registros
// genealógicos (R31). CA-16 (lista de verificación: no se emite lo incompleto y se dice qué falta), CA-17 (números
// consecutivos por libro, sin saltos, el anulado conserva su número), CA-18 (instantánea y reemisión), CA-19 (el
// certificado en PDF trae el rótulo obligatorio y el pedigrí correcto, sin imitar a ANCO), CA-20 (el libro exportado a
// PDF y a Excel coincide con lo emitido), el pedigrí imprimible y lo que ve el operario (R23).
// Uso (ver docs/PRUEBA_TECNICA.md):
//   npx tauri build --debug --no-bundle
//   rm -rf ~/.config/co.registrocaprino.escritorio/{registro-caprino.db*,documentos,fotos}
//   unshare -n sh -c 'ip link set lo up; xvfb-run -a node pruebas-e2e/etapa7.mjs "$PWD/src-tauri/target/debug/registro-caprino" capturas'
// Necesita pdftotext y pdfimages (paquete poppler-utils) para revisar los PDF.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
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

const filas = (p, css) => p.js(`return [...document.querySelectorAll(arguments[0] + " tbody tr")].map((f) => f.innerText);`, [css]);
const normalizar = (t) => t.replace(/\s+/g, " ");

/** Consulta la base del programa con Python (trae SQLite); la ventana puede seguir abierta (modo WAL). */
const consultar = (sql) =>
  JSON.parse(
    execFileSync(
      "python3",
      ["-c", "import sqlite3, json, sys\ndb = sqlite3.connect(sys.argv[1]); db.row_factory = sqlite3.Row\nprint(json.dumps([dict(r) for r in db.execute(sys.argv[2])]))", BASE, sql],
      { encoding: "utf8" },
    ),
  );
const leerRegistros = () =>
  consultar(
    `SELECT r.numero, r.estado, r.version, r.consecutivo, l.nombre AS libro, a.nombre AS animal, r.instantanea, r.motivo_anulacion AS motivo
     FROM registro_genealogico AS r JOIN animal AS a ON a.id = r.animal_id LEFT JOIN libro AS l ON l.id = r.libro_id
     WHERE r.eliminado_en IS NULL ORDER BY l.nombre, r.consecutivo, r.creado_en`,
  ).map((r) => ({ ...r, instantanea: r.instantanea ? JSON.parse(r.instantanea) : null }));
const nombreDe = (r, camino) => r.instantanea.pedigri.find((a) => a.camino === camino)?.nombre ?? "";

/** Texto de un PDF (con pdftotext), con los espacios y saltos de línea normalizados. */
const textoPdf = (ruta) => normalizar(execFileSync("pdftotext", [ruta, "-"], { encoding: "utf8" }));
const imagenesDelPdf = (ruta) => execFileSync("pdfimages", ["-list", ruta], { encoding: "utf8" }).trim().split("\n").length - 2;

/** Hace clic en un botón que abre el diálogo «Guardar» del sistema y lo responde con `ruta` (dialogo.py). */
async function conDialogo(p, css, ruta) {
  await p.clic(css);
  console.log(execFileSync("python3", ["pruebas-e2e/dialogo.py", ruta], { encoding: "utf8" }).trim());
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

async function pestanaRegistro(p, nombre) {
  await abrirFicha(p, nombre);
  await p.clic('[data-pestana="registro"]');
  await p.buscar('[data-prueba="pestana-registro"]');
}

const irARegistros = async (p, seccion) => {
  await p.clic('[data-pantalla="registros"]');
  await p.clic(`[data-pestana="${seccion}"]`);
};

try {
  // ---------- Preparación: base creada por el programa y datos de ejemplo ----------
  let p = await abrirPrograma(APLICACION, CAPTURAS);
  await p.buscar('[data-prueba="asistente-siguiente"]');
  await p.cerrar();
  await esperar(1000);
  console.log(`Datos de ejemplo: ${execFileSync("npx", ["tsx", "pruebas-e2e/cargar-datos.ts", BASE], { encoding: "utf8" }).trim()}`);
  p = await abrirPrograma(APLICACION, CAPTURAS);
  await entrar(p);

  // ---------- Registros: la pantalla existe para el propietario y empieza vacía ----------
  await p.clic('[data-pantalla="registros"]');
  await p.buscar('[data-prueba="sin-registros"]');
  comprobar("Registros: el propietario ve la pantalla y al principio no hay ningún registro", leerRegistros().length === 0);

  // ---------- CA-16: la lista de verificación dice qué le falta a cada animal ----------
  await p.clic('[data-pestana="verificacion"]');
  await p.buscar('[data-prueba="tabla-verificacion"]', { condicion: (t) => t.includes("Perla") && t.includes("Estrella") });
  const cantidad = (await p.buscar('[data-prueba="cantidad-verificacion"]')).texto;
  comprobar("CA-16: 21 animales del hato, 13 listos para emitir", cantidad === "21 animales, 13 listos para emitir.", cantidad);
  const lista = await filas(p, '[data-prueba="tabla-verificacion"]');
  const fila = (nombre) => normalizar(lista.find((f) => f.includes(nombre)) ?? "");
  comprobar("CA-16: a Perla le falta el padre", /Falta: padre/.test(fila("Perla")), fila("Perla"));
  comprobar("CA-16: a Chispa le falta el identificador", /Falta: identificador principal vigente/.test(fila("Chispa")), fila("Chispa"));
  comprobar("CA-16: a Ciro le faltan el nacimiento y la raza", /fecha de nacimiento, raza o composición/.test(fila("Ciro")), fila("Ciro"));
  comprobar("CA-16: a una cría recién nacida le falta el libro", /Falta: libro/.test(fila("Roble")), fila("Roble"));
  comprobar("CA-16: Estrella cumple todo", /cumple todo/i.test(fila("Estrella")), fila("Estrella"));
  comprobar("CA-13: los animales de otras fincas (Titán) no tienen registro propio", !lista.some((f) => f.includes("Titán")));
  await p.captura("e7-01-lista-de-verificacion");

  // ---------- CA-16: en la ficha no se puede emitir lo incompleto y se ofrece el enlace para corregirlo ----------
  await pestanaRegistro(p, "Perla");
  const bloqueado = await p.js("return document.querySelector('[data-prueba=emitir-registro]').disabled");
  const falta = await p.js(`return document.querySelector('[data-requisito="padre"]').dataset.cumple`);
  comprobar("CA-16: el botón Emitir registro está desactivado y la lista marca el padre como faltante", bloqueado === true && falta === "false");
  await p.captura("e7-02-ficha-incompleta");
  await p.clic('[data-prueba="corregir-padre"]');
  await p.buscar('[data-prueba="padre"]');
  comprobar("CA-16: «Corregir» lleva al formulario del animal", true);
  comprobar("CA-16: no se creó ningún registro", leerRegistros().length === 0);

  // ---------- Configuración (R31): datos del certificado y prefijo de un libro ----------
  await irARegistros(p, "configuracion");
  await p.escribir('[data-prueba="config-criador"]', "Aprisco El Paraíso");
  await p.escribir('[data-prueba="config-responsable"]', "Ana Pérez");
  await p.clic('[data-prueba="guardar-datos-certificado"]');
  await p.buscar('[data-prueba="datos-certificado"] .aviso--exito');
  const ejemploMestizo = (await p.buscar('[data-libro="Mestizo"] [data-prueba="ejemplo-numero"]')).texto;
  comprobar("Configuración: el libro Mestizo empieza con el prefijo MES-0001", ejemploMestizo.includes("MES-0001"), ejemploMestizo);
  await p.escribir('[data-libro="Mestizo"] [data-prueba="config-prefijo"]', "MZ");
  await p.escribir('[data-libro="Mestizo"] [data-prueba="config-digitos"]', "3");
  const nuevoEjemplo = (await p.buscar('[data-libro="Mestizo"] [data-prueba="ejemplo-numero"]', { condicion: (t) => t.includes("MZ-001") })).texto;
  await p.clic('[data-libro="Mestizo"] [data-prueba="guardar-libro"]');
  await p.buscar('[data-libro="Mestizo"] .aviso--exito');
  comprobar("Configuración: el prefijo y el formato del número se cambian (MZ-001)", nuevoEjemplo.includes("MZ-001"), nuevoEjemplo);
  await p.captura("e7-03-configuracion");

  // ---------- Emitir un registro desde la ficha: número, certificado y su PDF ----------
  await pestanaRegistro(p, "Estrella");
  await p.clic('[data-prueba="emitir-registro"]');
  const mensaje = (await p.buscar('[data-prueba="mensaje-emision"]', { tiempo: 60000 })).texto;
  comprobar("CA-17: el primer registro del libro Pureza por pedigrí es PPE-0001", mensaje.includes("PPE-0001"), mensaje);
  const estado = (await p.buscar('[data-prueba="estado-registro"]')).texto;
  comprobar("El registro queda «Emitido», con su certificado guardado en la carpeta de datos", /emitido/i.test(estado) && existsSync(join(DATOS, "documentos", "PPE-0001-v1.pdf")), estado);
  await p.captura("e7-04-registro-emitido");
  await p.clic('[data-prueba="generar-certificado-registro"]');
  await p.buscar('[data-prueba="copia-pdf"]', { tiempo: 60000 });
  await conDialogo(p, '[data-prueba="copia-pdf"]', join(SALIDA, "registro-Estrella-v1.pdf"));
  await p.buscar('[data-prueba="copia-guardada"]', { condicion: (t) => t.includes("registro-Estrella-v1.pdf") });
  const pdfV1 = join(SALIDA, "registro-Estrella-v1.pdf");
  const textoV1 = textoPdf(pdfV1);
  comprobar("CA-19: el PDF es un PDF", readFileSync(pdfV1).subarray(0, 5).toString("latin1") === "%PDF-");
  comprobar("CA-19: dice «Registro propio del criadero. No es el certificado oficial de ANCO»", textoV1.includes("Registro propio del criadero. No es el certificado oficial de ANCO."));
  comprobar("CA-19: trae el número, la versión y los datos del animal", ["PPE-0001", "Versión 1", "Estrella", "Pureza por pedigrí", "100 % Saanen", "EJ-10"].every((d) => textoV1.includes(d)));
  comprobar("CA-19: trae el criador, el responsable y la línea de firma", ["Aprisco El Paraíso", "Firma del responsable", "Ana Pérez", "Criadero de ejemplo"].every((d) => textoV1.includes(d)));
  comprobar("CA-19: pedigrí de tres generaciones con padres y abuelos correctos", textoV1.includes("Pedigrí de tres generaciones") && ["Bruno", "Bella", "Zeus", "Abril"].every((d) => textoV1.includes(d)));
  comprobar("CA-19: sin la sigla CRG, sin imágenes y sin código QR (no imita a ANCO)", !/CRG/.test(textoV1) && imagenesDelPdf(pdfV1) === 0, `${imagenesDelPdf(pdfV1)} imágenes`);
  const pdfBytes = readFileSync(join(DATOS, "documentos", "PPE-0001-v1.pdf"));
  comprobar("El certificado también quedó guardado en la carpeta de datos del programa", pdfBytes.subarray(0, 5).toString("latin1") === "%PDF-", `${pdfBytes.length} bytes`);
  const documentos = (await p.buscar('[data-prueba="documentos-registro"]', { condicion: (t) => t.includes("PPE-0001-v1") })).texto;
  comprobar("El documento aparece en la lista de certificados del registro", documentos.includes("PPE-0001-v1"), normalizar(documentos));

  // ---------- CA-17: emisión en lote, sin saltos, mostrando a los que no cumplen ----------
  await irARegistros(p, "verificacion");
  await p.buscar('[data-prueba="tabla-verificacion"]', { condicion: (t) => t.includes("Perla") });
  await p.clic('[data-prueba="seleccionar-listos"]');
  await p.buscar('[data-prueba="emitir-lote"]', { condicion: (t) => t.includes("(12)") });
  await p.js(`document.querySelector('[data-animal="EJ-31"] [data-prueba="elegir-animal"]').click();`); // Perla: incompleta, la elijo a propósito
  await p.buscar('[data-prueba="emitir-lote"]', { condicion: (t) => t.includes("(13)") });
  await p.clic('[data-prueba="emitir-lote"]');
  await p.buscar('[data-prueba="confirmar-lote"]');
  await p.captura("e7-05-confirmar-lote");
  await p.clic('[data-prueba="confirmar-emitir-lote"]');
  const emitidosLote = (await p.buscar('[data-prueba="lote-emitidos"]', { tiempo: 120000 })).texto;
  comprobar("CA-17: el lote emite 12 registros y guarda sus 12 certificados", emitidosLote === "Se emitieron 12 registros y se guardaron 12 certificados.", emitidosLote);
  const rechazadosLote = (await p.buscar('[data-prueba="lote-rechazados"]')).texto;
  const bloque = normalizar((await p.buscar('[data-prueba="resultado-lote"]')).texto);
  comprobar("CA-17: el lote muestra a Perla sin emitir y dice que le falta el padre", rechazadosLote.startsWith("1 sin emitir") && /Perla: Falta: padre/.test(bloque), bloque);
  await p.captura("e7-06-resultado-lote");
  let regs = leerRegistros();
  const porLibro = Object.groupBy(regs, (r) => r.libro);
  const sinSaltos = Object.entries(porLibro).every(([, rs]) => rs.map((r) => r.consecutivo).join() === rs.map((_, i) => i + 1).join());
  comprobar("CA-17: los números de cada libro son consecutivos, sin saltos", sinSaltos, Object.entries(porLibro).map(([l, rs]) => `${l}: ${rs.map((r) => r.numero).join(", ")}`).join(" | "));
  const numeroDe = (animal) => regs.find((r) => r.animal === animal && r.estado === "emitido")?.numero;
  comprobar(
    "CA-17: cada animal recibió el número que le tocaba en el orden de la lista",
    numeroDe("Bella") === "PPE-0002" && numeroDe("Bruno") === "PPE-0003" && numeroDe("Nube") === "PPE-0004" && numeroDe("Abril") === "FUN-0001" && numeroDe("Zeus") === "FUN-0005" && numeroDe("Cacique") === "MZ-001" && numeroDe("Gema") === "MZ-004",
    ["Bella", "Bruno", "Nube", "Abril", "Zeus", "Cacique", "Gema"].map((a) => `${a} ${numeroDe(a)}`).join(", "),
  );
  comprobar("CA-17: Perla no recibió número", !regs.some((r) => r.animal === "Perla"));

  // ---------- CA-17: un registro anulado conserva su número y no se reutiliza ----------
  await pestanaRegistro(p, "Bella");
  await p.clic('[data-prueba="anular-registro"]');
  await p.escribir('[data-prueba="motivo-anulacion-texto"]', "Registrada por error (prueba)");
  await p.clic('[data-prueba="confirmar-anular"]');
  await p.buscar('[data-prueba="mensaje-emision"]', { condicion: (t) => t.includes("Se anuló el registro PPE-0002") });
  const tablaAnulados = (await p.buscar('[data-prueba="registros-anulados"]', { condicion: (t) => t.includes("PPE-0002") })).texto;
  comprobar("CA-17: el registro anulado conserva su número y su motivo, y el animal queda sin registro vigente", tablaAnulados.includes("PPE-0002") && tablaAnulados.includes("por error"), normalizar(tablaAnulados));
  await p.captura("e7-07-anulado");
  await p.buscar('[data-prueba="emitir-registro"]');
  await p.clic('[data-prueba="emitir-registro"]');
  const nuevo = (await p.buscar('[data-prueba="mensaje-emision"]', { condicion: (t) => t.includes("Se emitió"), tiempo: 60000 })).texto;
  comprobar("CA-17: Bella recibe un registro nuevo con el número siguiente (PPE-0005); el 2 no se reutiliza", nuevo.includes("PPE-0005") && !nuevo.includes("PPE-0002"), nuevo);
  regs = leerRegistros();
  const pp = regs.filter((r) => r.libro === "Pureza por pedigrí").map((r) => `${r.numero}:${r.estado}`);
  comprobar("CA-17: el libro queda con PPE-0001 a PPE-0005 y el 0002 anulado", pp.join(" ") === "PPE-0001:emitido PPE-0002:anulado PPE-0003:emitido PPE-0004:emitido PPE-0005:emitido", pp.join(" "));

  // ---------- CA-18: cambiar el padre no altera lo emitido; reemitir crea la versión 2 con el mismo número ----------
  const antes = regs.find((r) => r.numero === "PPE-0001");
  comprobar("CA-18: el registro de Estrella se emitió con Bruno como padre", nombreDe(antes, "P") === "Bruno");
  await abrirFicha(p, "Estrella");
  await p.clic('[data-prueba="editar"]');
  await p.buscar('[data-prueba="padre-elegido"]');
  await p.js(`document.querySelector('[data-prueba="padre-elegido"]').parentElement.querySelector("button").click();`);
  await p.escribir('[data-prueba="padre"]', "Duque");
  await p.clic(".selector__resultados button");
  await p.clic('[data-prueba="guardar"]');
  await p.buscar('[data-prueba="titulo-animal"]', { condicion: (t) => t.startsWith("Estrella") });
  const padreAhora = (await p.buscar('[data-prueba="padre"]')).texto;
  const despues = leerRegistros().find((r) => r.numero === "PPE-0001");
  comprobar("CA-18: Estrella ahora tiene a Duque como padre, pero el registro emitido sigue con Bruno", padreAhora.startsWith("Duque") && nombreDe(despues, "P") === "Bruno" && despues.version === 1, `${padreAhora} / registro: ${nombreDe(despues, "P")} v${despues.version}`);
  await p.clic('[data-pestana="registro"]');
  await p.clic('[data-prueba="reemitir-registro"]');
  await p.buscar('[data-prueba="mensaje-registro"]', { condicion: (t) => t.includes("versión 2"), tiempo: 60000 });
  const v2 = leerRegistros().find((r) => r.numero === "PPE-0001");
  comprobar("CA-18: reemitir crea la versión 2 con el mismo número y el padre nuevo", v2.version === 2 && nombreDe(v2, "P") === "Duque", `v${v2.version}, padre ${nombreDe(v2, "P")}`);
  const historial = consultar(
    `SELECT h.valor_anterior FROM historial_cambios AS h JOIN registro_genealogico AS r ON r.id = h.registro_id
     WHERE h.entidad = 'registro_genealogico' AND h.campo = 'instantanea' AND h.valor_anterior IS NOT NULL AND r.numero = 'PPE-0001'`,
  );
  comprobar("CA-18: la versión 1 quedó en el historial como reemplazada", historial.length === 1 && JSON.parse(historial[0].valor_anterior).version === 1);
  const documentosV2 = (await p.buscar('[data-prueba="documentos-registro"]', { condicion: (t) => t.includes("PPE-0001-v2") })).texto;
  comprobar("CA-18: cada versión tiene su certificado (v1 y v2)", documentosV2.includes("PPE-0001-v1") && existsSync(join(DATOS, "documentos", "PPE-0001-v2.pdf")));
  const textoV2 = textoPdf(join(DATOS, "documentos", "PPE-0001-v2.pdf"));
  const textoV1Guardado = textoPdf(join(DATOS, "documentos", "PPE-0001-v1.pdf"));
  comprobar("CA-18: el certificado v1 sigue diciendo Bruno y el v2 dice Duque y que reemplaza a la v1", textoV1Guardado.includes("Bruno") && !textoV1Guardado.includes("Duque") && textoV2.includes("Duque") && textoV2.includes("Reemplaza a la versión 1"));
  await p.captura("e7-08-reemitido");

  // ---------- CA-20: el libro genealógico coincide con los registros emitidos (en pantalla, en PDF y en Excel) ----------
  regs = leerRegistros();
  const emitidos = regs.filter((r) => r.estado === "emitido");
  await irARegistros(p, "libro");
  const cantidadLibro = (await p.buscar('[data-prueba="libro-cantidad"]', { condicion: (t) => t.includes("registros") })).texto;
  comprobar("CA-20: el libro de la pantalla tiene un renglón por registro emitido (el anulado no)", cantidadLibro === `${emitidos.length} registros`, cantidadLibro);
  const renglones = await filas(p, '[data-prueba="tabla-libro"]');
  comprobar(
    "CA-20: la pantalla muestra los mismos números que la base",
    renglones.length === emitidos.length && emitidos.every((r) => renglones.some((f) => f.includes(r.numero))) && !renglones.some((f) => f.includes("PPE-0002")),
  );
  await p.captura("e7-09-libro");
  await conDialogo(p, '[data-prueba="exportar-libro-excel"]', join(SALIDA, "libro.xlsx"));
  await p.buscar('[data-prueba="libro-exportado"]', { condicion: (t) => t.includes("libro.xlsx"), tiempo: 30000 });
  const hoja = JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        `import zipfile, re, json, sys, html
z = zipfile.ZipFile(sys.argv[1])
comp = [html.unescape("".join(re.findall(r"<t[^>]*>(.*?)</t>", m, re.S))) for m in re.findall(r"<si>(.*?)</si>", z.read("xl/sharedStrings.xml").decode(), re.S)]
filas = []
for fila in re.findall(r"<row [^>]*>(.*?)</row>", z.read("xl/worksheets/sheet1.xml").decode(), re.S):
    celdas = {}
    for ref, attrs, cuerpo in re.findall(r'<c r="([A-Z]+)\\d+"([^>]*?)(?:/>|>(.*?)</c>)', fila, re.S):
        v = re.search(r"<v>(.*?)</v>", cuerpo or "")
        celdas[ref] = None if v is None else (comp[int(v.group(1))] if 't="s"' in attrs else float(v.group(1)))
    filas.append(celdas)
print(json.dumps(filas))`,
        join(SALIDA, "libro.xlsx"),
      ],
      { encoding: "utf8" },
    ),
  );
  const [encabezado, ...datosExcel] = hoja;
  comprobar("CA-20: el Excel tiene el encabezado y un renglón por registro emitido", encabezado.B === "Número" && datosExcel.length === emitidos.length, `${datosExcel.length} renglones`);
  const porNumero = new Map(datosExcel.map((f) => [f.B, f]));
  const coincide = emitidos.every((r) => {
    const f = porNumero.get(r.numero);
    return f && f.A === r.libro && f.C === r.instantanea.animal.nombre && f.D === (r.instantanea.animal.identificadores.find((i) => i.principal)?.valor ?? "") && (f.G ?? "") === nombreDe(r, "P") && (f.H ?? "") === nombreDe(r, "M") && f.J === r.version;
  });
  comprobar("CA-20: el Excel coincide con lo emitido: libro, número, nombre, identificador, padre, madre y versión", coincide);
  comprobar("CA-20: el Excel trae la versión 2 de Estrella con su padre nuevo (Duque)", porNumero.get("PPE-0001")?.G === "Duque" && porNumero.get("PPE-0001")?.J === 2);
  await conDialogo(p, '[data-prueba="exportar-libro-pdf"]', join(SALIDA, "libro.pdf"));
  await p.buscar('[data-prueba="libro-exportado"]', { condicion: (t) => t.includes("libro.pdf"), tiempo: 30000 });
  const textoLibro = textoPdf(join(SALIDA, "libro.pdf"));
  comprobar("CA-20: el PDF del libro trae todos los números emitidos y no el anulado", emitidos.every((r) => textoLibro.includes(r.numero)) && !textoLibro.includes("PPE-0002"), `${emitidos.length} números`);
  comprobar("CA-20: el PDF del libro dice que no es un documento oficial de ANCO", textoLibro.includes("No es el certificado oficial de ANCO"));
  // Filtro por raza: coincide con lo que dice cada instantánea.
  await p.escribir('[data-prueba="libro-filtro-raza"]', "Alpina");
  const conAlpina = emitidos.filter((r) => r.instantanea.animal.composicion.some((c) => c.raza === "Alpina" && c.fraccion > 0)).map((r) => r.numero);
  await p.buscar('[data-prueba="libro-cantidad"]', { condicion: (t) => t === `${conAlpina.length} registros` });
  const filtrados = await filas(p, '[data-prueba="tabla-libro"]');
  comprobar("CA-20: el filtro por raza muestra solo los registros de esa raza", filtrados.length === conAlpina.length && conAlpina.every((n) => filtrados.some((f) => f.includes(n))), `${conAlpina.length} registros con Alpina`);
  await p.escribir('[data-prueba="libro-filtro-raza"]', "");
  // La lista de registros también filtra por estado.
  await irARegistros(p, "registros");
  await p.escribir('[data-prueba="filtro-estado"]', "anulado");
  const anulados = (await p.buscar('[data-prueba="cantidad-registros"]')).texto;
  comprobar("Registros: el filtro por estado muestra el registro anulado", anulados === "1 registro", anulados);

  // ---------- Pedigrí imprimible de un animal sin registro, con su ancestro de otra finca ----------
  await abrirFicha(p, "Roble");
  await p.clic('[data-pestana="genealogia"]');
  await p.buscar('[data-prueba="pedigri-imprimible"]');
  await p.js(`document.querySelector('[data-prueba="pedigri-cuatro"]').click();`);
  await conDialogo(p, '[data-prueba="imprimir-pedigri"]', join(SALIDA, "pedigri-Roble.pdf"));
  await p.buscar('[data-prueba="pedigri-guardado"]', { condicion: (t) => t.includes("pedigri-Roble.pdf"), tiempo: 30000 });
  const textoPedigri = textoPdf(join(SALIDA, "pedigri-Roble.pdf"));
  comprobar(
    "Pedigrí imprimible: Roble (sin registro) con Titán, su propietario y su número de asociación",
    ["Pedigrí: Roble", "Titán", "Registro de asociación: EJEMPLO-EXT-01", "Otra finca: Criador vecino (ejemplo) · Hato El Roble (ejemplo)", "Sin registro propio", "Cuatro generaciones".replace("Cuatro", "Pedigrí de cuatro")].every((d) => textoPedigri.includes(d)),
  );
  comprobar("Pedigrí imprimible: dice que es informativo y no un certificado oficial", textoPedigri.includes("Documento informativo del criadero. No es el certificado oficial de ANCO."));

  // ---------- R23: el operario no ve la pantalla Registros ----------
  await p.clic('[data-pantalla="ajustes"]');
  await p.clic('[data-pestana="usuarios"]');
  await p.escribir('[data-prueba="usuario-nombre"]', "Luis");
  await p.elegirOpcion('[data-prueba="usuario-rol"]', "Operario");
  await p.clic('[data-prueba="agregar-usuario"]');
  await p.buscar("table", { condicion: (t) => t.includes("Luis") });
  await p.clic('[data-prueba="cambiar-usuario"]');
  await entrar(p, "Luis");
  const menu = await p.js("return [...document.querySelectorAll('[data-pantalla]')].map((b) => b.dataset.pantalla)");
  comprobar("R23: el operario no ve «Registros» en el menú", !menu.includes("registros") && menu.includes("animales"), menu.join(", "));
  await abrirFicha(p, "Estrella");
  const pestanas = await p.js("return [...document.querySelectorAll('[data-pestana]')].map((b) => b.dataset.pestana)");
  comprobar("R23: la ficha del operario no tiene la pestaña «Registro»", !pestanas.includes("registro") && pestanas.includes("genealogia"), pestanas.join(", "));
  await p.clic('[data-pestana="genealogia"]');
  await p.buscar('[data-prueba="arbol"]');
  const imprimir = await p.js("return !!document.querySelector('[data-prueba=pedigri-imprimible]')");
  comprobar("R23: el operario tampoco imprime el pedigrí (solo el propietario emite documentos)", !imprimir);
  await p.captura("e7-10-operario");
  await p.cerrar();
} catch (error) {
  comprobar("La prueba terminó sin errores", false, String(error?.stack ?? error));
} finally {
  driver.kill();
}
process.exit(registro.terminar() === 0 ? 0 : 1);
