// El informe de la comprobación contra el servidor, como CSV (mismo formato que los otros: punto y coma, UTF-8 con BOM, saltos de Windows).
import type { InformeDeVerificacion } from "./primera";

const celda = (valor: string | number) => {
  const texto = String(valor);
  return /[;"\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
};

export interface TextosDelInforme {
  columnas: { tabla: string; aqui: string; servidor: string; estado: string };
  igual: string;
  distinta: string;
}

export function informeCsv(informe: InformeDeVerificacion, etiqueta: (entidad: string) => string, t: TextosDelInforme): string {
  const filas: (string | number)[][] = [[t.columnas.tabla, t.columnas.aqui, t.columnas.servidor, t.columnas.estado]];
  for (const f of informe.filas) filas.push([etiqueta(f.entidad), f.locales, f.servidor, f.coincide ? t.igual : t.distinta]);
  return `﻿${filas.map((f) => f.map(celda).join(";")).join("\r\n")}\r\n`;
}
