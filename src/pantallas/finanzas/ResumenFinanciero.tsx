import { useState } from "react";
import { Campo, Casilla } from "../../componentes/Campo";
import { useConexion } from "../../componentes/contextos";
import { ListaMotivos } from "../../componentes/ListaMotivos";
import { TituloOrdenable, useOrden } from "../../componentes/orden";
import { useCarga } from "../../componentes/useCarga";
import { resumenFinanciero } from "../../datos/repositorios/finanzas";
import { fechaLocal } from "../../dominio/fechas";
import type { FilaAnimal } from "../../dominio/finanzas";
import { ordenarFilas } from "../../dominio/orden";
import { textos } from "../../textos/es";

const t = textos.finanzas.resumen;
const pesos = textos.comun.pesos;

type ClaveAnimal = "animal" | "ingresos" | "directos" | "deLote" | "generales" | "costo" | "rentabilidad";

const valorDe = (f: FilaAnimal, clave: ClaveAnimal): number | string =>
  ({
    animal: f.nombre,
    ingresos: f.ingresos,
    directos: f.gastosDirectos,
    deLote: f.gastosDeLote,
    generales: f.gastosGenerales,
    costo: f.costo,
    rentabilidad: f.rentabilidad,
  })[clave];

/** Primer y último día del mes y del año de hoy, para los atajos de periodo. */
function atajo(cual: "mes" | "anio" | "todo"): { desde: string; hasta: string } {
  const hoy = fechaLocal();
  if (cual === "todo") return { desde: "", hasta: "" };
  return { desde: cual === "mes" ? `${hoy.slice(0, 7)}-01` : `${hoy.slice(0, 4)}-01-01`, hasta: hoy };
}

/**
 * RF-34 y R19: resumen por finca, por lote y por animal en un periodo. Los gastos sin animal ni lote salen aparte como
 * «gastos generales». El reparto entre animales (prorrateo) es opcional, lo activa el propietario y se rotula como
 * suposición.
 */
export function ResumenFinanciero() {
  const conexion = useConexion();
  const [periodo, setPeriodo] = useState({ desde: "", hasta: "" });
  const [prorratear, setProrratear] = useState(false);
  const { clave, direccion, elegir } = useOrden<ClaveAnimal>("costo", "desc");
  const { datos: r, error } = useCarga(
    () => resumenFinanciero(conexion, { periodo: { desde: periodo.desde || null, hasta: periodo.hasta || null }, prorratear }),
    [conexion, periodo, prorratear],
  );

  const animales = r ? ordenarFilas(r.animales, (f) => valorDe(f, clave), direccion) : [];
  const titulo = (k: ClaveAnimal, numerico: boolean) => (
    <TituloOrdenable clave={k} texto={t.animalesColumnas[k]} ayuda={t.ordenarPor(t.animalesColumnas[k])} actual={clave} direccion={direccion} alElegir={elegir} numerico={numerico} />
  );

  return (
    <div data-prueba="resumen-financiero">
      <div className="filtros">
        <Campo etiqueta={textos.finanzas.filtros.desde} ancho="corto">
          <input type="date" value={periodo.desde} onChange={(e) => setPeriodo({ ...periodo, desde: e.target.value })} data-prueba="resumen-desde" />
        </Campo>
        <Campo etiqueta={textos.finanzas.filtros.hasta} ancho="corto">
          <input type="date" value={periodo.hasta} onChange={(e) => setPeriodo({ ...periodo, hasta: e.target.value })} data-prueba="resumen-hasta" />
        </Campo>
        <div className="campo campo--medio">
          <span className="campo__etiqueta">{t.periodo}</span>
          <div className="acciones-fila">
            {(["mes", "anio", "todo"] as const).map((cual) => (
              <button key={cual} type="button" className="boton boton--secundario boton--pequeno" onClick={() => setPeriodo(atajo(cual))} data-prueba={`periodo-${cual}`}>
                {t.preajustes[cual]}
              </button>
            ))}
          </div>
        </div>
      </div>
      <Casilla etiqueta={t.prorrateo} marcada={prorratear} alCambiar={setProrratear} prueba="resumen-prorrateo" />
      <p className="nota">{t.prorrateoAyuda}</p>

      <ListaMotivos error={error} />
      {r === null ? (
        <p>{textos.comun.cargando}</p>
      ) : (
        <>
          <h2>{t.fincaTitulo}</h2>
          <dl className="cifras" data-prueba="resumen-finca">
            <div>
              <dt>{t.ingresos}</dt>
              <dd data-prueba="resumen-ingresos">{pesos(r.finca.ingresos)}</dd>
            </div>
            <div>
              <dt>{t.gastos}</dt>
              <dd data-prueba="resumen-gastos">{pesos(r.finca.gastos)}</dd>
            </div>
            <div>
              <dt>{t.rentabilidad}</dt>
              <dd data-prueba="resumen-rentabilidad">{pesos(r.finca.rentabilidad)}</dd>
            </div>
          </dl>

          <div className="tarjeta tarjeta--suave" data-prueba="gastos-generales">
            <h3>{t.gastosAparte}</h3>
            <p className="destacado" data-prueba="resumen-generales">
              {pesos(r.finca.gastosGenerales)}
            </p>
            <p className="nota">{t.gastosAparteAyuda}</p>
          </div>

          <h3>{t.desglose.titulo}</h3>
          <ul className="lista-compacta" data-prueba="resumen-desglose">
            <li>
              {t.desglose.generales}: <strong>{pesos(r.finca.gastosGenerales)}</strong>
            </li>
            <li>
              {t.desglose.lotes}: <strong>{pesos(r.finca.gastosDeLotes)}</strong>
            </li>
            <li>
              {t.desglose.animales}: <strong>{pesos(r.finca.gastosDeAnimales)}</strong>
            </li>
            <li>
              {t.desglose.ingresosGenerales}: <strong>{pesos(r.finca.ingresosGenerales)}</strong>
            </li>
          </ul>
          {r.prorrateado && r.finca.gastosSinRepartir > 0 && <p className="nota">{t.sinRepartir(pesos(r.finca.gastosSinRepartir))}</p>}

          <h2>{t.lotesTitulo}</h2>
          <p className="nota">{t.lotesAyuda}</p>
          {r.lotes.length === 0 ? (
            <p className="nota">{t.lotesVacio}</p>
          ) : (
            <div className="tabla-ancha">
              <table className="tabla" data-prueba="tabla-resumen-lotes">
                <thead>
                  <tr>
                    <th>{t.lotesColumnas.lote}</th>
                    <th className="numero">{t.lotesColumnas.ingresos}</th>
                    <th className="numero">{t.lotesColumnas.gastos}</th>
                    <th className="numero">{t.lotesColumnas.rentabilidad}</th>
                  </tr>
                </thead>
                <tbody>
                  {r.lotes.map((l) => (
                    <tr key={l.loteId} data-lote={l.nombre}>
                      <td>{l.nombre}</td>
                      <td className="numero" data-columna="ingresos">
                        {pesos(l.ingresos)}
                      </td>
                      <td className="numero" data-columna="gastos">
                        {pesos(l.gastos)}
                      </td>
                      <td className="numero" data-columna="rentabilidad">
                        {pesos(l.rentabilidad)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2>{t.animalesTitulo}</h2>
          <p className="nota">{t.animalesAyuda}</p>
          {r.prorrateado && <p className="nota">{t.animalesAyudaProrrateo(r.animalesParaRepartir)}</p>}
          {animales.length === 0 ? (
            <p className="nota">{t.animalesVacio}</p>
          ) : (
            <div className="tabla-ancha">
              <table className="tabla" data-prueba="tabla-resumen-animales">
                <thead>
                  <tr>
                    {titulo("animal", false)}
                    {titulo("ingresos", true)}
                    {titulo("directos", true)}
                    {r.prorrateado && titulo("deLote", true)}
                    {r.prorrateado && titulo("generales", true)}
                    {titulo("costo", true)}
                    {titulo("rentabilidad", true)}
                  </tr>
                </thead>
                <tbody>
                  {animales.map((a) => (
                    <tr key={a.animalId} data-animal={a.nombre}>
                      <td>{a.nombre}</td>
                      <td className="numero" data-columna="ingresos">
                        {pesos(a.ingresos)}
                      </td>
                      <td className="numero" data-columna="directos">
                        {pesos(a.gastosDirectos)}
                      </td>
                      {r.prorrateado && (
                        <td className="numero" data-columna="deLote">
                          {pesos(a.gastosDeLote)}
                        </td>
                      )}
                      {r.prorrateado && (
                        <td className="numero" data-columna="generales">
                          {pesos(a.gastosGenerales)}
                        </td>
                      )}
                      <td className="numero" data-columna="costo">
                        {pesos(a.costo)}
                      </td>
                      <td className="numero" data-columna="rentabilidad">
                        {pesos(a.rentabilidad)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
