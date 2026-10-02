// Genera ejemplos del certificado interno, el expediente para ANCO y (Etapa 7) el certificado de registro propio, el libro
// genealógico (PDF y Excel) y el pedigrí imprimible; y (Etapa 9) el inventario del hato y la hoja de venta con pedigrí, en
// PDF y Excel, con los datos de ejemplo, en una base en memoria.
// Sirve para revisar a ojo cómo se ven los documentos sin abrir el programa. No toca ninguna base de datos.
// Uso: npm run documentos-de-ejemplo -- [carpeta]   (por defecto: documentos-de-ejemplo/)
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fechaLocal, marcaDeTiempo } from "../src/dominio/fechas";
import { armarExpediente } from "../src/dominio/expediente";
import { crearBaseDePrueba } from "../src/datos/conexion-memoria";
import { listarAnimales } from "../src/datos/repositorios/animales";
import { datosCertificado, datosExpediente, siguienteNumero } from "../src/datos/repositorios/documentos";
import { datosPedigri, emitirEnLote, emitirRegistro, listarRegistrosDelLibro, obtenerRegistro } from "../src/datos/repositorios/registros";
import { datosHojaVenta, datosInventario } from "../src/datos/repositorios/traspasos";
import { definicionCertificado } from "../src/documentos/certificado";
import { definicionExpediente, expedienteCsv } from "../src/documentos/expediente";
import { definicionHojaVenta, hojasExcelHojaVenta } from "../src/documentos/hoja-venta";
import { definicionInventario, hojasExcelInventario } from "../src/documentos/inventario";
import { generarXlsx } from "../src/documentos/excel";
import { definicionLibro, hojaLibro } from "../src/documentos/libro";
import { generarPdfEnNode } from "../src/documentos/pdf-node";
import { definicionPedigri } from "../src/documentos/pedigri";
import { definicionRegistroPropio } from "../src/documentos/registro-propio";
import { armarHojaVenta } from "../src/dominio/hoja-venta";
import { filasDelLibro } from "../src/dominio/libro-genealogico";
import { cargarDatosDeEjemplo } from "./datos-de-ejemplo";
import { cargarTraspasosDeEjemplo } from "./traspasos-de-ejemplo";

const carpeta = resolve(process.argv[2] ?? "documentos-de-ejemplo");
mkdirSync(carpeta, { recursive: true });
const db = crearBaseDePrueba();
try {
  await cargarDatosDeEjemplo(db, fechaLocal());
  const [{ id: usuarioId }] = await db.consultar<{ id: string }>("SELECT id FROM usuario LIMIT 1");
  const contexto = { usuarioId, rol: "propietario" as const, marcaTiempo: marcaDeTiempo() };
  const id = async (arete: string) => (await listarAnimales(db, { texto: arete }))[0].id;

  const certificado = await datosCertificado(db, await id("EJ-10"), contexto);
  writeFileSync(join(carpeta, "certificado-interno-Estrella.pdf"), await generarPdfEnNode(definicionCertificado(certificado)));

  for (const [arete, nombre] of [
    ["EJ-12", "Gema"],
    ["EJ-01", "Zeus"],
  ]) {
    const expediente = armarExpediente(await datosExpediente(db, await id(arete)));
    const meta = { numero: await siguienteNumero(db, "asociacion", fechaLocal()), fechaEmision: fechaLocal(), finca: certificado.finca.nombre };
    writeFileSync(join(carpeta, `expediente-${nombre}.pdf`), await generarPdfEnNode(definicionExpediente(expediente, meta)));
    writeFileSync(join(carpeta, `expediente-${nombre}.csv`), expedienteCsv(expediente));
  }

  // Etapa 7: registros emitidos con los datos de ejemplo, su certificado, el libro y un pedigrí.
  const hoy = fechaLocal();
  const estrella = await emitirRegistro(db, await id("EJ-10"), contexto, { hoy });
  await emitirEnLote(db, [await id("EJ-06"), await id("EJ-07"), await id("EJ-08"), await id("EJ-01")], contexto, { hoy });
  const instantanea = (await obtenerRegistro(db, estrella.registroId))!.instantanea!;
  writeFileSync(join(carpeta, "registro-propio-Estrella.pdf"), await generarPdfEnNode(definicionRegistroPropio(instantanea)));
  const filas = filasDelLibro(await listarRegistrosDelLibro(db), {});
  const descripcion = {
    finca: certificado.finca,
    fecha: hoy,
    filtros: { libro: null, raza: null, desde: null, hasta: null, incluirAnulados: false },
  };
  writeFileSync(join(carpeta, "libro-genealogico.pdf"), await generarPdfEnNode(definicionLibro(filas, descripcion)));
  writeFileSync(join(carpeta, "libro-genealogico.xlsx"), await generarXlsx([hojaLibro(filas)]));
  writeFileSync(join(carpeta, "pedigri-Roble.pdf"), await generarPdfEnNode(definicionPedigri(await datosPedigri(db, await id("EJ-17"), hoy), 3)));
  // Etapa 9: el inventario del hato y la hoja de venta de Cacique (EJ-08, vendido en los datos de ejemplo), con su pedigrí.
  await cargarTraspasosDeEjemplo(db, () => contexto, hoy);
  const inventario = await datosInventario(db, hoy);
  const fincaInventario = { nombre: certificado.finca.nombre, criadero: null, municipio: null };
  writeFileSync(join(carpeta, "inventario-del-hato.pdf"), await generarPdfEnNode(definicionInventario(inventario, { finca: fincaInventario, generado: hoy })));
  writeFileSync(join(carpeta, "inventario-del-hato.xlsx"), await generarXlsx(hojasExcelInventario(inventario)));
  const hoja = armarHojaVenta(await datosHojaVenta(db, await id("EJ-08"), { hoy }), { incluirProduccion: false });
  writeFileSync(join(carpeta, "hoja-de-venta-Cacique.pdf"), await generarPdfEnNode(definicionHojaVenta(hoja)));
  writeFileSync(join(carpeta, "hoja-de-venta-Cacique.xlsx"), await generarXlsx(hojasExcelHojaVenta(hoja)));
  console.log(`Documentos de ejemplo en ${carpeta}`);
} finally {
  db.cerrar();
}
