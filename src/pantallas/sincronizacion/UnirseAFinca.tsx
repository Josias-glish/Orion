import { useEffect, useState } from "react";
import { Aviso } from "../../componentes/Aviso";
import { Campo } from "../../componentes/Campo";
import { useConexion, useSincronizacion } from "../../componentes/contextos";
import { ListaMotivos } from "../../componentes/ListaMotivos";
import { descargarDatosIniciales, verificarContraElServidor, type ProgresoDePrimera } from "../../sincronizacion/primera";
import { fincasDeLaCuenta, vincularSegundoEquipo, type FincaDeLaCuenta } from "../../sincronizacion/vinculacion";
import { VERSION_ESQUEMA } from "../../datos/respaldo";
import { textos } from "../../textos/es";
import { FormularioDeCuenta, plataformaDeEsteEquipo } from "./FormularioDeCuenta";

const t = textos.sincronizacion;

interface Props {
  /** Después de unirse y descargar: el programa vuelve a leer la finca y los usuarios. */
  alTerminar: () => void | Promise<void>;
  alVolver: () => void;
}

/** «Ya tengo una finca en otro equipo»: este equipo, recién instalado y vacío, se une y descarga todos los datos (CA-26). */
export function UnirseAFinca({ alTerminar, alVolver }: Props) {
  const conexion = useConexion();
  const { red, cliente } = useSincronizacion();
  const [conSesion, setConSesion] = useState(red.sesionActual() !== null);
  const [fincas, setFincas] = useState<FincaDeLaCuenta[] | null>(null);
  const [nombreEquipo, setNombreEquipo] = useState<string>(t.equipo.nombrePorDefecto);
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [progreso, setProgreso] = useState<ProgresoDePrimera | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    if (!conSesion) return;
    fincasDeLaCuenta(red).then(setFincas, (e: unknown) => setError(e));
  }, [conSesion, red]);

  async function unirse(destino: { fincaId: string } | { codigo: string }) {
    setError(null);
    try {
      setProgreso({ fase: "descargando", hechas: 0, total: 0 });
      await vincularSegundoEquipo(conexion, red, { nombre: nombreEquipo.trim() || t.equipo.nombrePorDefecto, plataforma: plataformaDeEsteEquipo() }, VERSION_ESQUEMA, destino);
      await descargarDatosIniciales(conexion, red, cliente, { versionEsquema: VERSION_ESQUEMA, alProgreso: setProgreso });
      setProgreso({ fase: "verificando", hechas: 0, total: 0 });
      await verificarContraElServidor(conexion, red);
      setListo(true);
    } catch (e) {
      setError(e);
    } finally {
      setProgreso(null);
    }
  }

  if (listo) {
    return (
      <div>
        <Aviso tipo="exito">{t.unirse.listo}</Aviso>
        <div className="acciones">
          <button type="button" className="boton" onClick={() => void alTerminar()} data-prueba="unirse-continuar">
            {t.unirse.continuar}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-prueba="unirse-a-finca">
      <h2>{t.unirse.titulo}</h2>
      <p>{t.unirse.explicacion}</p>
      {!conSesion ? (
        <FormularioDeCuenta red={red} alIniciar={() => setConSesion(true)} />
      ) : (
        <>
          <Aviso tipo="info">{t.cuenta.conectado(red.sesionActual()?.correo ?? "")}</Aviso>
          <Campo etiqueta={t.equipo.nombre} ayuda={t.equipo.nombreAyuda}>
            <input value={nombreEquipo} onChange={(e) => setNombreEquipo(e.target.value)} data-prueba="unirse-nombre-equipo" />
          </Campo>
          <h3>{t.unirse.conMiCuenta}</h3>
          {fincas === null ? (
            <p>{textos.comun.cargando}</p>
          ) : fincas.length === 0 ? (
            <p className="nota">{t.unirse.sinFincas}</p>
          ) : (
            <ul className="usuarios">
              {fincas.map((f) => (
                <li key={f.finca_id}>
                  <button type="button" className="usuario" disabled={progreso !== null} onClick={() => void unirse({ fincaId: f.finca_id })} data-prueba="unirse-finca">
                    <span className="usuario__nombre">{t.unirse.unirseA(f.nombre)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <h3>{t.unirse.conCodigo}</h3>
          <Campo etiqueta={t.unirse.codigo} ayuda={t.unirse.codigoAyuda}>
            <input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} maxLength={11} data-prueba="unirse-codigo" />
          </Campo>
          <div className="acciones">
            <button type="button" className="boton" disabled={progreso !== null || codigo.replace(/[^A-Z0-9]/g, "").length < 10} onClick={() => void unirse({ codigo: codigo.replace(/[^A-Z0-9]/g, "") })} data-prueba="unirse-con-codigo">
              {t.unirse.boton}
            </button>
          </div>
        </>
      )}
      {progreso && (
        <p className="nota" role="status" data-prueba="unirse-progreso">
          {progreso.fase === "verificando" ? t.vincular.verificando : t.unirse.descargando} {progreso.total > 0 && t.progreso(progreso.entidad ?? "", progreso.hechas, progreso.total)}
        </p>
      )}
      <ListaMotivos error={error} />
      <div className="acciones">
        <button type="button" className="boton boton--secundario" disabled={progreso !== null} onClick={alVolver}>
          {textos.asistente.volverAEmpezar}
        </button>
      </div>
    </div>
  );
}
