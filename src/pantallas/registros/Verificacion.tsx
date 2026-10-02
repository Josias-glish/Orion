import { useMemo, useState } from "react";
import { Aviso } from "../../componentes/Aviso";
import { Campo } from "../../componentes/Campo";
import { useConexion, useContextoCambio, useNavegar } from "../../componentes/contextos";
import { ListaMotivos } from "../../componentes/ListaMotivos";
import { useCarga } from "../../componentes/useCarga";
import { listarCatalogo } from "../../datos/repositorios/catalogos";
import { emitirEnLote, listarVerificaciones, type FiltroVerificaciones, type ResultadoLote, type Verificacion } from "../../datos/repositorios/registros";
import { textos } from "../../textos/es";
import { generarCertificadoDeRegistro } from "./certificados";
import { FaltantesEnLinea } from "./ListaDeVerificacion";

const t = textos.registros.pantalla.verificacion;

type SituacionVerificacion = NonNullable<FiltroVerificaciones["situacion"]>;
const SITUACIONES: SituacionVerificacion[] = ["listos", "faltantes", "con_registro", "sin_registro"];

/** Un animal se puede emitir ahora si cumple todo y no tiene ya un registro emitido. */
const sePuedeEmitir = (v: Verificacion) => v.elegible && v.lista.cumple && v.registro?.estado !== "emitido";

/**
 * R31: lista de verificación de todos los animales del hato, con lo que le falta a cada uno y un enlace para
 * corregirlo, y emisión en lote: emite a los que cumplen y muestra a los demás, sin saltos en la numeración.
 */
export function Verificacion({ alCambiar }: { alCambiar?: () => void }) {
  const conexion = useConexion();
  const contexto = useContextoCambio();
  const navegar = useNavegar();
  const [filtro, setFiltro] = useState<FiltroVerificaciones>({});
  const { datos: animales, recargar } = useCarga(() => listarVerificaciones(conexion, filtro), [conexion, filtro]);
  const { datos: libros } = useCarga(() => listarCatalogo(conexion, "libro"), [conexion]);
  const [elegidos, setElegidos] = useState<ReadonlySet<string>>(new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [resultado, setResultado] = useState<(ResultadoLote & { certificados: number }) | null>(null);

  const listos = useMemo(() => (animales ?? []).filter(sePuedeEmitir), [animales]);
  const seleccionados = (animales ?? []).filter((a) => elegidos.has(a.animalId));
  const alternar = (id: string) => setElegidos((actual) => new Set(actual.has(id) ? [...actual].filter((x) => x !== id) : [...actual, id]));

  async function emitir() {
    setError(null);
    setResultado(null);
    setTrabajando(true);
    try {
      // El orden de la selección es el de la lista (por nombre): así los números salen en el orden que se ve.
      const ids = seleccionados.map((a) => a.animalId);
      const lote = await emitirEnLote(conexion, ids, contexto());
      let certificados = 0;
      for (const e of lote.emitidos) {
        await generarCertificadoDeRegistro(conexion, contexto(), e.registroId);
        certificados += 1;
      }
      setResultado({ ...lote, certificados });
      setElegidos(new Set());
      await recargar();
      alCambiar?.();
    } catch (e) {
      setError(e);
    } finally {
      setTrabajando(false);
      setConfirmando(false);
    }
  }

  return (
    <div>
      <p className="nota">{t.ayuda}</p>
      <div className="filtros">
        <Campo etiqueta={t.buscar} ancho="largo">
          <input type="search" value={filtro.texto ?? ""} onChange={(e) => setFiltro({ ...filtro, texto: e.target.value })} data-prueba="buscar-verificacion" />
        </Campo>
        <Campo etiqueta={t.libro} ancho="corto">
          <select value={filtro.libroId ?? ""} onChange={(e) => setFiltro({ ...filtro, libroId: e.target.value || null })}>
            <option value="">{textos.comun.todos}</option>
            {libros?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta={t.mostrar} ancho="medio">
          <select value={filtro.situacion ?? ""} onChange={(e) => setFiltro({ ...filtro, situacion: (e.target.value || null) as SituacionVerificacion | null })} data-prueba="filtro-situacion">
            <option value="">{textos.comun.todos}</option>
            {SITUACIONES.map((s) => (
              <option key={s} value={s}>
                {t.situaciones[s]}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      <ListaMotivos error={error} />
      {resultado && <ResultadoDelLote resultado={resultado} />}

      {animales === null ? (
        <p>{textos.comun.cargando}</p>
      ) : animales.length === 0 ? (
        <p className="nota">{t.vacio}</p>
      ) : (
        <>
          <div className="acciones">
            <button type="button" className="boton boton--secundario" onClick={() => setElegidos(new Set(listos.map((a) => a.animalId)))} disabled={listos.length === 0} data-prueba="seleccionar-listos">
              {t.seleccionarListos(listos.length)}
            </button>
            <button type="button" className="boton boton--secundario" onClick={() => setElegidos(new Set())} disabled={elegidos.size === 0}>
              {t.quitarSeleccion}
            </button>
            <button type="button" className="boton" onClick={() => setConfirmando(true)} disabled={seleccionados.length === 0 || trabajando} data-prueba="emitir-lote">
              {t.emitirSeleccionados(seleccionados.length)}
            </button>
          </div>
          {confirmando && (
            <Aviso tipo="info">
              <p className="destacado" data-prueba="confirmar-lote">{t.confirmar(seleccionados.length)}</p>
              <div className="acciones">
                <button type="button" className="boton" disabled={trabajando} onClick={emitir} data-prueba="confirmar-emitir-lote">
                  {trabajando ? t.emitiendo : t.si}
                </button>
                <button type="button" className="boton boton--secundario" disabled={trabajando} onClick={() => setConfirmando(false)}>
                  {textos.comun.cancelar}
                </button>
              </div>
            </Aviso>
          )}
          <p className="nota" data-prueba="cantidad-verificacion">{t.cantidad(animales.length, listos.length)}</p>
          <table className="tabla" data-prueba="tabla-verificacion">
            <thead>
              <tr>
                <th>
                  <span className="solo-lectores">{t.elegir}</span>
                </th>
                <th>{t.columnas.animal}</th>
                <th>{t.columnas.libro}</th>
                <th>{t.columnas.registro}</th>
                <th>{t.columnas.requisitos}</th>
              </tr>
            </thead>
            <tbody>
              {animales.map((a) => (
                <tr key={a.animalId} data-animal={a.identificador ?? a.animalId}>
                  <td>
                    <input
                      type="checkbox"
                      checked={elegidos.has(a.animalId)}
                      onChange={() => alternar(a.animalId)}
                      disabled={a.registro?.estado === "emitido"}
                      aria-label={`${t.elegir}: ${a.nombre ?? a.identificador ?? ""}`}
                      data-prueba="elegir-animal"
                    />
                  </td>
                  <td>
                    <button type="button" className="enlace" onClick={() => navegar({ pantalla: "animal", id: a.animalId, pestana: "registro" })}>
                      {a.nombre ?? a.identificador ?? textos.animales.sinNombre}
                    </button>
                    {a.identificador && a.nombre && <span className="nota"> · {a.identificador}</span>}
                  </td>
                  <td>{a.libro ?? textos.comun.sinDato}</td>
                  <td>
                    {a.registro ? (
                      <button
                        type="button"
                        className="enlace"
                        onClick={() => navegar({ pantalla: "registros", seccion: "registros", registroId: a.registro!.id })}
                      >
                        {a.registro.numero ?? textos.registros.estados[a.registro.estado]}
                      </button>
                    ) : (
                      <span className="nota">{t.sinRegistro}</span>
                    )}
                  </td>
                  <td>{a.registro?.estado === "emitido" ? <span className="nota">{t.yaEmitido}</span> : <FaltantesEnLinea faltantes={a.lista.faltantes} animalId={a.animalId} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

/** Resultado de una emisión en lote: lo emitido con su número y lo que no se pudo, con lo que le falta. */
function ResultadoDelLote({ resultado }: { resultado: ResultadoLote & { certificados: number } }) {
  const navegar = useNavegar();
  return (
    <div data-prueba="resultado-lote">
      {resultado.emitidos.length > 0 && (
        <Aviso tipo="exito">
          <p className="destacado" data-prueba="lote-emitidos">{t.resultado.emitidos(resultado.emitidos.length, resultado.certificados)}</p>
          <ul>
            {resultado.emitidos.map((e) => (
              <li key={e.registroId}>
                <button type="button" className="enlace" onClick={() => navegar({ pantalla: "registros", seccion: "registros", registroId: e.registroId })}>
                  {e.numero}
                </button>{" "}
                — {e.nombre}
              </li>
            ))}
          </ul>
        </Aviso>
      )}
      {resultado.emitidos.length === 0 && resultado.rechazados.length > 0 && <Aviso tipo="info">{t.resultado.ninguno}</Aviso>}
      {resultado.rechazados.length > 0 && (
        <Aviso tipo="error">
          <p className="destacado" data-prueba="lote-rechazados">{t.resultado.rechazados(resultado.rechazados.length)}</p>
          <ul>
            {resultado.rechazados.map((r) => (
              <li key={r.animalId}>
                <button type="button" className="enlace" onClick={() => navegar({ pantalla: "animal", id: r.animalId, pestana: "registro" })}>
                  {r.nombre || textos.animales.sinNombre}
                </button>
                {": "}
                {r.motivo === "incompleto" ? <FaltantesEnLinea faltantes={r.faltantes} animalId={r.animalId} /> : t.resultado.motivos[r.motivo]}
              </li>
            ))}
          </ul>
        </Aviso>
      )}
    </div>
  );
}
