import { useState } from "react";
import { Campo } from "../../componentes/Campo";
import { useConexion, useContextoCambio } from "../../componentes/contextos";
import { ListaMotivos } from "../../componentes/ListaMotivos";
import { useCarga } from "../../componentes/useCarga";
import { actualizarElemento, crearElemento, listarCatalogo, type Catalogo } from "../../datos/repositorios/catalogos";
import { textos } from "../../textos/es";

/** RF-04: razas o libros. Se agregan, se renombran y se activan o desactivan; no se borran. */
export function SeccionCatalogo({ catalogo }: { catalogo: Catalogo }) {
  const conexion = useConexion();
  const contexto = useContextoCambio();
  const { datos: elementos, recargar } = useCarga(() => listarCatalogo(conexion, catalogo), [conexion, catalogo]);
  const [nuevo, setNuevo] = useState("");
  const [nombres, setNombres] = useState<Record<string, string>>({});
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
      <p className="nota">{t.catalogoAyuda[catalogo]}</p>
      <ListaMotivos error={error} />
      <table className="tabla">
        <tbody>
          {elementos?.map((e) => (
            <tr key={e.id} className={e.activo ? "" : "inactivo"}>
              <td>
                <input
                  aria-label={textos.usuario.nombre}
                  value={nombres[e.id] ?? e.nombre}
                  onChange={(ev) => setNombres({ ...nombres, [e.id]: ev.target.value })}
                />
              </td>
              <td>{e.activo ? t.activo : t.inactivo}</td>
              <td className="acciones-fila">
                {nombres[e.id] !== undefined && nombres[e.id] !== e.nombre && (
                  <button
                    type="button"
                    className="boton boton--pequeno"
                    onClick={() =>
                      ejecutar(async () => {
                        await actualizarElemento(conexion, catalogo, e.id, { nombre: nombres[e.id], activo: e.activo }, contexto());
                        setNombres(({ [e.id]: _quitado, ...resto }) => resto);
                      })
                    }
                  >
                    {textos.comun.guardar}
                  </button>
                )}
                <button
                  type="button"
                  className="boton boton--secundario boton--pequeno"
                  onClick={() =>
                    ejecutar(() => actualizarElemento(conexion, catalogo, e.id, { nombre: e.nombre, activo: !e.activo }, contexto()))
                  }
                >
                  {e.activo ? t.desactivar : t.activar}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        className="fila-editable"
        onSubmit={(ev) => {
          ev.preventDefault();
          ejecutar(async () => {
            await crearElemento(conexion, catalogo, nuevo, contexto());
            setNuevo("");
          });
        }}
      >
        <Campo etiqueta={t.catalogoNuevo[catalogo]}>
          <input value={nuevo} onChange={(e) => setNuevo(e.target.value)} />
        </Campo>
        <button type="submit" className="boton">
          {textos.comun.agregar}
        </button>
      </form>
    </div>
  );
}
