// PDF dentro de la ventana del programa, sin red: pdfmake con las fuentes Roboto incluidas en el programa.
import pdfMake from "pdfmake/build/pdfmake";
import vfs from "pdfmake/build/vfs_fonts";
import type { TDocumentDefinitions } from "pdfmake/interfaces";

pdfMake.addVirtualFileSystem(vfs);

export async function generarPdf(definicion: TDocumentDefinitions): Promise<Uint8Array> {
  return new Uint8Array(await pdfMake.createPdf(definicion).getBuffer());
}
