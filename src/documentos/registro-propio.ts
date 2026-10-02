// R31: certificado de registro propio en PDF. Sale solo de la instantánea guardada al emitir: lo que se emitió no
// cambia aunque el animal cambie después. Lleva el rótulo obligatorio y NUNCA el nombre, el logo ni el diseño del
// certificado de ANCO: diseño propio y sobrio, sin sellos, escudos, imágenes ni código QR (el QR llega con la
// página pública, Etapa 11, y solo para animales publicados).
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import type { GeneracionesPedigri } from "../dominio/pedigri";
import type { InstantaneaRegistro } from "../dominio/registros";
import { formatearPorcentaje, textos } from "../textos/es";
import { composicionTexto, ESTILOS, fechaTexto, formaTexto, recuadro, tablaDatos } from "./comun";
import { tablaPedigri } from "./pedigri";

const t = textos.registros;

/** R31: texto exigido por la especificación. */
export const AVISO_REGISTRO_PROPIO = t.aviso;

export function definicionRegistroPropio(i: InstantaneaRegistro, opciones: { generaciones?: GeneracionesPedigri } = {}): TDocumentDefinitions {
  const generaciones = opciones.generaciones ?? 3;
  const a = i.animal;
  const nombre = a.nombre ?? textos.animales.sinNombre;
  const identificadores = a.identificadores
    .map((x) => `${x.tipo === "registro_asociacion" ? t.registroAsociacion : textos.comun.tipoIdentificador[x.tipo]}: ${x.valor}`)
    .join("\n");
  const firma: Content = {
    columns: [
      {
        width: 240,
        stack: [
          { canvas: [{ type: "line", x1: 0, y1: 0, x2: 240, y2: 0, lineWidth: 0.7 }], margin: [0, 22, 0, 2] },
          { text: t.firma, style: "etiqueta" },
          { text: i.responsable ?? "", bold: true },
        ],
      },
      { text: "" },
    ],
    margin: [0, 6, 0, 0],
  };

  return {
    pageSize: "LETTER",
    pageMargins: [45, 40, 45, 55],
    info: { title: `${t.certificado} ${i.numero}`, subject: AVISO_REGISTRO_PROPIO, creator: textos.app.nombre, author: i.finca.nombre },
    defaultStyle: { fontSize: 10 },
    // Más compacto que el certificado interno: con tres generaciones todo cabe en una hoja.
    styles: { ...ESTILOS, titulo: { fontSize: 17, bold: true, margin: [0, 8, 0, 4] }, seccion: { fontSize: 12, bold: true, margin: [0, 8, 0, 4] } },
    footer: (actual: number, total: number): Content => ({
      margin: [45, 20, 45, 0],
      columns: [
        { text: AVISO_REGISTRO_PROPIO, style: "pie", bold: true },
        { text: t.pagina(actual, total), style: "pie", alignment: "right", width: 90 },
      ],
    }),
    content: [
      { text: i.finca.nombre, style: "finca" },
      {
        text: [i.finca.criadero && `${t.criadero}: ${i.finca.criadero}`, i.finca.municipio && `${t.municipio}: ${i.finca.municipio}`].filter(Boolean).join(" · "),
        style: "subtitulo",
      },
      { text: t.certificado, style: "titulo" },
      recuadro({ text: AVISO_REGISTRO_PROPIO, style: "aviso" }),
      {
        columns: [
          { text: [{ text: `${t.numero}: `, style: "etiqueta" }, { text: i.numero, bold: true, fontSize: 14 }], width: "*" },
          {
            text: [{ text: t.version(i.version), bold: true }, ...(i.version > 1 ? [{ text: ` · ${t.reemplaza(i.version - 1)}`, style: "pequeno" }] : [])],
            alignment: "right",
            width: "auto",
          },
        ],
        margin: [0, 4, 0, 0],
      },
      {
        columns: [
          { text: [{ text: `${t.fechaRegistro}: `, style: "etiqueta" }, fechaTexto(i.fechaRegistro)] },
          { text: [{ text: `${t.fechaEmision}: `, style: "etiqueta" }, fechaTexto(i.fechaEmision)] },
          { text: [{ text: `${t.emitidoPor}: `, style: "etiqueta" }, i.emitidoPor ?? ""] },
        ],
        margin: [0, 2, 0, 0],
      },
      { text: t.datosTitulo, style: "seccion" },
      tablaDatos([
        [textos.formulario.nombre, nombre],
        [textos.ficha.campos.sexo, textos.comun.sexo[a.sexo]],
        [textos.ficha.campos.nacimiento, fechaTexto(a.fechaNacimiento)],
        [textos.ficha.campos.colorSenas, a.colorSenas ?? ""],
        [t.libro, a.libro],
        [textos.ficha.campos.formaConcepcion, formaTexto(a.formaConcepcion)],
        [textos.ficha.razaTitulo, composicionTexto(a.composicion)],
        [t.consanguinidad, a.consanguinidad === null ? "" : formatearPorcentaje(a.consanguinidad * 100)],
        [t.identificadores, identificadores],
        [t.criador, i.criador],
        [t.propietario, i.propietario],
        [t.criadero, i.finca.criadero ?? ""],
        ...(i.observaciones ? ([[t.observaciones, i.observaciones]] as [string, string][]) : []),
      ]),
      // El pedigrí y la firma van juntos: si no caben en la hoja, pasan completos a la siguiente.
      {
        stack: [{ text: t.pedigriTitulo(generaciones), style: "seccion" }, tablaPedigri(nombre, i.pedigri, generaciones), firma],
        unbreakable: true,
      },
    ],
  };
}
