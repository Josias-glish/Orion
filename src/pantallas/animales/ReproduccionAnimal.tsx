import { useConexion, useNavegar, usePermiso } from "../../componentes/contextos";
import { useCarga } from "../../componentes/useCarga";
import type { Animal } from "../../datos/repositorios/animales";
import { lactanciasDeHembra } from "../../datos/repositorios/leche";
import { historialReproductivo } from "../../datos/repositorios/reproduccion";
import { formatearFecha } from "../../dominio/fechas";
import { textos } from "../../textos/es";
import { machoDeServicio } from "../reproduccion/Reproduccion";

const t = textos.ficha;

/** Pestaña de una hembra: servicios, partos con sus crías, intervalo entre partos (R9) y lactancias. */
export function ReproduccionAnimal({ animal }: { animal: Animal }) {
  const conexion = useConexion();
  const navegar = useNavegar();
  const puedeParto = usePermiso("registrar_parto");
  const { datos: historial } = useCarga(() => historialReproductivo(conexion, animal.id), [conexion, animal.id]);
  const { datos: lactancias } = useCarga(() => lactanciasDeHembra(conexion, animal.id), [conexion, animal.id]);
  // R11: una hembra vendida o muerta conserva su historial, pero no se le registran partos nuevos.
  const disponible = animal.estado === "activo" && animal.enHato;

  if (!historial || !lactancias) return <p>{textos.comun.cargando}</p>;
  const r = textos.reproduccion;
  return (
    <div>
      {puedeParto && disponible && (
        <div className="acciones">
          <button type="button" className="boton" onClick={() => navegar({ pantalla: "registrarParto", hembraId: animal.id })} data-prueba="registrar-parto">
            {r.registrarParto}
          </button>
        </div>
      )}
      {historial.servicios.length === 0 && historial.partos.length === 0 && <p className="nota">{t.reproduccionVacio}</p>}

      {historial.servicios.length > 0 && (
        <>
          <h2>{t.serviciosTitulo}</h2>
          <table className="tabla">
            <thead>
              <tr>
                <th>{r.columnas.fecha}</th>
                <th>{r.columnas.tipo}</th>
                <th>{r.columnas.macho}</th>
                <th>{r.columnas.resultado}</th>
                <th>{r.columnas.fpp}</th>
              </tr>
            </thead>
            <tbody>
              {historial.servicios.map((s) => (
                <tr key={s.id}>
                  <td>{formatearFecha(s.fecha)}</td>
                  <td>{textos.comun.tipoServicio[s.tipo]}</td>
                  <td>{machoDeServicio(s)}</td>
                  <td>
                    {textos.comun.resultadoServicio[s.resultado]}
                    {s.fechaDiagnostico && <span className="nota"> {formatearFecha(s.fechaDiagnostico)}</span>}
                  </td>
                  <td>{s.resultado === "vacia" || s.resultado === "aborto" || !s.fechaProbableParto ? textos.comun.sinDato : formatearFecha(s.fechaProbableParto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {historial.partos.length > 0 && (
        <>
          <h2>{t.partosTitulo}</h2>
          <ul className="lista-enlaces" data-prueba="partos">
            {[...historial.partos].reverse().map((p) => (
              <li key={p.id}>
                <span className="destacado">{t.partoResumen(formatearFecha(p.fecha), p.numeroCrias)}</span>
                {p.crias.length > 0 && " — "}
                {p.crias.map((c, i) => (
                  <span key={c.id}>
                    {i > 0 && ", "}
                    <button type="button" className="enlace" onClick={() => navegar({ pantalla: "animal", id: c.id, pestana: "ficha" })}>
                      {c.nombre ?? textos.animales.sinNombre}
                    </button>{" "}
                    <span className="nota">
                      ({textos.comun.sexo[c.sexo].toLowerCase()}
                      {c.estado !== "activo" ? `, ${textos.comun.estado[c.estado].toLowerCase()}` : ""})
                    </span>
                  </span>
                ))}
                {p.observaciones && <span className="nota"> · {p.observaciones}</span>}
              </li>
            ))}
          </ul>
          {historial.intervaloPromedio !== null && (
            <p data-prueba="intervalo-promedio">{t.intervaloPromedio(textos.comun.dias(Math.round(historial.intervaloPromedio)))}</p>
          )}
        </>
      )}

      {lactancias.length > 0 && (
        <>
          <h2>{t.lactanciasTitulo}</h2>
          <table className="tabla tabla--filas">
            <thead>
              <tr>
                <th>{textos.leche.lactanciasColumnas.inicio}</th>
                <th>{textos.leche.lactanciasColumnas.secado}</th>
                <th className="numero">{textos.leche.lactanciasColumnas.acumulado}</th>
                <th className="numero">{textos.leche.lactanciasColumnas.proyeccion}</th>
              </tr>
            </thead>
            <tbody>
              {lactancias.map((l) => (
                <tr key={l.id} onClick={() => navegar({ pantalla: "lactancia", id: l.id })}>
                  <td>
                    <button type="button" className="enlace" onClick={() => navegar({ pantalla: "lactancia", id: l.id })}>
                      {formatearFecha(l.fechaInicio)}
                    </button>
                  </td>
                  <td>{l.fechaSecado ? formatearFecha(l.fechaSecado) : textos.leche.enCurso}</td>
                  <td className="numero">{l.proyeccion ? textos.comun.kilos(l.proyeccion.acumulado) : textos.leche.sinPesajes}</td>
                  <td className="numero">{l.proyeccion && !l.fechaSecado ? textos.comun.kilos(l.proyeccion.proyeccion, 0) : textos.comun.sinDato}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
