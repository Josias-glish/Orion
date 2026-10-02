import { useState } from "react";
import { useConexion, useContextoCambio, usePermiso } from "../../componentes/contextos";
import { ListaMotivos } from "../../componentes/ListaMotivos";
import { useCarga } from "../../componentes/useCarga";
import { crearGastoDeServicio, listarCategorias } from "../../datos/repositorios/finanzas";
import { CATEGORIA_MONTAS_ID } from "../../dominio/finanzas";
import { textos } from "../../textos/es";

const t = textos.finanzas.ofertaMonta;

interface Props {
  servicioId: string;
  costo: number;
  hembra: string;
  macho: string;
  /** Con el mensaje de éxito si se anotó el gasto, o `null` si el usuario dijo «ahora no». */
  alTerminar: (mensaje: string | null) => void;
}

/**
 * R30: después de guardar una monta con costo, ofrece anotarlo como gasto de la hembra servida. Solo se muestra a
 * quien puede gestionar finanzas (R23). Si no se acepta ahora, se puede hacer después desde la ficha del macho.
 */
export function OfertaGastoMonta({ servicioId, costo, hembra, macho, alTerminar }: Props) {
  const conexion = useConexion();
  const contexto = useContextoCambio();
  const puede = usePermiso("gestionar_finanzas");
  const { datos: categorias } = useCarga(() => listarCategorias(conexion, { tipo: "gasto", soloActivas: true }), [conexion]);
  const [elegida, setElegida] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  if (!puede) return null;

  const categoriaId = elegida ?? (categorias?.some((c) => c.id === CATEGORIA_MONTAS_ID) ? CATEGORIA_MONTAS_ID : (categorias?.[0]?.id ?? ""));

  return (
    <div className="tarjeta tarjeta--suave" role="group" aria-label={t.titulo} data-prueba="oferta-gasto-monta">
      <h3>{t.titulo}</h3>
      <p>{t.texto(textos.comun.pesos(costo), hembra)}</p>
      <ListaMotivos error={error} />
      <div className="fila-editable">
        <label className="campo campo--medio">
          <span className="campo__etiqueta">{t.categoria}</span>
          <select value={categoriaId} onChange={(e) => setElegida(e.target.value)} data-prueba="oferta-categoria">
            {(categorias ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="boton"
          onClick={async () => {
            setError(null);
            try {
              await crearGastoDeServicio(conexion, servicioId, categoriaId, textos.finanzas.ofertaMonta.descripcion(hembra, macho), contexto());
              alTerminar(t.anotado(textos.comun.pesos(costo)));
            } catch (e) {
              setError(e);
            }
          }}
          data-prueba="anotar-gasto-monta"
        >
          {t.anotar}
        </button>
        <button type="button" className="boton boton--secundario" onClick={() => alTerminar(null)} data-prueba="gasto-monta-ahora-no">
          {t.ahoraNo}
        </button>
      </div>
    </div>
  );
}
