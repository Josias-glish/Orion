import { useState } from "react";
import { useConexion } from "../componentes/contextos";
import { comprobarPin, type Usuario } from "../datos/repositorios/usuarios";
import { textos } from "../textos/es";

interface Props {
  usuarios: Usuario[];
  alEntrar: (usuario: Usuario) => void;
}

/** Al abrir el programa se elige el usuario; si tiene PIN, se pide (RF-06). */
export function ElegirUsuario({ usuarios, alEntrar }: Props) {
  const conexion = useConexion();
  const [elegido, setElegido] = useState<Usuario | null>(null);
  const [pin, setPin] = useState("");
  const [incorrecto, setIncorrecto] = useState(false);
  const [comprobando, setComprobando] = useState(false);
  const t = textos.sesion;

  function elegir(usuario: Usuario) {
    if (!usuario.tienePin) return alEntrar(usuario);
    setElegido(usuario);
    setPin("");
    setIncorrecto(false);
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
                      {u.tienePin && ` · ${t.conPin}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
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
