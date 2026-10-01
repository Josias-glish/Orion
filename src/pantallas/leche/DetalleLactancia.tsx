import { useState } from "react";
import { Aviso } from "../../componentes/Aviso";
import { Campo } from "../../componentes/Campo";
import { useConexion, useContextoCambio, useNavegar, usePermiso } from "../../componentes/contextos";
import { ListaMotivos } from "../../componentes/ListaMotivos";
import { useCarga } from "../../componentes/useCarga";
import { obtenerLactancia, secarLactancia } from "../../datos/repositorios/leche";
import { fechaLocal, formatearFecha } from "../../dominio/fechas";
import { textos } from "../../textos/es";
import { CurvaLactancia } from "./CurvaLactancia";

const t = textos.leche;

/** RF-27 y RF-28: una lactancia con su curva, su proyección (R8), sus pesajes y el secado. */
export function DetalleLactancia({ id }: { id: string }) {
  const conexion = useConexion();
  const contexto = useContextoCambio();
  const navegar = useNavegar();
  const puedeSecar = usePermiso("registrar_leche");
  const { datos: l, recargar } = useCarga(() => obtenerLactancia(conexion, id), [conexion, id]);
  const [fechaSecado, setFechaSecado] = useState(fechaLocal());
  const [error, setError] = useState<unknown>(null);
  const [exito, setExito] = useState<string | null>(null);

  if (l === null) return <p>{textos.comun.cargando}</p>;
  if (!l) return <p className="aviso aviso--error">{textos.errores.motivo({ codigo: "no_encontrado" })}</p>;
  const p = l.proyeccion;
  const r = t.resumen;

  return (
    <section className="pantalla pantalla--ancha">
      <button type="button" className="enlace" onClick={() => navegar({ pantalla: "leche", seccion: "lactancias" })}>
        {t.volver}
      </button>
      <div className="encabezado">
        <h1>{t.detalleTitulo(l.hembra)}</h1>
        {!l.fechaSecado && <span className="insignia insignia--activo">{t.enCurso}</span>}
      </div>
      <button type="button" className="enlace" onClick={() => navegar({ pantalla: "animal", id: l.hembraId, pestana: "reproduccion" })}>
        {textos.ficha.pestanas.ficha}: {l.hembra}
      </button>

      <dl className="cifras">
        <div>
          <dt>{r.inicio}</dt>
          <dd>{formatearFecha(l.fechaInicio)}</dd>
        </div>
        {l.fechaSecado && (
          <div>
            <dt>{r.secado}</dt>
            <dd>{formatearFecha(l.fechaSecado)}</dd>
          </div>
        )}
        {p && (
          <>
            <div>
              <dt>{r.diaActual}</dt>
              <dd>{p.diaActual}</dd>
            </div>
            <div>
              <dt>{r.acumulado}</dt>
              <dd data-prueba="acumulado">{textos.comun.kilos(p.acumulado)}</dd>
            </div>
            <div>
              <dt>{r.promedio(p.diasPromediados)}</dt>
              <dd>{textos.comun.kilos(p.promedioDiario, 2)}</dd>
            </div>
            <div>
              <dt>{r.restantes}</dt>
              <dd>{p.diasRestantes}</dd>
            </div>
            <div>
              <dt>{r.proyeccion(l.diasLactancia)}</dt>
              <dd data-prueba="proyeccion">{textos.comun.kilos(p.proyeccion, 0)}</dd>
            </div>
          </>
        )}
      </dl>
      <p className="nota">{t.formula(l.diasLactancia)}</p>

      <h2>{t.curvaTitulo}</h2>
      {l.curva.length === 0 ? (
        <p className="nota">{t.curvaVacia}</p>
      ) : (
        <>
          <p className="nota">{t.curvaDescripcion(l.curva.length)}</p>
          <CurvaLactancia puntos={l.curva} diasLactancia={l.diasLactancia} promedio={l.fechaSecado ? null : (p?.promedioDiario ?? null)} />
        </>
      )}

      {puedeSecar && !l.fechaSecado && (
        <form
          className="tarjeta"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              await secarLactancia(conexion, id, fechaSecado, contexto());
              setExito(t.secada(formatearFecha(fechaSecado)));
              await recargar();
            } catch (err) {
              setError(err);
            }
          }}
        >
          <h2>{t.secarTitulo}</h2>
          <p className="nota">{t.secarAyuda}</p>
          <ListaMotivos error={error} />
          <div className="fila-editable">
            <Campo etiqueta={t.fechaSecado} ancho="corto">
              <input type="date" value={fechaSecado} min={l.fechaInicio} max={fechaLocal()} onChange={(e) => setFechaSecado(e.target.value)} />
            </Campo>
            <button type="submit" className="boton boton--secundario" data-prueba="secar">
              {t.secar}
            </button>
          </div>
        </form>
      )}
      {exito && <Aviso tipo="exito">{exito}</Aviso>}

      <h2>{t.pesajesTitulo}</h2>
      {l.curva.length === 0 ? (
        <p className="nota">{t.sinPesajes}</p>
      ) : (
        <TablaPesajes pesajes={l.pesajes} curva={l.curva} />
      )}
    </section>
  );
}

/** Vista en tabla de la curva (accesibilidad): una fila por día, del más reciente al más antiguo. */
function TablaPesajes({
  pesajes,
  curva,
}: {
  pesajes: readonly { fecha: string; jornada: "manana" | "tarde"; kilos: number }[];
  curva: readonly { fecha: string; dia: number; kilos: number }[];
}) {
  const de = (fecha: string, jornada: "manana" | "tarde") => pesajes.find((x) => x.fecha === fecha && x.jornada === jornada)?.kilos;
  const k = (v: number | undefined) => (v === undefined ? textos.comun.sinDato : textos.comun.kilos(v, 1, false));
  return (
    <div className="tabla-con-scroll">
      <table className="tabla" data-prueba="tabla-pesajes-leche">
        <thead>
          <tr>
            <th>{t.fecha}</th>
            <th className="numero">{t.columnas.dia}</th>
            <th className="numero">{textos.comun.jornada.manana}</th>
            <th className="numero">{textos.comun.jornada.tarde}</th>
            <th className="numero">{t.curvaEjeY}</th>
          </tr>
        </thead>
        <tbody>
          {[...curva].reverse().map((d) => (
            <tr key={d.fecha}>
              <td>{formatearFecha(d.fecha)}</td>
              <td className="numero">{d.dia}</td>
              <td className="numero">{k(de(d.fecha, "manana"))}</td>
              <td className="numero">{k(de(d.fecha, "tarde"))}</td>
              <td className="numero">{k(d.kilos)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
