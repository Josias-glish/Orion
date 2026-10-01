import { useState } from "react";
import { CamposFinca, fincaVacia } from "../componentes/CamposFinca";
import { CamposUsuario, pinDelFormulario, usuarioVacio } from "../componentes/CamposUsuario";
import { useConexion } from "../componentes/contextos";
import { ListaMotivos } from "../componentes/ListaMotivos";
import { completarAsistente } from "../datos/arranque";
import { ErrorDeRegistro } from "../datos/errores";
import { validarFinca, type Finca } from "../datos/repositorios/finca";
import type { Usuario } from "../datos/repositorios/usuarios";
import { textos } from "../textos/es";

interface Props {
  /** Si la finca ya existe (por ejemplo, el asistente se interrumpió), solo se pide el propietario. */
  fincaExistente: Finca | null;
  alTerminar: (usuario: Usuario) => void;
}

/** Primer arranque: finca y usuario propietario (RF-06). */
export function Asistente({ fincaExistente, alTerminar }: Props) {
  const conexion = useConexion();
  const pasos = fincaExistente ? 1 : 2;
  const [paso, setPaso] = useState(fincaExistente ? 2 : 1);
  const [finca, setFinca] = useState(fincaVacia());
  const [usuario, setUsuario] = useState(usuarioVacio("propietario"));
  const [error, setError] = useState<unknown>(null);
  const [ocupado, setOcupado] = useState(false);
  const t = textos.asistente;

  function siguiente() {
    const motivos = validarFinca(finca);
    if (motivos.length > 0) return setError(new ErrorDeRegistro(motivos));
    setError(null);
    setPaso(2);
  }

  async function terminar() {
    const { pin, error: errorPin } = pinDelFormulario(usuario);
    if (errorPin) return setError(new Error(errorPin));
    setOcupado(true);
    setError(null);
    try {
      const creado = await completarAsistente(
        conexion,
        fincaExistente ? null : finca,
        { nombre: usuario.nombre, contacto: usuario.contacto || null },
        pin,
      );
      alTerminar(creado);
    } catch (e) {
      setError(e);
      setOcupado(false);
    }
  }

  return (
    <main className="centrado">
      <section className="tarjeta tarjeta--ancha">
        <h1>{t.titulo}</h1>
        <p>{t.introduccion}</p>
        <p className="nota">{t.paso(fincaExistente ? 1 : paso, pasos)}</p>
        {error instanceof Error && !(error instanceof ErrorDeRegistro) ? (
          <div className="aviso aviso--error" role="alert">
            {error.message}
          </div>
        ) : (
          <ListaMotivos error={error} />
        )}

        {paso === 1 ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              siguiente();
            }}
          >
            <h2>{t.fincaTitulo}</h2>
            <CamposFinca datos={finca} alCambiar={setFinca} />
            <div className="acciones">
              <button type="submit" className="boton" data-prueba="asistente-siguiente">
                {textos.comun.siguiente}
              </button>
            </div>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              terminar();
            }}
          >
            <h2>{t.propietarioTitulo}</h2>
            <p className="nota">{t.propietarioAyuda}</p>
            <CamposUsuario datos={usuario} alCambiar={setUsuario} rolFijo />
            <div className="acciones">
              {!fincaExistente && (
                <button type="button" className="boton boton--secundario" onClick={() => setPaso(1)}>
                  {textos.comun.atras}
                </button>
              )}
              <button type="submit" className="boton" disabled={ocupado} data-prueba="asistente-terminar">
                {ocupado ? textos.comun.guardando : t.terminar}
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
