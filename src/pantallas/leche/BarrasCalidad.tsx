import { formatearFecha } from "../../dominio/fechas";
import type { BarraComparacion } from "../../dominio/calidad-leche";

// Medidas del dibujo (unidades del viewBox; el SVG se adapta al ancho disponible).
const ANCHO = 800;
const ALTO_FILA = 32;
const M = { arriba: 10, abajo: 10, izquierda: 250, derecha: 130 };

interface Props {
  barras: readonly BarraComparacion[];
  /** Cómo se escribe el valor al final de cada barra (con su unidad). */
  formato: (valor: number) => string;
  descripcion: string;
}

/**
 * Gráfico sencillo de la comparación (RF-32): una barra horizontal por lactancia, de mayor a menor, con su valor escrito
 * al final. Una sola serie, del mismo verde de la curva de lactancia. La tabla de arriba trae los mismos datos, y es la
 * vista accesible de este gráfico.
 */
export function BarrasCalidad({ barras, formato, descripcion }: Props) {
  const maximo = Math.max(...barras.map((b) => b.valor), 0) || 1;
  const largoMaximo = ANCHO - M.izquierda - M.derecha;
  const alto = M.arriba + barras.length * ALTO_FILA + M.abajo;
  return (
    <figure className="curva barras" data-prueba="barras-calidad">
      <svg viewBox={`0 0 ${ANCHO} ${alto}`} role="img" aria-label={descripcion}>
        {barras.map((b, i) => {
          const y = M.arriba + i * ALTO_FILA;
          const largo = Math.max(2, (b.valor / maximo) * largoMaximo);
          return (
            <g key={b.id} data-barra={b.hembra}>
              <title>{`${b.hembra} · ${formatearFecha(b.fechaInicio)}: ${formato(b.valor)}`}</title>
              <text className="curva__eje" x={M.izquierda - 10} y={y + ALTO_FILA / 2} textAnchor="end" dominantBaseline="middle">
                {b.hembra} · {formatearFecha(b.fechaInicio)}
              </text>
              <rect className="barras__barra" x={M.izquierda} y={y + 5} width={largo} height={ALTO_FILA - 10} rx={3} />
              <text className="curva__valor" x={M.izquierda + largo + 8} y={y + ALTO_FILA / 2} dominantBaseline="middle">
                {formato(b.valor)}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
