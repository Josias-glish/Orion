// Prueba de extremo a extremo de la Etapa 8 sobre el programa real en Linux, SIN RED: calidad de la leche (R18) y
// finanzas (R19). CA-21 (el promedio de células somáticas por lactancia coincide con el cálculo manual e ignora los
// valores vacíos), CA-22 (costo por cabra, costo por lote, rentabilidad y gastos generales aparte), la conexión con las
// montas de otras fincas (R30) y lo que ve el operario (R23).
// Uso (ver docs/PRUEBA_TECNICA.md):
//   npx tauri build --debug --no-bundle
//   rm -rf ~/.config/co.registrocaprino.escritorio/{registro-caprino.db*,documentos,fotos}
//   unshare -n sh -c 'ip link set lo up; xvfb-run -a node pruebas-e2e/etapa8.mjs "$PWD/src-tauri/target/debug/registro-caprino" capturas'
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

const normalizar = (t) => t.replace(/\s+/g, " ").trim();
const fechaLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const HOY = fechaLocal();
const haceDias = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return fechaLocal(d);
};
/** «$ 1.250.000», «−$ 60.000» → número. */
const aNumero = (texto) => {
  const n = Number(texto.replace(/[^\d]/g, ""));
  return /[−-]/.test(texto) ? -n : n;
};

/** Consulta la base del programa con Python (trae SQLite); la ventana puede seguir abierta (modo WAL). */
const consultar = (sql) =>
  JSON.parse(
    execFileSync(
      "python3",
      ["-c", "import sqlite3, json, sys\ndb = sqlite3.connect(sys.argv[1]); db.row_factory = sqlite3.Row\nprint(json.dumps([dict(r) for r in db.execute(sys.argv[2])]))", BASE, sql],
      { encoding: "utf8" },
    ),
  );

async function entrar(p, usuario = "Propietario de ejemplo") {
  await p.clic(`[data-usuario="${usuario}"]`);
  await p.buscar('[data-prueba="usuario-actual"]', { condicion: (t) => t.includes(usuario) });
}

const texto = (p, css) => p.js(`return document.querySelector(arguments[0])?.innerText ?? ""`, [css]);

/** Pone el foco en una casilla y presiona Enter (guarda la fila del ordeño). */
async function enter(p, css) {
  await p.clic(css);
  await p.teclear("");
}

const pesajeDe = (animal, fecha = HOY) =>
  consultar(
    `SELECT p.kilos, p.grasa_pct, p.proteina_pct, p.celulas_somaticas FROM pesaje_leche AS p
     JOIN lactancia AS l ON l.id = p.lactancia_id JOIN animal AS a ON a.id = l.hembra_id
     WHERE a.nombre = '${animal}' AND p.fecha = '${fecha}' AND p.jornada = 'manana' AND p.eliminado_en IS NULL`,
  )[0];

async function irAOrdeno(p) {
  await p.clic('[data-pantalla="leche"]');
  await p.clic('[data-pestana="ordeno"]');
  await p.elegirOpcion('[data-prueba="ordeno-jornada"]', "Mañana");
  await p.buscar('[data-prueba="ordeno-progreso"]', { condicion: (t) => t.startsWith("0 de 3") });
}

const celdaCalidad = (p, hembra, columna) => texto(p, `[data-prueba="tabla-calidad"] [data-lactancia="${hembra}"] [data-columna="${columna}"]`).then(normalizar);
const ordenCalidad = (p) => p.js(`return [...document.querySelectorAll('[data-prueba="tabla-calidad"] tbody tr')].map((r) => r.dataset.lactancia)`);

try {
  // ---------- Preparación: base creada por el programa y datos de ejemplo (con calidad y movimientos) ----------
  let p = await abrirPrograma(APLICACION, CAPTURAS);
  await p.buscar('[data-prueba="asistente-siguiente"]');
  await p.cerrar();
  await esperar(1000);
  console.log(`Datos de ejemplo: ${execFileSync("npx", ["tsx", "pruebas-e2e/cargar-datos.ts", BASE], { encoding: "utf8" }).trim()}`);
  p = await abrirPrograma(APLICACION, CAPTURAS);
  await entrar(p);
  const menu = await p.js("return [...document.querySelectorAll('[data-pantalla]')].map((b) => b.dataset.pantalla)");
  comprobar("Finanzas: el propietario ve «Finanzas» en el menú", menu.includes("finanzas"), menu.join(", "));

  // ---------- RF-32: la calidad es opcional y se anota junto al ordeño ----------
  await irAOrdeno(p);
  const sinCalidad = await p.js("return document.querySelectorAll('[data-prueba=grasa]').length");
  comprobar("RF-32: sin marcar la casilla, el ordeño es el de siempre (sin columnas de calidad)", sinCalidad === 0);
  await p.clic('[data-prueba="ordeno-calidad"]');
  await p.buscar('[data-cabra="Abril"] [data-prueba="grasa"]');
  const columnas = await p.js("return [...document.querySelectorAll('[data-prueba=tabla-ordeno] thead th')].map((t) => t.innerText)");
  comprobar("RF-32: al marcarla aparecen grasa, proteína y células somáticas", ["Grasa (%)", "Proteína (%)", "Células somáticas (por ml)"].every((c) => columnas.includes(c)), columnas.join(" | "));
  await p.captura("e8-01-ordeno-con-calidad");

  // Abril: la muestra completa, con puntos de miles en las células.
  const fila = (cabra, campo) => `[data-cabra="${cabra}"] [data-prueba="${campo}"]`;
  await p.escribir(fila("Abril", "kilos"), "2,5");
  await p.escribir(fila("Abril", "grasa"), "3,8");
  await p.escribir(fila("Abril", "proteina"), "3,2");
  await p.escribir(fila("Abril", "celulas"), "450.000");
  await enter(p, fila("Abril", "celulas"));
  await p.buscar('[data-cabra="Abril"] [data-prueba="estado-fila"]', { condicion: (t) => t.toLowerCase().includes("guardado") });
  const abril = pesajeDe("Abril");
  comprobar("RF-32: Abril guardó kilos, grasa, proteína y células somáticas", abril?.kilos === 2.5 && abril.grasa_pct === 3.8 && abril.proteina_pct === 3.2 && abril.celulas_somaticas === 450000, JSON.stringify(abril));

  // Bella: solo las células somáticas (grasa y proteína quedan vacías).
  await p.escribir(fila("Bella", "kilos"), "3");
  await p.escribir(fila("Bella", "celulas"), "380000");
  await enter(p, fila("Bella", "celulas"));
  await p.buscar('[data-cabra="Bella"] [data-prueba="estado-fila"]', { condicion: (t) => t.toLowerCase().includes("guardado") });
  const bella = pesajeDe("Bella");
  comprobar("R18: lo que no se anota queda vacío (no cero): Bella tiene solo las células", bella?.grasa_pct === null && bella.proteina_pct === null && bella.celulas_somaticas === 380000, JSON.stringify(bella));

  // Dalia: primero errores (no se guarda nada a medias) y después solo los kilos.
  await p.escribir(fila("Dalia", "kilos"), "2");
  await p.escribir(fila("Dalia", "grasa"), "abc");
  await enter(p, fila("Dalia", "grasa"));
  const errorGrasa = (await p.buscar('[data-cabra="Dalia"] [data-prueba="estado-fila"]', { condicion: (t) => t.includes("grasa") })).texto;
  comprobar("RF-32: una grasa que no es un número se rechaza con un mensaje claro y no se guarda nada", errorGrasa.includes("porcentaje de 0 a 100") && !pesajeDe("Dalia"), errorGrasa);
  await p.escribir(fila("Dalia", "kilos"), "");
  await p.escribir(fila("Dalia", "grasa"), "3,5");
  await enter(p, fila("Dalia", "grasa"));
  const errorKilos = (await p.buscar('[data-cabra="Dalia"] [data-prueba="estado-fila"]', { condicion: (t) => t.includes("kilos") })).texto;
  comprobar("RF-32: la calidad sin kilos no se guarda: pide anotar los kilos", errorKilos.includes("Anote los kilos") && !pesajeDe("Dalia"), errorKilos);
  await p.escribir(fila("Dalia", "kilos"), "2,2");
  await p.escribir(fila("Dalia", "grasa"), "");
  await enter(p, fila("Dalia", "kilos"));
  await p.buscar('[data-cabra="Dalia"] [data-prueba="estado-fila"]', { condicion: (t) => t.toLowerCase().includes("guardado") });
  const dalia = pesajeDe("Dalia");
  comprobar("RF-32: Dalia guardó solo los kilos, con la calidad vacía", dalia?.kilos === 2.2 && dalia.grasa_pct === null && dalia.celulas_somaticas === null, JSON.stringify(dalia));
  await p.captura("e8-02-ordeno-guardado");

  // ---------- CA-21: comparación de calidad por lactancia, con los vacíos ignorados ----------
  await p.clic('[data-pestana="calidad"]');
  await p.buscar('[data-prueba="tabla-calidad"]', { condicion: (t) => t.includes("Abril") && t.includes("Bella") && t.includes("Dalia") });
  // Cálculo manual, con las muestras de los datos de ejemplo más las de hoy:
  //   Abril, células: (850 + 920 + 780 + 1100 + 870 + 450) mil / 6 = 828 333; grasa (3,1 + 3,2 + 3,0 + 3,3 + 3,1 + 3,8) / 6 = 3,25.
  //   Bella, células: (340 + 410 + 380 + 450 + 360 + 380) mil / 6 = 386 667; la grasa de hoy está vacía: sigue con 5 muestras, 3,94.
  //   Dalia, células: (520 + 610 + 580) mil / 3 = 570 000; hoy no anotó calidad: sigue con 3 muestras.
  const abrilCs = await celdaCalidad(p, "Abril", "celulas");
  const bellaCs = await celdaCalidad(p, "Bella", "celulas");
  const bellaGrasa = await celdaCalidad(p, "Bella", "grasa");
  const daliaCs = await celdaCalidad(p, "Dalia", "celulas");
  const daliaProteina = await celdaCalidad(p, "Dalia", "proteina");
  comprobar("CA-21: Abril, células somáticas = 828.333 (6 muestras), como el cálculo manual", abrilCs === "828.333 (6 muestras)", abrilCs);
  comprobar("CA-21: Bella, células somáticas = 386.667 (6 muestras)", bellaCs === "386.667 (6 muestras)", bellaCs);
  comprobar("CA-21: el valor vacío de hoy no cuenta: la grasa de Bella sigue en 3,94 % con 5 muestras", bellaGrasa === "3,94 % (5 muestras)", bellaGrasa);
  comprobar("CA-21: Dalia, células = 570.000 con 3 muestras (lo vacío no baja el promedio) y proteína 3,05 % con 2", daliaCs === "570.000 (3 muestras)" && daliaProteina === "3,05 % (2 muestras)", `${daliaCs} / ${daliaProteina}`);
  comprobar("CA-21: la grasa de Abril = 3,25 % (6 muestras)", (await celdaCalidad(p, "Abril", "grasa")) === "3,25 % (6 muestras)");
  await p.captura("e8-03-calidad");

  // Tabla ordenable.
  await p.clic('[data-orden="celulas"]');
  let orden = await ordenCalidad(p);
  const sentido = await p.js(`return document.querySelector('[data-orden="celulas"]').closest("th").getAttribute("aria-sort")`);
  comprobar("Calidad: ordenar por células de menor a mayor (Bella, Dalia, Abril)", orden.join() === "Bella,Dalia,Abril" && sentido === "ascending", `${orden.join()} / ${sentido}`);
  await p.clic('[data-orden="celulas"]');
  orden = await ordenCalidad(p);
  comprobar("Calidad: al volver a hacer clic se invierte (Abril, Dalia, Bella)", orden.join() === "Abril,Dalia,Bella");
  await p.clic('[data-orden="grasa"]');
  orden = await ordenCalidad(p);
  comprobar("Calidad: ordenar por grasa de menor a mayor (Abril 3,25 · Dalia 3,5 · Bella 3,94)", orden.join() === "Abril,Dalia,Bella", orden.join());

  // Gráfico sencillo.
  await p.elegirOpcion('[data-prueba="calidad-dato"]', "Células somáticas (células por ml)");
  await p.buscar('[data-prueba="barras-calidad"]');
  let barras = await p.js(`return [...document.querySelectorAll('[data-prueba="barras-calidad"] g[data-barra]')].map((g) => g.dataset.barra)`);
  comprobar("Calidad: el gráfico muestra las tres cabras, de mayor a menor en células (Abril, Dalia, Bella)", barras.join() === "Abril,Dalia,Bella", barras.join());
  await p.elegirOpcion('[data-prueba="calidad-dato"]', "Grasa (%)");
  barras = await p.js(`return [...document.querySelectorAll('[data-prueba="barras-calidad"] g[data-barra]')].map((g) => g.dataset.barra)`);
  comprobar("Calidad: al elegir grasa el gráfico se reordena (Bella, Dalia, Abril)", barras.join() === "Bella,Dalia,Abril", barras.join());
  await p.captura("e8-04-calidad-grafico");

  // Detalle de una lactancia.
  await p.clic('[data-prueba="tabla-calidad"] [data-lactancia="Bella"] .enlace');
  const promedioDetalle = (await p.buscar('[data-prueba="promedio-celulas"]')).texto;
  comprobar("CA-21: el detalle de la lactancia de Bella trae el mismo promedio de células (386.667)", promedioDetalle === "386.667", promedioDetalle);
  const muestras = await p.js(`return document.querySelectorAll('[data-prueba="tabla-muestras-calidad"] tbody tr').length`);
  comprobar("El detalle lista las 6 muestras con calidad de Bella", muestras === 6, `${muestras} filas`);

  // ---------- RF-33: movimientos de ingresos y gastos ----------
  await p.clic('[data-pantalla="finanzas"]');
  const totalInicial = normalizar((await p.buscar('[data-prueba="movimientos-totales"]', { condicion: (t) => t.includes("movimientos") })).texto);
  comprobar("RF-33: los datos de ejemplo traen 8 movimientos: ingresos $ 3.400.000 y gastos $ 3.910.000", totalInicial === "8 movimientos · Ingresos $ 3.400.000 · Gastos $ 3.910.000", totalInicial);
  await p.captura("e8-05-movimientos");

  // Sin valor o con un valor que no es número: se rechaza.
  await p.escribir('[data-prueba="movimiento-valor"]', "abc");
  await p.clic('[data-prueba="guardar-movimiento"]');
  const errorValor = (await p.buscar('[data-prueba="formulario-movimiento"] [data-prueba="errores"]')).texto;
  comprobar("RF-33: un valor que no es número entero se rechaza y dice cómo escribirlo", errorValor.includes("número entero"), normalizar(errorValor));

  // Un gasto general.
  await p.elegirOpcion('[data-prueba="movimiento-categoria"]', "Alimento");
  await p.escribir('[data-prueba="movimiento-valor"]', "80.000");
  await p.escribir('[data-prueba="movimiento-descripcion"]', "Sal mineral (prueba)");
  await p.clic('[data-prueba="guardar-movimiento"]');
  await p.buscar('[data-prueba="formulario-movimiento"] .aviso--exito', { condicion: (t) => t.includes("anotado") });
  // Un ingreso asignado a un animal (Gema).
  await p.clic('[data-prueba="tipo-ingreso"]');
  await p.elegirOpcion('[data-prueba="movimiento-categoria"]', "Venta de animales");
  await p.escribir('[data-prueba="movimiento-valor"]', "600000");
  await p.clic('[data-prueba="asignacion-animal"]');
  await p.escribir('[data-prueba="movimiento-animal"]', "Gema");
  await p.clic(".selector__resultados button");
  await p.escribir('[data-prueba="movimiento-descripcion"]', "Venta de Gema (prueba)");
  await p.clic('[data-prueba="guardar-movimiento"]');
  await p.buscar('[data-prueba="tabla-movimientos"]', { condicion: (t) => t.includes("Venta de Gema (prueba)") });
  const totalDespues = normalizar((await p.buscar('[data-prueba="movimientos-totales"]', { condicion: (t) => t.startsWith("10 movimientos") })).texto);
  comprobar("RF-33: se anotaron un gasto y un ingreso: 10 movimientos, ingresos $ 4.000.000 y gastos $ 3.990.000", totalDespues === "10 movimientos · Ingresos $ 4.000.000 · Gastos $ 3.990.000", totalDespues);
  const asignado = normalizar(await texto(p, '[data-movimiento="Venta de Gema (prueba)"] [data-columna="asignado"]'));
  comprobar("RF-33: el ingreso queda asignado al animal y el gasto sin asignar se llama «Gasto general»", asignado.includes("Gema") && normalizar(await texto(p, '[data-movimiento="Sal mineral (prueba)"] [data-columna="asignado"]')) === "Gasto general", asignado);

  // Corregir y retirar.
  await p.clic('[data-movimiento="Sal mineral (prueba)"] [data-prueba="corregir-movimiento"]');
  await p.buscar('[data-prueba="formulario-movimiento"] h2', { condicion: (t) => t.includes("Corregir") });
  await p.escribir('[data-prueba="movimiento-valor"]', "100.000");
  await p.clic('[data-prueba="guardar-movimiento"]');
  await p.buscar('[data-movimiento="Sal mineral (prueba)"] [data-columna="valor"]', { condicion: (t) => normalizar(t) === "$ 100.000" });
  const historial = consultar(`SELECT h.valor_anterior, h.valor_nuevo FROM historial_cambios AS h JOIN movimiento_economico AS m ON m.id = h.registro_id WHERE m.descripcion = 'Sal mineral (prueba)' AND h.campo = 'valor' AND h.valor_anterior IS NOT NULL`);
  comprobar("RF-33: corregir el valor lo cambia y deja el anterior en el historial", historial.length === 1 && historial[0].valor_anterior === "80000" && historial[0].valor_nuevo === "100000", JSON.stringify(historial));
  await p.escribir('[data-prueba="movimiento-valor"]', "5000");
  await p.escribir('[data-prueba="movimiento-descripcion"]', "Prueba para retirar (prueba)");
  await p.clic('[data-prueba="guardar-movimiento"]');
  await p.buscar('[data-prueba="tabla-movimientos"]', { condicion: (t) => t.includes("Prueba para retirar") });
  await p.clic('[data-movimiento="Prueba para retirar (prueba)"] [data-prueba="retirar-movimiento"]');
  await p.clic('[data-prueba="confirmar-retirar-movimiento"]');
  await p.buscar('[data-prueba="movimientos-totales"]', { condicion: (t) => t.startsWith("10 movimientos") });
  const retirado = consultar(`SELECT eliminado_en FROM movimiento_economico WHERE descripcion = 'Prueba para retirar (prueba)'`);
  comprobar("RF-33: retirar es un borrado lógico: deja de contar, pero la fila sigue en la base", retirado.length === 1 && retirado[0].eliminado_en !== null);

  // Filtro por periodo: desde hace 20 días hasta hoy.
  await p.escribir('[data-prueba="filtro-desde"]', haceDias(20));
  await p.escribir('[data-prueba="filtro-hasta"]', HOY);
  const filtrado = normalizar((await p.buscar('[data-prueba="movimientos-totales"]', { condicion: (t) => t.startsWith("7 movimientos") })).texto);
  // Entran: antibiótico 120.000, jornales 1.500.000, desparasitante 90.000, venta de leche 2.300.000 y 1.100.000, sal 100.000 y la venta de Gema 600.000.
  comprobar("RF-33: el filtro por periodo (últimos 20 días) trae 7 movimientos: ingresos $ 4.000.000 y gastos $ 1.810.000", filtrado === "7 movimientos · Ingresos $ 4.000.000 · Gastos $ 1.810.000", filtrado);
  await p.elegirOpcion('[data-prueba="filtro-tipo"]', "Ingresos");
  const soloIngresos = normalizar((await p.buscar('[data-prueba="movimientos-totales"]', { condicion: (t) => t.startsWith("3 movimientos") })).texto);
  comprobar("RF-33: el filtro por tipo deja solo los ingresos", soloIngresos === "3 movimientos · Ingresos $ 4.000.000 · Gastos $ 0", soloIngresos);
  await p.captura("e8-06-movimientos-filtrados");
  await p.clic('[data-prueba="filtros-movimientos"] .boton--secundario');

  // ---------- CA-22 / RF-34: resumen por finca, por lote y por animal ----------
  await p.clic('[data-pestana="resumen"]');
  await p.buscar('[data-prueba="resumen-finca"]');
  const ingresos = (await p.buscar('[data-prueba="resumen-ingresos"]')).texto;
  const gastos = (await p.buscar('[data-prueba="resumen-gastos"]')).texto;
  const rentabilidad = (await p.buscar('[data-prueba="resumen-rentabilidad"]')).texto;
  const generales = (await p.buscar('[data-prueba="resumen-generales"]')).texto;
  // A mano: ingresos 2.300.000 + 1.100.000 + 600.000 = 4.000.000; gastos 3.910.000 + 100.000 = 4.010.000; rentabilidad −10.000.
  comprobar("CA-22: finca, ingresos $ 4.000.000", normalizar(ingresos) === "$ 4.000.000", ingresos);
  comprobar("CA-22: finca, gastos $ 4.010.000", normalizar(gastos) === "$ 4.010.000", gastos);
  comprobar("CA-22: rentabilidad = ingresos − gastos = −$ 10.000", normalizar(rentabilidad) === "−$ 10.000", rentabilidad);
  comprobar("CA-22: los gastos sin animal ni lote salen aparte: $ 2.800.000 (1.200.000 + 1.500.000 + 100.000)", normalizar(generales) === "$ 2.800.000", generales);
  const desglose = normalizar(await texto(p, '[data-prueba="resumen-desglose"]'));
  comprobar("CA-22: el desglose dice $ 940.000 de lotes y $ 270.000 de animales", desglose.includes("lotes: $ 940.000") && desglose.includes("animales: $ 270.000"), desglose);
  const celdaLote = (lote, col) => texto(p, `[data-prueba="tabla-resumen-lotes"] [data-lote="${lote}"] [data-columna="${col}"]`).then(normalizar);
  comprobar(
    "CA-22: costo por lote = gastos asignados al lote; Ordeño (850.000 de gasto y 1.100.000 de ingreso) = +$ 250.000; Levante (90.000) = −$ 90.000",
    (await celdaLote("Ordeño", "gastos")) === "$ 850.000" && (await celdaLote("Ordeño", "rentabilidad")) === "$ 250.000" && (await celdaLote("Levante", "gastos")) === "$ 90.000" && (await celdaLote("Levante", "rentabilidad")) === "−$ 90.000",
  );
  const celdaAnimal = (animal, col) => texto(p, `[data-prueba="tabla-resumen-animales"] [data-animal="${animal}"] [data-columna="${col}"]`).then(normalizar);
  comprobar(
    "CA-22: costo por cabra = gastos asignados al animal: Canela $ 150.000 (monta), Bella $ 120.000, Gema $ 0 con ingreso de $ 600.000",
    (await celdaAnimal("Canela", "costo")) === "$ 150.000" && (await celdaAnimal("Bella", "costo")) === "$ 120.000" && (await celdaAnimal("Bella", "rentabilidad")) === "−$ 120.000" && (await celdaAnimal("Gema", "costo")) === "$ 0" && (await celdaAnimal("Gema", "rentabilidad")) === "$ 600.000",
  );
  const sinProrrateo = await p.js(`return document.querySelectorAll('[data-prueba="tabla-resumen-animales"] [data-animal]').length`);
  comprobar("CA-22: sin el reparto, solo aparecen los 3 animales con movimientos", sinProrrateo === 3, `${sinProrrateo} animales`);
  await p.captura("e8-07-resumen");

  // Prorrateo opcional (suposición): el cálculo manual sale de la base, de forma independiente de la pantalla.
  await p.clic('[data-prueba="resumen-prorrateo"]');
  await p.buscar('[data-prueba="tabla-resumen-animales"] [data-columna="deLote"]');
  const activos = consultar(`SELECT a.nombre, l.nombre AS lote FROM animal AS a LEFT JOIN lote AS l ON l.id = a.lote_id WHERE a.estado = 'activo' AND a.en_hato = 1 AND a.origen <> 'externo' AND a.eliminado_en IS NULL`);
  const miembros = (lote) => activos.filter((a) => a.lote === lote).length;
  const gastoDeLote = { Ordeño: 850000, Levante: 90000 };
  const directos = { Bella: 120000, Canela: 150000 };
  const esperado = (a) => Math.round((directos[a.nombre] ?? 0) + (a.lote ? (gastoDeLote[a.lote] ?? 0) / miembros(a.lote) : 0) + 2800000 / activos.length);
  const verificados = [];
  let coincide = true;
  for (const nombre of ["Bella", "Canela", "Gema", "Zeus"]) {
    const a = activos.find((x) => x.nombre === nombre);
    const mostrado = aNumero(await celdaAnimal(nombre, "costo"));
    verificados.push(`${nombre} ${mostrado}/${esperado(a)}`);
    if (mostrado !== esperado(a)) coincide = false;
  }
  comprobar(`CA-22: con el reparto, el costo de cada animal = lo asignado + su parte del lote + su parte de los generales (${activos.length} animales activos)`, coincide, verificados.join(", "));
  const costos = await p.js(`return [...document.querySelectorAll('[data-prueba="tabla-resumen-animales"] [data-columna="costo"]')].map((c) => c.innerText)`);
  const suma = costos.reduce((s, c) => s + aNumero(c), 0);
  comprobar("CA-22: nada se pierde: la suma de los costos repartidos es el total de gastos (± redondeo)", Math.abs(suma - 4010000) <= activos.length, `${suma} de 4.010.000`);
  const finca2 = normalizar(await texto(p, '[data-prueba="resumen-finca"]'));
  comprobar("CA-22: el reparto no cambia los totales de la finca", finca2.includes("$ 4.010.000") && finca2.includes("$ 4.000.000"));
  comprobar("El reparto se presenta como una suposición, no como un dato", normalizar(await texto(p, '[data-prueba="resumen-financiero"]')).includes("es una suposición"));
  await p.captura("e8-08-resumen-con-reparto");
  await p.clic('[data-prueba="resumen-prorrateo"]');
  // Orden de la tabla por animal.
  await p.clic('[data-orden="rentabilidad"]');
  const primero = await p.js(`return document.querySelector('[data-prueba="tabla-resumen-animales"] tbody tr').dataset.animal`);
  comprobar("La tabla por animal se ordena por rentabilidad (el menor primero: Canela −$ 150.000)", primero === "Canela", primero);

  // ---------- RF-33: categorías editables ----------
  await p.clic('[data-pestana="categorias"]');
  await p.buscar('[data-prueba="tabla-categorias-gasto"]');
  const gastosIniciales = await p.js(`return [...document.querySelectorAll('[data-prueba="tabla-categorias-gasto"] tr')].map((r) => r.dataset.categoria)`);
  const ingresosIniciales = await p.js(`return [...document.querySelectorAll('[data-prueba="tabla-categorias-ingreso"] tr')].map((r) => r.dataset.categoria)`);
  comprobar(
    "RF-33: vienen precargadas las categorías: alimento, compra de animales (la agrega la Etapa 9), medicamentos, mano de obra y montas (gastos), venta de leche y de animales (ingresos)",
    gastosIniciales.join() === "Alimento,Compra de animales,Mano de obra,Medicamentos,Montas y pajillas" && ingresosIniciales.join() === "Venta de animales,Venta de leche",
    `${gastosIniciales.join(", ")} | ${ingresosIniciales.join(", ")}`,
  );
  await p.escribir('[data-prueba="categoria-nombre"]', "Veterinario (prueba)");
  await p.clic('[data-prueba="agregar-categoria"]');
  await p.buscar('[data-categoria="Veterinario (prueba)"]');
  await p.escribir('[data-prueba="categoria-nombre"]', "alimento");
  await p.clic('[data-prueba="agregar-categoria"]');
  const duplicada = (await p.buscar('[data-prueba="errores"]')).texto;
  comprobar("RF-33: una categoría repetida se rechaza", duplicada.includes("Ya existe"), normalizar(duplicada));
  await p.clic('[data-categoria="Veterinario (prueba)"] [data-prueba="renombrar-categoria"]');
  await p.escribir('[data-prueba="categoria-nombre-editar"]', "Veterinario y exámenes (prueba)");
  await p.clic('[data-prueba="guardar-categoria"]');
  await p.buscar('[data-categoria="Veterinario y exámenes (prueba)"]');
  await p.clic('[data-categoria="Mano de obra"] [data-prueba="activar-categoria"]');
  await p.buscar('[data-categoria="Mano de obra"]', { condicion: (t) => /desactivada/i.test(t) });
  await p.clic('[data-pestana="movimientos"]');
  await p.buscar('[data-prueba="movimiento-categoria"]');
  const ofrecidas = await p.js(`return [...document.querySelector('[data-prueba="movimiento-categoria"]').options].map((o) => o.textContent.trim())`);
  comprobar("RF-33: una categoría desactivada ya no se ofrece, y la nueva sí", !ofrecidas.includes("Mano de obra") && ofrecidas.includes("Veterinario y exámenes (prueba)"), ofrecidas.join(", "));
  await p.clic('[data-pestana="categorias"]');
  await p.clic('[data-categoria="Mano de obra"] [data-prueba="activar-categoria"]');
  await p.buscar('[data-categoria="Mano de obra"]', { condicion: (t) => !/desactivada/i.test(t) });
  await p.captura("e8-09-categorias");

  // ---------- R30: al guardar una monta con costo, el programa ofrece anotar el gasto ----------
  const montaNueva = async (hembra, costo) => {
    await p.clic('[data-pantalla="reproduccion"]');
    await p.clic('[data-pestana="servicios"]');
    await p.escribir('[data-prueba="servicio-hembra"]', hembra);
    await p.clic(".selector__resultados button");
    await p.clic('[data-prueba="procedencia-otra_finca"]');
    await p.escribir('[data-prueba="servicio-macho"]', "Titán");
    await p.clic(".selector__resultados button");
    await p.escribir('[data-prueba="servicio-costo"]', costo);
    await p.clic('[data-prueba="guardar-servicio"]');
    return normalizar((await p.buscar('[data-prueba="oferta-gasto-monta"]')).texto);
  };
  const oferta = await montaNueva("Abril", "200.000");
  comprobar("R30: una monta con costo ofrece anotarlo como gasto de la hembra servida", oferta.includes("$ 200.000") && oferta.includes("Abril"), oferta);
  await p.js("document.querySelector('[data-prueba=oferta-gasto-monta]').scrollIntoView({ block: 'center' })");
  await p.captura("e8-10-oferta-gasto");
  await p.clic('[data-prueba="anotar-gasto-monta"]');
  await p.buscar('[data-prueba="aviso-exito"]', { condicion: (t) => normalizar(t).includes("Gasto de $ 200.000 anotado") });
  const gastoMonta = consultar(
    `SELECT m.valor, m.fecha, c.nombre AS categoria, a.nombre AS animal, m.descripcion FROM movimiento_economico AS m
     JOIN categoria_economica AS c ON c.id = m.categoria_id JOIN animal AS a ON a.id = m.animal_id
     WHERE m.evento_reproductivo_id IS NOT NULL AND m.eliminado_en IS NULL AND m.descripcion LIKE 'Monta de Abril%'`,
  );
  comprobar(
    "R30: el gasto queda con el costo, la fecha del servicio, la categoría «Montas y pajillas» y la hembra",
    gastoMonta.length === 1 && gastoMonta[0].valor === 200000 && gastoMonta[0].fecha === HOY && gastoMonta[0].categoria === "Montas y pajillas" && gastoMonta[0].animal === "Abril",
    JSON.stringify(gastoMonta),
  );
  const segunda = await montaNueva("Brisa", "120.000");
  await p.clic('[data-prueba="gasto-monta-ahora-no"]');
  const ofertaCerrada = await p.js("return !document.querySelector('[data-prueba=oferta-gasto-monta]')");
  const sinGasto = consultar(`SELECT count(*) AS n FROM movimiento_economico WHERE descripcion LIKE 'Monta de Brisa%'`)[0].n;
  comprobar("R30: si se dice «Ahora no», no se crea ningún gasto", segunda.includes("$ 120.000") && ofertaCerrada && sinGasto === 0);

  // Desde la ficha del semental: el gasto pendiente de la monta de Dalia (de los datos de ejemplo), sin duplicar los demás.
  await p.clic('[data-pantalla="animales"]');
  await p.clic('[data-pestana="externos"]');
  await p.buscar('[data-prueba="tabla-externos"]', { condicion: (t) => t.includes("Titán") });
  await p.clic('[data-prueba="tabla-externos"] tbody tr .enlace');
  await p.buscar('[data-prueba="titulo-animal"]', { condicion: (t) => t.startsWith("Titán") });
  await p.clic('[data-pestana="servicios"]');
  await p.buscar('[data-prueba="tabla-servicios-macho"]', { condicion: (t) => t.includes("Dalia") });
  const columnasMacho = await p.js(`return [...document.querySelectorAll('[data-prueba="tabla-servicios-macho"] thead th')].map((t) => t.innerText)`);
  comprobar("R30: la ficha del semental trae la columna «Gasto» para el propietario", columnasMacho.includes("Gasto"), columnasMacho.join(" | "));
  const estadoDe = (hembra) => p.js(`return document.querySelector('[data-prueba="tabla-servicios-macho"] [data-servicio="${hembra}"]')?.innerText ?? ""`).then(normalizar);
  comprobar("R30: Canela y Abril ya tienen el gasto anotado; Dalia, no", /gasto anotado/i.test(await estadoDe("Canela")) && /gasto anotado/i.test(await estadoDe("Abril")) && !/gasto anotado/i.test(await estadoDe("Dalia")));
  await p.clic('[data-prueba="tabla-servicios-macho"] [data-servicio="Dalia"] [data-prueba="anotar-gasto-servicio"]');
  await p.clic('[data-prueba="anotar-gasto-monta"]');
  await p.buscar('[data-prueba="gasto-monta-anotado"]', { condicion: (t) => normalizar(t).includes("$ 150.000") });
  await p.buscar('[data-prueba="tabla-servicios-macho"] [data-servicio="Dalia"]', { condicion: (t) => /gasto anotado/i.test(t) });
  comprobar("R30: desde la ficha se anota el gasto de la monta de Dalia", /gasto anotado/i.test(await estadoDe("Dalia")));
  const enlazados = consultar(`SELECT count(*) AS n FROM movimiento_economico WHERE evento_reproductivo_id IS NOT NULL AND eliminado_en IS NULL`)[0].n;
  comprobar("R30: hay tres gastos de montas enlazados (Canela, Abril y Dalia), uno por servicio", enlazados === 3, `${enlazados} gastos`);
  await p.captura("e8-11-servicios-semental");
  await p.clic('[data-pantalla="finanzas"]');
  const deMonta = await p.buscar('[data-prueba="tabla-movimientos"]', { condicion: (t) => (t.match(/Viene de una monta/g) ?? []).length === 3 });
  comprobar("R30: en Finanzas, los tres gastos se marcan «Viene de una monta»", (deMonta.texto.match(/Viene de una monta/g) ?? []).length === 3);

  // ---------- R23: el operario no ve Finanzas, pero sí anota la calidad de la leche ----------
  await p.clic('[data-pantalla="ajustes"]');
  await p.clic('[data-pestana="usuarios"]');
  await p.escribir('[data-prueba="usuario-nombre"]', "Luis");
  await p.elegirOpcion('[data-prueba="usuario-rol"]', "Operario");
  await p.clic('[data-prueba="agregar-usuario"]');
  await p.buscar("table", { condicion: (t) => t.includes("Luis") });
  await p.clic('[data-prueba="cambiar-usuario"]');
  await entrar(p, "Luis");
  const menuOperario = await p.js("return [...document.querySelectorAll('[data-pantalla]')].map((b) => b.dataset.pantalla)");
  comprobar("R23: el operario no ve «Finanzas» en el menú", !menuOperario.includes("finanzas") && menuOperario.includes("leche"), menuOperario.join(", "));
  await p.clic('[data-pantalla="leche"]');
  await p.clic('[data-pestana="ordeno"]');
  await p.elegirOpcion('[data-prueba="ordeno-jornada"]', "Tarde");
  await p.buscar('[data-prueba="ordeno-progreso"]', { condicion: (t) => / de 3/.test(t) });
  await p.clic('[data-prueba="ordeno-calidad"]');
  await p.buscar('[data-cabra="Bella"] [data-prueba="celulas"]');
  const habilitado = await p.js(`return !document.querySelector('[data-cabra="Bella"] [data-prueba="celulas"]').disabled`);
  await p.escribir(fila("Bella", "kilos"), "2,4");
  await p.escribir(fila("Bella", "celulas"), "420000");
  await enter(p, fila("Bella", "celulas"));
  await p.buscar('[data-cabra="Bella"] [data-prueba="estado-fila"]', { condicion: (t) => t.toLowerCase().includes("guardado") });
  const bellaTarde = consultar(`SELECT p.celulas_somaticas AS cs FROM pesaje_leche AS p JOIN lactancia AS l ON l.id = p.lactancia_id JOIN animal AS a ON a.id = l.hembra_id WHERE a.nombre = 'Bella' AND p.fecha = '${HOY}' AND p.jornada = 'tarde'`)[0];
  comprobar("R23: el operario anota la calidad de la leche junto al ordeño", habilitado && bellaTarde?.cs === 420000, JSON.stringify(bellaTarde));
  await p.clic('[data-pestana="calidad"]');
  await p.buscar('[data-prueba="tabla-calidad"]', { condicion: (t) => t.includes("Bella") });
  // A mano: (340 + 410 + 380 + 450 + 360 + 380 + 420) mil / 7 = 391 429 (la muestra de la tarde la anotó el operario).
  comprobar("R23: el operario ve la comparación de calidad: Bella 391.429 con 7 muestras", (await celdaCalidad(p, "Bella", "celulas")) === "391.429 (7 muestras)", await celdaCalidad(p, "Bella", "celulas"));
  await p.clic('[data-pantalla="animales"]');
  await p.clic('[data-pestana="externos"]');
  await p.buscar('[data-prueba="tabla-externos"]', { condicion: (t) => t.includes("Titán") });
  await p.clic('[data-prueba="tabla-externos"] tbody tr .enlace');
  await p.buscar('[data-prueba="titulo-animal"]', { condicion: (t) => t.startsWith("Titán") });
  await p.clic('[data-pestana="servicios"]');
  await p.buscar('[data-prueba="tabla-servicios-macho"]');
  const columnasOperario = await p.js(`return [...document.querySelectorAll('[data-prueba="tabla-servicios-macho"] thead th')].map((t) => t.innerText)`);
  const botones = await p.js(`return document.querySelectorAll('[data-prueba="anotar-gasto-servicio"]').length`);
  comprobar("R23: en la ficha del semental el operario no ve la columna «Gasto» ni los botones para anotarlo", !columnasOperario.includes("Gasto") && botones === 0, columnasOperario.join(" | "));
  await p.captura("e8-12-operario");
  await p.cerrar();
} catch (error) {
  comprobar("La prueba terminó sin errores", false, String(error?.stack ?? error));
} finally {
  driver.kill();
}
process.exit(registro.terminar() === 0 ? 0 : 1);
