import { useState, type PointerEvent } from "react";
import { formatearFecha } from "../../dominio/fechas";
import type { PuntoCurva } from "../../dominio/leche";
import { textos } from "../../textos/es";

const t = textos.leche;

// Medidas del dibujo (unidades del viewBox; el SVG se adapta al ancho disponible).
const ANCHO = 800;
const ALTO = 300;
const M = { arriba: 16, derecha: 24, abajo: 44, izquierda: 56 };
const AREA_X = ANCHO - M.izquierda - M.derecha;
const AREA_Y = ALTO - M.arriba - M.abajo;

/** Escalón «limpio» para las marcas del eje (1, 2, 5 × 10^n). */
function paso(maximo: number, marcas: number): number {
  const bruto = maximo / marcas;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  return [1, 2, 5, 10].map((m) => m * potencia).find((p) => p >= bruto)!;
}

interface Props {
  puntos: readonly PuntoCurva[];
  diasLactancia: number;
  /** Promedio diario que usa la proyección (R8); se dibuja desde el último registro hasta el final. */
  promedio: number | null;
}

/**
 * Curva de lactancia (RF-28): kilos por día contra el día de lactancia, una sola serie (sin leyenda: el título la
 * nombra). Línea de 2 px, relleno al 10 %, cuadrícula de un pixel, cruz que se ajusta al día más cercano con su
 * valor. La tabla de pesajes de la misma pantalla es la vista accesible de estos datos.
 */
export function CurvaLactancia({ puntos, diasLactancia, promedio }: Props) {
  const [activo, setActivo] = useState<PuntoCurva | null>(null);
  const ultimo = puntos[puntos.length - 1];
  const diaMaximo = Math.max(diasLactancia, ultimo.dia);
  const pasoY = paso(Math.max(...puntos.map((p) => p.kilos), promedio ?? 0, 0.5), 4);
  const maximoY = Math.ceil(Math.max(...puntos.map((p) => p.kilos), promedio ?? 0) / pasoY) * pasoY || pasoY;
  const pasoX = paso(diaMaximo, 6);
  const x = (dia: number) => M.izquierda + ((dia - 1) / Math.max(1, diaMaximo - 1)) * AREA_X;
  const y = (kilos: number) => M.arriba + AREA_Y - (kilos / maximoY) * AREA_Y;

  const linea = puntos.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.dia).toFixed(1)},${y(p.kilos).toFixed(1)}`).join(" ");
  const area = `${linea} L${x(ultimo.dia).toFixed(1)},${y(0)} L${x(puntos[0].dia).toFixed(1)},${y(0)} Z`;
  const marcasY = Array.from({ length: Math.round(maximoY / pasoY) + 1 }, (_, i) => i * pasoY);
  const marcasX = [1, ...Array.from({ length: Math.floor(diaMaximo / pasoX) }, (_, i) => (i + 1) * pasoX).filter((d) => d > 1)];

  function mover(e: PointerEvent<SVGRectElement>) {
    const caja = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const dia = 1 + (((e.clientX - caja.left) * (ANCHO / caja.width) - M.izquierda) / AREA_X) * (diaMaximo - 1);
    let cercano = puntos[0];
    for (const p of puntos) if (Math.abs(p.dia - dia) < Math.abs(cercano.dia - dia)) cercano = p;
    setActivo(cercano);
  }

  const kg = (v: number) => textos.comun.kilos(v, 1, false);
  return (
    <figure className="curva" data-prueba="curva-lactancia">
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" aria-label={`${t.curvaTitulo}. ${t.curvaDescripcion(puntos.length)}`}>
        {marcasY.map((v) => (
          <g key={`y${v}`}>
            <line className="curva__rejilla" x1={M.izquierda} x2={ANCHO - M.derecha} y1={y(v)} y2={y(v)} />
            <text className="curva__eje" x={M.izquierda - 8} y={y(v)} textAnchor="end" dominantBaseline="middle">
              {textos.comun.kilos(v, v % 1 ? 1 : 0, false)}
            </text>
          </g>
        ))}
        {marcasX.map((d) => (
          <text key={`x${d}`} className="curva__eje" x={x(d)} y={ALTO - M.abajo + 18} textAnchor="middle">
            {d}
          </text>
        ))}
        <text className="curva__eje" x={M.izquierda + AREA_X / 2} y={ALTO - 6} textAnchor="middle">
          {t.curvaEjeX}
        </text>
        <text className="curva__eje" x={14} y={M.arriba + AREA_Y / 2} textAnchor="middle" transform={`rotate(-90 14 ${M.arriba + AREA_Y / 2})`}>
          {t.curvaEjeY}
        </text>

        <path className="curva__area" d={area} />
        <path className="curva__linea" d={linea} />
        {promedio !== null && ultimo.dia < diaMaximo && (
          <line className="curva__proyeccion" x1={x(ultimo.dia)} x2={x(diaMaximo)} y1={y(promedio)} y2={y(promedio)} />
        )}
        <circle className="curva__punto" cx={x(ultimo.dia)} cy={y(ultimo.kilos)} r={5} />
        <text className="curva__valor" x={x(ultimo.dia)} y={y(ultimo.kilos) - 12} textAnchor="middle">
          {kg(ultimo.kilos)}
        </text>

        {activo && (
          <g pointerEvents="none">
            <line className="curva__cruz" x1={x(activo.dia)} x2={x(activo.dia)} y1={M.arriba} y2={M.arriba + AREA_Y} />
            <circle className="curva__punto" cx={x(activo.dia)} cy={y(activo.kilos)} r={5} />
          </g>
        )}
        <rect
          x={M.izquierda}
          y={M.arriba}
          width={AREA_X}
          height={AREA_Y}
          fill="transparent"
          onPointerMove={mover}
          onPointerLeave={() => setActivo(null)}
        />
      </svg>
      {promedio !== null && (
        <figcaption className="curva__leyenda">
          <span>
            <span className="curva__clave" aria-hidden="true" /> {t.curvaLeyendaLinea}
          </span>
          <span>
            <span className="curva__clave curva__clave--promedio" aria-hidden="true" /> {t.curvaLeyendaPromedio}
          </span>
        </figcaption>
      )}
      {activo && (
        <div
          className="curva__globo"
          style={{ left: `${(x(activo.dia) / ANCHO) * 100}%`, top: `${(y(activo.kilos) / ALTO) * 100}%` }}
          data-prueba="globo-curva"
        >
          <span className="curva__clave" aria-hidden="true" />
          {t.columnas.dia} {activo.dia} · {formatearFecha(activo.fecha)}
          <strong>{textos.comun.kilos(activo.kilos)}</strong>
        </div>
      )}
    </figure>
  );
}
