import { useState } from "react";
import { Aviso } from "../../componentes/Aviso";
import { Campo, Casilla } from "../../componentes/Campo";
import { useConexion, useContextoCambio, useNavegar, usePermiso } from "../../componentes/contextos";
import { GuardarCopias, type Generado } from "../../componentes/GuardarCopias";
import { ListaMotivos } from "../../componentes/ListaMotivos";
import { useCarga } from "../../componentes/useCarga";
import { listarDocumentos } from "../../datos/repositorios/documentos";
import {
  anularRegistro,
  descartarBorrador,
  editarBorrador,
  emitirRegistro,
  historialDeRegistro,
  obtenerRegistro,
  reemitirRegistro,
} from "../../datos/repositorios/registros";
import { formatearFecha, formatearMarcaDeTiempo } from "../../dominio/fechas";
import type { GeneracionesPedigri } from "../../dominio/pedigri";
import { textos } from "../../textos/es";
import { CLASE_DE_ESTADO } from "./estado";
import { generarCertificadoDeRegistro } from "./certificados";

const t = textos.registros.pantalla.detalle;
const e = textos.registros;

/**
 * R31: un registro con sus acciones. Borrador: editar, emitir o descartar. Emitido: certificado en PDF, reemitir
 * (versión nueva con el mismo número) o anular (con motivo). Anulado: solo se consulta. El número nunca se reutiliza.
 */
export function DetalleRegistro({ registroId, alCambiar }: { registroId: string; alCambiar?: (mensaje: string | null) => void | Promise<void> }) {
  const conexion = useConexion();
  const contexto = useContextoCambio();
  const navegar = useNavegar();
  const puedeGestionar = usePermiso("gestionar_registros");
  const { datos: registro, recargar } = useCarga(() => obtenerRegistro(conexion, registroId), [conexion, registroId]);
  const { datos: historial, recargar: recargarHistorial } = useCarga(() => historialDeRegistro(conexion, registroId), [conexion, registroId]);
  const { datos: documentos, recargar: recargarDocumentos } = useCarga(
    async () => (registro ? (await listarDocumentos(conexion, { animalId: registro.animalId })).filter((d) => d.tipo === "registro_propio") : []),
    [conexion, registro?.animalId, registro?.version],
  );
  const [modo, setModo] = useState<"anular" | "editar" | "descartar" | null>(null);
  const [motivo, setMotivo] = useState("");
  const [observaciones, setObservaciones] = useState<string | null>(null);
  const [fecha, setFecha] = useState<string | null>(null);
  const [cuatro, setCuatro] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [copias, setCopias] = useState<Generado[]>([]);
  const generaciones: GeneracionesPedigri = cuatro ? 4 : 3;

  if (registro === null) return <p>{textos.comun.cargando}</p>;
  if (!registro) return <Aviso tipo="error">{textos.errores.motivo({ codigo: "no_encontrado" })}</Aviso>;

  /** Recarga lo que muestra y avisa a quien lo contiene, con el mensaje (un registro anulado deja de estar a la vista). */
  async function refrescar(mensajeDeLaAccion: string | null) {
    await Promise.all([recargar(), recargarHistorial(), recargarDocumentos()]);
    await alCambiar?.(mensajeDeLaAccion);
  }
  /** Ejecuta una acción mostrando los errores y bloqueando los botones mientras trabaja. */
  async function ejecutar(accion: () => Promise<string | null>) {
    setError(null);
    setMensaje(null);
    setOcupado(true);
    try {
      const resultado = await accion();
      if (resultado) setMensaje(resultado);
      setModo(null);
      await refrescar(resultado);
    } catch (err) {
      setError(err);
    } finally {
      setOcupado(false);
    }
  }
  async function conCertificado(registroDelCertificado: string): Promise<void> {
    const c = await generarCertificadoDeRegistro(conexion, contexto(), registroDelCertificado, generaciones);
    setCopias([{ nombre: c.nombre, bytes: c.bytes, filtro: { nombre: textos.documentos.filtroPdf, extension: "pdf" } }]);
  }

  const r = registro;
  return (
    <div className="tarjeta" data-prueba="detalle-registro" data-estado={r.estado}>
      <div className="encabezado">
        <h2 data-prueba="titulo-registro">{t.titulo(r.numero ?? undefined)}</h2>
        <span className={`insignia ${CLASE_DE_ESTADO[r.estado]}`} data-prueba="estado-registro">
          {e.estados[r.estado]}
        </span>
        {r.numero && <span className="insignia">{e.version(r.version)}</span>}
      </div>
      <ListaMotivos error={error} />
      {mensaje && (
        <Aviso tipo="exito">
          <span data-prueba="mensaje-registro">{mensaje}</span>
        </Aviso>
      )}

      <dl className="ficha">
        <dt>{t.animal}</dt>
        <dd>
          <button type="button" className="enlace" onClick={() => navegar({ pantalla: "animal", id: r.animalId, pestana: "ficha" })}>
            {r.animal}
          </button>
          {r.identificador && <span className="nota"> · {r.identificador}</span>}
        </dd>
        <dt>{t.libro}</dt>
        <dd>{r.libro ?? textos.comun.sinDato}</dd>
        <dt>{t.fechaRegistro}</dt>
        <dd>{formatearFecha(r.fechaRegistro)}</dd>
        {r.responsable && (
          <>
            <dt>{t.responsable}</dt>
            <dd>{r.responsable}</dd>
          </>
        )}
        {r.observaciones && (
          <>
            <dt>{t.observaciones}</dt>
            <dd>{r.observaciones}</dd>
          </>
        )}
        {r.motivoAnulacion && (
          <>
            <dt>{t.motivo}</dt>
            <dd data-prueba="motivo-anulacion">{r.motivoAnulacion}</dd>
          </>
        )}
      </dl>

      {r.estado === "borrador" && puedeGestionar && (
        <div>
          <p className="nota">{t.borradorAyuda}</p>
          {modo === "editar" ? (
            <form
              onSubmit={(ev) => {
                ev.preventDefault();
                ejecutar(async () => {
                  await editarBorrador(conexion, r.id, { fechaRegistro: fecha ?? r.fechaRegistro, observaciones: observaciones ?? r.observaciones }, contexto());
                  return t.borradorGuardado;
                });
              }}
            >
              <div className="rejilla">
                <Campo etiqueta={t.fechaRegistro} ancho="corto">
                  <input type="date" value={fecha ?? r.fechaRegistro} onChange={(ev) => setFecha(ev.target.value)} data-prueba="borrador-fecha" />
                </Campo>
                <Campo etiqueta={t.observaciones} ancho="largo">
                  <input value={observaciones ?? r.observaciones ?? ""} onChange={(ev) => setObservaciones(ev.target.value)} data-prueba="borrador-observaciones" />
                </Campo>
              </div>
              <div className="acciones">
                <button type="submit" className="boton" disabled={ocupado} data-prueba="guardar-borrador">
                  {t.guardarBorrador}
                </button>
                <button type="button" className="boton boton--secundario" onClick={() => setModo(null)}>
                  {textos.comun.cancelar}
                </button>
              </div>
            </form>
          ) : modo === "descartar" ? (
            <div className="acciones-fila">
              <span className="destacado">{t.descartarConfirmar}</span>
              <button
                type="button"
                className="boton boton--peligro boton--pequeno"
                disabled={ocupado}
                onClick={() =>
                  ejecutar(async () => {
                    await descartarBorrador(conexion, r.id, contexto());
                    return t.borradorDescartado;
                  })
                }
                data-prueba="confirmar-descartar"
              >
                {t.descartar}
              </button>
              <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => setModo(null)}>
                {textos.comun.cancelar}
              </button>
            </div>
          ) : (
            <div className="acciones">
              <button
                type="button"
                className="boton"
                disabled={ocupado}
                onClick={() =>
                  ejecutar(async () => {
                    const emitido = await emitirRegistro(conexion, r.animalId, contexto());
                    await conCertificado(emitido.registroId);
                    return t.emitido(emitido.numero);
                  })
                }
                data-prueba="emitir-borrador"
              >
                {ocupado ? t.trabajando : t.emitir}
              </button>
              <button type="button" className="boton boton--secundario" onClick={() => setModo("editar")} data-prueba="editar-borrador">
                {t.editar}
              </button>
              <button type="button" className="boton boton--secundario" onClick={() => setModo("descartar")} data-prueba="descartar-borrador">
                {t.descartar}
              </button>
            </div>
          )}
        </div>
      )}

      {r.estado === "emitido" && puedeGestionar && (
        <div>
          <h3>{t.certificadoTitulo}</h3>
          <p className="nota">{t.certificadoAyuda}</p>
          <Aviso tipo="info">{e.aviso}</Aviso>
          <Casilla etiqueta={t.cuatroGeneraciones} marcada={cuatro} alCambiar={setCuatro} prueba="cuatro-generaciones" />
          <div className="acciones">
            <button
              type="button"
              className="boton"
              disabled={ocupado}
              onClick={() =>
                ejecutar(async () => {
                  await conCertificado(r.id);
                  return t.certificadoGuardado(r.numero ?? "", r.version);
                })
              }
              data-prueba="generar-certificado-registro"
            >
              {ocupado ? t.trabajando : t.generarCertificado}
            </button>
          </div>
          {copias.length > 0 && <GuardarCopias archivos={copias} />}

          {modo === "anular" ? (
            <form
              className="tarjeta tarjeta--peligro"
              onSubmit={(ev) => {
                ev.preventDefault();
                ejecutar(async () => {
                  await anularRegistro(conexion, r.id, motivo, contexto());
                  return t.anulado(r.numero ?? "");
                });
              }}
            >
              <p className="destacado">{t.anularAyuda}</p>
              <Campo etiqueta={t.motivoAnulacion} ancho="largo">
                <input value={motivo} onChange={(ev) => setMotivo(ev.target.value)} data-prueba="motivo-anulacion-texto" />
              </Campo>
              <div className="acciones">
                <button type="submit" className="boton boton--peligro" disabled={ocupado} data-prueba="confirmar-anular">
                  {t.confirmarAnular}
                </button>
                <button type="button" className="boton boton--secundario" onClick={() => setModo(null)}>
                  {textos.comun.cancelar}
                </button>
              </div>
            </form>
          ) : (
            <div className="acciones">
              <button
                type="button"
                className="boton boton--secundario"
                disabled={ocupado}
                onClick={() =>
                  ejecutar(async () => {
                    const nuevo = await reemitirRegistro(conexion, r.id, contexto());
                    await conCertificado(nuevo.registroId);
                    return t.reemitido(nuevo.numero, nuevo.version);
                  })
                }
                data-prueba="reemitir-registro"
              >
                {t.reemitir}
              </button>
              <button type="button" className="boton boton--secundario" onClick={() => setModo("anular")} data-prueba="anular-registro">
                {t.anular}
              </button>
            </div>
          )}
          <p className="nota">{t.reemitirAyuda}</p>
        </div>
      )}

      {r.numero && (
        <>
          <h3>{t.documentosTitulo}</h3>
          {documentos && documentos.filter((d) => d.numero.startsWith(`${r.numero}-v`)).length > 0 ? (
            <table className="tabla" data-prueba="documentos-registro">
              <thead>
                <tr>
                  <th>{textos.documentos.emitidosColumnas.fecha}</th>
                  <th>{textos.documentos.emitidosColumnas.numero}</th>
                  <th>{textos.documentos.emitidosColumnas.archivo}</th>
                </tr>
              </thead>
              <tbody>
                {documentos
                  .filter((d) => d.numero.startsWith(`${r.numero}-v`))
                  .map((d) => (
                    <tr key={d.id}>
                      <td>{formatearFecha(d.fecha)}</td>
                      <td className="destacado">{d.numero}</td>
                      <td className="nota">{d.archivo}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ) : (
            <p className="nota">{t.sinDocumentos}</p>
          )}
        </>
      )}

      <h3>{t.historialTitulo}</h3>
      {historial && historial.length > 0 ? (
        <table className="tabla" data-prueba="historial-registro">
          <thead>
            <tr>
              <th>{textos.historial.columnas.fecha}</th>
              <th>{textos.historial.columnas.cambio}</th>
              <th>{textos.historial.columnas.antes}</th>
              <th>{textos.historial.columnas.despues}</th>
              <th>{textos.historial.columnas.usuario}</th>
            </tr>
          </thead>
          <tbody>
            {historial.map((h, i) => (
              <tr key={i}>
                <td>{formatearMarcaDeTiempo(h.marcaTiempo)}</td>
                <td>{textos.historial.campo(h.campo)}</td>
                {/* La copia fija completa va al historial, pero es demasiado larga para leerla aquí. */}
                <td>{h.campo === "instantanea" ? (h.valorAnterior ? t.copiaAnterior : textos.comun.sinDato) : t.valor(h.campo, h.valorAnterior ?? undefined)}</td>
                <td>{h.campo === "instantanea" ? t.copiaNueva : t.valor(h.campo, h.valorNuevo ?? undefined)}</td>
                <td>{h.usuario ?? textos.comun.sinDato}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="nota">{textos.historial.vacio}</p>
      )}
    </div>
  );
}
