import { useConexion } from "../../componentes/contextos";
import { useCarga } from "../../componentes/useCarga";
import { listarHistorialAnimal } from "../../datos/repositorios/historial";
import { formatearFecha, formatearMarcaDeTiempo } from "../../dominio/fechas";
import type { EstadoAnimal, FormaConcepcion, Sexo, TipoIdentificador } from "../../dominio/tipos";
import { textos } from "../../textos/es";

const CAMPOS_SI_NO = new Set(["en_hato", "vigente", "principal", "padre_sin_verificar", "madre_sin_verificar"]);

/** Valor del historial tal como lo entiende una persona: «Sí» en lugar de 1, «Hembra» en lugar de hembra… */
function valorLegible(campo: string, valor: string | null): string {
  if (valor === null) return textos.comun.sinDato;
  const c = textos.comun;
  if (CAMPOS_SI_NO.has(campo)) return valor === "1" ? c.si : c.no;
  if (campo === "sexo") return c.sexo[valor as Sexo] ?? valor;
  if (campo === "estado") return c.estado[valor as EstadoAnimal] ?? valor;
  if (campo === "tipo") return c.tipoIdentificador[valor as TipoIdentificador] ?? valor;
  if (campo === "forma_concepcion") return c.formaConcepcion[valor as FormaConcepcion] ?? valor;
  if (campo === "fraccion") return c.porcentaje(Number(valor) * 100);
  if (campo === "fecha_nacimiento" || campo === "fecha") return formatearFecha(valor);
  if (campo === "eliminado_en") return formatearMarcaDeTiempo(valor);
  return valor;
}

/** Historial de cambios del animal (sección 6: historial_cambios). */
export function HistorialAnimal({ animalId }: { animalId: string }) {
  const conexion = useConexion();
  const { datos } = useCarga(() => listarHistorialAnimal(conexion, animalId), [conexion, animalId]);
  const t = textos.historial;
  if (!datos) return <p>{textos.comun.cargando}</p>;
  if (datos.length === 0) return <p className="nota">{t.vacio}</p>;
  return (
    <table className="tabla" data-prueba="tabla-historial">
      <thead>
        <tr>
          <th>{t.columnas.fecha}</th>
          <th>{t.columnas.cambio}</th>
          <th>{t.columnas.antes}</th>
          <th>{t.columnas.despues}</th>
          <th>{t.columnas.usuario}</th>
        </tr>
      </thead>
      <tbody>
        {datos.map((h, i) => (
          <tr key={i}>
            <td>{formatearMarcaDeTiempo(h.marcaTiempo)}</td>
            <td>
              {t.entidades[h.entidad] ?? h.entidad}: {t.campo(h.campo)}
            </td>
            <td>{valorLegible(h.campo, h.valorAnterior)}</td>
            <td>{valorLegible(h.campo, h.valorNuevo)}</td>
            <td>{h.usuario ?? textos.comun.sinDato}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
