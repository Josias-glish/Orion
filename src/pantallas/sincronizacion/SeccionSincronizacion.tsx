import { useState } from "react";
import { Aviso } from "../../componentes/Aviso";
import { Campo } from "../../componentes/Campo";
import { useConexion, useEstadoDeSincronizacion, useSincronizacion } from "../../componentes/contextos";
import { ListaMotivos } from "../../componentes/ListaMotivos";
import { useCarga } from "../../componentes/useCarga";
import { CLAVES, leerEstado, leerVinculo, type Vinculo } from "../../datos/sincronizacion/estado";
import { VERSION_ESQUEMA } from "../../datos/respaldo";
import { descargarDatosIniciales, subirDatosIniciales, verificarContraElServidor, type ProgresoDePrimera } from "../../sincronizacion/primera";
import { vincularPrimerEquipo } from "../../sincronizacion/vinculacion";
import { textos } from "../../textos/es";
import { FormularioDeCuenta, plataformaDeEsteEquipo } from "./FormularioDeCuenta";
import { PanelDeSincronizacion } from "./PanelDeSincronizacion";

const t = textos.sincronizacion;

/** Ajustes → Sincronización (solo el propietario, R14): vincular este equipo, ver su estado y administrar los equipos de la finca. */
export function SeccionSincronizacion() {
  const conexion = useConexion();
  const { configurada, red, cliente, servicio } = useSincronizacion();
  const estado = useEstadoDeSincronizacion();
  const { datos, recargar } = useCarga(
    async () => ({
      vinculo: await leerVinculo(conexion),
      estado: await leerEstado(conexion, [CLAVES.subidaInicial, CLAVES.descargaInicial, CLAVES.cuentaCorreo]),
    }),
    [conexion, estado.fase],
  );
  const [conSesion, setConSesion] = useState(red.sesionActual() !== null);
  const [nombreEquipo, setNombreEquipo] = useState<string>(t.equipo.nombrePorDefecto);
  const [progreso, setProgreso] = useState<ProgresoDePrimera | null>(null);
  const [error, setError] = useState<unknown>(null);

  if (!configurada) return <Aviso tipo="info">{t.sinServidor}</Aviso>;
  if (!datos) return <p>{textos.comun.cargando}</p>;

  async function terminar() {
    await servicio.refrescar();
    await recargar();
    void servicio.sincronizarAhora();
  }

  async function vincular() {
    setError(null);
    try {
      setProgreso({ fase: "subiendo", hechas: 0, total: 0 });
      await vincularPrimerEquipo(conexion, red, { nombre: nombreEquipo.trim() || t.equipo.nombrePorDefecto, plataforma: plataformaDeEsteEquipo() }, VERSION_ESQUEMA);
      await subirDatosIniciales(conexion, red, cliente, { versionEsquema: VERSION_ESQUEMA, alProgreso: setProgreso });
      setProgreso({ fase: "verificando", hechas: 0, total: 0 });
      await verificarContraElServidor(conexion, red);
      await terminar();
    } catch (e) {
      setError(e);
      await recargar();
    } finally {
      setProgreso(null);
    }
  }

  async function reanudar(vinculo: Vinculo, subida: boolean) {
    setError(null);
    try {
      setProgreso({ fase: subida ? "subiendo" : "descargando", hechas: 0, total: 0 });
      if (subida) await subirDatosIniciales(conexion, red, cliente, { versionEsquema: VERSION_ESQUEMA, alProgreso: setProgreso });
      else await descargarDatosIniciales(conexion, red, cliente, { versionEsquema: VERSION_ESQUEMA, alProgreso: setProgreso });
      setProgreso({ fase: "verificando", hechas: 0, total: 0 });
      await verificarContraElServidor(conexion, red);
      await terminar();
    } catch (e) {
      setError(e);
    } finally {
      setProgreso(null);
    }
    void vinculo;
  }

  const textoDeProgreso = progreso && (
    <p className="nota" role="status" data-prueba="sincronizacion-progreso">
      {progreso.fase === "verificando" ? t.vincular.verificando : progreso.fase === "descargando" ? t.unirse.descargando : t.vincular.subiendo}{" "}
      {progreso.total > 0 && t.progreso(progreso.entidad ? (t.entidades[progreso.entidad] ?? progreso.entidad) : "", progreso.hechas, progreso.total)}
    </p>
  );

  // Sin vincular: crear la finca en el servidor con los datos de este equipo.
  if (!datos.vinculo) {
    return (
      <div className="tarjeta" data-prueba="sincronizacion-sin-vincular">
        <p>{t.introduccion}</p>
        <h2>{t.vincular.titulo}</h2>
        <p>{t.vincular.explicacion}</p>
        {!conSesion ? (
          <FormularioDeCuenta red={red} alIniciar={() => setConSesion(true)} />
        ) : (
          <>
            <Aviso tipo="info">{t.cuenta.conectado(red.sesionActual()?.correo ?? "")}</Aviso>
            <Campo etiqueta={t.equipo.nombre} ayuda={t.equipo.nombreAyuda}>
              <input value={nombreEquipo} onChange={(e) => setNombreEquipo(e.target.value)} data-prueba="vincular-nombre-equipo" />
            </Campo>
            <div className="acciones">
              <button type="button" className="boton" disabled={progreso !== null} onClick={() => void vincular()} data-prueba="vincular-equipo">
                {t.vincular.boton}
              </button>
            </div>
          </>
        )}
        {textoDeProgreso}
        <ListaMotivos error={error} />
      </div>
    );
  }

  // Vinculado, pero la primera subida o descarga quedó a medias.
  const subidaPendiente = datos.estado[CLAVES.subidaInicial] !== null && datos.estado[CLAVES.subidaInicial] !== "completa";
  const descargaPendiente = datos.estado[CLAVES.descargaInicial] !== null && datos.estado[CLAVES.descargaInicial] !== "completa";
  if (subidaPendiente || descargaPendiente) {
    return (
      <div className="tarjeta" data-prueba="sincronizacion-a-medias">
        <Aviso tipo="info">{subidaPendiente ? t.reanudar.subida : t.reanudar.descarga}</Aviso>
        {!conSesion && !red.sesionActual() ? (
          <FormularioDeCuenta red={red} alIniciar={() => setConSesion(true)} />
        ) : (
          <div className="acciones">
            <button type="button" className="boton" disabled={progreso !== null} onClick={() => void reanudar(datos.vinculo!, subidaPendiente)} data-prueba="sincronizacion-reanudar">
              {t.reanudar.boton}
            </button>
          </div>
        )}
        {textoDeProgreso}
        <ListaMotivos error={error} />
      </div>
    );
  }

  return <PanelDeSincronizacion vinculo={datos.vinculo} correo={datos.estado[CLAVES.cuentaCorreo] ?? ""} alCambiar={recargar} />;
}
