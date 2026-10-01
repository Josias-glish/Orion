import { useState } from "react";
import { Campo, Casilla } from "../../componentes/Campo";
import { useConexion, useNavegar, usePermiso } from "../../componentes/contextos";
import { useCarga } from "../../componentes/useCarga";
import { listarAnimales, type FiltroAnimales } from "../../datos/repositorios/animales";
import { listarLotes } from "../../datos/repositorios/lotes";
import { edadEnMeses, fechaLocal, formatearFecha } from "../../dominio/fechas";
import { ESTADOS_ANIMAL, SEXOS, type EstadoAnimal, type Sexo } from "../../dominio/tipos";
import { textos } from "../../textos/es";

/** Se conserva mientras el programa está abierto, para volver a la lista con el mismo filtro. */
let ultimoFiltro: FiltroAnimales = {};

/** RF-01 y RF-07: lista de animales con búsqueda y filtros. */
export function ListaAnimales() {
  const conexion = useConexion();
  const navegar = useNavegar();
  const puedeCrear = usePermiso("crear_animal");
  const [filtro, setFiltroEstado] = useState<FiltroAnimales>(ultimoFiltro);
  const setFiltro = (f: FiltroAnimales) => {
    ultimoFiltro = f;
    setFiltroEstado(f);
  };
  const { datos: animales } = useCarga(() => listarAnimales(conexion, filtro), [conexion, filtro]);
  const { datos: lotes } = useCarga(() => listarLotes(conexion), [conexion]);
  const t = textos.animales;
  const hoy = fechaLocal();
  const hayFiltro = Boolean(filtro.texto || filtro.sexo || filtro.estado || filtro.loteId);

  return (
    <section className="pantalla pantalla--ancha">
      <div className="encabezado">
        <h1>{t.titulo}</h1>
        {puedeCrear && (
          <button type="button" className="boton" onClick={() => navegar({ pantalla: "nuevoAnimal" })} data-prueba="registrar-animal">
            {t.registrar}
          </button>
        )}
      </div>

      <div className="filtros">
        <Campo etiqueta={t.buscar} ancho="largo">
          <input
            type="search"
            value={filtro.texto ?? ""}
            onChange={(e) => setFiltro({ ...filtro, texto: e.target.value })}
            data-prueba="buscar"
          />
        </Campo>
        <Campo etiqueta={t.filtroSexo} ancho="corto">
          <select value={filtro.sexo ?? ""} onChange={(e) => setFiltro({ ...filtro, sexo: (e.target.value || null) as Sexo | null })}>
            <option value="">{textos.comun.todos}</option>
            {SEXOS.map((s) => (
              <option key={s} value={s}>
                {textos.comun.sexo[s]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta={t.filtroEstado} ancho="corto">
          <select
            value={filtro.estado ?? ""}
            onChange={(e) => setFiltro({ ...filtro, estado: (e.target.value || null) as EstadoAnimal | null })}
          >
            <option value="">{textos.comun.todos}</option>
            {ESTADOS_ANIMAL.map((s) => (
              <option key={s} value={s}>
                {textos.comun.estado[s]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta={t.filtroLote} ancho="corto">
          <select value={filtro.loteId ?? ""} onChange={(e) => setFiltro({ ...filtro, loteId: e.target.value || null })}>
            <option value="">{textos.comun.todos}</option>
            {lotes?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Casilla
          etiqueta={t.incluirGenealogia}
          marcada={Boolean(filtro.incluirSoloGenealogia)}
          alCambiar={(v) => setFiltro({ ...filtro, incluirSoloGenealogia: v })}
        />
      </div>

      {animales === null ? (
        <p>{textos.comun.cargando}</p>
      ) : animales.length === 0 ? (
        <p className="nota">{hayFiltro ? t.vacio : t.vacioSinFiltro}</p>
      ) : (
        <>
          <p className="nota" data-prueba="cantidad">
            {t.cantidad(animales.length)}
          </p>
          <table className="tabla tabla--filas" data-prueba="tabla-animales">
            <thead>
              <tr>
                <th>{t.columnas.identificador}</th>
                <th>{t.columnas.nombre}</th>
                <th>{t.columnas.sexo}</th>
                <th>{t.columnas.nacimiento}</th>
                <th>{t.columnas.lote}</th>
                <th>{t.columnas.estado}</th>
              </tr>
            </thead>
            <tbody>
              {animales.map((a) => (
                <tr key={a.id} onClick={() => navegar({ pantalla: "animal", id: a.id, pestana: "ficha" })}>
                  <td>{a.identificador ?? textos.comun.sinDato}</td>
                  <td>
                    <button
                      type="button"
                      className="enlace"
                      onClick={(e) => {
                        e.stopPropagation();
                        navegar({ pantalla: "animal", id: a.id, pestana: "ficha" });
                      }}
                    >
                      {a.nombre ?? t.sinNombre}
                    </button>
                    {!a.enHato && <span className="insignia">{t.soloGenealogia}</span>}
                  </td>
                  <td>{textos.comun.sexo[a.sexo]}</td>
                  <td>
                    {a.fechaNacimiento
                      ? `${formatearFecha(a.fechaNacimiento)} (${textos.comun.edad(edadEnMeses(a.fechaNacimiento, hoy))})`
                      : textos.comun.sinDato}
                  </td>
                  <td>{a.lote ?? textos.comun.sinDato}</td>
                  <td>{textos.comun.estado[a.estado]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
