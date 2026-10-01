import { useState } from "react";
import { Aviso } from "../../componentes/Aviso";
import { CamposFinca } from "../../componentes/CamposFinca";
import { useConexion, useContextoCambio, useSesion } from "../../componentes/contextos";
import { ListaMotivos } from "../../componentes/ListaMotivos";
import { actualizarFinca, type DatosFinca } from "../../datos/repositorios/finca";
import { textos } from "../../textos/es";

export function SeccionFinca() {
  const conexion = useConexion();
  const contexto = useContextoCambio();
  const { finca, recargarFinca } = useSesion();
  const [datos, setDatos] = useState<DatosFinca>(finca);
  const [error, setError] = useState<unknown>(null);
  const [guardado, setGuardado] = useState(false);

  async function guardar() {
    setError(null);
    setGuardado(false);
    try {
      await actualizarFinca(conexion, datos, contexto());
      await recargarFinca();
      setGuardado(true);
    } catch (e) {
      setError(e);
    }
  }

  return (
    <form
      className="tarjeta"
      onSubmit={(e) => {
        e.preventDefault();
        guardar();
      }}
    >
      <ListaMotivos error={error} />
      {guardado && <Aviso tipo="exito">{textos.comun.guardado}</Aviso>}
      <CamposFinca datos={datos} alCambiar={setDatos} />
      <div className="acciones">
        <button type="submit" className="boton">
          {textos.comun.guardar}
        </button>
      </div>
    </form>
  );
}
