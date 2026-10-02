import { useState } from "react";
import { Aviso } from "../../componentes/Aviso";
import { Campo } from "../../componentes/Campo";
import { useConexion, useContextoCambio } from "../../componentes/contextos";
import { ListaMotivos } from "../../componentes/ListaMotivos";
import { SelectorAnimal } from "../../componentes/SelectorAnimal";
import { useCarga } from "../../componentes/useCarga";
import { ErrorDeRegistro } from "../../datos/errores";
import { listarAnimales } from "../../datos/repositorios/animales";
import {
  actualizarMovimiento,
  listarCategorias,
  listarMovimientos,
  registrarMovimiento,
  retirarMovimiento,
  type DatosMovimientoNuevo,
  type FilaMovimiento,
} from "../../datos/repositorios/finanzas";
import { listarLotes } from "../../datos/repositorios/lotes";
import { fechaLocal, formatearFecha } from "../../dominio/fechas";
import { leerPesos, TIPOS_MOVIMIENTO, type TipoMovimiento } from "../../dominio/finanzas";
import { textos } from "../../textos/es";

const t = textos.finanzas;

type Asignacion = "finca" | "lote" | "animal";
interface Formulario {
  tipo: TipoMovimiento;
  categoriaId: string;
  valor: string;
  fecha: string;
  asignacion: Asignacion;
  loteId: string;
  animalId: string | null;
  descripcion: string;
}

const formularioVacio = (tipo: TipoMovimiento = "gasto"): Formulario => ({
  tipo,
  categoriaId: "",
  valor: "",
  fecha: fechaLocal(),
  asignacion: "finca",
  loteId: "",
  animalId: null,
  descripcion: "",
});

const deMovimiento = (m: FilaMovimiento): Formulario => ({
  tipo: m.tipo,
  categoriaId: m.categoriaId,
  valor: String(m.valor),
  fecha: m.fecha,
  asignacion: m.animalId ? "animal" : m.loteId ? "lote" : "finca",
  loteId: m.loteId ?? "",
  animalId: m.animalId,
  descripcion: m.descripcion ?? "",
});

/** «A quién» se asignó un movimiento, para la tabla. */
const asignadoA = (m: FilaMovimiento) =>
  m.animal ? `${textos.animales.titulo}: ${m.animal}` : m.lote ? `${textos.finanzas.campos.lote}: ${m.lote}` : m.tipo === "gasto" ? t.gastoGeneral : t.ingresoGeneral;

/** RF-33: anotar, corregir y retirar ingresos y gastos, con filtro por periodo, tipo y categoría. */
export function Movimientos() {
  const conexion = useConexion();
  const contexto = useContextoCambio();
  const [filtros, setFiltros] = useState({ desde: "", hasta: "", tipo: "" as "" | TipoMovimiento, categoriaId: "" });
  const { datos: movimientos, error: errorCarga, recargar } = useCarga(
    () =>
      listarMovimientos(conexion, {
        desde: filtros.desde || null,
        hasta: filtros.hasta || null,
        tipo: filtros.tipo || null,
        categoriaId: filtros.categoriaId || null,
      }),
    [conexion, filtros],
  );
  const { datos: categorias } = useCarga(() => listarCategorias(conexion), [conexion]);
  const { datos: lotes } = useCarga(() => listarLotes(conexion), [conexion]);
  const { datos: animales } = useCarga(() => listarAnimales(conexion), [conexion]);

  const [f, setF] = useState<Formulario>(formularioVacio);
  const [editando, setEditando] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  // Categorías que se pueden elegir: las activas del tipo, y la que ya tenía el movimiento que se corrige.
  const elegibles = (categorias ?? []).filter((c) => c.tipo === f.tipo && (c.activo || c.id === f.categoriaId));
  const categoriaElegida = elegibles.some((c) => c.id === f.categoriaId) ? f.categoriaId : (elegibles[0]?.id ?? "");

  function cambiarTipo(tipo: TipoMovimiento) {
    setF({ ...f, tipo, categoriaId: "" });
  }

  function limpiar() {
    setF(formularioVacio(f.tipo));
    setEditando(null);
  }

  async function guardar() {
    setError(null);
    setExito(null);
    try {
      if (f.asignacion === "lote" && !f.loteId) throw new ErrorDeRegistro([{ codigo: "dato_obligatorio", campo: "lote_id" }]);
      if (f.asignacion === "animal" && !f.animalId) throw new ErrorDeRegistro([{ codigo: "dato_obligatorio", campo: "animal_id" }]);
      const datos: DatosMovimientoNuevo = {
        fecha: f.fecha,
        tipo: f.tipo,
        categoriaId: categoriaElegida,
        // Un valor vacío o que no es número se rechaza con el mensaje del valor (nunca se guarda a medias).
        valor: leerPesos(f.valor) ?? Number.NaN,
        animalId: f.asignacion === "animal" ? f.animalId : null,
        loteId: f.asignacion === "lote" ? f.loteId : null,
        descripcion: f.descripcion,
      };
      if (editando) {
        await actualizarMovimiento(conexion, editando, datos, contexto());
        setExito(t.corregido);
      } else {
        await registrarMovimiento(conexion, datos, contexto());
        setExito(t.guardado);
      }
      limpiar();
      await recargar();
    } catch (e) {
      setError(e);
    }
  }

  function corregir(m: FilaMovimiento) {
    setF(deMovimiento(m));
    setEditando(m.id);
    setError(null);
    setExito(null);
    document.querySelector(".contenido")?.scrollTo(0, 0);
  }

  const lista = movimientos ?? [];
  const ingresos = lista.filter((m) => m.tipo === "ingreso").reduce((s, m) => s + m.valor, 0);
  const gastos = lista.filter((m) => m.tipo === "gasto").reduce((s, m) => s + m.valor, 0);
  const hayFiltros = Boolean(filtros.desde || filtros.hasta || filtros.tipo || filtros.categoriaId);

  return (
    <div>
      <form
        className="tarjeta"
        onSubmit={(e) => {
          e.preventDefault();
          guardar();
        }}
        data-prueba="formulario-movimiento"
      >
        <h2>{editando ? t.corregirTitulo : t.nuevo}</h2>
        <ListaMotivos error={error} />
        {exito && <Aviso tipo="exito">{exito}</Aviso>}
        <div className="rejilla">
          <div className="campo campo--largo">
            <span className="campo__etiqueta">{t.campos.tipo}</span>
            <div className="opciones">
              {TIPOS_MOVIMIENTO.map((v) => (
                <label key={v} className="casilla">
                  <input type="radio" name="tipo-movimiento" checked={f.tipo === v} onChange={() => cambiarTipo(v)} data-prueba={`tipo-${v}`} />
                  <span>{t.tipo[v]}</span>
                </label>
              ))}
            </div>
          </div>
          <Campo etiqueta={t.campos.categoria} ancho="medio">
            <select value={categoriaElegida} onChange={(e) => setF({ ...f, categoriaId: e.target.value })} data-prueba="movimiento-categoria">
              {elegibles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </Campo>
          {categorias && elegibles.length === 0 && <p className="nota">{t.sinCategorias}</p>}
          <Campo etiqueta={t.campos.valor} ancho="corto" ayuda={t.valorAyuda}>
            <input inputMode="numeric" autoComplete="off" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} data-prueba="movimiento-valor" />
          </Campo>
          <Campo etiqueta={t.campos.fecha} ancho="corto">
            <input type="date" value={f.fecha} max={fechaLocal()} onChange={(e) => setF({ ...f, fecha: e.target.value })} data-prueba="movimiento-fecha" />
          </Campo>
          <div className="campo campo--largo">
            <span className="campo__etiqueta">{t.campos.asignado}</span>
            <div className="opciones">
              {(["finca", "lote", "animal"] as const).map((v) => (
                <label key={v} className="casilla">
                  <input type="radio" name="asignacion-movimiento" checked={f.asignacion === v} onChange={() => setF({ ...f, asignacion: v })} data-prueba={`asignacion-${v}`} />
                  <span>{t.asignacion[v]}</span>
                </label>
              ))}
            </div>
            {f.asignacion === "finca" && f.tipo === "gasto" && <span className="campo__ayuda">{t.asignacionAyuda}</span>}
          </div>
          {f.asignacion === "lote" && (
            <Campo etiqueta={t.campos.lote} ancho="medio">
              <select value={f.loteId} onChange={(e) => setF({ ...f, loteId: e.target.value })} data-prueba="movimiento-lote">
                <option value="">—</option>
                {(lotes ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nombre}
                  </option>
                ))}
              </select>
            </Campo>
          )}
          {f.asignacion === "animal" && (
            <SelectorAnimal etiqueta={t.campos.animal} candidatos={animales ?? []} valor={f.animalId} alCambiar={(id) => setF({ ...f, animalId: id })} prueba="movimiento-animal" />
          )}
          <Campo etiqueta={t.campos.descripcion} ancho="largo">
            <input value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} data-prueba="movimiento-descripcion" />
          </Campo>
        </div>
        <div className="acciones">
          <button type="submit" className="boton" data-prueba="guardar-movimiento">
            {editando ? t.guardarCambios : t.guardar}
          </button>
          {editando && (
            <button type="button" className="boton boton--secundario" onClick={limpiar}>
              {textos.comun.cancelar}
            </button>
          )}
        </div>
      </form>

      <div className="filtros" data-prueba="filtros-movimientos">
        <Campo etiqueta={t.filtros.desde} ancho="corto">
          <input type="date" value={filtros.desde} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} data-prueba="filtro-desde" />
        </Campo>
        <Campo etiqueta={t.filtros.hasta} ancho="corto">
          <input type="date" value={filtros.hasta} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })} data-prueba="filtro-hasta" />
        </Campo>
        <Campo etiqueta={t.filtros.tipo} ancho="corto">
          <select value={filtros.tipo} onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value as "" | TipoMovimiento })} data-prueba="filtro-tipo">
            <option value="">{t.filtros.todos}</option>
            {TIPOS_MOVIMIENTO.map((v) => (
              <option key={v} value={v}>
                {t.tipoPlural[v]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta={t.filtros.categoria} ancho="medio">
          <select value={filtros.categoriaId} onChange={(e) => setFiltros({ ...filtros, categoriaId: e.target.value })} data-prueba="filtro-categoria">
            <option value="">{t.filtros.todas}</option>
            {(categorias ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </Campo>
        {hayFiltros && (
          <button type="button" className="boton boton--secundario" onClick={() => setFiltros({ desde: "", hasta: "", tipo: "", categoriaId: "" })}>
            {t.filtros.quitar}
          </button>
        )}
      </div>

      <ListaMotivos error={errorCarga} />
      {movimientos === null ? (
        <p>{textos.comun.cargando}</p>
      ) : lista.length === 0 ? (
        <p className="nota" data-prueba="movimientos-vacio">
          {t.vacio}
        </p>
      ) : (
        <>
          <p className="destacado" data-prueba="movimientos-totales">
            {t.totales(lista.length, textos.comun.pesos(ingresos), textos.comun.pesos(gastos))}
          </p>
          <div className="tabla-ancha">
            <table className="tabla" data-prueba="tabla-movimientos">
              <thead>
                <tr>
                  <th>{t.columnas.fecha}</th>
                  <th>{t.columnas.tipo}</th>
                  <th>{t.columnas.categoria}</th>
                  <th>{t.columnas.asignado}</th>
                  <th>{t.columnas.descripcion}</th>
                  <th className="numero">{t.columnas.valor}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lista.map((m) => (
                  <tr key={m.id} data-movimiento={m.descripcion ?? m.categoria}>
                    <td>{formatearFecha(m.fecha)}</td>
                    <td>
                      <span className={`insignia insignia--${m.tipo}`}>{t.tipo[m.tipo]}</span>
                    </td>
                    <td>{m.categoria}</td>
                    <td data-columna="asignado">{asignadoA(m)}</td>
                    <td>
                      {m.descripcion}
                      {m.servicioId && <div className="nota">{t.deMonta}</div>}
                    </td>
                    <td className="numero" data-columna="valor">
                      {textos.comun.pesos(m.valor)}
                    </td>
                    <td>
                      <div className="acciones-fila">
                        {confirmando === m.id ? (
                          <>
                            <span className="nota">{t.retirarConfirmar}</span>
                            <button
                              type="button"
                              className="boton boton--peligro boton--pequeno"
                              onClick={async () => {
                                try {
                                  await retirarMovimiento(conexion, m.id, contexto());
                                  setConfirmando(null);
                                  setExito(t.retirado);
                                  await recargar();
                                } catch (err) {
                                  setError(err);
                                }
                              }}
                              data-prueba="confirmar-retirar-movimiento"
                            >
                              {textos.comun.confirmar}
                            </button>
                            <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => setConfirmando(null)}>
                              {textos.comun.cancelar}
                            </button>
                          </>
                        ) : (
                          <>
                            <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => corregir(m)} data-prueba="corregir-movimiento">
                              {t.corregir}
                            </button>
                            <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => setConfirmando(m.id)} data-prueba="retirar-movimiento">
                              {t.retirar}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
