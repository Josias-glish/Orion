import { useMemo, useState } from "react";
import { Campo, Casilla } from "../../componentes/Campo";
import { useConexion } from "../../componentes/contextos";
import { nombreArchivo } from "../../componentes/GuardarCopias";
import { ListaMotivos } from "../../componentes/ListaMotivos";
import { useCarga } from "../../componentes/useCarga";
import { guardarCopiaConDialogo } from "../../datos/archivos";
import { listarCatalogo } from "../../datos/repositorios/catalogos";
import { obtenerDatosDeRegistro, listarRegistrosDelLibro } from "../../datos/repositorios/registros";
import { generarXlsx } from "../../documentos/excel";
import { definicionLibro, hojaLibro, type DescripcionLibro } from "../../documentos/libro";
import { generarPdf } from "../../documentos/pdf-navegador";
import { fechaLocal, formatearFecha } from "../../dominio/fechas";
import { filasDelLibro, type FiltroLibro } from "../../dominio/libro-genealogico";
import { composicionTexto } from "../../documentos/comun";
import { textos } from "../../textos/es";

const t = textos.registros.pantalla.libro;
const e = textos.registros;

/** R31: libro genealógico del criadero por libro, raza y periodo, exportable a PDF y a Excel. Sale de lo emitido. */
export function LibroGenealogico() {
  const conexion = useConexion();
  const { datos: registros } = useCarga(() => listarRegistrosDelLibro(conexion), [conexion]);
  const { datos: libros } = useCarga(() => listarCatalogo(conexion, "libro"), [conexion]);
  const { datos: razas } = useCarga(() => listarCatalogo(conexion, "raza"), [conexion]);
  const [filtro, setFiltro] = useState<FiltroLibro>({});
  const [error, setError] = useState<unknown>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const filas = useMemo(() => filasDelLibro(registros ?? [], filtro), [registros, filtro]);

  async function exportar(formato: "pdf" | "xlsx") {
    setError(null);
    setMensaje(null);
    setTrabajando(true);
    try {
      const datos = await obtenerDatosDeRegistro(conexion);
      const hoy = fechaLocal();
      const descripcion: DescripcionLibro = {
        finca: { nombre: datos.nombreFinca, criadero: datos.criadero, municipio: datos.municipio },
        fecha: hoy,
        filtros: {
          libro: libros?.find((l) => l.id === filtro.libroId)?.nombre ?? null,
          raza: filtro.raza ?? null,
          desde: filtro.desde ?? null,
          hasta: filtro.hasta ?? null,
          incluirAnulados: filtro.incluirAnulados ?? false,
        },
      };
      const bytes = formato === "pdf" ? await generarPdf(definicionLibro(filas, descripcion)) : await generarXlsx([hojaLibro(filas)]);
      const destino = await guardarCopiaConDialogo(
        nombreArchivo(["libro-genealogico", hoy], formato),
        formato === "pdf" ? { nombre: textos.documentos.filtroPdf, extension: "pdf" } : { nombre: t.filtroExcel, extension: "xlsx" },
        bytes,
      );
      setMensaje(destino ? textos.documentos.guardadoEn(destino) : textos.documentos.sinCopia);
    } catch (err) {
      setError(err);
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <div>
      <p className="nota">{t.ayuda}</p>
      <div className="filtros">
        <Campo etiqueta={textos.registros.pantalla.filtros.libro} ancho="corto">
          <select value={filtro.libroId ?? ""} onChange={(ev) => setFiltro({ ...filtro, libroId: ev.target.value || null })} data-prueba="libro-filtro-libro">
            <option value="">{textos.comun.todos}</option>
            {libros?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta={textos.registros.pantalla.filtros.raza} ancho="corto">
          <select value={filtro.raza ?? ""} onChange={(ev) => setFiltro({ ...filtro, raza: ev.target.value || null })} data-prueba="libro-filtro-raza">
            <option value="">{textos.comun.todos}</option>
            {razas?.map((r) => (
              <option key={r.id} value={r.nombre}>
                {r.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta={textos.registros.pantalla.filtros.desde} ancho="corto">
          <input type="date" value={filtro.desde ?? ""} onChange={(ev) => setFiltro({ ...filtro, desde: ev.target.value || null })} data-prueba="libro-filtro-desde" />
        </Campo>
        <Campo etiqueta={textos.registros.pantalla.filtros.hasta} ancho="corto">
          <input type="date" value={filtro.hasta ?? ""} onChange={(ev) => setFiltro({ ...filtro, hasta: ev.target.value || null })} data-prueba="libro-filtro-hasta" />
        </Campo>
      </div>
      <Casilla etiqueta={t.incluirAnulados} marcada={filtro.incluirAnulados ?? false} alCambiar={(v) => setFiltro({ ...filtro, incluirAnulados: v })} prueba="libro-anulados" />

      <ListaMotivos error={error} />
      <div className="acciones">
        <button type="button" className="boton" disabled={trabajando || filas.length === 0} onClick={() => exportar("pdf")} data-prueba="exportar-libro-pdf">
          {t.exportarPdf}
        </button>
        <button type="button" className="boton" disabled={trabajando || filas.length === 0} onClick={() => exportar("xlsx")} data-prueba="exportar-libro-excel">
          {t.exportarExcel}
        </button>
      </div>
      {mensaje && (
        <p className="nota" data-prueba="libro-exportado">
          {mensaje}
        </p>
      )}

      {registros === null ? (
        <p>{textos.comun.cargando}</p>
      ) : filas.length === 0 ? (
        <p className="nota" data-prueba="libro-vacio">
          {e.libroGenealogico.vacio}
        </p>
      ) : (
        <>
          <p className="nota" data-prueba="libro-cantidad">
            {e.libroGenealogico.total(filas.length)}
          </p>
          <div className="tabla-con-scroll">
            <table className="tabla" data-prueba="tabla-libro">
              <thead>
                <tr>
                  <th>{e.libroGenealogico.columnas.libro}</th>
                  <th>{e.libroGenealogico.columnas.numero}</th>
                  <th>{e.libroGenealogico.columnas.nombre}</th>
                  <th>{e.libroGenealogico.columnas.identificador}</th>
                  <th>{e.libroGenealogico.columnas.nacimiento}</th>
                  <th>{e.libroGenealogico.columnas.raza}</th>
                  <th>{e.libroGenealogico.columnas.padre}</th>
                  <th>{e.libroGenealogico.columnas.madre}</th>
                  <th>{e.libroGenealogico.columnas.fechaRegistro}</th>
                  <th>{e.libroGenealogico.columnas.version}</th>
                  {filtro.incluirAnulados && <th>{e.libroGenealogico.columnas.estado}</th>}
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.numero} data-numero={f.numero}>
                    <td>{f.libro}</td>
                    <td className="destacado">{f.numero}</td>
                    <td>{f.nombre}</td>
                    <td>{f.identificador}</td>
                    <td>{f.nacimiento ? formatearFecha(f.nacimiento) : ""}</td>
                    <td>{composicionTexto(f.razas)}</td>
                    <td>{f.padre}</td>
                    <td>{f.madre}</td>
                    <td>{formatearFecha(f.fechaRegistro)}</td>
                    <td>{f.version}</td>
                    {filtro.incluirAnulados && <td>{e.estados[f.estado]}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
