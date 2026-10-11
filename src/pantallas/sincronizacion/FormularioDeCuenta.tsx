import { useState } from "react";
import { Aviso } from "../../componentes/Aviso";
import { Campo } from "../../componentes/Campo";
import { ListaMotivos } from "../../componentes/ListaMotivos";
import type { Red } from "../../sincronizacion/red";
import { textos } from "../../textos/es";

const t = textos.sincronizacion.cuenta;

/** La plataforma que se anota para reconocer cada equipo en la lista de la finca. */
export function plataformaDeEsteEquipo(): string {
  const agente = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/Windows/i.test(agente)) return "Windows";
  if (/Mac/i.test(agente)) return "macOS";
  if (/Linux/i.test(agente)) return "Linux";
  return "desconocida";
}

interface Props {
  red: Red;
  /** Se llama cuando la sesión quedó iniciada. */
  alIniciar: () => void;
}

/** Correo y contraseña de la cuenta del servidor: iniciar sesión o crear la cuenta. */
export function FormularioDeCuenta({ red, alIniciar }: Props) {
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function entrar(crear: boolean) {
    setError(null);
    setMensaje(null);
    setConfirmar(false);
    if (crear && contrasena.length < 8) return setMensaje(t.minimoContrasena);
    setOcupado(true);
    try {
      if (crear) {
        const r = await red.crearCuenta(correo.trim(), contrasena);
        if (r.sesion === null) {
          setConfirmar(true);
          return;
        }
      } else {
        await red.iniciarSesion(correo.trim(), contrasena);
      }
      alIniciar();
    } catch (e) {
      setError(e);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void entrar(false);
      }}
    >
      <p className="nota">{t.ayuda}</p>
      <Campo etiqueta={t.correo}>
        <input type="email" autoComplete="username" value={correo} onChange={(e) => setCorreo(e.target.value)} data-prueba="sincronizacion-correo" />
      </Campo>
      <Campo etiqueta={t.contrasena}>
        <input type="password" autoComplete="current-password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} data-prueba="sincronizacion-contrasena" />
      </Campo>
      <ListaMotivos error={error} />
      {mensaje && <Aviso tipo="error">{mensaje}</Aviso>}
      {confirmar && <Aviso tipo="info">{t.confirmar}</Aviso>}
      <div className="acciones">
        <button type="button" className="boton boton--secundario" disabled={ocupado || !correo || !contrasena} onClick={() => void entrar(true)} data-prueba="sincronizacion-crear-cuenta">
          {t.crear}
        </button>
        <button type="submit" className="boton" disabled={ocupado || !correo || !contrasena} data-prueba="sincronizacion-entrar">
          {t.entrar}
        </button>
      </div>
    </form>
  );
}
