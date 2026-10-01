// RF-15 y R13: expediente para ANCO en PDF y CSV, con los campos que faltan.
// SUPOSICION: ANCO no publica un formato; este es un formato provisional del programa (ver docs/SUPOSICIONES.md).
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { CAMPOS_ASCENDENCIA, CAMPOS_EXPEDIENTE, type CampoExpediente, type Expediente } from "../dominio/expediente";
import { textos } from "../textos/es";
import { celdaAncestro, composicionTexto, ESTILOS, fechaTexto, formaTexto, marcasTexto, recuadro, VACIO } from "./comun";

const esAscendencia = (campo: CampoExpediente): campo is (typeof CAMPOS_ASCENDENCIA)[number] =>
  (CAMPOS_ASCENDENCIA as readonly string[]).includes(campo);

/** Valor de un campo (que no es de la ascendencia) como texto en español. Vacío si no hay dato. */
function valorTexto(e: Expediente, campo: CampoExpediente): string {
  const d = e.datos;
  switch (campo) {
    case "sexo":
      return textos.comun.sexo[d.sexo];
    case "composicion":
      return composicionTexto(d.composicion);
    case "formaConcepcion":
      return formaTexto(d.formaConcepcion);
    case "marcas":
      return marcasTexto(d.marcas);
    case "nacimiento":
      return fechaTexto(d.nacimiento);
    case "nombre":
    case "crg":
    case "criador":
    case "propietario":
    case "criadero":
    case "libro":
    case "color":
      return d[campo] ?? "";
    default:
      return "";
  }
}

// ---------------------------------------------------------------- CSV

/** Comillas solo cuando hacen falta (punto y coma, comillas o saltos de línea). */
const celdaCsv = (valor: string) => (/[;"\r\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor);

/**
 * SUPOSICION: una fila por animal, separada por punto y coma (lo que espera Excel en español), en UTF-8 con BOM
 * para que se vean bien las tildes, con fechas dd/mm/aaaa y saltos de línea de Windows.
 */
export function expedienteCsv(e: Expediente): string {
  const t = textos.expediente;
  const encabezado: string[] = [];
  const fila: string[] = [];
  for (const campo of CAMPOS_EXPEDIENTE) {
    encabezado.push(t.campos[campo]);
    if (esAscendencia(campo)) {
      const a = e.datos[campo];
      fila.push(a?.nombre ?? "");
      encabezado.push(t.registroDe[campo]);
      fila.push(a?.crg ?? "");
    } else {
      fila.push(valorTexto(e, campo));
    }
  }
  encabezado.push(t.columnaFaltantes);
  fila.push(e.faltantes.map((c) => t.campos[c]).join(", "));
  return `﻿${encabezado.map(celdaCsv).join(";")}\r\n${fila.map(celdaCsv).join(";")}\r\n`;
}

// ---------------------------------------------------------------- PDF

export interface MetaExpediente {
  numero: string;
  fechaEmision: string;
  finca: string;
}

export function definicionExpediente(e: Expediente, meta: MetaExpediente): TDocumentDefinitions {
  const t = textos.expediente;
  const filas: Content[][] = CAMPOS_EXPEDIENTE.map((campo) => {
    const falta = e.faltantes.includes(campo);
    const valor: Content = esAscendencia(campo) ? celdaAncestro(e.datos[campo]) : { text: valorTexto(e, campo) || VACIO };
    return [{ text: t.campos[campo], style: "etiqueta", bold: falta, color: falta ? "#b3261e" : undefined }, valor];
  });
  const avisos = e.avisos.map((a) => textos.documentos.avisoSinVerificar(t.campos[a.campo]));

  return {
    pageSize: "LETTER",
    pageMargins: [50, 50, 50, 60],
    info: { title: `${t.tituloDocumento} ${meta.numero}`, creator: textos.app.nombre, author: meta.finca },
    defaultStyle: { fontSize: 11 },
    styles: ESTILOS,
    footer: (actual: number, total: number): Content => ({
      margin: [50, 20, 50, 0],
      columns: [
        { text: t.provisional, style: "pie" },
        { text: textos.certificado.pagina(actual, total), style: "pie", alignment: "right", width: 90 },
      ],
    }),
    content: [
      { text: meta.finca, style: "finca" },
      { text: t.tituloDocumento, style: "titulo" },
      {
        columns: [
          { text: [{ text: `${t.numero}: `, style: "etiqueta" }, { text: meta.numero, bold: true }] },
          { text: [{ text: `${t.fechaEmision}: `, style: "etiqueta" }, fechaTexto(meta.fechaEmision)] },
        ],
      },
      recuadro({ text: t.provisional, fontSize: 10 }, "#fff6dc", "#a87800"),
      ...(e.faltantes.length > 0
        ? [
            recuadro({
              stack: [
                { text: t.faltanTitulo, style: "aviso" },
                { ul: e.faltantes.map((c) => t.campos[c]), margin: [0, 4, 0, 0] },
              ],
            }),
          ]
        : []),
      ...(avisos.length > 0 ? [{ text: t.avisosTitulo, style: "seccion" } as Content, { ul: avisos } as Content] : []),
      {
        table: { widths: [170, "*"], headerRows: 1, body: [[{ text: t.campo, bold: true }, { text: t.valor, bold: true }], ...filas] },
        layout: "lightHorizontalLines",
        margin: [0, 10, 0, 0],
      },
    ],
  };
}
