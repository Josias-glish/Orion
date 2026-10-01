import { useConexion, useNavegar, usePermiso, useSesion } from "../componentes/contextos";
import { useCarga } from "../componentes/useCarga";
import { contarAnimales } from "../datos/repositorios/animales";
import { listarOrdeno } from "../datos/repositorios/leche";
import { listarPartosProximos } from "../datos/repositorios/reproduccion";
import { listarAlertasRetiro, listarProximasAplicaciones } from "../datos/repositorios/salud";
import { fechaLocal } from "../dominio/fechas";
import { textos } from "../textos/es";
import { TablaPartosProximos } from "./reproduccion/Reproduccion";
import { TablaProximas, TablaRetiros } from "./salud/Salud";

export function Inicio() {
  const conexion = useConexion();
  const { usuario, finca } = useSesion();
  const navegar = useNavegar();
  const puedeCrear = usePermiso("crear_animal");
  const puedeParto = usePermiso("registrar_parto");
  const hoy = fechaLocal();
  const { datos: conteo } = useCarga(() => contarAnimales(conexion), [conexion]);
  const { datos: proximos } = useCarga(() => listarPartosProximos(conexion, hoy), [conexion, hoy]);
  // R11: listarOrdeno ya deja fuera a las vendidas y muertas.
  const { datos: enLactancia } = useCarga(() => listarOrdeno(conexion, hoy, "manana"), [conexion, hoy]);
  const { datos: retiros } = useCarga(() => listarAlertasRetiro(conexion, hoy), [conexion, hoy]);
  const { datos: vacunas } = useCarga(() => listarProximasAplicaciones(conexion, hoy), [conexion, hoy]);
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
          <div>
            <dt>{t.enLactancia}</dt>
            <dd data-prueba="total-lactancia">{enLactancia?.length ?? "…"}</dd>
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
      <h2>{t.retirosTitulo}</h2>
      {retiros === null ? (
        <p>{textos.comun.cargando}</p>
      ) : retiros.length === 0 ? (
        <p className="nota">{t.retirosVacio}</p>
      ) : (
        <TablaRetiros alertas={retiros} />
      )}

      <h2>{t.partosProximosTitulo}</h2>
      {proximos === null ? (
        <p>{textos.comun.cargando}</p>
      ) : proximos.length === 0 ? (
        <p className="nota">{t.partosProximosVacio}</p>
      ) : (
        <TablaPartosProximos
          proximos={proximos}
          hoy={hoy}
          alRegistrar={puedeParto ? (id) => navegar({ pantalla: "registrarParto", hembraId: id }) : null}
        />
      )}

      <h2>{t.lactanciaTitulo}</h2>
      {enLactancia === null ? (
        <p>{textos.comun.cargando}</p>
      ) : enLactancia.length === 0 ? (
        <p className="nota">{t.lactanciaVacio}</p>
      ) : (
        <>
          <ul className="lista-compacta" data-prueba="inicio-lactancia">
            {enLactancia.map((f) => (
              <li key={f.lactanciaId}>
                <button type="button" className="enlace" onClick={() => navegar({ pantalla: "lactancia", id: f.lactanciaId })}>
                  {[f.identificador, f.nombre].filter(Boolean).join(" · ")}
                </button>{" "}
                <span className="nota">
                  ({textos.leche.columnas.dia.toLowerCase()} {f.diaLactancia})
                </span>
              </li>
            ))}
          </ul>
          <button type="button" className="boton" onClick={() => navegar({ pantalla: "leche", seccion: "ordeno" })} data-prueba="abrir-ordeno">
            {t.abrirOrdeno}
          </button>
        </>
      )}

      <h2>{t.vacunasTitulo}</h2>
      {vacunas === null ? (
        <p>{textos.comun.cargando}</p>
      ) : vacunas.length === 0 ? (
        <p className="nota">{t.vacunasVacio}</p>
      ) : (
        <TablaProximas proximas={vacunas} alAbrir={(id) => navegar({ pantalla: "animal", id, pestana: "salud" })} />
      )}
    </section>
  );
}
