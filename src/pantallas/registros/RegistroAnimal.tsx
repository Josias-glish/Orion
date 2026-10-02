import { useState } from "react";
import { Aviso } from "../../componentes/Aviso";
import { useConexion, useContextoCambio, useNavegar } from "../../componentes/contextos";
import { ListaMotivos } from "../../componentes/ListaMotivos";
import { useCarga } from "../../componentes/useCarga";
import { crearBorrador, emitirRegistro, listarRegistrosDeAnimal, verificarAnimal } from "../../datos/repositorios/registros";
import { formatearFecha } from "../../dominio/fechas";
import { textos } from "../../textos/es";
import { generarCertificadoDeRegistro } from "./certificados";
import { DetalleRegistro } from "./DetalleRegistro";
import { ListaDeVerificacion } from "./ListaDeVerificacion";

const t = textos.registros.pantalla.animal;

/** Pestaña «Registro» de la ficha (solo el propietario): lista de verificación, Emitir registro y el registro vigente. */
export function RegistroAnimal({ animalId }: { animalId: string }) {
  const conexion = useConexion();
  const contexto = useContextoCambio();
  const navegar = useNavegar();
  const { datos, recargar } = useCarga(
    async () => ({ verificacion: await verificarAnimal(conexion, animalId), historia: await listarRegistrosDeAnimal(conexion, animalId) }),
    [conexion, animalId],
  );
  const [error, setError] = useState<unknown>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  if (!datos) return <p>{textos.comun.cargando}</p>;
  const { verificacion: v, historia } = datos;
  if (!v.elegible) return <Aviso tipo="info">{t.noElegible}</Aviso>;
  const anulados = historia.filter((r) => r.estado === "anulado");

  /** Lo que hace el detalle de un registro (reemitir, anular…): se muestra su mensaje aquí, porque el detalle puede desaparecer. */
  async function alCambiarRegistro(texto: string | null) {
    if (texto) setMensaje(texto);
    await recargar();
  }

  async function accion(hacer: () => Promise<string>) {
    setError(null);
    setMensaje(null);
    setTrabajando(true);
    try {
      setMensaje(await hacer());
      await recargar();
    } catch (e) {
      setError(e);
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <div data-prueba="pestana-registro">
      <p className="nota">{t.ayuda}</p>
      <ListaMotivos error={error} />
      {mensaje && (
        <Aviso tipo="exito">
          <span data-prueba="mensaje-emision">{mensaje}</span>
        </Aviso>
      )}

      {v.registro?.estado === "emitido" ? (
        <DetalleRegistro registroId={v.registro.id} alCambiar={alCambiarRegistro} />
      ) : (
        <>
          <div className="tarjeta">
            <h2>{t.verificacionTitulo}</h2>
            <p className="nota">{v.lista.cumple ? t.todoListo : t.faltaAlgo}</p>
            <ListaDeVerificacion lista={v.lista} animalId={animalId} />
            {!v.registro && (
              <div className="acciones">
                <button
                  type="button"
                  className="boton"
                  disabled={!v.lista.cumple || trabajando}
                  onClick={() =>
                    accion(async () => {
                      const emitido = await emitirRegistro(conexion, animalId, contexto());
                      await generarCertificadoDeRegistro(conexion, contexto(), emitido.registroId);
                      return t.emitido(emitido.numero);
                    })
                  }
                  data-prueba="emitir-registro"
                >
                  {trabajando ? t.trabajando : t.emitir}
                </button>
                <button
                  type="button"
                  className="boton boton--secundario"
                  disabled={trabajando}
                  onClick={() =>
                    accion(async () => {
                      await crearBorrador(conexion, animalId, {}, contexto());
                      return t.borradorCreado;
                    })
                  }
                  data-prueba="crear-borrador"
                >
                  {t.crearBorrador}
                </button>
              </div>
            )}
          </div>
          {v.registro && <DetalleRegistro registroId={v.registro.id} alCambiar={alCambiarRegistro} />}
        </>
      )}

      {anulados.length > 0 && (
        <>
          <h2>{t.anuladosTitulo}</h2>
          <table className="tabla" data-prueba="registros-anulados">
            <thead>
              <tr>
                <th>{textos.registros.pantalla.columnas.numero}</th>
                <th>{textos.registros.pantalla.columnas.fecha}</th>
                <th>{textos.registros.pantalla.detalle.motivo}</th>
              </tr>
            </thead>
            <tbody>
              {anulados.map((r) => (
                <tr key={r.id}>
                  <td className="destacado">
                    <button type="button" className="enlace" onClick={() => navegar({ pantalla: "registros", seccion: "registros", registroId: r.id })}>
                      {r.numero}
                    </button>
                  </td>
                  <td>{formatearFecha(r.fechaRegistro)}</td>
                  <td>{r.motivoAnulacion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
