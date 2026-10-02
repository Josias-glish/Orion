// R21: hoja de venta con pedigrí, en PDF y en Excel. Las dos salidas salen del mismo `HojaVenta` (dominio), así que
// traen los mismos identificadores, composición racial, libro y árbol (CA-25). Documento informativo del criadero: no es
// un certificado oficial y no lleva precios ni datos de contactos.
import type { Content, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import { sexoEsperado } from "../dominio/genealogia";
import type { HojaVenta } from "../dominio/hoja-venta";
import { GENERACIONES_HOJA_VENTA } from "../dominio/hoja-venta";
import { caminosDeGeneracion } from "../dominio/pedigri";
import { textos } from "../textos/es";
import { composicionTexto, ESTILOS, fechaTexto, marcasTexto, recuadro, tablaDatos } from "./comun";
import { fechaParaExcel, type HojaExcel, type ValorCelda } from "./excel";
import { tablaPedigri } from "./pedigri";

const t = textos.hojaVenta;
const r = textos.registros;

export const AVISO_HOJA_VENTA = t.aviso;

const nombreDelAnimal = (h: HojaVenta) => h.animal.nombre ?? h.animal.identificadores[0]?.valor ?? textos.animales.sinNombre;

/**
 * Parentesco en palabras. Hasta los abuelos es el de siempre («Padre», «Abuela paterna»); en la tercera generación se
 * dice de quién es hijo («Madre del abuelo paterno»), porque «Bisabuelo paterno» sería el nombre de cuatro lugares.
 */
export function parentescoDeCamino(camino: string): string {
  if (camino.length < GENERACIONES_HOJA_VENTA) return textos.parentesco(camino);
  const abuelo = textos.parentesco(camino.slice(0, -1));
  const articulo = abuelo.startsWith("Abuela") ? "de la" : "del";
  return `${sexoEsperado(camino) === "macho" ? "Padre" : "Madre"} ${articulo} ${abuelo.toLowerCase()}`;
}

const estadoDeLactancia = (secado: string | null) => (secado ? t.secada : t.enCurso);
const kilos = (valor: number | null) => (valor === null ? "" : textos.comun.numero(valor, 1));

/** La hoja de venta en PDF: datos del animal, pedigrí de tres generaciones y, si se eligió, la producción de leche. */
export function definicionHojaVenta(h: HojaVenta): TDocumentDefinitions {
  const a = h.animal;
  const nombre = nombreDelAnimal(h);
  const identificadores = marcasTexto(a.identificadores);
  const datos: [string, string | Content][] = [
    [t.campos.nombre, nombre],
    [t.campos.sexo, textos.comun.sexo[a.sexo]],
    [t.campos.nacimiento, a.fechaNacimiento ? `${fechaTexto(a.fechaNacimiento)}${a.edadMeses !== null ? ` (${textos.comun.edad(a.edadMeses)})` : ""}` : ""],
    [t.campos.color, a.colorSenas ?? ""],
    [t.campos.identificadores, identificadores],
    [t.campos.libro, a.libro ?? ""],
    [t.campos.raza, a.composicion.length > 0 ? composicionTexto(a.composicion) : t.sinComposicion],
    ...(a.registroPropio ? ([[t.campos.registroPropio, a.registroPropio]] as [string, string][]) : []),
  ];

  const produccion: Content[] =
    h.produccion === null
      ? []
      : [
          { text: t.produccionTitulo, style: "seccion" },
          { text: t.produccionAyuda, style: "pequeno", margin: [0, 0, 0, 4] },
          h.produccion.length === 0
            ? { text: t.produccionVacia, style: "desconocido" }
            : {
                table: {
                  headerRows: 1,
                  widths: ["auto", "auto", "auto", "*", "*"],
                  body: [
                    [t.produccionColumnas.inicio, t.produccionColumnas.secado, t.produccionColumnas.estado, t.produccionColumnas.acumulado, t.produccionColumnas.promedio].map(
                      (titulo): TableCell => ({ text: titulo, style: "etiqueta", bold: true }),
                    ),
                    ...h.produccion.map((l): TableCell[] => [
                      fechaTexto(l.fechaInicio),
                      fechaTexto(l.fechaSecado),
                      estadoDeLactancia(l.fechaSecado),
                      kilos(l.acumuladoKg),
                      kilos(l.promedioDiarioKg),
                    ]),
                  ],
                },
                layout: "lightHorizontalLines",
              },
        ];

  return {
    pageSize: "LETTER",
    pageMargins: [40, 40, 40, 50],
    info: { title: t.tituloDe(nombre), subject: AVISO_HOJA_VENTA, creator: textos.app.nombre, author: h.finca.nombre },
    defaultStyle: { fontSize: 10 },
    styles: ESTILOS,
    footer: (actual: number, total: number): Content => ({
      margin: [40, 16, 40, 0],
      columns: [
        { text: AVISO_HOJA_VENTA, style: "pie", bold: true },
        { text: t.pagina(actual, total), style: "pie", alignment: "right", width: 90 },
      ],
    }),
    content: [
      { text: h.finca.nombre, style: "finca" },
      {
        text: [h.finca.criadero && `${r.criadero}: ${h.finca.criadero}`, h.finca.municipio && `${r.municipio}: ${h.finca.municipio}`].filter(Boolean).join(" · "),
        style: "subtitulo",
      },
      { text: t.tituloDe(nombre), style: "titulo" },
      { text: t.generadaEl(fechaTexto(h.fecha)), style: "pequeno" },
      recuadro({ text: AVISO_HOJA_VENTA, style: "aviso" }),
      { text: t.datosTitulo, style: "seccion" },
      tablaDatos(datos),
      ...(a.composicionCompleta ? [] : [{ text: t.composicionIncompleta, style: "sinVerificar", margin: [0, 4, 0, 0] } as Content]),
      { text: r.pedigriTitulo(GENERACIONES_HOJA_VENTA), style: "seccion" },
      tablaPedigri(nombre, h.arbol.flat().filter((x) => x !== null), GENERACIONES_HOJA_VENTA),
      ...produccion,
    ],
  };
}

/**
 * La hoja de venta en Excel, con los mismos datos que el PDF: la hoja del animal (dato y valor), una fila por lugar del
 * pedigrí (los que no se conocen quedan vacíos) y, si se eligió, la producción de leche.
 */
export function hojasExcelHojaVenta(h: HojaVenta): HojaExcel[] {
  const a = h.animal;
  const c = t.pedigriColumnas;
  const filasAnimal: ValorCelda[][] = [
    [t.hojaAnimal, AVISO_HOJA_VENTA],
    [r.criadero, [h.finca.nombre, h.finca.criadero, h.finca.municipio].filter(Boolean).join(" · ")],
    [t.generadaEl(""), fechaParaExcel(h.fecha)],
    [t.campos.nombre, nombreDelAnimal(h)],
    [t.campos.sexo, textos.comun.sexo[a.sexo]],
    [t.campos.nacimiento, fechaParaExcel(a.fechaNacimiento)],
    [t.campos.color, a.colorSenas],
    [t.campos.identificadores, marcasTexto(a.identificadores)],
    [t.campos.libro, a.libro],
    [t.campos.raza, a.composicion.length > 0 ? composicionTexto(a.composicion) : t.sinComposicion],
    ...(a.composicionCompleta ? [] : [["", t.composicionIncompleta] as ValorCelda[]]),
    [t.campos.registroPropio, a.registroPropio],
  ];
  const hojas: HojaExcel[] = [
    {
      nombre: t.hojaAnimal,
      columnas: [
        { titulo: t.datoColumna, ancho: 26 },
        { titulo: t.valorColumna, ancho: 70 },
      ],
      filas: filasAnimal,
    },
    {
      nombre: t.hojaPedigri,
      columnas: [
        { titulo: c.generacion, ancho: 12 },
        { titulo: c.parentesco, ancho: 30 },
        { titulo: c.nombre, ancho: 26 },
        { titulo: c.identificador, ancho: 20 },
        { titulo: c.registro, ancho: 26 },
        { titulo: c.propietario, ancho: 34 },
        { titulo: c.sinVerificar, ancho: 14 },
      ],
      filas: h.arbol.flatMap((columna, i) =>
        caminosDeGeneracion(i + 1).map((camino, k): ValorCelda[] => {
          const x = columna[k] ?? null;
          return [i + 1, parentescoDeCamino(camino), x?.nombre ?? null, x?.identificador ?? null, x?.registroAsociacion ?? null, x?.externo ? x.propietario : null, x?.sinVerificar ? textos.comun.si : null];
        }),
      ),
    },
  ];
  if (h.produccion !== null) {
    const p = t.produccionColumnas;
    hojas.push({
      nombre: t.hojaProduccion,
      columnas: [
        { titulo: p.inicio, ancho: 13 },
        { titulo: p.secado, ancho: 13 },
        { titulo: p.estado, ancho: 12 },
        { titulo: p.acumulado, ancho: 22 },
        { titulo: p.promedio, ancho: 22 },
      ],
      filas: h.produccion.map((l): ValorCelda[] => [fechaParaExcel(l.fechaInicio), fechaParaExcel(l.fechaSecado), estadoDeLactancia(l.fechaSecado), l.acumuladoKg, l.promedioDiarioKg]),
    });
  }
  return hojas;
}

