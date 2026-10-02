import { useState } from "react";
import { Aviso } from "../../componentes/Aviso";
import { GuardarCopias, nombreArchivo, type Generado } from "../../componentes/GuardarCopias";
import { useConexion, usePermiso } from "../../componentes/contextos";
import { ListaMotivos } from "../../componentes/ListaMotivos";
import { useCarga } from "../../componentes/useCarga";
import { datosInventario } from "../../datos/repositorios/traspasos";
import { obtenerDatosDeRegistro } from "../../datos/repositorios/registros";
import { generarXlsx } from "../../documentos/excel";
import { definicionInventario, hojasExcelInventario } from "../../documentos/inventario";
import { generarPdf } from "../../documentos/pdf-navegador";
import { fechaLocal, formatearFecha } from "../../dominio/fechas";
import { textos } from "../../textos/es";

const t = textos.inventario;

/** RF-36: el inventario del hato en PDF y en Excel. Lo emite quien puede emitir documentos (R14, solo el propietario). */
export function InventarioHato() {
  const conexion = useConexion();
  const puedeEmitir = usePermiso("emitir_documento");
  const hoy = fechaLocal();
  const { datos: inventario, error: errorCarga } = useCarga(() => datosInventario(conexion, hoy), [conexion, hoy]);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [resultado, setResultado] = useState<{ animales: number; archivos: Generado[] } | null>(null);

  async function generar() {
    if (!inventario) return;
    setError(null);
    setGenerando(true);
    try {
      const finca = await obtenerDatosDeRegistro(conexion);
      const descripcion = { finca: { nombre: finca.nombreFinca, criadero: finca.criadero, municipio: finca.municipio }, generado: hoy };
      const pdf = await generarPdf(definicionInventario(inventario, descripcion));
      const excel = await generarXlsx(hojasExcelInventario(inventario));
      const base = ["inventario-del-hato", hoy];
      setResultado({
        animales: inventario.totales.total,
        archivos: [
          { nombre: nombreArchivo(base, "pdf"), bytes: pdf, filtro: { nombre: textos.documentos.filtroPdf, extension: "pdf" } },
          { nombre: nombreArchivo(base, "xlsx"), bytes: excel, filtro: { nombre: textos.documentos.filtroExcel, extension: "xlsx" } },
        ],
      });
    } catch (e) {
      setError(e);
    } finally {
      setGenerando(false);
    }
  }

  if (!puedeEmitir) return <Aviso tipo="info">{textos.documentos.soloPropietario}</Aviso>;
  return (
    <div data-prueba="inventario">
      <p className="nota">{t.ayuda}</p>
      <Aviso tipo="info">{t.aviso}</Aviso>
      <ListaMotivos error={error ?? errorCarga} />
      {inventario === null ? (
        <p>{textos.comun.cargando}</p>
      ) : (
        <div className="tarjeta">
          <h2>{t.alFecha(formatearFecha(inventario.fecha))}</h2>
          {inventario.totales.total === 0 ? (
            <p className="nota">{t.vacio}</p>
          ) : (
            <>
              <p className="destacado" data-prueba="inventario-totales">
                {[
                  t.totales.total(inventario.totales.total),
                  t.totales.hembras(inventario.totales.hembras),
                  t.totales.machos(inventario.totales.machos),
                  t.totales.nacidosAqui(inventario.totales.nacidosAqui),
                  t.totales.comprados(inventario.totales.comprados),
                ].join(" · ")}
              </p>
              <h3>{t.porLote}</h3>
              <ul className="lista-simple" data-prueba="inventario-por-lote">
                {inventario.totales.porLote.map((l) => (
                  <li key={l.lote ?? "sin-lote"}>
                    {l.lote ?? t.sinLote}: {l.cantidad}
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="acciones">
            <button type="button" className="boton" disabled={generando} onClick={generar} data-prueba="generar-inventario">
              {generando ? t.generando : t.generar}
            </button>
          </div>
        </div>
      )}
      {resultado && (
        <>
          <Aviso tipo="exito">
            <span data-prueba="documento-generado">{t.listo(resultado.animales)}</span>
          </Aviso>
          <GuardarCopias archivos={resultado.archivos} />
        </>
      )}
    </div>
  );
}
