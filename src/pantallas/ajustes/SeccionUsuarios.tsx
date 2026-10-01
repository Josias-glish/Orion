import { useState } from "react";
import { Campo } from "../../componentes/Campo";
import { CamposUsuario, pinDelFormulario, usuarioVacio, type FormularioUsuario } from "../../componentes/CamposUsuario";
import { useConexion, useContextoCambio, useSesion } from "../../componentes/contextos";
import { ListaMotivos } from "../../componentes/ListaMotivos";
import { useCarga } from "../../componentes/useCarga";
import {
  actualizarUsuario,
  cambiarPin,
  crearUsuario,
  listarUsuarios,
  retirarUsuario,
  type Usuario,
} from "../../datos/repositorios/usuarios";
import { textos } from "../../textos/es";

type Edicion = { tipo: "datos"; usuario: Usuario } | { tipo: "pin"; usuario: Usuario } | { tipo: "retirar"; usuario: Usuario };

export function SeccionUsuarios() {
  const conexion = useConexion();
  const contexto = useContextoCambio();
  const { usuario: actual } = useSesion();
  const { datos: usuarios, recargar } = useCarga(() => listarUsuarios(conexion), [conexion]);
  const [nuevo, setNuevo] = useState<FormularioUsuario>(usuarioVacio("operario"));
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [formulario, setFormulario] = useState<FormularioUsuario>(usuarioVacio("operario"));
  const [pin, setPin] = useState({ pin: "", confirmacion: "" });
  const [error, setError] = useState<unknown>(null);
  const t = textos.ajustes;

  async function ejecutar(accion: () => Promise<unknown>) {
    setError(null);
    try {
      await accion();
      setEdicion(null);
      await recargar();
    } catch (e) {
      setError(e);
    }
  }

  async function agregar() {
    const { pin: elegido, error: errorPin } = pinDelFormulario(nuevo);
    if (errorPin) return setError(new Error(errorPin));
    await ejecutar(async () => {
      await crearUsuario(conexion, { nombre: nuevo.nombre, rol: nuevo.rol, contacto: nuevo.contacto || null }, elegido, contexto());
      setNuevo(usuarioVacio("operario"));
    });
  }

  function editar(u: Usuario) {
    setFormulario({ ...usuarioVacio(u.rol), nombre: u.nombre, contacto: u.contacto ?? "" });
    setEdicion({ tipo: "datos", usuario: u });
  }

  return (
    <div>
      <ListaMotivos error={error} />
      <table className="tabla">
        <thead>
          <tr>
            <th>{t.usuariosColumnas.nombre}</th>
            <th>{t.usuariosColumnas.rol}</th>
            <th>{t.usuariosColumnas.contacto}</th>
            <th>{t.usuariosColumnas.pin}</th>
            <th>{t.usuariosColumnas.acciones}</th>
          </tr>
        </thead>
        <tbody>
          {usuarios?.map((u) => (
            <tr key={u.id}>
              <td>{u.nombre}</td>
              <td>{textos.comun.rol[u.rol]}</td>
              <td>{u.contacto ?? textos.comun.sinDato}</td>
              <td>{u.tienePin ? textos.comun.si : textos.comun.no}</td>
              <td className="acciones-fila">
                <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => editar(u)}>
                  {textos.comun.editar}
                </button>
                <button
                  type="button"
                  className="boton boton--secundario boton--pequeno"
                  onClick={() => {
                    setPin({ pin: "", confirmacion: "" });
                    setEdicion({ tipo: "pin", usuario: u });
                  }}
                >
                  {u.tienePin ? t.cambiarPin : t.ponerPin}
                </button>
                {u.id !== actual.id && (
                  <button
                    type="button"
                    className="boton boton--secundario boton--pequeno"
                    onClick={() => setEdicion({ tipo: "retirar", usuario: u })}
                  >
                    {textos.comun.retirar}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {edicion?.tipo === "datos" && (
        <form
          className="tarjeta"
          onSubmit={(e) => {
            e.preventDefault();
            ejecutar(() =>
              actualizarUsuario(
                conexion,
                edicion.usuario.id,
                { nombre: formulario.nombre, rol: formulario.rol, contacto: formulario.contacto || null },
                contexto(),
              ),
            );
          }}
        >
          <h2>
            {textos.comun.editar}: {edicion.usuario.nombre}
          </h2>
          <CamposUsuario datos={formulario} alCambiar={setFormulario} conPin={false} />
          <div className="acciones">
            <button type="button" className="boton boton--secundario" onClick={() => setEdicion(null)}>
              {textos.comun.cancelar}
            </button>
            <button type="submit" className="boton">
              {textos.comun.guardar}
            </button>
          </div>
        </form>
      )}

      {edicion?.tipo === "pin" && (
        <form
          className="tarjeta"
          onSubmit={(e) => {
            e.preventDefault();
            if (pin.pin !== pin.confirmacion) return setError(new Error(textos.usuario.pinesDistintos));
            ejecutar(() => cambiarPin(conexion, edicion.usuario.id, pin.pin, contexto()));
          }}
        >
          <h2>
            {t.cambiarPin}: {edicion.usuario.nombre}
          </h2>
          <div className="rejilla">
            <Campo etiqueta={textos.usuario.pin} ancho="corto">
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin.pin}
                onChange={(e) => setPin({ ...pin, pin: e.target.value.replace(/\D/g, "") })}
              />
            </Campo>
            <Campo etiqueta={textos.usuario.confirmarPin} ancho="corto">
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin.confirmacion}
                onChange={(e) => setPin({ ...pin, confirmacion: e.target.value.replace(/\D/g, "") })}
              />
            </Campo>
          </div>
          <div className="acciones">
            <button type="button" className="boton boton--secundario" onClick={() => setEdicion(null)}>
              {textos.comun.cancelar}
            </button>
            {edicion.usuario.tienePin && (
              <button
                type="button"
                className="boton boton--secundario"
                onClick={() => ejecutar(() => cambiarPin(conexion, edicion.usuario.id, null, contexto()))}
              >
                {t.quitarPin}
              </button>
            )}
            <button type="submit" className="boton">
              {textos.comun.guardar}
            </button>
          </div>
        </form>
      )}

      {edicion?.tipo === "retirar" && (
        <div className="tarjeta tarjeta--peligro">
          <p className="destacado">{t.retirarUsuarioConfirmar(edicion.usuario.nombre)}</p>
          <div className="acciones">
            <button type="button" className="boton boton--secundario" onClick={() => setEdicion(null)}>
              {textos.comun.cancelar}
            </button>
            <button
              type="button"
              className="boton boton--peligro"
              onClick={() => ejecutar(() => retirarUsuario(conexion, edicion.usuario.id, contexto()))}
            >
              {textos.comun.confirmar}
            </button>
          </div>
        </div>
      )}

      <form
        className="tarjeta"
        onSubmit={(e) => {
          e.preventDefault();
          agregar();
        }}
      >
        <h2>{t.usuariosAgregar}</h2>
        <CamposUsuario datos={nuevo} alCambiar={setNuevo} />
        <div className="acciones">
          <button type="submit" className="boton" data-prueba="agregar-usuario">
            {t.usuariosAgregar}
          </button>
        </div>
      </form>
    </div>
  );
}
