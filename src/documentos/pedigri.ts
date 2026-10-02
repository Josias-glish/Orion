// R31: pedigrí en una tabla de pdfmake (tres generaciones, o cuatro) y pedigrí imprimible de cualquier animal,
// tenga o no registro propio. Los ancestros de otras fincas aparecen con su propietario y su número de asociación.
import type { Content, ContentStack, ContentText, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import { columnasDelPedigri, type DatosPedigri } from "../dominio/pedigri";
import type { AncestroInstantanea } from "../dominio/registros";
import { textos } from "../textos/es";
import { composicionTexto, ESTILOS, fechaTexto, recuadro, tablaDatos } from "./comun";

const t = textos.registros;

/** Celda de un ancestro: nombre, identificador, registro de asociación, propietario si es de otra finca y «sin verificar». */
export function celdaAncestroPedigri(a: AncestroInstantanea | null, compacta: boolean): ContentStack | ContentText {
  if (!a) return { text: t.desconocido, style: "desconocido" };
  const pequeno = compacta ? "diminuto" : "pequeno";
  const nombre = a.nombre ?? a.identificador ?? t.desconocido;
  return {
    stack: [
      { text: nombre, bold: true, fontSize: compacta ? 8 : 10 },
      ...(a.nombre && a.identificador && a.identificador !== a.registroAsociacion ? [{ text: a.identificador, style: pequeno }] : []),
      ...(a.registroAsociacion ? [{ text: `${t.registroAsociacion}: ${a.registroAsociacion}`, style: pequeno }] : []),
      ...(a.externo && a.propietario ? [{ text: t.otraFinca(a.propietario), style: pequeno, italics: true }] : []),
      ...(a.sinVerificar ? [{ text: t.sinVerificar, style: "sinVerificar" }] : []),
    ],
  };
}

/**
 * Tabla del pedigrí: una columna para el animal y una por generación, con una fila por ancestro de la última
 * generación; cada celda abarca las filas de sus propios padres.
 */
export function tablaPedigri(nombreDelAnimal: string, pedigri: readonly AncestroInstantanea[], generaciones: number): Content {
  const columnas = columnasDelPedigri(pedigri, generaciones);
  const filas = 2 ** generaciones;
  const compacta = generaciones >= 4;
  const cuerpo: TableCell[][] = Array.from({ length: filas }, () => Array.from({ length: generaciones + 1 }, () => ({}) as TableCell));
  cuerpo[0][0] = { text: nombreDelAnimal, bold: true, fontSize: 12, rowSpan: filas, margin: [0, 4, 0, 0] };
  columnas.forEach((ancestros, i) => {
    const alto = 2 ** (generaciones - (i + 1));
    ancestros.forEach((a, k) => {
      cuerpo[k * alto][i + 1] = { ...celdaAncestroPedigri(a, compacta), rowSpan: alto, margin: [2, 2, 2, 2] };
    });
  });
  const ancho = generaciones >= 4 ? ["auto", "*", "*", "*", "*"] : ["auto", "*", "*", "*"];
  // Alto mínimo de cada fila de la última generación: así una celda de abuelos con varias líneas (nombre, identificador,
  // registro de asociación) cabe en las dos filas que ocupa, sin pisar a la siguiente.
  const altoMinimo = compacta ? 22 : 24;
  return {
    table: { widths: ancho, body: cuerpo, dontBreakRows: true, heights: () => altoMinimo },
    layout: {
      hLineColor: () => "#9a9a9a",
      vLineColor: () => "#9a9a9a",
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
    },
  } as Content;
}

/** Encabezados de las columnas del pedigrí (padres, abuelos, bisabuelos y, si se piden, tatarabuelos). */
export function titulosDelPedigri(generaciones: number): string[] {
  return [t.animal, t.padres, t.abuelos, t.bisabuelos, t.tatarabuelos].slice(0, generaciones + 1);
}

/** Pedigrí imprimible de cualquier animal. Es informativo: no es un certificado ni lleva número propio. */
export function definicionPedigri(d: DatosPedigri, generaciones: 3 | 4 = 3): TDocumentDefinitions {
  const a = d.animal;
  const nombre = a.nombre ?? a.identificador ?? textos.animales.sinNombre;
  const etiqueta = textos.registros.pedigri;
  return {
    pageSize: "LETTER",
    pageOrientation: "landscape",
    pageMargins: [40, 40, 40, 50],
    info: { title: `${etiqueta.titulo} — ${nombre}`, subject: etiqueta.aviso, creator: textos.app.nombre, author: d.finca.nombre },
    defaultStyle: { fontSize: 10 },
    styles: ESTILOS,
    footer: (actual: number, total: number): Content => ({
      margin: [40, 16, 40, 0],
      columns: [
        { text: etiqueta.aviso, style: "pie", bold: true },
        { text: t.pagina(actual, total), style: "pie", alignment: "right", width: 90 },
      ],
    }),
    content: [
      { text: d.finca.nombre, style: "finca" },
      {
        text: [d.finca.criadero && `${t.criadero}: ${d.finca.criadero}`, d.finca.municipio && `${t.municipio}: ${d.finca.municipio}`].filter(Boolean).join(" · "),
        style: "subtitulo",
      },
      { text: `${etiqueta.titulo}: ${nombre}`, style: "titulo" },
      { text: `${etiqueta.fecha}: ${fechaTexto(d.fecha)} · ${t.generadoCon}`, style: "pequeno" },
      recuadro({ text: etiqueta.aviso, style: "aviso" }),
      tablaDatos([
        [t.identificadores, [a.identificador, a.registroAsociacion && `${t.registroAsociacion}: ${a.registroAsociacion}`].filter(Boolean).join(" · ")],
        [textos.ficha.campos.sexo, textos.comun.sexo[a.sexo]],
        [textos.ficha.campos.nacimiento, fechaTexto(a.fechaNacimiento)],
        [textos.ficha.campos.libro, a.libro ?? ""],
        [textos.ficha.razaTitulo, composicionTexto(a.composicion)],
        ...(a.origen === "externo" && a.propietario ? ([[t.propietario, t.otraFinca(a.propietario)]] as [string, string][]) : []),
        [
          t.numero,
          a.registro ? etiqueta.registro(a.registro.numero, t.estados[a.registro.estado]) : etiqueta.sinRegistro,
        ],
      ]),
      // Con cuatro generaciones (16 filas) la tabla va sola en la hoja siguiente.
      { text: t.pedigriTitulo(generaciones), style: "seccion", pageBreak: generaciones === 4 ? "before" : undefined },
      tablaPedigri(nombre, d.pedigri, generaciones),
    ],
  };
}
