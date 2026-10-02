import { useState } from "react";
import { Aviso } from "../../componentes/Aviso";
import { Casilla } from "../../componentes/Campo";
import { GuardarCopias, nombreArchivo, type Generado } from "../../componentes/GuardarCopias";
import { useConexion, useContextoCambio, usePermiso } from "../../componentes/contextos";
import { ListaMotivos } from "../../componentes/ListaMotivos";
import { SelectorAnimal } from "../../componentes/SelectorAnimal";
import { useCarga } from "../../componentes/useCarga";
import { exigirPermiso } from "../../datos/cambios";
import { listarAnimales } from "../../datos/repositorios/animales";
import { registroVigenteDe } from "../../datos/repositorios/registros";
import { datosHojaVenta } from "../../datos/repositorios/traspasos";
import { generarXlsx } from "../../documentos/excel";
import { definicionHojaVenta, hojasExcelHojaVenta } from "../../documentos/hoja-venta";
import { generarPdf } from "../../documentos/pdf-navegador";
import { armarHojaVenta } from "../../dominio/hoja-venta";
import { textos } from "../../textos/es";
import { generarCertificadoDeRegistro } from "../registros/certificados";

const t = textos.hojaVenta;

/**
 * RF-36 (R21): la hoja de venta de un animal con su pedigrí de tres generaciones, en PDF y en Excel. La producción de
 * leche es opcional (la elige el vendedor) y, si el animal tiene registro propio emitido, también puede entregarse su
 * certificado (R31). Es un documento informativo del criadero, no un certificado oficial.
 */
export function HojaDeVenta({ animalInicial }: { animalInicial: string | null }) {
  const conexion = useConexion();
  const contexto = useContextoCambio();
  const puedeEmitir = usePermiso("emitir_documento");
  const [animalId, setAnimalId] = useState<string | null>(animalInicial);
  // También los vendidos: la hoja se entrega después de la venta.
  const { datos: animales } = useCarga(() => listarAnimales(conexion, { incluirSoloGenealogia: true }), [conexion]);
  const { datos: hoja, error: errorCarga } = useCarga(async () => {
    if (!animalId) return null;
    const entrada = await datosHojaVenta(conexion, animalId);
    return { entrada, registro: await registroVigenteDe(conexion, animalId) };
  }, [conexion, animalId]);
  const [incluirProduccion, setIncluirProduccion] = useState(false);
  const [incluirCertificado, setIncluirCertificado] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [resultado, setResultado] = useState<{ nombre: string; certificado: string | null; archivos: Generado[] } | null>(null);

  const registroEmitido = hoja?.registro?.estado === "emitido" ? hoja.registro : null;
  const esHembra = hoja?.entrada.animal.sexo === "hembra";

  async function generar() {
    if (!hoja || !animalId) return;
    setError(null);
    setGenerando(true);
    try {
      exigirPermiso(contexto(), "emitir_documento");
      const datos = armarHojaVenta(hoja.entrada, { incluirProduccion: incluirProduccion && esHembra });
      const nombre = datos.animal.nombre ?? datos.animal.identificadores[0]?.valor ?? textos.animales.sinNombre;
      const pdf = await generarPdf(definicionHojaVenta(datos));
      const excel = await generarXlsx(hojasExcelHojaVenta(datos));
      const base = ["hoja-de-venta", nombre, datos.fecha];
      const archivos: Generado[] = [
        { nombre: nombreArchivo(base, "pdf"), bytes: pdf, filtro: { nombre: textos.documentos.filtroPdf, extension: "pdf" } },
        { nombre: nombreArchivo(base, "xlsx"), bytes: excel, filtro: { nombre: textos.documentos.filtroExcel, extension: "xlsx" } },
      ];
      let certificado: string | null = null;
      if (incluirCertificado && registroEmitido) {
        const generado = await generarCertificadoDeRegistro(conexion, contexto(), registroEmitido.id);
        archivos.push({ nombre: generado.nombre, bytes: generado.bytes, filtro: { nombre: textos.documentos.filtroPdf, extension: "pdf" } });
        certificado = generado.numero;
      }
      setResultado({ nombre, certificado, archivos });
    } catch (e) {
      setError(e);
    } finally {
      setGenerando(false);
    }
  }

  if (!puedeEmitir) return <Aviso tipo="info">{textos.documentos.soloPropietario}</Aviso>;
  return (
    <div data-prueba="hoja-venta">
      <p className="nota">{t.ayuda}</p>
      <Aviso tipo="info">{t.aviso}</Aviso>
      <ListaMotivos error={error ?? errorCarga} />
      <div className="tarjeta">
        <SelectorAnimal etiqueta={t.elegirAnimal} candidatos={animales ?? []} valor={animalId} alCambiar={(id) => (setAnimalId(id), setResultado(null))} prueba="hoja-animal" />
        {hoja && (
          <div>
            {hoja.entrada.animal.estado === "vendido" && <p className="nota">{t.animalVendido}</p>}
            {esHembra && (
              <div>
                <Casilla etiqueta={t.incluirProduccion} marcada={incluirProduccion} alCambiar={setIncluirProduccion} prueba="hoja-produccion" />
                <p className="nota">{t.incluirProduccionAyuda}</p>
              </div>
            )}
            {registroEmitido ? (
              <div>
                <Casilla etiqueta={t.incluirCertificado} marcada={incluirCertificado} alCambiar={setIncluirCertificado} prueba="hoja-certificado" />
                <p className="nota">{t.incluirCertificadoAyuda}</p>
              </div>
            ) : (
              <p className="nota" data-prueba="hoja-sin-registro">
                {t.sinRegistroPropio}
              </p>
            )}
          </div>
        )}
        <div className="acciones">
          <button type="button" className="boton" disabled={!hoja || generando} onClick={generar} data-prueba="generar-hoja-venta">
            {generando ? t.generando : t.generar}
          </button>
        </div>
      </div>
      {resultado && (
        <>
          <Aviso tipo="exito">
            <span data-prueba="documento-generado">{t.listo(resultado.nombre)}</span>
            {resultado.certificado && <span> {t.certificadoIncluido(resultado.certificado)}</span>}
          </Aviso>
          <GuardarCopias archivos={resultado.archivos} />
        </>
      )}
    </div>
  );
}
