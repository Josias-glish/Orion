import { useEffect, useState } from "react";
import { Aviso } from "../../componentes/Aviso";
import { Campo } from "../../componentes/Campo";
import { useConexion, useContextoCambio, useNavegar } from "../../componentes/contextos";
import { ListaMotivos } from "../../componentes/ListaMotivos";
import { useCarga } from "../../componentes/useCarga";
import {
  guardarConfigLibro,
  guardarDatosDeRegistro,
  listarConfigLibros,
  obtenerDatosDeRegistro,
  type ConfigLibro,
} from "../../datos/repositorios/registros";
import { formatearNumero } from "../../dominio/registros";
import { textos } from "../../textos/es";

const t = textos.registros.pantalla.configuracion;

/** R31 (solo propietario): prefijo y formato del número de cada libro, quién firma y los datos del certificado. */
export function ConfiguracionRegistros() {
  const conexion = useConexion();
  const { datos: libros, recargar } = useCarga(() => listarConfigLibros(conexion), [conexion]);
  return (
    <div>
      <DatosDelCertificado />
      <h2>{t.librosTitulo}</h2>
      <p className="nota">{t.librosAyuda}</p>
      {libros === null ? (
        <p>{textos.comun.cargando}</p>
      ) : (
        libros.map((l) => <FilaLibro key={l.id} libro={l} alGuardar={recargar} />)
      )}
    </div>
  );
}

function DatosDelCertificado() {
  const conexion = useConexion();
  const contexto = useContextoCambio();
  const navegar = useNavegar();
  const { datos, recargar } = useCarga(() => obtenerDatosDeRegistro(conexion), [conexion]);
  const [criador, setCriador] = useState("");
  const [propietario, setPropietario] = useState("");
  const [responsable, setResponsable] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    if (datos) {
      setCriador(datos.criador);
      setPropietario(datos.propietario);
      setResponsable(datos.responsable ?? "");
    }
  }, [datos]);

  if (!datos) return <p>{textos.comun.cargando}</p>;
  return (
    <form
      className="tarjeta"
      onSubmit={async (ev) => {
        ev.preventDefault();
        setError(null);
        setGuardado(false);
        try {
          await guardarDatosDeRegistro(conexion, { criador, propietario, responsable }, contexto());
          setGuardado(true);
          await recargar();
        } catch (err) {
          setError(err);
        }
      }}
      data-prueba="datos-certificado"
    >
      <h2>{t.certificadoTitulo}</h2>
      <p className="nota">{t.certificadoAyuda}</p>
      <ListaMotivos error={error} />
      {guardado && <Aviso tipo="exito">{t.guardado}</Aviso>}
      <div className="rejilla">
        <Campo etiqueta={t.criador} ayuda={t.criadorAyuda} ancho="largo">
          <input value={criador} onChange={(ev) => setCriador(ev.target.value)} data-prueba="config-criador" />
        </Campo>
        <Campo etiqueta={t.propietario} ayuda={t.propietarioAyuda} ancho="largo">
          <input value={propietario} onChange={(ev) => setPropietario(ev.target.value)} data-prueba="config-propietario" />
        </Campo>
        <Campo etiqueta={t.responsable} ayuda={t.responsableAyuda} ancho="largo">
          <input value={responsable} onChange={(ev) => setResponsable(ev.target.value)} data-prueba="config-responsable" />
        </Campo>
      </div>
      <p className="nota" data-prueba="datos-criadero">
        {t.criaderoActual(datos.nombreFinca, datos.criadero ?? undefined, datos.municipio ?? undefined)}{" "}
        <button type="button" className="enlace" onClick={() => navegar({ pantalla: "ajustes", seccion: "finca" })}>
          {t.cambiarCriadero}
        </button>
      </p>
      <div className="acciones">
        <button type="submit" className="boton" data-prueba="guardar-datos-certificado">
          {textos.comun.guardar}
        </button>
      </div>
    </form>
  );
}

function FilaLibro({ libro, alGuardar }: { libro: ConfigLibro; alGuardar: () => Promise<void> }) {
  const conexion = useConexion();
  const contexto = useContextoCambio();
  const [prefijo, setPrefijo] = useState(libro.prefijo ?? "");
  const [separador, setSeparador] = useState<"" | "-">(libro.separador);
  const [digitos, setDigitos] = useState(String(libro.digitos));
  const [inicio, setInicio] = useState(String(libro.siguienteNumero));
  const [error, setError] = useState<unknown>(null);
  const [guardado, setGuardado] = useState(false);
  const bloqueado = libro.registros > 0;
  const numeroInicio = Number(inicio);
  const ejemplo =
    prefijo.trim() && Number.isInteger(numeroInicio) && numeroInicio > 0 && Number.isInteger(Number(digitos))
      ? formatearNumero({ prefijo: prefijo.trim(), separador, digitos: Number(digitos) }, numeroInicio)
      : null;

  return (
    <form
      className="tarjeta"
      data-libro={libro.nombre}
      onSubmit={async (ev) => {
        ev.preventDefault();
        setError(null);
        setGuardado(false);
        try {
          await guardarConfigLibro(conexion, libro.id, { prefijo, separador, digitos: Number(digitos), siguienteNumero: numeroInicio }, contexto());
          setGuardado(true);
          await alGuardar();
        } catch (err) {
          setError(err);
        }
      }}
    >
      <h3>{libro.nombre}</h3>
      <ListaMotivos error={error} />
      {guardado && <Aviso tipo="exito">{t.guardado}</Aviso>}
      {bloqueado && <p className="nota">{t.bloqueado(libro.registros)}</p>}
      <div className="rejilla">
        <Campo etiqueta={t.prefijo} ayuda={t.prefijoAyuda} ancho="corto">
          <input value={prefijo} maxLength={8} disabled={bloqueado} onChange={(ev) => setPrefijo(ev.target.value)} data-prueba="config-prefijo" />
        </Campo>
        <Campo etiqueta={t.separador} ancho="corto">
          <select value={separador} disabled={bloqueado} onChange={(ev) => setSeparador(ev.target.value as "" | "-")} data-prueba="config-separador">
            <option value="-">{t.conGuion}</option>
            <option value="">{t.sinSeparador}</option>
          </select>
        </Campo>
        <Campo etiqueta={t.digitos} ayuda={t.digitosAyuda} ancho="corto">
          <input type="number" min={1} max={8} value={digitos} disabled={bloqueado} onChange={(ev) => setDigitos(ev.target.value)} data-prueba="config-digitos" />
        </Campo>
        <Campo etiqueta={t.inicio} ayuda={bloqueado ? t.siguienteEs : t.inicioAyuda} ancho="corto">
          <input type="number" min={1} value={inicio} disabled={bloqueado} onChange={(ev) => setInicio(ev.target.value)} data-prueba="config-inicio" />
        </Campo>
      </div>
      <p data-prueba="ejemplo-numero">{ejemplo ? t.ejemplo(ejemplo) : t.sinPrefijo}</p>
      {!bloqueado && (
        <div className="acciones">
          <button type="submit" className="boton" data-prueba="guardar-libro">
            {textos.comun.guardar}
          </button>
        </div>
      )}
    </form>
  );
}
