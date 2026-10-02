import { useState } from "react";
import { guardarCopiaConDialogo } from "../datos/archivos";
import { textos } from "../textos/es";
import { ListaMotivos } from "./ListaMotivos";

const t = textos.documentos;

/** Un archivo generado que el usuario puede guardar donde quiera. */
export interface Generado {
  nombre: string;
  bytes: Uint8Array;
  filtro: { nombre: string; extension: string };
}

/** Botones «Guardar una copia…» de los archivos recién generados. */
export function GuardarCopias({ archivos }: { archivos: Generado[] }) {
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  return (
    <div>
      <ListaMotivos error={error} />
      <div className="acciones">
        {archivos.map((a) => (
          <button
            key={a.nombre}
            type="button"
            className="boton boton--secundario"
            onClick={async () => {
              setError(null);
              try {
                const ruta = await guardarCopiaConDialogo(a.nombre, a.filtro, a.bytes);
                setMensaje(ruta ? t.guardadoEn(ruta) : t.sinCopia);
              } catch (e) {
                setError(e);
              }
            }}
            data-prueba={`copia-${a.filtro.extension}`}
          >
            {t.guardarCopia(a.filtro.extension.toUpperCase())}
          </button>
        ))}
      </div>
      {mensaje && <p className="nota" data-prueba="copia-guardada">{mensaje}</p>}
    </div>
  );
}

/** Nombre de archivo sin tildes ni espacios: «certificado-interno-Estrella-CI-2026-0001.pdf». */
export const nombreArchivo = (partes: (string | null)[], extension: string) =>
  `${partes
    .filter(Boolean)
    .join("-")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")}.${extension}`;
