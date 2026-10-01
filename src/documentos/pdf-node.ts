// Solo para pruebas y scripts de desarrollo (Node). El programa usa pdf-navegador.ts.
// Mismas fuentes Roboto que trae pdfmake; sin acceso a internet ni a otros archivos.
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { TDocumentDefinitions } from "pdfmake/interfaces";

const require = createRequire(import.meta.url);
const pdfmake = require("pdfmake") as typeof import("pdfmake");
const fuentes = join(dirname(require.resolve("pdfmake/package.json")), "fonts", "Roboto");

pdfmake.setFonts({
  Roboto: {
    normal: join(fuentes, "Roboto-Regular.ttf"),
    bold: join(fuentes, "Roboto-Medium.ttf"),
    italics: join(fuentes, "Roboto-Italic.ttf"),
    bolditalics: join(fuentes, "Roboto-MediumItalic.ttf"),
  },
});
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((ruta) => ruta.startsWith(fuentes));

export async function generarPdfEnNode(definicion: TDocumentDefinitions): Promise<Uint8Array> {
  return new Uint8Array(await pdfmake.createPdf(definicion).getBuffer());
}
