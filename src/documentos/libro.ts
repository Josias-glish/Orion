// R31: libro genealógico del criadero en PDF y en Excel. Las dos salidas salen de las mismas filas (las de las
// instantáneas de los registros emitidos), así que coinciden entre sí y con los registros (CA-20).
import type { Content, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import type { FilaLibro } from "../dominio/libro-genealogico";
import { formatearFecha } from "../dominio/fechas";
import { textos } from "../textos/es";
import { composicionTexto, ESTILOS, fechaTexto, recuadro } from "./comun";
import { fechaParaExcel, type HojaExcel } from "./excel";
import { AVISO_REGISTRO_PROPIO } from "./registro-propio";

const t = textos.registros.libroGenealogico;
const e = textos.registros;

export interface DescripcionLibro {
  finca: { nombre: string; criadero: string | null; municipio: string | null };
  fecha: string;
  filtros: { libro: string | null; raza: string | null; desde: string | null; hasta: string | null; incluirAnulados: boolean };
}

/** Los filtros aplicados, en español, para que se vean en el documento. */
export function textoDeFiltros(f: DescripcionLibro["filtros"]): string {
  const partes = [
    f.libro && t.libro(f.libro),
    f.raza && t.raza(f.raza),
    (f.desde || f.hasta) && t.periodo(f.desde ? formatearFecha(f.desde) : undefined, f.hasta ? formatearFecha(f.hasta) : undefined),
    f.incluirAnulados && t.incluyeAnulados,
  ].filter(Boolean);
  return partes.length > 0 ? partes.join(" · ") : t.sinFiltros;
}

export function definicionLibro(filas: readonly FilaLibro[], d: DescripcionLibro): TDocumentDefinitions {
  const conEstado = d.filtros.incluirAnulados;
  const titulos = [t.columnas.numero, t.columnas.nombre, t.columnas.identificador, t.columnas.nacimiento, t.columnas.raza, t.columnas.padre, t.columnas.madre, t.columnas.fechaRegistro, t.columnas.version, ...(conEstado ? [t.columnas.estado] : [])];
  const encabezado: TableCell[] = titulos.map((titulo) => ({ text: titulo, style: "etiqueta", bold: true }));
  const columnas = titulos.length;

  const cuerpo: TableCell[][] = [encabezado];
  let libroActual: string | null = null;
  for (const f of filas) {
    if (f.libro !== libroActual) {
      libroActual = f.libro;
      cuerpo.push([{ text: f.libro, bold: true, fillColor: "#eeeeee", colSpan: columnas }, ...Array.from({ length: columnas - 1 }, () => ({}) as TableCell)]);
    }
    cuerpo.push([
      { text: f.numero, bold: true },
      f.nombre,
      f.identificador,
      fechaTexto(f.nacimiento),
      composicionTexto(f.razas),
      f.padre,
      f.madre,
      fechaTexto(f.fechaRegistro),
      String(f.version),
      ...(conEstado ? [e.estados[f.estado]] : []),
    ]);
  }

  return {
    pageSize: "LETTER",
    pageOrientation: "landscape",
    pageMargins: [36, 40, 36, 50],
    info: { title: t.titulo, subject: AVISO_REGISTRO_PROPIO, creator: textos.app.nombre, author: d.finca.nombre },
    defaultStyle: { fontSize: 9 },
    styles: ESTILOS,
    footer: (actual: number, total: number): Content => ({
      margin: [36, 16, 36, 0],
      columns: [
        { text: AVISO_REGISTRO_PROPIO, style: "pie", bold: true },
        { text: e.pagina(actual, total), style: "pie", alignment: "right", width: 90 },
      ],
    }),
    content: [
      { text: d.finca.nombre, style: "finca" },
      {
        text: [d.finca.criadero && `${e.criadero}: ${d.finca.criadero}`, d.finca.municipio && `${e.municipio}: ${d.finca.municipio}`].filter(Boolean).join(" · "),
        style: "subtitulo",
      },
      { text: t.titulo, style: "titulo" },
      recuadro({ text: AVISO_REGISTRO_PROPIO, style: "aviso" }),
      { text: `${t.filtros}: ${textoDeFiltros(d.filtros)}`, margin: [0, 2, 0, 0] },
      { text: `${t.total(filas.length)} · ${t.generado(fechaTexto(d.fecha))}`, style: "pequeno", margin: [0, 2, 0, 8] },
      filas.length === 0
        ? { text: t.vacio, style: "desconocido" }
        : {
            table: {
              headerRows: 1,
              dontBreakRows: true,
              widths: conEstado ? ["auto", "*", "auto", "auto", "*", "*", "*", "auto", "auto", "auto"] : ["auto", "*", "auto", "auto", "*", "*", "*", "auto", "auto"],
              body: cuerpo,
            },
            layout: "lightHorizontalLines",
          },
    ],
  };
}

/** La misma lista como hoja de Excel: una columna más (el libro) y el estado, con fechas de Excel. */
export function hojaLibro(filas: readonly FilaLibro[]): HojaExcel {
  const c = t.columnas;
  return {
    nombre: t.hoja,
    columnas: [
      { titulo: c.libro, ancho: 24 },
      { titulo: c.numero, ancho: 14 },
      { titulo: c.nombre, ancho: 24 },
      { titulo: c.identificador, ancho: 22 },
      { titulo: c.nacimiento, ancho: 13 },
      { titulo: c.raza, ancho: 28 },
      { titulo: c.padre, ancho: 22 },
      { titulo: c.madre, ancho: 22 },
      { titulo: c.fechaRegistro, ancho: 16 },
      { titulo: c.version, ancho: 9 },
      { titulo: c.estado, ancho: 11 },
    ],
    filas: filas.map((f) => [
      f.libro,
      f.numero,
      f.nombre,
      f.identificador,
      fechaParaExcel(f.nacimiento),
      composicionTexto(f.razas),
      f.padre,
      f.madre,
      fechaParaExcel(f.fechaRegistro),
      f.version,
      e.estados[f.estado],
    ]),
  };
}
