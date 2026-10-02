import { useState } from "react";
import { Aviso } from "../../componentes/Aviso";
import { useConexion, useContextoCambio, usePermiso } from "../../componentes/contextos";
import { ListaMotivos } from "../../componentes/ListaMotivos";
import { useCarga } from "../../componentes/useCarga";
import { listarContactos, retirarContacto, type Contacto } from "../../datos/repositorios/contactos";
import { textos } from "../../textos/es";
import { FormularioContacto } from "./FormularioContacto";

/** Contactos (especificación 2, sección 6): propietarios de los animales de otras fincas. R28: datos mínimos. */
export function Contactos() {
  const conexion = useConexion();
  const contexto = useContextoCambio();
  const puedeEditar = usePermiso("editar_contactos");
  const { datos: contactos, recargar } = useCarga(() => listarContactos(conexion), [conexion]);
  const [editando, setEditando] = useState<Contacto | "nuevo" | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const t = textos.contactos;

  async function retirar(c: Contacto) {
    setError(null);
    setAviso(null);
    try {
      await retirarContacto(conexion, c.id, contexto());
      setAviso(t.retirado(c.nombre));
      await recargar();
    } catch (e) {
      setError(e);
    }
  }

  return (
    <div>
      <p className="nota">{t.ayuda}</p>
      <ListaMotivos error={error} />
      {aviso && <Aviso tipo="exito">{aviso}</Aviso>}
      {editando ? (
        <FormularioContacto
          id={editando === "nuevo" ? undefined : editando.id}
          inicial={editando === "nuevo" ? undefined : editando}
          alGuardar={async () => {
            setEditando(null);
            setAviso(t.guardado);
            await recargar();
          }}
          alCancelar={() => setEditando(null)}
        />
      ) : (
        puedeEditar && (
          <div className="acciones">
            <button type="button" className="boton" onClick={() => setEditando("nuevo")} data-prueba="nuevo-contacto">
              {t.nuevo}
            </button>
          </div>
        )
      )}
      {contactos === null ? (
        <p>{textos.comun.cargando}</p>
      ) : contactos.length === 0 ? (
        <p className="nota">{t.vacio}</p>
      ) : (
        <table className="tabla" data-prueba="tabla-contactos">
          <thead>
            <tr>
              <th>{t.campos.nombre}</th>
              <th>{t.campos.criadero}</th>
              <th>{t.campos.municipio}</th>
              <th>{t.campos.telefono}</th>
              <th>{t.campos.correo}</th>
              <th>{t.animales}</th>
              {puedeEditar && <th />}
            </tr>
          </thead>
          <tbody>
            {contactos.map((c) => (
              <tr key={c.id} data-contacto={c.nombre}>
                <td>{c.nombre}</td>
                <td>{c.criadero ?? textos.comun.sinDato}</td>
                <td>{c.municipio ?? textos.comun.sinDato}</td>
                <td>{c.telefono ?? textos.comun.sinDato}</td>
                <td>{c.correo ?? textos.comun.sinDato}</td>
                <td>{c.animales}</td>
                {puedeEditar && (
                  <td>
                    <div className="acciones">
                      <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => setEditando(c)}>
                        {textos.comun.editar}
                      </button>
                      {c.animales === 0 && (
                        <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => retirar(c)}>
                          {t.retirar}
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
