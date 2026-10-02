import { useConexion, useNavegar } from "../../componentes/contextos";
import { useCarga } from "../../componentes/useCarga";
import { serviciosComoMacho } from "../../datos/repositorios/reproduccion";
import { formatearFecha } from "../../dominio/fechas";
import { textos } from "../../textos/es";

/** R30: historial de servicios de un macho (del hato o de otra finca) y sus resultados. */
export function ServiciosMacho({ machoId }: { machoId: string }) {
  const conexion = useConexion();
  const navegar = useNavegar();
  const { datos } = useCarga(() => serviciosComoMacho(conexion, machoId), [conexion, machoId]);
  const t = textos.ficha.serviciosMacho;
  if (!datos) return <p>{textos.comun.cargando}</p>;
  if (datos.servicios.length === 0) return <p className="nota">{t.vacio}</p>;
  const r = datos.resumen;
  return (
    <div>
      <p className="destacado" data-prueba="resumen-macho">
        {t.resumen(r.servicios, r.prenadas, r.vacias, r.abortos, r.pendientes, r.partos, r.crias)}
      </p>
      <table className="tabla" data-prueba="tabla-servicios-macho">
        <thead>
          <tr>
            <th>{t.columnas.fecha}</th>
            <th>{t.columnas.hembra}</th>
            <th>{t.columnas.tipo}</th>
            <th>{t.columnas.resultado}</th>
            <th>{t.columnas.crias}</th>
            <th>{t.columnas.costo}</th>
            <th>{t.columnas.condiciones}</th>
          </tr>
        </thead>
        <tbody>
          {datos.servicios.map((s) => (
            <tr key={s.id}>
              <td>{formatearFecha(s.fecha)}</td>
              <td>
                <button type="button" className="enlace" onClick={() => navegar({ pantalla: "animal", id: s.hembraId, pestana: "reproduccion" })}>
                  {s.hembra}
                </button>
              </td>
              <td>{textos.comun.tipoServicio[s.tipo]}</td>
              <td>
                <span className={`insignia insignia--${s.resultado}`}>{textos.comun.resultadoServicio[s.resultado]}</span>
              </td>
              <td>{s.crias}</td>
              <td>{s.costo === null ? textos.comun.sinDato : textos.comun.pesos(s.costo)}</td>
              <td>{s.condiciones ?? textos.comun.sinDato}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
