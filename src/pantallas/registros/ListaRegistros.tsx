import { useState } from "react";
import { Campo } from "../../componentes/Campo";
import { useConexion, useNavegar } from "../../componentes/contextos";
import { useCarga } from "../../componentes/useCarga";
import { listarCatalogo } from "../../datos/repositorios/catalogos";
import { listarRegistros, type FiltroRegistros } from "../../datos/repositorios/registros";
import { formatearFecha } from "../../dominio/fechas";
import { ESTADOS_REGISTRO, type EstadoRegistro } from "../../dominio/registros";
import { textos } from "../../textos/es";
import { CLASE_DE_ESTADO } from "./estado";
import { DetalleRegistro } from "./DetalleRegistro";

const t = textos.registros.pantalla;

/** Se conserva mientras el programa está abierto, para volver a la lista con el mismo filtro. */
let ultimoFiltro: FiltroRegistros = {};

/** R31: lista de registros con su estado, y filtros por libro, raza, periodo y estado. */
export function ListaRegistros({ abiertoInicial }: { abiertoInicial: string | null }) {
  const conexion = useConexion();
  const navegar = useNavegar();
  const [filtro, setFiltroEstado] = useState<FiltroRegistros>(ultimoFiltro);
  const setFiltro = (f: FiltroRegistros) => {
    ultimoFiltro = f;
    setFiltroEstado(f);
  };
  const [abierto, setAbierto] = useState<string | null>(abiertoInicial);
  const { datos: registros, recargar } = useCarga(() => listarRegistros(conexion, filtro), [conexion, filtro]);
  const { datos: libros } = useCarga(() => listarCatalogo(conexion, "libro"), [conexion]);
  const { datos: razas } = useCarga(() => listarCatalogo(conexion, "raza"), [conexion]);
  const hayFiltro = Boolean(filtro.texto || filtro.libroId || filtro.raza || filtro.desde || filtro.hasta || filtro.estado);

  return (
    <div>
      <p className="nota">{t.ayuda}</p>
      <div className="filtros">
        <Campo etiqueta={t.filtros.buscar} ancho="largo">
          <input type="search" value={filtro.texto ?? ""} onChange={(e) => setFiltro({ ...filtro, texto: e.target.value })} data-prueba="buscar-registro" />
        </Campo>
        <Campo etiqueta={t.filtros.libro} ancho="corto">
          <select value={filtro.libroId ?? ""} onChange={(e) => setFiltro({ ...filtro, libroId: e.target.value || null })} data-prueba="filtro-libro">
            <option value="">{textos.comun.todos}</option>
            {libros?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta={t.filtros.raza} ancho="corto">
          <select value={filtro.raza ?? ""} onChange={(e) => setFiltro({ ...filtro, raza: e.target.value || null })} data-prueba="filtro-raza">
            <option value="">{textos.comun.todos}</option>
            {razas?.map((r) => (
              <option key={r.id} value={r.nombre}>
                {r.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta={t.filtros.desde} ancho="corto">
          <input type="date" value={filtro.desde ?? ""} onChange={(e) => setFiltro({ ...filtro, desde: e.target.value || null })} data-prueba="filtro-desde" />
        </Campo>
        <Campo etiqueta={t.filtros.hasta} ancho="corto">
          <input type="date" value={filtro.hasta ?? ""} onChange={(e) => setFiltro({ ...filtro, hasta: e.target.value || null })} data-prueba="filtro-hasta" />
        </Campo>
        <Campo etiqueta={t.filtros.estado} ancho="corto">
          <select value={filtro.estado ?? ""} onChange={(e) => setFiltro({ ...filtro, estado: (e.target.value || null) as EstadoRegistro | null })} data-prueba="filtro-estado">
            <option value="">{textos.comun.todos}</option>
            {ESTADOS_REGISTRO.map((s) => (
              <option key={s} value={s}>
                {textos.registros.estados[s]}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      {registros === null ? (
        <p>{textos.comun.cargando}</p>
      ) : registros.length === 0 ? (
        <p className="nota" data-prueba="sin-registros">
          {hayFiltro ? t.vacioFiltro : t.vacio}
        </p>
      ) : (
        <>
          <p className="nota" data-prueba="cantidad-registros">
            {t.cantidad(registros.length)}
          </p>
          <table className="tabla tabla--filas" data-prueba="tabla-registros">
            <thead>
              <tr>
                <th>{t.columnas.numero}</th>
                <th>{t.columnas.animal}</th>
                <th>{t.columnas.libro}</th>
                <th>{t.columnas.estado}</th>
                <th>{t.columnas.version}</th>
                <th>{t.columnas.fecha}</th>
              </tr>
            </thead>
            <tbody>
              {registros.map((r) => (
                <tr key={r.id} className={abierto === r.id ? "fila-abierta" : undefined} onClick={() => setAbierto(abierto === r.id ? null : r.id)} data-registro={r.numero ?? r.id}>
                  <td className="destacado">{r.numero ?? t.sinNumero}</td>
                  <td>
                    <button
                      type="button"
                      className="enlace"
                      onClick={(e) => {
                        e.stopPropagation();
                        navegar({ pantalla: "animal", id: r.animalId, pestana: "registro" });
                      }}
                    >
                      {r.animal}
                    </button>
                    {r.identificador && <span className="nota"> · {r.identificador}</span>}
                  </td>
                  <td>{r.libro ?? textos.comun.sinDato}</td>
                  <td>
                    <span className={`insignia ${CLASE_DE_ESTADO[r.estado]}`}>{textos.registros.estados[r.estado]}</span>
                  </td>
                  <td>{r.numero ? r.version : textos.comun.sinDato}</td>
                  <td>{formatearFecha(r.fechaRegistro)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {abierto && <DetalleRegistro key={abierto} registroId={abierto} alCambiar={() => recargar()} />}
    </div>
  );
}
