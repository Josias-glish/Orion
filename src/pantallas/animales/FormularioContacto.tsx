import { useState } from "react";
import { Campo } from "../../componentes/Campo";
import { useConexion, useContextoCambio } from "../../componentes/contextos";
import { ListaMotivos } from "../../componentes/ListaMotivos";
import { contactoVacio, guardarContacto, type DatosContacto } from "../../datos/repositorios/contactos";
import { textos } from "../../textos/es";

interface Props {
  /** Contacto que se edita; sin él, se crea uno nuevo. */
  id?: string;
  inicial?: DatosContacto;
  alGuardar: (id: string) => void;
  alCancelar: () => void;
}

/** Crear o editar un contacto. R28: solo el nombre es obligatorio; los demás datos, solo si hacen falta. */
export function FormularioContacto({ id, inicial, alGuardar, alCancelar }: Props) {
  const conexion = useConexion();
  const contexto = useContextoCambio();
  const [datos, setDatos] = useState<DatosContacto>(inicial ?? contactoVacio());
  const [error, setError] = useState<unknown>(null);
  const t = textos.contactos;
  const campo = (c: keyof DatosContacto) => ({
    value: datos[c] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDatos({ ...datos, [c]: e.target.value }),
    "data-prueba": `contacto-${c}`,
  });

  async function guardar() {
    setError(null);
    try {
      alGuardar(await guardarContacto(conexion, datos, contexto(), id));
    } catch (e) {
      setError(e);
    }
  }

  return (
    <div className="tarjeta" data-prueba="formulario-contacto">
      <h2>{id ? t.editarTitulo : t.nuevoTitulo}</h2>
      <p className="nota">{t.ayudaDatos}</p>
      <ListaMotivos error={error} />
      <div className="rejilla">
        <Campo etiqueta={t.campos.nombre}>
          <input {...campo("nombre")} />
        </Campo>
        <Campo etiqueta={t.campos.criadero}>
          <input {...campo("criadero")} />
        </Campo>
        <Campo etiqueta={t.campos.municipio}>
          <input {...campo("municipio")} />
        </Campo>
        <Campo etiqueta={t.campos.telefono} ancho="corto">
          <input inputMode="tel" {...campo("telefono")} />
        </Campo>
        <Campo etiqueta={t.campos.correo}>
          <input type="email" {...campo("correo")} />
        </Campo>
        <Campo etiqueta={t.campos.notas} ancho="largo">
          <textarea rows={2} {...campo("notas")} />
        </Campo>
      </div>
      <div className="acciones">
        <button type="button" className="boton boton--secundario" onClick={alCancelar}>
          {textos.comun.cancelar}
        </button>
        <button type="button" className="boton" onClick={guardar} data-prueba="guardar-contacto">
          {textos.comun.guardar}
        </button>
      </div>
    </div>
  );
}
