import { useState } from "react";
import { Aviso } from "../../componentes/Aviso";
import { Campo } from "../../componentes/Campo";
import { useConexion, useContextoCambio } from "../../componentes/contextos";
import { ListaMotivos } from "../../componentes/ListaMotivos";
import { useCarga } from "../../componentes/useCarga";
import { actualizarCategoria, crearCategoria, listarCategorias } from "../../datos/repositorios/finanzas";
import { TIPOS_MOVIMIENTO, type CategoriaEconomica, type TipoMovimiento } from "../../dominio/finanzas";
import { textos } from "../../textos/es";

const t = textos.finanzas;
const c = t.categorias;

/** RF-33: catálogo editable de categorías de ingresos y gastos. No se borran: se renombran o se desactivan. */
export function Categorias() {
  const conexion = useConexion();
  const contexto = useContextoCambio();
  const { datos: categorias, recargar } = useCarga(() => listarCategorias(conexion), [conexion]);
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<TipoMovimiento>("gasto");
  const [editando, setEditando] = useState<{ id: string; nombre: string } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [exito, setExito] = useState<string | null>(null);

  async function accion(hacer: () => Promise<void>, mensaje: string) {
    setError(null);
    setExito(null);
    try {
      await hacer();
      setExito(mensaje);
      await recargar();
    } catch (e) {
      setError(e);
    }
  }

  const fila = (cat: CategoriaEconomica) => (
    <tr key={cat.id} className={cat.activo ? undefined : "inactivo"} data-categoria={cat.nombre}>
      <td>
        {editando?.id === cat.id ? (
          <input
            value={editando.nombre}
            aria-label={c.nombre}
            onChange={(e) => setEditando({ id: cat.id, nombre: e.target.value })}
            data-prueba="categoria-nombre-editar"
          />
        ) : (
          <>
            {cat.nombre} {!cat.activo && <span className="insignia">{c.desactivada}</span>}
          </>
        )}
      </td>
      <td>
        <div className="acciones-fila">
          {editando?.id === cat.id ? (
            <>
              <button
                type="button"
                className="boton boton--pequeno"
                onClick={() =>
                  accion(async () => {
                    await actualizarCategoria(conexion, cat.id, { nombre: editando.nombre, activo: cat.activo }, contexto());
                    setEditando(null);
                  }, c.guardado)
                }
                data-prueba="guardar-categoria"
              >
                {textos.comun.guardar}
              </button>
              <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => setEditando(null)}>
                {textos.comun.cancelar}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => setEditando({ id: cat.id, nombre: cat.nombre })} data-prueba="renombrar-categoria">
                {textos.comun.editar}
              </button>
              <button
                type="button"
                className="boton boton--secundario boton--pequeno"
                onClick={() => accion(() => actualizarCategoria(conexion, cat.id, { nombre: cat.nombre, activo: !cat.activo }, contexto()), c.guardado)}
                data-prueba="activar-categoria"
              >
                {cat.activo ? c.desactivar : c.activar}
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );

  return (
    <div>
      <p className="nota">{c.ayuda}</p>
      <ListaMotivos error={error} />
      {exito && <Aviso tipo="exito">{exito}</Aviso>}
      {categorias === null ? (
        <p>{textos.comun.cargando}</p>
      ) : (
        TIPOS_MOVIMIENTO.slice()
          .reverse()
          .map((tipoLista) => {
            const lista = categorias.filter((x) => x.tipo === tipoLista);
            return (
              <div key={tipoLista}>
                <h2>{tipoLista === "gasto" ? c.gastos : c.ingresos}</h2>
                {lista.length === 0 ? (
                  <p className="nota">{c.vacio}</p>
                ) : (
                  <table className="tabla" data-prueba={`tabla-categorias-${tipoLista}`}>
                    <tbody>{lista.map(fila)}</tbody>
                  </table>
                )}
              </div>
            );
          })
      )}

      <form
        className="tarjeta tarjeta--suave"
        onSubmit={(e) => {
          e.preventDefault();
          accion(async () => {
            await crearCategoria(conexion, { nombre, tipo }, contexto());
            setNombre("");
          }, c.creada(nombre.trim()));
        }}
        data-prueba="formulario-categoria"
      >
        <h2>{c.nueva}</h2>
        <div className="rejilla">
          <Campo etiqueta={c.nombre} ancho="medio">
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} data-prueba="categoria-nombre" />
          </Campo>
          <div className="campo campo--medio">
            <span className="campo__etiqueta">{c.tipo}</span>
            <div className="opciones">
              {TIPOS_MOVIMIENTO.map((v) => (
                <label key={v} className="casilla">
                  <input type="radio" name="tipo-categoria" checked={tipo === v} onChange={() => setTipo(v)} data-prueba={`categoria-tipo-${v}`} />
                  <span>{t.tipo[v]}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="acciones">
          <button type="submit" className="boton" data-prueba="agregar-categoria">
            {c.agregar}
          </button>
        </div>
      </form>
    </div>
  );
}
