import { useState } from "react";
import { Campo } from "../../componentes/Campo";
import { useConexion, useContextoCambio } from "../../componentes/contextos";
import { ListaMotivos } from "../../componentes/ListaMotivos";
import { useCarga } from "../../componentes/useCarga";
import { actualizarLote, crearLote, listarLotes, retirarLote, type DatosLote, type Lote } from "../../datos/repositorios/lotes";
import { textos } from "../../textos/es";

/** RF-05: lotes. */
export function SeccionLotes() {
  const conexion = useConexion();
  const contexto = useContextoCambio();
  const { datos: lotes, recargar } = useCarga(() => listarLotes(conexion), [conexion]);
  const [nuevo, setNuevo] = useState<DatosLote>({ nombre: "", descripcion: "" });
  const [editando, setEditando] = useState<{ lote: Lote; datos: DatosLote } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const t = textos.ajustes;

  async function ejecutar(accion: () => Promise<unknown>) {
    setError(null);
    try {
      await accion();
      await recargar();
    } catch (e) {
      setError(e);
    }
  }

  return (
    <div>
      <ListaMotivos error={error} />
      <table className="tabla">
        <tbody>
          {lotes?.map((l) =>
            editando?.lote.id === l.id ? (
              <tr key={l.id}>
                <td>
                  <input
                    aria-label={textos.usuario.nombre}
                    value={editando.datos.nombre}
                    onChange={(e) => setEditando({ ...editando, datos: { ...editando.datos, nombre: e.target.value } })}
                  />
                </td>
                <td>
                  <input
                    aria-label={t.loteDescripcion}
                    value={editando.datos.descripcion ?? ""}
                    onChange={(e) => setEditando({ ...editando, datos: { ...editando.datos, descripcion: e.target.value } })}
                  />
                </td>
                <td className="acciones-fila">
                  <button
                    type="button"
                    className="boton boton--pequeno"
                    onClick={() =>
                      ejecutar(async () => {
                        await actualizarLote(conexion, l.id, editando.datos, contexto());
                        setEditando(null);
                      })
                    }
                  >
                    {textos.comun.guardar}
                  </button>
                  <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => setEditando(null)}>
                    {textos.comun.cancelar}
                  </button>
                </td>
              </tr>
            ) : (
              <tr key={l.id}>
                <td className="destacado">{l.nombre}</td>
                <td>
                  {l.descripcion ?? ""} <span className="nota">({t.loteAnimales(l.animales)})</span>
                </td>
                <td className="acciones-fila">
                  <button
                    type="button"
                    className="boton boton--secundario boton--pequeno"
                    onClick={() => setEditando({ lote: l, datos: { nombre: l.nombre, descripcion: l.descripcion } })}
                  >
                    {textos.comun.editar}
                  </button>
                  <button
                    type="button"
                    className="boton boton--secundario boton--pequeno"
                    onClick={() => ejecutar(() => retirarLote(conexion, l.id, contexto()))}
                  >
                    {textos.comun.retirar}
                  </button>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
      <form
        className="fila-editable"
        onSubmit={(e) => {
          e.preventDefault();
          ejecutar(async () => {
            await crearLote(conexion, nuevo, contexto());
            setNuevo({ nombre: "", descripcion: "" });
          });
        }}
      >
        <Campo etiqueta={t.loteNuevo}>
          <input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
        </Campo>
        <Campo etiqueta={t.loteDescripcion} ancho="largo">
          <input value={nuevo.descripcion ?? ""} onChange={(e) => setNuevo({ ...nuevo, descripcion: e.target.value })} />
        </Campo>
        <button type="submit" className="boton">
          {textos.comun.agregar}
        </button>
      </form>
    </div>
  );
}
