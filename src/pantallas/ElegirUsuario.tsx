import { useState } from "react";
import { useConexion } from "../componentes/contextos";
import { comprobarPin, definirPinDeEsteEquipo, type Usuario } from "../datos/repositorios/usuarios";
import { marcaDeTiempo } from "../dominio/fechas";
import { ListaMotivos } from "../componentes/ListaMotivos";
import { textos } from "../textos/es";

interface Props {
  usuarios: Usuario[];
  alEntrar: (usuario: Usuario) => void;
  /** Después de definir un PIN en este equipo (Etapa 10): se vuelve a leer la lista de usuarios. */
  alDefinirPin?: () => void | Promise<unknown>;
}

/** Al abrir el programa se elige el usuario; si tiene PIN, se pide (RF-06). */
export function ElegirUsuario({ usuarios, alEntrar, alDefinirPin }: Props) {
  const conexion = useConexion();
  const [elegido, setElegido] = useState<Usuario | null>(null);
  const [pin, setPin] = useState("");
  const [incorrecto, setIncorrecto] = useState(false);
  const [comprobando, setComprobando] = useState(false);
  const [repetido, setRepetido] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [noCoincide, setNoCoincide] = useState(false);
  const t = textos.sesion;

  function elegir(usuario: Usuario) {
    if (!usuario.tienePin && !usuario.pinPendiente) return alEntrar(usuario);
    setElegido(usuario);
    setPin("");
    setRepetido("");
    setError(null);
    setIncorrecto(false);
  }

  /** Un usuario que llegó por sincronización define aquí su PIN antes de entrar (S-90). */
  async function definirPin() {
    if (!elegido) return;
    setNoCoincide(false);
    if (pin !== repetido) return setNoCoincide(true);
    setComprobando(true);
    try {
      await definirPinDeEsteEquipo(conexion, elegido.id, pin, marcaDeTiempo());
      await alDefinirPin?.();
      alEntrar({ ...elegido, tienePin: true, pinPendiente: false });
    } catch (e) {
      setError(e);
      setComprobando(false);
    }
  }

  async function entrar() {
    if (!elegido) return;
    setComprobando(true);
    const correcto = await comprobarPin(conexion, elegido.id, pin);
    setComprobando(false);
    if (correcto) alEntrar(elegido);
    else {
      setIncorrecto(true);
      setPin("");
    }
  }

  return (
    <main className="centrado">
      <section className="tarjeta tarjeta--ancha">
        <h1>{textos.app.nombre}</h1>
        {!elegido ? (
          <>
            <h2>{t.titulo}</h2>
            <ul className="usuarios">
              {usuarios.map((u) => (
                <li key={u.id}>
                  <button type="button" className="usuario" onClick={() => elegir(u)} data-usuario={u.nombre}>
                    <span className="usuario__nombre">{u.nombre}</span>
                    <span className="usuario__rol">
                      {textos.comun.rol[u.rol]}
                      {u.pinPendiente ? ` · ${t.pinPorDefinir}` : u.tienePin && ` · ${t.conPin}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : elegido.pinPendiente ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void definirPin();
            }}
          >
            <h2>{t.definirPin(elegido.nombre)}</h2>
            <p className="nota">{t.definirPinAyuda}</p>
            <label className="campo">
              <span>{t.pinNuevo}</span>
              <input className="pin" type="password" inputMode="numeric" autoFocus maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} data-prueba="pin-nuevo" />
            </label>
            <label className="campo">
              <span>{t.pinRepetir}</span>
              <input className="pin" type="password" inputMode="numeric" maxLength={6} value={repetido} onChange={(e) => setRepetido(e.target.value.replace(/\D/g, ""))} data-prueba="pin-repetido" />
            </label>
            <ListaMotivos error={error} />
            {noCoincide && <p className="aviso aviso--error" role="alert">{t.pinNoCoincide}</p>}
            <div className="acciones">
              <button type="button" className="boton boton--secundario" onClick={() => setElegido(null)}>
                {t.elegirOtro}
              </button>
              <button type="submit" className="boton" disabled={comprobando || pin.length < 4} data-prueba="guardar-pin">
                {t.guardarPin}
              </button>
            </div>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              entrar();
            }}
          >
            <h2>{t.escribaPin(elegido.nombre)}</h2>
            <input
              className="pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              autoFocus
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              aria-label={textos.usuario.pin}
              data-prueba="pin-entrada"
            />
            {incorrecto && (
              <p className="aviso aviso--error" role="alert">
                {t.pinIncorrecto}
              </p>
            )}
            <div className="acciones">
              <button type="button" className="boton boton--secundario" onClick={() => setElegido(null)}>
                {t.elegirOtro}
              </button>
              <button type="submit" className="boton" disabled={comprobando || pin.length < 4} data-prueba="entrar">
                {comprobando ? t.comprobando : t.entrar}
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
