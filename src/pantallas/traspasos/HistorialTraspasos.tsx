import { useState } from "react";
import { Aviso } from "../../componentes/Aviso";
import { Campo } from "../../componentes/Campo";
import { useConexion, useContextoCambio, useNavegar } from "../../componentes/contextos";
import { ListaMotivos } from "../../componentes/ListaMotivos";
import { useCarga } from "../../componentes/useCarga";
import { guardarCopiaDeAdjunto } from "../../datos/archivos";
import { listarContactos } from "../../datos/repositorios/contactos";
import { crearMovimientoDeTraspaso, listarTraspasos, type FilaTraspaso } from "../../datos/repositorios/traspasos";
import { formatearFecha } from "../../dominio/fechas";
import { resumirTraspasos, TIPOS_TRASPASO, type TipoTraspaso } from "../../dominio/traspasos";
import { textos } from "../../textos/es";

const t = textos.traspasos;

interface Filtros {
  desde: string;
  hasta: string;
  tipo: "" | TipoTraspaso;
  contactoId: string;
}

const SIN_FILTROS: Filtros = { desde: "", hasta: "", tipo: "", contactoId: "" };

/**
 * RF-50 y RF-16: el historial de compras y ventas de animales, con filtros por periodo, tipo y contacto. Solo el
 * propietario (R23): la ruta exige `ver_traspasos`. Es solo un registro; el programa no publica animales en venta.
 */
export function HistorialTraspasos() {
  const conexion = useConexion();
  const contexto = useContextoCambio();
  const navegar = useNavegar();
  const [filtros, setFiltros] = useState<Filtros>(SIN_FILTROS);
  const { datos: filas, error: errorCarga, recargar } = useCarga(
    () =>
      listarTraspasos(conexion, {
        desde: filtros.desde || null,
        hasta: filtros.hasta || null,
        tipo: filtros.tipo || null,
        contactoId: filtros.contactoId || null,
      }),
    [conexion, filtros],
  );
  const { datos: contactos } = useCarga(() => listarContactos(conexion), [conexion]);
  const [error, setError] = useState<unknown>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const lista = filas ?? [];
  const resumen = resumirTraspasos(lista);
  const hayFiltros = JSON.stringify(filtros) !== JSON.stringify(SIN_FILTROS);

  async function anotarMovimiento(fila: FilaTraspaso) {
    setError(null);
    setMensaje(null);
    try {
      const descripcion = fila.tipo === "compra" ? t.descripcionGasto(fila.animal, fila.contacto) : t.descripcionIngreso(fila.animal, fila.contacto);
      await crearMovimientoDeTraspaso(conexion, fila.id, contexto(), descripcion);
      setMensaje(t.movimientoAnotado(fila.tipo === "compra" ? t.gasto : t.ingreso, textos.comun.pesos(fila.precio ?? 0)));
      await recargar();
    } catch (e) {
      setError(e);
    }
  }

  async function guardarAdjunto(ruta: string) {
    setError(null);
    setMensaje(null);
    try {
      const destino = await guardarCopiaDeAdjunto(ruta, t.filtroAdjunto);
      if (destino) setMensaje(t.adjuntoGuardado(destino));
    } catch (e) {
      setError(e);
    }
  }

  return (
    <section className="pantalla pantalla--ancha" data-prueba="pantalla-traspasos">
      <h1>{t.titulo}</h1>
      <p className="nota">{t.ayuda}</p>
      <div className="acciones">
        <button type="button" className="boton" onClick={() => navegar({ pantalla: "registrarCompra" })} data-prueba="historial-registrar-compra">
          {textos.animales.registrarCompra}
        </button>
      </div>
      <ListaMotivos error={error ?? errorCarga} />
      {mensaje && <Aviso tipo="exito">{mensaje}</Aviso>}

      <div className="filtros" data-prueba="filtros-traspasos">
        <Campo etiqueta={t.filtros.desde} ancho="corto">
          <input type="date" value={filtros.desde} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} data-prueba="filtro-desde" />
        </Campo>
        <Campo etiqueta={t.filtros.hasta} ancho="corto">
          <input type="date" value={filtros.hasta} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })} data-prueba="filtro-hasta" />
        </Campo>
        <Campo etiqueta={t.filtros.tipo} ancho="corto">
          <select value={filtros.tipo} onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value as "" | TipoTraspaso })} data-prueba="filtro-tipo">
            <option value="">{textos.comun.todos}</option>
            {TIPOS_TRASPASO.map((v) => (
              <option key={v} value={v}>
                {t.tipo[v]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta={t.filtros.contacto} ancho="medio">
          <select value={filtros.contactoId} onChange={(e) => setFiltros({ ...filtros, contactoId: e.target.value })} data-prueba="filtro-contacto">
            <option value="">{textos.comun.todos}</option>
            {(contactos ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.criadero ? `${c.nombre} · ${c.criadero}` : c.nombre}
              </option>
            ))}
          </select>
        </Campo>
        {hayFiltros && (
          <button type="button" className="boton boton--secundario" onClick={() => setFiltros(SIN_FILTROS)} data-prueba="quitar-filtros">
            {t.filtros.quitar}
          </button>
        )}
      </div>

      {filas === null ? (
        <p>{textos.comun.cargando}</p>
      ) : lista.length === 0 ? (
        <p className="nota" data-prueba="traspasos-vacio">
          {hayFiltros ? t.vacioConFiltro : t.vacio}
        </p>
      ) : (
        <>
          <p className="destacado" data-prueba="traspasos-totales">
            {t.resumen.compras(resumen.compras.cantidad, textos.comun.pesos(resumen.compras.total))} · {t.resumen.ventas(resumen.ventas.cantidad, textos.comun.pesos(resumen.ventas.total))} ·{" "}
            {t.resumen.saldo(textos.comun.pesos(resumen.saldo))}
          </p>
          <div className="tabla-ancha">
            <table className="tabla" data-prueba="tabla-traspasos">
              <thead>
                <tr>
                  <th>{t.columnas.fecha}</th>
                  <th>{t.columnas.tipo}</th>
                  <th>{t.columnas.animal}</th>
                  <th>{t.columnas.contacto}</th>
                  <th className="numero">{t.columnas.precio}</th>
                  <th>{t.columnas.finanzas}</th>
                  <th>{t.columnas.documentos}</th>
                  <th>{t.columnas.observaciones}</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((f) => (
                  <tr key={f.id} data-traspaso={`${f.tipo}-${f.animal}`}>
                    <td>{formatearFecha(f.fecha)}</td>
                    <td>
                      <span className={`insignia insignia--${f.tipo === "compra" ? "gasto" : "ingreso"}`}>{t.tipo[f.tipo]}</span>
                    </td>
                    <td>
                      <button type="button" className="enlace" onClick={() => navegar({ pantalla: "animal", id: f.animalId, pestana: "ficha" })}>
                        {f.animal || textos.animales.sinNombre}
                      </button>
                      {f.identificador && f.animal !== f.identificador && <div className="nota">{f.identificador}</div>}
                    </td>
                    <td data-columna="contacto">{f.contacto}</td>
                    <td className="numero" data-columna="precio">
                      {f.precio === null ? <span className="nota">{t.sinPrecio}</span> : textos.comun.pesos(f.precio)}
                    </td>
                    <td>
                      {f.movimientoId ? (
                        <span className="insignia">{t.anotadoEnFinanzas}</span>
                      ) : f.precio !== null ? (
                        <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => anotarMovimiento(f)} data-prueba="anotar-movimiento">
                          {f.tipo === "compra" ? t.anotarGasto : t.anotarIngreso}
                        </button>
                      ) : null}
                    </td>
                    <td>
                      {f.adjuntos.length === 0 ? (
                        <span className="nota">{t.sinAdjuntos}</span>
                      ) : (
                        <>
                          <div>{t.adjuntos(f.adjuntos.length)}</div>
                          {f.adjuntos.map((ruta, i) => (
                            <button key={ruta} type="button" className="enlace" onClick={() => guardarAdjunto(ruta)} data-prueba="guardar-adjunto" title={ruta.replace(/^documentos\//, "")}>
                              {f.adjuntos.length === 1 ? t.guardarAdjunto : `${t.guardarAdjunto} (${i + 1})`}
                            </button>
                          ))}
                        </>
                      )}
                    </td>
                    <td>{f.observaciones}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
