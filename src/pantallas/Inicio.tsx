import { useConexion, useNavegar, usePermiso, useSesion } from "../componentes/contextos";
import { useCarga } from "../componentes/useCarga";
import { contarAnimales } from "../datos/repositorios/animales";
import { textos } from "../textos/es";

export function Inicio() {
  const conexion = useConexion();
  const { usuario, finca } = useSesion();
  const navegar = useNavegar();
  const puedeCrear = usePermiso("crear_animal");
  const { datos: conteo } = useCarga(() => contarAnimales(conexion), [conexion]);
  const t = textos.inicio;

  return (
    <section className="pantalla">
      <h1>{finca.nombre}</h1>
      <p className="destacado">{t.saludo(usuario.nombre)}</p>

      <h2>{t.resumenTitulo}</h2>
      {conteo ? (
        <dl className="cifras">
          <div>
            <dt>{t.activos}</dt>
            <dd data-prueba="total-animales">{conteo.total}</dd>
          </div>
          <div>
            <dt>{t.hembras}</dt>
            <dd>{conteo.hembras}</dd>
          </div>
          <div>
            <dt>{t.machos}</dt>
            <dd>{conteo.machos}</dd>
          </div>
        </dl>
      ) : (
        <p>{textos.comun.cargando}</p>
      )}

      <div className="acciones">
        <button type="button" className="boton boton--secundario" onClick={() => navegar({ pantalla: "animales" })}>
          {t.verAnimales}
        </button>
        {puedeCrear && (
          <button type="button" className="boton" onClick={() => navegar({ pantalla: "nuevoAnimal" })}>
            {t.registrarAnimal}
          </button>
        )}
      </div>

      {puedeCrear && conteo?.total === 0 && (
        <div className="tarjeta">
          <h2>{t.primerosPasosTitulo}</h2>
          <ol>
            {t.primerosPasos.map((paso) => (
              <li key={paso}>{paso}</li>
            ))}
          </ol>
        </div>
      )}
      <p className="nota">{t.proximamente}</p>
    </section>
  );
}
