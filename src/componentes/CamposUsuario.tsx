import { ROLES, type Rol } from "../dominio/tipos";
import { textos } from "../textos/es";
import { Campo, Casilla } from "./Campo";

export interface FormularioUsuario {
  nombre: string;
  rol: Rol;
  contacto: string;
  usarPin: boolean;
  pin: string;
  confirmacion: string;
}

export const usuarioVacio = (rol: Rol): FormularioUsuario => ({
  nombre: "",
  rol,
  contacto: "",
  usarPin: false,
  pin: "",
  confirmacion: "",
});

/** El PIN que se guardará (o null), o un mensaje si las dos copias no coinciden. */
export function pinDelFormulario(f: FormularioUsuario): { pin: string | null; error: string | null } {
  if (!f.usarPin) return { pin: null, error: null };
  if (f.pin !== f.confirmacion) return { pin: null, error: textos.usuario.pinesDistintos };
  return { pin: f.pin, error: null };
}

interface Props {
  datos: FormularioUsuario;
  alCambiar: (d: FormularioUsuario) => void;
  /** En el asistente el primer usuario es siempre propietario. */
  rolFijo?: boolean;
  conPin?: boolean;
}

export function CamposUsuario({ datos, alCambiar, rolFijo = false, conPin = true }: Props) {
  const t = textos.usuario;
  return (
    <div className="rejilla">
      <Campo etiqueta={t.nombre}>
        <input value={datos.nombre} onChange={(e) => alCambiar({ ...datos, nombre: e.target.value })} data-prueba="usuario-nombre" />
      </Campo>
      {!rolFijo && (
        <Campo etiqueta={t.rol} ayuda={t.ayudaRol[datos.rol]}>
          <select value={datos.rol} onChange={(e) => alCambiar({ ...datos, rol: e.target.value as Rol })} data-prueba="usuario-rol">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {textos.comun.rol[r]}
              </option>
            ))}
          </select>
        </Campo>
      )}
      <Campo etiqueta={t.contacto} ancho="largo">
        <input value={datos.contacto} onChange={(e) => alCambiar({ ...datos, contacto: e.target.value })} />
      </Campo>
      {conPin && (
        <div className="campo campo--largo">
          <Casilla etiqueta={t.usarPin} marcada={datos.usarPin} alCambiar={(v) => alCambiar({ ...datos, usarPin: v })} prueba="usar-pin" />
          <span className="campo__ayuda">{t.ayudaPin}</span>
        </div>
      )}
      {conPin && datos.usarPin && (
        <>
          <Campo etiqueta={t.pin} ancho="corto">
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={6}
              value={datos.pin}
              onChange={(e) => alCambiar({ ...datos, pin: e.target.value.replace(/\D/g, "") })}
              data-prueba="pin"
            />
          </Campo>
          <Campo etiqueta={t.confirmarPin} ancho="corto">
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={6}
              value={datos.confirmacion}
              onChange={(e) => alCambiar({ ...datos, confirmacion: e.target.value.replace(/\D/g, "") })}
              data-prueba="pin-confirmacion"
            />
          </Campo>
        </>
      )}
    </div>
  );
}
