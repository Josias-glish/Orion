// Genera ejemplos del certificado interno y del expediente para ANCO con los datos de ejemplo, en una base en memoria.
// Sirve para revisar a ojo cómo se ven los documentos sin abrir el programa. No toca ninguna base de datos.
// Uso: npm run documentos-de-ejemplo -- [carpeta]   (por defecto: documentos-de-ejemplo/)
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fechaLocal, marcaDeTiempo } from "../src/dominio/fechas";
import { armarExpediente } from "../src/dominio/expediente";
import { crearBaseDePrueba } from "../src/datos/conexion-memoria";
import { listarAnimales } from "../src/datos/repositorios/animales";
import { datosCertificado, datosExpediente, siguienteNumero } from "../src/datos/repositorios/documentos";
import { definicionCertificado } from "../src/documentos/certificado";
import { definicionExpediente, expedienteCsv } from "../src/documentos/expediente";
import { generarPdfEnNode } from "../src/documentos/pdf-node";
import { cargarDatosDeEjemplo } from "./datos-de-ejemplo";

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
  console.log(`Documentos de ejemplo en ${carpeta}`);
} finally {
  db.cerrar();
}
