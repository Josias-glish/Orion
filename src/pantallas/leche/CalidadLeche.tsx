import { useState } from "react";
import { Campo, Casilla } from "../../componentes/Campo";
import { useConexion, useNavegar } from "../../componentes/contextos";
import { TituloOrdenable, useOrden } from "../../componentes/orden";
import { useCarga } from "../../componentes/useCarga";
import { listarComparacionCalidad } from "../../datos/repositorios/leche";
import {
  barrasDeComparacion,
  COLUMNAS_CALIDAD,
  ordenarComparacion,
  type ClaveComparacion,
  type ColumnaCalidad,
  type PromedioCalidad,
} from "../../dominio/calidad-leche";
import { formatearFecha } from "../../dominio/fechas";
import { textos } from "../../textos/es";
import { BarrasCalidad } from "./BarrasCalidad";
import { formatoCalidad as formato } from "./formatoCalidad";

const t = textos.leche;
const c = t.calidad;
/** Cuántas barras se dibujan: la tabla trae todas las cabras. */
const MAX_BARRAS = 15;

/**
 * RF-32 y R18: compara las cabras por lactancia con los promedios de grasa, proteína y células somáticas, en una tabla
 * ordenable y un gráfico de barras. Los pesajes donde un dato está vacío no cuentan en el promedio de ese dato.
 */
export function CalidadLeche() {
  const conexion = useConexion();
  const navegar = useNavegar();
  const [soloAbiertas, setSoloAbiertas] = useState(true);
  const [dato, setDato] = useState<ColumnaCalidad>("celulas");
  const { clave, direccion, elegir } = useOrden<ClaveComparacion>("hembra");
  const { datos } = useCarga(() => listarComparacionCalidad(conexion, { soloAbiertas }), [conexion, soloAbiertas]);

  const filas = datos ? ordenarComparacion(datos, clave, direccion) : null;
  const hayMuestras = datos?.some((f) => COLUMNAS_CALIDAD.some((col) => f.resumen[col].muestras > 0)) ?? false;
  const barras = datos ? barrasDeComparacion(datos, dato) : [];
  const celda = (p: PromedioCalidad, col: ColumnaCalidad) =>
    p.promedio === null ? (
      <span className="nota">{c.sinDato}</span>
    ) : (
      <>
        {formato[col](p.promedio)} <span className="nota">({c.muestras(p.muestras)})</span>
      </>
    );
  const titulo = (k: ClaveComparacion, numerico: boolean) => (
    <TituloOrdenable clave={k} texto={c.columnas[k]} ayuda={c.ordenarPor(c.columnas[k])} actual={clave} direccion={direccion} alElegir={elegir} numerico={numerico} />
  );

  return (
    <div data-prueba="calidad-leche">
      <p className="nota">{c.ayuda}</p>
      <Casilla etiqueta={t.soloAbiertas} marcada={soloAbiertas} alCambiar={setSoloAbiertas} />
      {filas === null ? (
        <p>{textos.comun.cargando}</p>
      ) : filas.length === 0 ? (
        <p className="nota">{c.vacio}</p>
      ) : (
        <>
          {!hayMuestras && (
            <p className="nota" data-prueba="calidad-sin-muestras">
              {c.sinMuestras}
            </p>
          )}
          <div className="tabla-ancha">
            <table className="tabla" data-prueba="tabla-calidad">
              <thead>
                <tr>
                  {titulo("hembra", false)}
                  {titulo("inicio", false)}
                  {titulo("grasa", true)}
                  {titulo("proteina", true)}
                  {titulo("celulas", true)}
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id} data-lactancia={f.hembra}>
                    <td>
                      <button type="button" className="enlace" onClick={() => navegar({ pantalla: "lactancia", id: f.id })}>
                        {f.hembra}
                      </button>
                    </td>
                    <td>{formatearFecha(f.fechaInicio)}</td>
                    {COLUMNAS_CALIDAD.map((col) => (
                      <td key={col} className="numero" data-columna={col}>
                        {celda(f.resumen[col], col)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>{c.graficoTitulo}</h2>
          <div className="filtros">
            <Campo etiqueta={c.graficoElegir} ancho="medio">
              <select value={dato} onChange={(e) => setDato(e.target.value as ColumnaCalidad)} data-prueba="calidad-dato">
                {COLUMNAS_CALIDAD.map((col) => (
                  <option key={col} value={col}>
                    {c.datos[col]} ({c.unidades[col]})
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          {barras.length === 0 ? (
            <p className="nota">{c.graficoVacio}</p>
          ) : (
            <>
              <p className="nota">{c.graficoDescripcion(`${c.datos[dato]} (${c.unidades[dato]})`, barras.length)}</p>
              {barras.length > MAX_BARRAS && <p className="nota">{c.graficoLimite(MAX_BARRAS)}</p>}
              <BarrasCalidad
                barras={barras.slice(0, MAX_BARRAS)}
                formato={formato[dato]}
                descripcion={c.graficoDescripcion(`${c.datos[dato]} (${c.unidades[dato]})`, barras.length)}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
