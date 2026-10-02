// Archivos de Excel (.xlsx) con write-excel-file (D-046): MIT, una sola dependencia (fflate), mantenida, funciona igual
// en la ventana del programa y en Node (pruebas). Sin red. Se reutiliza en la hoja de venta de la Etapa 9.
import writeXlsxFile from "write-excel-file/universal";

export type ValorCelda = string | number | Date | null;

export interface ColumnaExcel {
  titulo: string;
  /** Ancho en caracteres. */
  ancho: number;
}

export interface HojaExcel {
  /** Hasta 31 caracteres y sin \ / ? * [ ]. */
  nombre: string;
  columnas: ColumnaExcel[];
  filas: ValorCelda[][];
}

const FORMATO_FECHA = "dd/mm/yyyy";

/** «2026-10-02» → fecha de Excel (a medianoche UTC, así no cambia de día en ningún huso horario). Vacío si no es una fecha. */
export function fechaParaExcel(fecha: string | null): Date | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha ?? "");
  return partes ? new Date(Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]))) : null;
}

type Celda = { value: string | number | Date; type: StringConstructor | NumberConstructor | DateConstructor; format?: string; fontWeight?: "bold" } | null;

function celda(valor: ValorCelda): Celda {
  if (valor === null || valor === "") return null;
  if (valor instanceof Date) return { value: valor, type: Date, format: FORMATO_FECHA };
  if (typeof valor === "number") return { value: valor, type: Number };
  return { value: valor, type: String };
}

/** Un libro de Excel con las hojas dadas: encabezado en negrita y fijo arriba, y anchos de columna. */
export async function generarXlsx(hojas: readonly HojaExcel[]): Promise<Uint8Array> {
  const sheets = hojas.map((hoja) => ({
    sheet: hoja.nombre,
    data: [
      hoja.columnas.map((c) => ({ value: c.titulo, type: String, fontWeight: "bold" as const })),
      ...hoja.filas.map((fila) => fila.map(celda)),
    ],
    columns: hoja.columnas.map((c) => ({ width: c.ancho })),
    stickyRowsCount: 1,
  }));
  const blob = await writeXlsxFile(sheets as Parameters<typeof writeXlsxFile>[0]).toBlob();
  return new Uint8Array(await blob.arrayBuffer());
}
