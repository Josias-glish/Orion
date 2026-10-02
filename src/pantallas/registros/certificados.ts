// Pasos del programa (no reglas del dominio) para dejar listo el certificado de un registro: armar el PDF con la
// instantánea, guardarlo en la carpeta de datos y anotarlo en «certificado». Lo usan la emisión, la reemisión y la
// descarga del certificado.
import { guardarDocumento } from "../../datos/archivos";
import type { Conexion, ContextoCambio } from "../../datos/conexion";
import { ErrorDeRegistro } from "../../datos/errores";
import { obtenerRegistro, registrarDocumentoDeRegistro } from "../../datos/repositorios/registros";
import { definicionRegistroPropio } from "../../documentos/registro-propio";
import { generarPdf } from "../../documentos/pdf-navegador";
import type { GeneracionesPedigri } from "../../dominio/pedigri";
import { numeroDeDocumento } from "../../dominio/registros";
import { nombreArchivo } from "../../componentes/GuardarCopias";

export interface CertificadoGenerado {
  numero: string;
  version: number;
  /** Nombre sugerido para una copia: «certificado-registro-Estrella-PPE-0001-v1.pdf». */
  nombre: string;
  bytes: Uint8Array;
}

/** Genera el PDF de la versión vigente de un registro emitido, lo guarda y lo anota en «certificado». */
export async function generarCertificadoDeRegistro(
  conexion: Conexion,
  contexto: ContextoCambio,
  registroId: string,
  generaciones: GeneracionesPedigri = 3,
): Promise<CertificadoGenerado> {
  const registro = await obtenerRegistro(conexion, registroId);
  if (!registro) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  if (registro.estado !== "emitido" || !registro.instantanea) throw new ErrorDeRegistro([{ codigo: "registro_no_emitido" }]);
  const bytes = await generarPdf(definicionRegistroPropio(registro.instantanea, { generaciones }));
  const documento = numeroDeDocumento(registro.numero!, registro.version);
  const archivo = await guardarDocumento(`${documento}.pdf`, bytes);
  await registrarDocumentoDeRegistro(conexion, registroId, archivo, contexto);
  return {
    numero: registro.numero!,
    version: registro.version,
    nombre: nombreArchivo(["certificado-registro", registro.instantanea.animal.nombre, documento], "pdf"),
    bytes,
  };
}
