// RF-36: inventario del hato en PDF y en Excel. Las dos salidas salen del mismo `Inventario` (dominio): coinciden entre
// sí y con el contador de Inicio. Documento informativo del criadero.
import type { Content, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import type { Inventario } from "../dominio/inventario";
import { textos } from "../textos/es";
import { composicionTexto, ESTILOS, fechaTexto, recuadro } from "./comun";
import { fechaParaExcel, type HojaExcel, type ValorCelda } from "./excel";

const t = textos.inventario;
const r = textos.registros;

export const AVISO_INVENTARIO = t.aviso;

export interface DescripcionInventario {
  finca: { nombre: string; criadero: string | null; municipio: string | null };
  /** Fecha en que se generó (la del inventario es la de `inventario.fecha`). */
  generado: string;
}

/** «3 animales · 2 hembras · 1 macho · 2 nacidos en la finca · 1 comprado». */
function lineaDeTotales(i: Inventario): string {
  const x = i.totales;
  return [t.totales.total(x.total), t.totales.hembras(x.hembras), t.totales.machos(x.machos), t.totales.nacidosAqui(x.nacidosAqui), t.totales.comprados(x.comprados)].join(" · ");
}

export function definicionInventario(inventario: Inventario, d: DescripcionInventario): TDocumentDefinitions {
  const c = t.columnas;
  const titulos = [c.nombre, c.identificador, c.registroAsociacion, c.sexo, c.nacimiento, c.edad, c.raza, c.libro, c.lote, c.origen];
  const encabezado: TableCell[] = titulos.map((titulo) => ({ text: titulo, style: "etiqueta", bold: true }));
  const cuerpo: TableCell[][] = [
    encabezado,
    ...inventario.filas.map((f): TableCell[] => [
      { text: f.nombre ?? textos.animales.sinNombre, bold: true },
      f.identificador ?? "",
      f.registroAsociacion ?? "",
      textos.comun.sexo[f.sexo],
      fechaTexto(f.fechaNacimiento),
      f.edadMeses === null ? "" : textos.comun.edad(f.edadMeses),
      composicionTexto(f.razas),
      f.libro ?? "",
      f.lote ?? "",
      textos.comun.origen[f.origen],
    ]),
  ];
  return {
    pageSize: "LETTER",
    pageOrientation: "landscape",
    pageMargins: [36, 40, 36, 50],
    info: { title: t.titulo, subject: AVISO_INVENTARIO, creator: textos.app.nombre, author: d.finca.nombre },
    defaultStyle: { fontSize: 9 },
    styles: ESTILOS,
    footer: (actual: number, total: number): Content => ({
      margin: [36, 16, 36, 0],
      columns: [
        { text: AVISO_INVENTARIO, style: "pie", bold: true },
        { text: t.pagina(actual, total), style: "pie", alignment: "right", width: 90 },
      ],
    }),
    content: [
      { text: d.finca.nombre, style: "finca" },
      {
        text: [d.finca.criadero && `${r.criadero}: ${d.finca.criadero}`, d.finca.municipio && `${r.municipio}: ${d.finca.municipio}`].filter(Boolean).join(" · "),
        style: "subtitulo",
      },
      { text: t.titulo, style: "titulo" },
      recuadro({ text: AVISO_INVENTARIO, style: "aviso" }),
      { text: `${t.alFecha(fechaTexto(inventario.fecha))} · ${t.generado(fechaTexto(d.generado))}`, style: "pequeno", margin: [0, 2, 0, 2] },
      { text: lineaDeTotales(inventario), bold: true, margin: [0, 0, 0, 2] },
      ...(inventario.totales.porLote.length > 0
        ? [{ text: `${t.porLote}: ${inventario.totales.porLote.map((l) => `${l.lote ?? t.sinLote} (${l.cantidad})`).join(", ")}`, style: "pequeno", margin: [0, 0, 0, 8] } as Content]
        : []),
      inventario.filas.length === 0
        ? { text: t.vacio, style: "desconocido" }
        : {
            table: { headerRows: 1, dontBreakRows: true, widths: ["auto", "auto", "auto", "auto", "auto", "auto", "*", "auto", "auto", "auto"], body: cuerpo },
            layout: "lightHorizontalLines",
          },
    ],
  };
}

/** El mismo inventario como Excel: la hoja con una fila por animal (con fechas reales) y una hoja de resumen. */
export function hojasExcelInventario(inventario: Inventario): HojaExcel[] {
  const c = t.columnas;
  const x = inventario.totales;
  const resumen: ValorCelda[][] = [
    [t.resumenTotal, x.total],
    [t.resumenHembras, x.hembras],
    [t.resumenMachos, x.machos],
    [t.resumenNacidosAqui, x.nacidosAqui],
    [t.resumenComprados, x.comprados],
    ...x.porLote.map((l): ValorCelda[] => (l.lote === null ? [t.sinLote, l.cantidad] : [t.resumenLote(l.lote), l.cantidad])),
  ];
  return [
    {
      nombre: t.hojaInventario,
      columnas: [
        { titulo: c.nombre, ancho: 24 },
        { titulo: c.identificador, ancho: 18 },
        { titulo: c.registroAsociacion, ancho: 24 },
        { titulo: c.sexo, ancho: 10 },
        { titulo: c.nacimiento, ancho: 13 },
        { titulo: t.edadMeses, ancho: 13 },
        { titulo: c.raza, ancho: 30 },
        { titulo: c.libro, ancho: 22 },
        { titulo: c.lote, ancho: 16 },
        { titulo: c.origen, ancho: 20 },
      ],
      filas: inventario.filas.map((f): ValorCelda[] => [
        f.nombre ?? textos.animales.sinNombre,
        f.identificador,
        f.registroAsociacion,
        textos.comun.sexo[f.sexo],
        fechaParaExcel(f.fechaNacimiento),
        f.edadMeses,
        composicionTexto(f.razas),
        f.libro,
        f.lote,
        textos.comun.origen[f.origen],
      ]),
    },
    {
      nombre: t.hojaResumen,
      columnas: [
        { titulo: t.resumenConcepto, ancho: 34 },
        { titulo: t.resumenCantidad, ancho: 12 },
      ],
      filas: resumen,
    },
  ];
}
