// RF-14 y R12: certificado interno del criadero en PDF. No imita el diseño ni el nombre del certificado de ANCO
// (CRG) y no lleva código QR. El aviso de R12 va arriba, en un recuadro, y en el pie de cada página.
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import type { Ancestro, CampoAscendencia, FraccionConRaza } from "../dominio/expediente";
import type { FormaConcepcion, Sexo, TipoIdentificador } from "../dominio/tipos";
import { formatearPorcentaje, textos } from "../textos/es";
import { celdaAncestro, composicionTexto, ESTILOS, fechaTexto, formaTexto, recuadro, tablaDatos } from "./comun";

/** R12: texto exigido por la especificación. */
export const AVISO_CERTIFICADO = textos.certificado.aviso;

export interface DatosCertificado {
  numero: string;
  fechaEmision: string;
  emitidoPor: string | null;
  finca: { nombre: string; criadero: string | null; municipio: string | null };
  animal: {
    nombre: string | null;
    sexo: Sexo;
    fechaNacimiento: string | null;
    colorSenas: string | null;
    libro: string | null;
    formaConcepcion: FormaConcepcion | null;
    identificadores: { tipo: TipoIdentificador; valor: string }[];
    composicion: FraccionConRaza[];
    consanguinidad: number | null;
  };
  ascendencia: Record<CampoAscendencia, Ancestro | null>;
}

export function definicionCertificado(d: DatosCertificado): TDocumentDefinitions {
  const t = textos.certificado;
  const a = d.animal;
  const asc = d.ascendencia;
  const ascendencia: Content = {
    table: {
      widths: ["*", "*"],
      headerRows: 1,
      body: [
        [
          { text: t.padres, style: "etiqueta" },
          { text: t.abuelos, style: "etiqueta" },
        ],
        [{ stack: [celdaAncestro(asc.padre)], rowSpan: 2 }, celdaAncestro(asc.abueloPaterno)],
        ["", celdaAncestro(asc.abuelaPaterna)],
        [{ stack: [celdaAncestro(asc.madre)], rowSpan: 2 }, celdaAncestro(asc.abueloMaterno)],
        ["", celdaAncestro(asc.abuelaMaterna)],
      ],
    },
    layout: "lightHorizontalLines",
  };

  return {
    pageSize: "LETTER",
    pageMargins: [50, 50, 50, 60],
    info: { title: t.tituloDocumento, subject: AVISO_CERTIFICADO, creator: textos.app.nombre, author: d.finca.nombre },
    defaultStyle: { fontSize: 11 },
    styles: ESTILOS,
    footer: (actual: number, total: number): Content => ({
      margin: [50, 20, 50, 0],
      columns: [
        { text: AVISO_CERTIFICADO, style: "pie", bold: true },
        { text: t.pagina(actual, total), style: "pie", alignment: "right", width: 90 },
      ],
    }),
    content: [
      { text: d.finca.nombre, style: "finca" },
      {
        text: [d.finca.criadero && `${t.criadero}: ${d.finca.criadero}`, d.finca.municipio && `${t.municipio}: ${d.finca.municipio}`]
          .filter(Boolean)
          .join(" · "),
        style: "subtitulo",
      },
      { text: t.tituloDocumento, style: "titulo" },
      recuadro({ text: AVISO_CERTIFICADO, style: "aviso" }),
      {
        columns: [
          { text: [{ text: `${t.numero}: `, style: "etiqueta" }, { text: d.numero, bold: true }] },
          { text: [{ text: `${t.fechaEmision}: `, style: "etiqueta" }, fechaTexto(d.fechaEmision)] },
          { text: [{ text: `${t.emitidoPor}: `, style: "etiqueta" }, d.emitidoPor ?? ""] },
        ],
        margin: [0, 4, 0, 0],
      },
      { text: t.datosTitulo, style: "seccion" },
      tablaDatos([
        [textos.formulario.nombre, a.nombre ?? textos.animales.sinNombre],
        [textos.ficha.campos.sexo, textos.comun.sexo[a.sexo]],
        [textos.ficha.campos.nacimiento, fechaTexto(a.fechaNacimiento)],
        [textos.ficha.campos.colorSenas, a.colorSenas ?? ""],
        [textos.ficha.campos.libro, a.libro ?? ""],
        [textos.ficha.campos.formaConcepcion, formaTexto(a.formaConcepcion)],
        [textos.ficha.razaTitulo, composicionTexto(a.composicion)],
        [t.consanguinidad, a.consanguinidad === null ? "" : formatearPorcentaje(a.consanguinidad * 100)],
        [
          t.identificadores,
          // Sin la sigla del certificado de ANCO: «Registro de asociación».
          a.identificadores
            .map((i) => `${i.tipo === "registro_asociacion" ? t.registroAsociacion : textos.comun.tipoIdentificador[i.tipo]}: ${i.valor}`)
            .join("\n"),
        ],
      ]),
      { text: t.ascendenciaTitulo, style: "seccion" },
      ascendencia,
      { text: t.generadoCon, style: "pie", margin: [0, 24, 0, 0] },
    ],
  };
}
