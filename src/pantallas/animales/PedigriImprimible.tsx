import { useState } from "react";
import { Casilla } from "../../componentes/Campo";
import { useConexion, usePermiso } from "../../componentes/contextos";
import { nombreArchivo } from "../../componentes/GuardarCopias";
import { ListaMotivos } from "../../componentes/ListaMotivos";
import { guardarCopiaConDialogo } from "../../datos/archivos";
import { datosPedigri } from "../../datos/repositorios/registros";
import { generarPdf } from "../../documentos/pdf-navegador";
import { definicionPedigri } from "../../documentos/pedigri";
import { textos } from "../../textos/es";

const t = textos.registros.pedigri;

/** R31: pedigrí imprimible en PDF de cualquier animal (tenga o no registro propio). Solo el propietario imprime documentos. */
export function PedigriImprimible({ animalId }: { animalId: string }) {
  const conexion = useConexion();
  const puede = usePermiso("emitir_documento");
  const [cuatro, setCuatro] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  if (!puede) return null;

  async function imprimir() {
    setError(null);
    setMensaje(null);
    setTrabajando(true);
    try {
      const datos = await datosPedigri(conexion, animalId);
      const bytes = await generarPdf(definicionPedigri(datos, cuatro ? 4 : 3));
      const destino = await guardarCopiaConDialogo(
        nombreArchivo(["pedigri", datos.animal.nombre ?? datos.animal.identificador], "pdf"),
        { nombre: textos.documentos.filtroPdf, extension: "pdf" },
        bytes,
      );
      setMensaje(destino ? textos.documentos.guardadoEn(destino) : textos.documentos.sinCopia);
    } catch (e) {
      setError(e);
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <div className="tarjeta" data-prueba="pedigri-imprimible">
      <h2>{t.imprimirTitulo}</h2>
      <p className="nota">{t.imprimirAyuda}</p>
      <ListaMotivos error={error} />
      <Casilla etiqueta={t.cuatroGeneraciones} marcada={cuatro} alCambiar={setCuatro} prueba="pedigri-cuatro" />
      <div className="acciones">
        <button type="button" className="boton" disabled={trabajando} onClick={imprimir} data-prueba="imprimir-pedigri">
          {trabajando ? t.generando : t.imprimir}
        </button>
      </div>
      {mensaje && (
        <p className="nota" data-prueba="pedigri-guardado">
          {mensaje}
        </p>
      )}
    </div>
  );
}
