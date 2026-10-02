import type { DatosFinca } from "../datos/repositorios/finca";
import { textos } from "../textos/es";
import { Campo } from "./Campo";

/** Campos de la finca, compartidos por el asistente y por Ajustes. */
export function CamposFinca({ datos, alCambiar }: { datos: DatosFinca; alCambiar: (d: DatosFinca) => void }) {
  const t = textos.finca;
  const texto = (campo: "nombre" | "criadero" | "municipio" | "registroSanitarioPredio") => ({
    value: datos[campo] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => alCambiar({ ...datos, [campo]: e.target.value }),
  });
  const numero = (campo: "diasGestacion" | "diasLactancia" | "margenGestacion") => ({
    value: Number.isNaN(datos[campo]) ? "" : String(datos[campo]),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => alCambiar({ ...datos, [campo]: Number.parseInt(e.target.value, 10) }),
  });
  return (
    <div className="rejilla">
      <Campo etiqueta={t.nombre} ancho="largo">
        <input {...texto("nombre")} required data-prueba="finca-nombre" />
      </Campo>
      <Campo etiqueta={t.criadero}>
        <input {...texto("criadero")} />
      </Campo>
      <Campo etiqueta={t.municipio}>
        <input {...texto("municipio")} />
      </Campo>
      <Campo etiqueta={t.registroSanitario}>
        <input {...texto("registroSanitarioPredio")} />
      </Campo>
      <Campo etiqueta={t.diasGestacion} ancho="corto">
        <input type="number" min={1} inputMode="numeric" {...numero("diasGestacion")} />
      </Campo>
      <Campo etiqueta={t.diasLactancia} ancho="corto" ayuda={t.ayudaDias}>
        <input type="number" min={1} inputMode="numeric" {...numero("diasLactancia")} />
      </Campo>
      <Campo etiqueta={t.margenGestacion} ancho="corto" ayuda={t.ayudaMargen}>
        <input type="number" min={0} max={60} inputMode="numeric" {...numero("margenGestacion")} data-prueba="finca-margen" />
      </Campo>
    </div>
  );
}

export const fincaVacia = (): DatosFinca => ({
  nombre: "",
  criadero: null,
  municipio: null,
  registroSanitarioPredio: null,
  diasGestacion: 150,
  diasLactancia: 305,
  margenGestacion: 10,
});
