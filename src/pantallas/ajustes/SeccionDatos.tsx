import { useState } from "react";
import { Aviso } from "../../componentes/Aviso";
import { useConexion, useContextoCambio } from "../../componentes/contextos";
import { ListaMotivos } from "../../componentes/ListaMotivos";
import { useCarga } from "../../componentes/useCarga";
import { consultarEstado, listarAnimalesDePrueba, retirarDatosDePrueba } from "../../datos/diagnostico";
import { rutaBaseDatos } from "../../datos/ubicacion";
import { textos } from "../../textos/es";

/** Información técnica de la base y limpieza de los datos de la prueba técnica de la Etapa 1. */
export function SeccionDatos() {
  const conexion = useConexion();
  const contexto = useContextoCambio();
  const { datos, recargar } = useCarga(
    async () => ({
      estado: await consultarEstado(conexion),
      ruta: await rutaBaseDatos(),
      deprueba: (await listarAnimalesDePrueba(conexion)).length,
    }),
    [conexion],
  );
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const t = textos.ajustes;
  if (!datos) return <p>{textos.comun.cargando}</p>;

  async function retirar() {
    try {
      setMensaje(t.datosPruebaRetirados(await retirarDatosDePrueba(conexion, contexto())));
      await recargar();
    } catch (e) {
      setError(e);
    }
  }

  return (
    <div className="tarjeta">
      <dl className="ficha">
        <dt>{t.datosArchivo}</dt>
        <dd className="ruta" data-prueba="ruta-base">
          {datos.ruta}
        </dd>
        <dt>{t.datosVersion}</dt>
        <dd>{datos.estado.versionSqlite}</dd>
        <dt>{t.datosMigraciones}</dt>
        <dd data-prueba="migraciones">{datos.estado.migraciones.map((m) => `${m.version} · ${m.descripcion}`).join(", ")}</dd>
      </dl>
      {import.meta.env.DEV && <p className="nota">{t.datosModoDesarrollo}</p>}
      <ListaMotivos error={error} />
      {mensaje && <Aviso tipo="exito">{mensaje}</Aviso>}
      {datos.deprueba > 0 && (
        <>
          <h2>{t.datosPruebaTitulo}</h2>
          <p>{t.datosPruebaExplicacion(datos.deprueba)}</p>
          <button type="button" className="boton boton--secundario" onClick={retirar}>
            {t.datosPruebaRetirar}
          </button>
        </>
      )}
    </div>
  );
}
