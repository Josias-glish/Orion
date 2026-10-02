import { useState } from "react";
import { useConexion, useNavegar, usePermiso } from "../../componentes/contextos";
import { useCarga } from "../../componentes/useCarga";
import { serviciosConGasto } from "../../datos/repositorios/finanzas";
import { serviciosComoMacho } from "../../datos/repositorios/reproduccion";
import { formatearFecha } from "../../dominio/fechas";
import { textos } from "../../textos/es";
import { OfertaGastoMonta } from "../finanzas/OfertaGastoMonta";

/** R30: historial de servicios de un macho (del hato o de otra finca) y sus resultados. */
export function ServiciosMacho({ machoId }: { machoId: string }) {
  const conexion = useConexion();
  const navegar = useNavegar();
  const { datos } = useCarga(() => serviciosComoMacho(conexion, machoId), [conexion, machoId]);
  // R30 y R23: el gasto de una monta con costo se anota solo con el permiso de Finanzas.
  const verGasto = usePermiso("ver_finanzas");
  const { datos: conGasto, recargar } = useCarga(
    async () => (verGasto && datos ? serviciosConGasto(conexion, datos.servicios.map((s) => s.id)) : new Set<string>()),
    [conexion, datos, verGasto],
  );
  const [ofreciendo, setOfreciendo] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const t = textos.ficha.serviciosMacho;
  if (!datos) return <p>{textos.comun.cargando}</p>;
  if (datos.servicios.length === 0) return <p className="nota">{t.vacio}</p>;
  const r = datos.resumen;
  return (
    <div>
      <p className="destacado" data-prueba="resumen-macho">
        {t.resumen(r.servicios, r.prenadas, r.vacias, r.abortos, r.pendientes, r.partos, r.crias)}
      </p>
      {mensaje && (
        <p className="aviso aviso--exito" role="status" data-prueba="gasto-monta-anotado">
          {mensaje}
        </p>
      )}
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
            {verGasto && <th>{t.columnas.gasto}</th>}
          </tr>
        </thead>
        <tbody>
          {datos.servicios.map((s) => [
            <tr key={s.id} data-servicio={s.hembra}>
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
              {verGasto && (
                <td>
                  {!s.costo ? (
                    textos.comun.sinDato
                  ) : conGasto?.has(s.id) ? (
                    <span className="insignia insignia--activo">{t.gastoAnotado}</span>
                  ) : (
                    <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => setOfreciendo(s.id)} data-prueba="anotar-gasto-servicio">
                      {t.anotarGasto}
                    </button>
                  )}
                </td>
              )}
            </tr>,
            ofreciendo === s.id && s.costo ? (
              <tr key={`${s.id}-oferta`}>
                <td colSpan={8}>
                  <OfertaGastoMonta
                    servicioId={s.id}
                    costo={s.costo}
                    hembra={s.hembra}
                    macho={s.macho ?? ""}
                    alTerminar={async (m) => {
                      setOfreciendo(null);
                      if (m) {
                        setMensaje(m);
                        await recargar();
                      }
                    }}
                  />
                </td>
              </tr>
            ) : null,
          ])}
        </tbody>
      </table>
    </div>
  );
}
