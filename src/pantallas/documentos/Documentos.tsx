import { useState } from "react";
import { Aviso } from "../../componentes/Aviso";
import { GuardarCopias, nombreArchivo, type Generado } from "../../componentes/GuardarCopias";
import { useConexion, useContextoCambio, useNavegar, usePermiso, type SeccionDocumentos } from "../../componentes/contextos";
import { ListaMotivos } from "../../componentes/ListaMotivos";
import { Pestanas } from "../../componentes/Pestanas";
import { SelectorAnimal } from "../../componentes/SelectorAnimal";
import { useCarga } from "../../componentes/useCarga";
import { crearRespaldoConDialogo, guardarDocumento } from "../../datos/archivos";
import { exigirPermiso } from "../../datos/cambios";
import { listarAnimales } from "../../datos/repositorios/animales";
import {
  datosCertificado,
  datosExpediente,
  listarDocumentos,
  registrarDocumento,
  siguienteNumero,
} from "../../datos/repositorios/documentos";
import { obtenerFinca } from "../../datos/repositorios/finca";
import { exportarRespaldo } from "../../datos/respaldo";
import { definicionCertificado } from "../../documentos/certificado";
import { definicionExpediente, expedienteCsv } from "../../documentos/expediente";
import { generarPdf } from "../../documentos/pdf-navegador";
import { armarExpediente } from "../../dominio/expediente";
import { fechaLocal, formatearFecha } from "../../dominio/fechas";
import { textos } from "../../textos/es";
import { HojaDeVenta } from "./HojaDeVenta";
import { InventarioHato } from "./InventarioHato";

const t = textos.documentos;

/** RF-14, RF-15 (Flujo 5) y RF-43. */
export function Documentos({ seccion, animalId }: { seccion: SeccionDocumentos; animalId: string | null }) {
  const navegar = useNavegar();
  return (
    <section className="pantalla pantalla--ancha">
      <h1>{t.titulo}</h1>
      <Pestanas
        opciones={(["certificado", "expediente", "inventario", "hojaVenta", "emitidos", "respaldo"] as const).map((valor) => ({ valor, texto: t.secciones[valor] }))}
        actual={seccion}
        alElegir={(s) => navegar({ pantalla: "documentos", seccion: s, animalId: animalId ?? undefined })}
      />
      {seccion === "certificado" && <EmitirCertificado animalInicial={animalId} />}
      {seccion === "expediente" && <EmitirExpediente animalInicial={animalId} />}
      {seccion === "inventario" && <InventarioHato />}
      {seccion === "hojaVenta" && <HojaDeVenta animalInicial={animalId} />}
      {seccion === "emitidos" && <ListaEmitidos animalId={null} />}
      {seccion === "respaldo" && <Respaldo />}
    </section>
  );
}

function SelectorDeDocumento({ valor, alCambiar }: { valor: string | null; alCambiar: (id: string | null) => void }) {
  const conexion = useConexion();
  // También los registrados solo para la genealogía: un expediente puede pedirse para un animal comprado.
  const { datos: animales } = useCarga(() => listarAnimales(conexion, { incluirSoloGenealogia: true }), [conexion]);
  return <SelectorAnimal etiqueta={t.elegirAnimal} candidatos={animales ?? []} valor={valor} alCambiar={alCambiar} prueba="documento-animal" />;
}

/** RF-14 (R12): certificado interno en PDF. */
function EmitirCertificado({ animalInicial }: { animalInicial: string | null }) {
  const conexion = useConexion();
  const contexto = useContextoCambio();
  const puedeEmitir = usePermiso("emitir_documento");
  const [animalId, setAnimalId] = useState<string | null>(animalInicial);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [resultado, setResultado] = useState<{ numero: string; archivo: Generado } | null>(null);

  async function generar() {
    if (!animalId) return;
    setError(null);
    setGenerando(true);
    try {
      exigirPermiso(contexto(), "emitir_documento");
      const datos = await datosCertificado(conexion, animalId, contexto());
      const bytes = await generarPdf(definicionCertificado(datos));
      const nombre = nombreArchivo(["certificado-interno", datos.animal.nombre, datos.numero], "pdf");
      const archivo = await guardarDocumento(`${datos.numero}.pdf`, bytes);
      await registrarDocumento(conexion, { animalId, tipo: "propio", numero: datos.numero, fecha: datos.fechaEmision, archivo }, contexto());
      setResultado({ numero: datos.numero, archivo: { nombre, bytes, filtro: { nombre: t.filtroPdf, extension: "pdf" } } });
    } catch (e) {
      setError(e);
    } finally {
      setGenerando(false);
    }
  }

  if (!puedeEmitir) return <Aviso tipo="info">{t.soloPropietario}</Aviso>;
  return (
    <div>
      <p className="nota">{t.certificadoAyuda}</p>
      <Aviso tipo="info">{textos.certificado.aviso}</Aviso>
      <ListaMotivos error={error} />
      <div className="tarjeta">
        <SelectorDeDocumento valor={animalId} alCambiar={(id) => (setAnimalId(id), setResultado(null))} />
        <div className="acciones">
          <button type="button" className="boton" disabled={!animalId || generando} onClick={generar} data-prueba="generar-certificado">
            {generando ? t.generando : t.generarCertificado}
          </button>
        </div>
      </div>
      {resultado && (
        <>
          <Aviso tipo="exito">
            <span data-prueba="documento-generado">{t.guardadoInterno(resultado.numero)}</span>
          </Aviso>
          <GuardarCopias archivos={[resultado.archivo]} />
        </>
      )}
    </div>
  );
}

/** Flujo 5 (RF-15, R13): elegir el animal, ver los campos que faltan, generar PDF y CSV. */
function EmitirExpediente({ animalInicial }: { animalInicial: string | null }) {
  const conexion = useConexion();
  const contexto = useContextoCambio();
  const puedeEmitir = usePermiso("emitir_documento");
  const [animalId, setAnimalId] = useState<string | null>(animalInicial);
  const { datos: expediente } = useCarga(
    async () => (animalId ? armarExpediente(await datosExpediente(conexion, animalId)) : null),
    [conexion, animalId],
  );
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [resultado, setResultado] = useState<{ numero: string; archivos: Generado[] } | null>(null);
  const campos = textos.expediente.campos;

  async function generar() {
    if (!animalId || !expediente) return;
    setError(null);
    setGenerando(true);
    try {
      exigirPermiso(contexto(), "emitir_documento");
      const fecha = fechaLocal();
      const numero = await siguienteNumero(conexion, "asociacion", fecha);
      const finca = (await obtenerFinca(conexion))?.nombre ?? "";
      const pdf = await generarPdf(definicionExpediente(expediente, { numero, fechaEmision: fecha, finca }));
      const csv = new TextEncoder().encode(expedienteCsv(expediente));
      const archivo = await guardarDocumento(`${numero}.pdf`, pdf);
      await guardarDocumento(`${numero}.csv`, csv);
      await registrarDocumento(conexion, { animalId, tipo: "asociacion", numero, fecha, archivo }, contexto());
      const base = ["expediente-anco", expediente.datos.nombre, numero];
      setResultado({
        numero,
        archivos: [
          { nombre: nombreArchivo(base, "pdf"), bytes: pdf, filtro: { nombre: t.filtroPdf, extension: "pdf" } },
          { nombre: nombreArchivo(base, "csv"), bytes: csv, filtro: { nombre: t.filtroCsv, extension: "csv" } },
        ],
      });
    } catch (e) {
      setError(e);
    } finally {
      setGenerando(false);
    }
  }

  if (!puedeEmitir) return <Aviso tipo="info">{t.soloPropietario}</Aviso>;
  return (
    <div>
      <p className="nota">{t.expedienteAyuda}</p>
      <ListaMotivos error={error} />
      <div className="tarjeta">
        <SelectorDeDocumento valor={animalId} alCambiar={(id) => (setAnimalId(id), setResultado(null))} />
        {expediente && (
          <div data-prueba="faltantes">
            {expediente.faltantes.length === 0 ? (
              <Aviso tipo="exito">{t.nadaFalta}</Aviso>
            ) : (
              <Aviso tipo="error">
                <p className="destacado">{t.faltanTitulo}</p>
                <ul>
                  {expediente.faltantes.map((c) => (
                    <li key={c}>{campos[c]}</li>
                  ))}
                </ul>
                <p>{t.faltanAyuda}</p>
              </Aviso>
            )}
            {expediente.avisos.map((a) => (
              <p key={a.campo} className="nota">
                {t.avisoSinVerificar(campos[a.campo])}
              </p>
            ))}
          </div>
        )}
        <div className="acciones">
          <button type="button" className="boton" disabled={!expediente || generando} onClick={generar} data-prueba="generar-expediente">
            {generando ? t.generando : t.generarExpediente}
          </button>
        </div>
      </div>
      {resultado && (
        <>
          <Aviso tipo="exito">
            <span data-prueba="documento-generado">{t.guardadoInterno(resultado.numero)}</span>
          </Aviso>
          <GuardarCopias archivos={resultado.archivos} />
        </>
      )}
    </div>
  );
}

/** Documentos emitidos (tabla certificado), de todo el hato o de un animal. */
export function ListaEmitidos({ animalId }: { animalId: string | null }) {
  const conexion = useConexion();
  const navegar = useNavegar();
  const { datos } = useCarga(() => listarDocumentos(conexion, { animalId: animalId ?? undefined }), [conexion, animalId]);
  const c = t.emitidosColumnas;
  if (datos === null) return <p>{textos.comun.cargando}</p>;
  if (datos.length === 0) return <p className="nota">{t.emitidosVacio}</p>;
  return (
    <table className="tabla" data-prueba="tabla-emitidos">
      <thead>
        <tr>
          <th>{c.fecha}</th>
          <th>{c.numero}</th>
          <th>{c.tipo}</th>
          {!animalId && <th>{c.animal}</th>}
          <th>{c.archivo}</th>
        </tr>
      </thead>
      <tbody>
        {datos.map((d) => (
          <tr key={d.id}>
            <td>{formatearFecha(d.fecha)}</td>
            <td className="destacado">{d.numero}</td>
            <td>{t.tipoDocumento[d.tipo]}</td>
            {!animalId && (
              <td>
                <button type="button" className="enlace" onClick={() => navegar({ pantalla: "animal", id: d.animalId, pestana: "documentos" })}>
                  {d.animal}
                </button>
              </td>
            )}
            <td className="nota">{d.archivo}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** RF-43: exportar todos los datos de la finca a un .zip. Restaurar se hace en la primera pantalla (Asistente). */
function Respaldo() {
  const conexion = useConexion();
  const contexto = useContextoCambio();
  const puedeExportar = usePermiso("exportar_respaldo");
  const [trabajando, setTrabajando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const r = textos.respaldo;

  async function exportar() {
    setError(null);
    setMensaje(null);
    setTrabajando(true);
    try {
      const respaldo = await exportarRespaldo(conexion, contexto());
      const resultado = await crearRespaldoConDialogo(r.nombreArchivo(fechaLocal()), r.filtro, JSON.stringify(respaldo));
      if (resultado) setMensaje(r.exportado(resultado.ruta, tamano(resultado.bytes)));
    } catch (e) {
      setError(e);
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <div>
      <div className="tarjeta">
        <h2>{r.titulo}</h2>
        <p>{r.explicacion}</p>
        <ListaMotivos error={error} />
        {mensaje && <Aviso tipo="exito">{mensaje}</Aviso>}
        {puedeExportar ? (
          <button type="button" className="boton" disabled={trabajando} onClick={exportar} data-prueba="crear-respaldo">
            {trabajando ? r.exportando : r.exportar}
          </button>
        ) : (
          <Aviso tipo="info">{r.soloPropietario}</Aviso>
        )}
      </div>
      <div className="tarjeta">
        <h2>{r.restaurarTitulo}</h2>
        <p>{r.restaurarExplicacion}</p>
      </div>
    </div>
  );
}

/** 1536 → «1,5 kB». */
function tamano(bytes: number): string {
  const unidades = ["bytes", "kB", "MB", "GB"];
  let valor = bytes;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024;
    i++;
  }
  return `${valor.toLocaleString("es-CO", { maximumFractionDigits: 1 })} ${unidades[i]}`;
}
