// Piezas comunes de los documentos PDF y CSV: formato de valores en español y estilos de pdfmake.
import type { Content, StyleDictionary } from "pdfmake/interfaces";
import type { Ancestro, FraccionConRaza, Marca } from "../dominio/expediente";
import { formatearFecha } from "../dominio/fechas";
import type { FormaConcepcion } from "../dominio/tipos";
import { formatearPorcentaje, textos } from "../textos/es";

export const VACIO = "—";

export const composicionTexto = (composicion: readonly FraccionConRaza[]) =>
  composicion.map((c) => `${formatearPorcentaje(c.fraccion * 100)} ${c.raza}`).join(", ");

export const marcasTexto = (marcas: readonly Marca[]) =>
  marcas.map((m) => `${textos.comun.tipoIdentificador[m.tipo]} ${m.valor}`).join(", ");

export const formaTexto = (forma: FormaConcepcion | null) => (forma ? textos.comun.formaConcepcion[forma] : "");

export const fechaTexto = (fecha: string | null) => (fecha ? formatearFecha(fecha) : "");

/** Celda de un ancestro: nombre, registro de asociación y «sin verificar», o «Desconocido». */
export function celdaAncestro(a: Ancestro | null): Content {
  const t = textos.certificado;
  if (!a) return { text: t.desconocido, style: "desconocido" };
  return {
    stack: [
      { text: a.nombre ?? textos.animales.sinNombre, bold: true },
      ...(a.crg ? [{ text: t.registro(a.crg), style: "pequeno" }] : []),
      ...(a.sinVerificar ? [{ text: t.sinVerificar, style: "sinVerificar" }] : []),
    ],
  };
}

/** Estilos sobrios, letra grande y sin adornos (sin sellos, escudos ni códigos QR). */
export const ESTILOS: StyleDictionary = {
  finca: { fontSize: 16, bold: true },
  subtitulo: { fontSize: 10, color: "#4a4a4a" },
  titulo: { fontSize: 18, bold: true, margin: [0, 14, 0, 6] },
  seccion: { fontSize: 13, bold: true, margin: [0, 14, 0, 6] },
  aviso: { fontSize: 11, bold: true, color: "#7a1c12" },
  etiqueta: { fontSize: 10, color: "#4a4a4a" },
  pequeno: { fontSize: 9, color: "#4a4a4a" },
  desconocido: { italics: true, color: "#6b6b6b" },
  sinVerificar: { fontSize: 9, bold: true, color: "#8a5a00" },
  pie: { fontSize: 8, color: "#4a4a4a" },
};

/** Recuadro de aviso: borde y fondo claro, para que se lea antes que el resto. */
export function recuadro(contenido: Content, fondo = "#fdecea", borde = "#b3261e"): Content {
  return {
    table: { widths: ["*"], body: [[{ ...(contenido as object), margin: [8, 6, 8, 6] } as Content]] },
    layout: {
      fillColor: () => fondo,
      hLineColor: () => borde,
      vLineColor: () => borde,
    },
    margin: [0, 6, 0, 6],
  };
}

/** Tabla de dos columnas «etiqueta | valor». */
export function tablaDatos(filas: [string, string | Content][]): Content {
  return {
    table: {
      widths: [150, "*"],
      body: filas.map(([etiqueta, valor]) => [
        { text: etiqueta, style: "etiqueta" },
        typeof valor === "string" ? { text: valor || VACIO } : valor,
      ]),
    },
    layout: "lightHorizontalLines",
  };
}
