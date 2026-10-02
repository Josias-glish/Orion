import { useState } from "react";
import { Aviso } from "../../componentes/Aviso";
import { Campo, Casilla } from "../../componentes/Campo";
import {
  useConexion,
  useContextoCambio,
  useNavegar,
  usePermiso,
  useSesion,
  type SeccionReproduccion,
} from "../../componentes/contextos";
import { ListaMotivos } from "../../componentes/ListaMotivos";
import { Pestanas } from "../../componentes/Pestanas";
import { SelectorAnimal } from "../../componentes/SelectorAnimal";
import { useCarga } from "../../componentes/useCarga";
import { listarAnimales, listarExternos } from "../../datos/repositorios/animales";
import {
  diagnosticarServicio,
  listarPartosProximos,
  listarServicios,
  registrarServicio,
  resumenIntervalos,
  type DatosServicio,
  type Servicio,
} from "../../datos/repositorios/reproduccion";
import { diasEntre, fechaLocal, formatearFecha } from "../../dominio/fechas";
import type { ResultadoServicio, TipoServicio } from "../../dominio/reproduccion";
import { textos } from "../../textos/es";

const t = textos.reproduccion;

/** RF-18 a RF-21: servicios, diagnóstico, partos próximos, abortos e intervalo entre partos. */
export function Reproduccion({ seccion }: { seccion: SeccionReproduccion }) {
  const navegar = useNavegar();
  return (
    <section className="pantalla pantalla--ancha">
      <h1>{t.titulo}</h1>
      <Pestanas
        opciones={(["servicios", "proximos", "intervalos"] as const).map((valor) => ({ valor, texto: t.secciones[valor] }))}
        actual={seccion}
        alElegir={(s) => navegar({ pantalla: "reproduccion", seccion: s })}
      />
      {seccion === "servicios" && <SeccionServicios />}
      {seccion === "proximos" && <SeccionProximos />}
      {seccion === "intervalos" && <SeccionIntervalos />}
    </section>
  );
}

/** Macho o pajilla de un servicio, para las tablas. */
export const machoDeServicio = (s: Pick<Servicio, "macho" | "pajilla">) =>
  [s.macho, s.pajilla && `${textos.reproduccion.pajilla}: ${s.pajilla}`].filter(Boolean).join(" · ") || t.sinMacho;

/** R30: de dónde viene el macho del servicio. */
type Procedencia = "hato" | "otra_finca" | "pajilla";

const servicioVacio = (): DatosServicio => ({
  hembraId: "",
  tipo: "monta",
  machoId: null,
  pajilla: null,
  fecha: fechaLocal(),
  observaciones: null,
  costo: null,
  condiciones: null,
});

/** «150.000» o «150000» → 150000; vacío → null. Un texto que no es número da NaN y el dominio lo rechaza. */
const aPesos = (texto: string): number | null => {
  const limpio = texto.replace(/[\s.$]/g, "");
  return limpio === "" ? null : Number(limpio);
};

function SeccionServicios() {
  const conexion = useConexion();
  const contexto = useContextoCambio();
  const { finca } = useSesion();
  const puedeRegistrar = usePermiso("registrar_servicio");
  const [soloPendientes, setSoloPendientes] = useState(false);
  const { datos: servicios, recargar } = useCarga(() => listarServicios(conexion, { soloPendientes }), [conexion, soloPendientes]);
  const { datos: hembras } = useCarga(() => listarAnimales(conexion, { sexo: "hembra", estado: "activo" }), [conexion]);
  const [datos, setDatos] = useState<DatosServicio>(servicioVacio);
  const [procedencia, setProcedencia] = useState<Procedencia>("hato");
  const [costoTexto, setCostoTexto] = useState("");
  // R30: machos del hato o de otras fincas (los de otra finca también sirven como donantes de pajillas).
  const { datos: machos } = useCarga(
    async () =>
      procedencia === "otra_finca"
        ? (await listarExternos(conexion, { sexo: "macho" })).filter((m) => m.estado === "activo")
        : listarAnimales(conexion, { sexo: "macho", estado: "activo" }),
    [conexion, procedencia],
  );
  const elegirProcedencia = (p: Procedencia) => {
    setProcedencia(p);
    setCostoTexto("");
    setDatos({ ...datos, machoId: null, costo: null, condiciones: null, tipo: p === "pajilla" ? "inseminacion" : datos.tipo });
  };
  const [error, setError] = useState<unknown>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [diagnosticando, setDiagnosticando] = useState<string | null>(null);

  async function guardar() {
    setError(null);
    setExito(null);
    try {
      const externo = procedencia === "otra_finca";
      const id = await registrarServicio(
        conexion,
        { ...datos, costo: externo ? aPesos(costoTexto) : null, condiciones: externo ? datos.condiciones : null },
        contexto(),
      );
      const [guardado] = (await listarServicios(conexion, { hembraId: datos.hembraId })).filter((s) => s.id === id);
      setExito(t.servicioGuardado(formatearFecha(guardado.fechaProbableParto!)));
      setDatos({ ...servicioVacio(), fecha: datos.fecha, tipo: datos.tipo });
      setCostoTexto("");
      await recargar();
    } catch (e) {
      setError(e);
    }
  }

  return (
    <div>
      {puedeRegistrar && (
        <form
          className="tarjeta"
          onSubmit={(e) => {
            e.preventDefault();
            guardar();
          }}
          data-prueba="formulario-servicio"
        >
          <h2>{t.nuevoServicio}</h2>
          <ListaMotivos error={error} />
          {exito && <Aviso tipo="exito">{exito}</Aviso>}
          <div className="rejilla">
            <SelectorAnimal
              etiqueta={t.hembra}
              candidatos={hembras ?? []}
              valor={datos.hembraId || null}
              alCambiar={(id) => setDatos({ ...datos, hembraId: id ?? "" })}
              prueba="servicio-hembra"
            />
            <Campo etiqueta={t.tipo} ancho="corto">
              <select
                value={datos.tipo}
                onChange={(e) => {
                  const tipo = e.target.value as TipoServicio;
                  // Una monta necesita el macho: «solo pajilla» vuelve a «del hato».
                  if (tipo === "monta" && procedencia === "pajilla") setProcedencia("hato");
                  setDatos({ ...datos, tipo, machoId: tipo === "monta" && procedencia === "pajilla" ? null : datos.machoId });
                }}
                data-prueba="servicio-tipo"
              >
                {(["monta", "inseminacion"] as const).map((v) => (
                  <option key={v} value={v}>
                    {textos.comun.tipoServicio[v]}
                  </option>
                ))}
              </select>
            </Campo>
            <div className="campo campo--largo">
              <span className="campo__etiqueta">{t.procedencia}</span>
              <div className="opciones">
                {(["hato", "otra_finca", "pajilla"] as const).map((p) => (
                  <label key={p} className="casilla">
                    <input
                      type="radio"
                      name="procedencia"
                      checked={procedencia === p}
                      onChange={() => elegirProcedencia(p)}
                      data-prueba={`procedencia-${p}`}
                    />
                    <span>{t.procedencias[p]}</span>
                  </label>
                ))}
              </div>
            </div>
            {procedencia !== "pajilla" && (
              <SelectorAnimal
                etiqueta={procedencia === "otra_finca" ? t.machoOtraFinca : t.macho}
                candidatos={machos ?? []}
                valor={datos.machoId}
                alCambiar={(id) => setDatos({ ...datos, machoId: id })}
                prueba="servicio-macho"
              />
            )}
            {procedencia === "otra_finca" && machos?.length === 0 && <p className="nota">{t.sinMachosOtraFinca}</p>}
            {datos.tipo === "inseminacion" && (
              <Campo etiqueta={t.pajilla} ayuda={t.pajillaAyuda}>
                <input value={datos.pajilla ?? ""} onChange={(e) => setDatos({ ...datos, pajilla: e.target.value })} data-prueba="servicio-pajilla" />
              </Campo>
            )}
            {procedencia === "otra_finca" && (
              <>
                <Campo etiqueta={t.costo} ancho="corto" ayuda={t.costoAyuda}>
                  <input inputMode="numeric" value={costoTexto} onChange={(e) => setCostoTexto(e.target.value)} data-prueba="servicio-costo" />
                </Campo>
                <Campo etiqueta={t.condiciones} ancho="largo" ayuda={t.condicionesAyuda}>
                  <input
                    value={datos.condiciones ?? ""}
                    onChange={(e) => setDatos({ ...datos, condiciones: e.target.value })}
                    data-prueba="servicio-condiciones"
                  />
                </Campo>
              </>
            )}
            <Campo etiqueta={t.fecha} ancho="corto" ayuda={t.fppAyuda(finca.diasGestacion)}>
              <input type="date" value={datos.fecha} max={fechaLocal()} onChange={(e) => setDatos({ ...datos, fecha: e.target.value })} />
            </Campo>
            <Campo etiqueta={t.observaciones} ancho="largo">
              <input value={datos.observaciones ?? ""} onChange={(e) => setDatos({ ...datos, observaciones: e.target.value })} />
            </Campo>
          </div>
          <div className="acciones">
            <button type="submit" className="boton" data-prueba="guardar-servicio">
              {textos.comun.guardar}
            </button>
          </div>
        </form>
      )}

      <Casilla etiqueta={t.soloPendientes} marcada={soloPendientes} alCambiar={setSoloPendientes} />
      {servicios === null ? (
        <p>{textos.comun.cargando}</p>
      ) : servicios.length === 0 ? (
        <p className="nota">{t.vacio}</p>
      ) : (
        <table className="tabla" data-prueba="tabla-servicios">
          <thead>
            <tr>
              <th>{t.columnas.fecha}</th>
              <th>{t.columnas.hembra}</th>
              <th>{t.columnas.tipo}</th>
              <th>{t.columnas.macho}</th>
              <th>{t.columnas.resultado}</th>
              <th>{t.columnas.fpp}</th>
              {puedeRegistrar && <th>{t.columnas.acciones}</th>}
            </tr>
          </thead>
          <tbody>
            {servicios.map((s) =>
              diagnosticando === s.id ? (
                <tr key={s.id}>
                  <td colSpan={puedeRegistrar ? 7 : 6}>
                    <FormularioDiagnostico
                      servicio={s}
                      alTerminar={async (guardado) => {
                        setDiagnosticando(null);
                        if (guardado) await recargar();
                      }}
                    />
                  </td>
                </tr>
              ) : (
                <FilaServicio key={s.id} servicio={s} puedeDiagnosticar={puedeRegistrar} alDiagnosticar={() => setDiagnosticando(s.id)} />
              ),
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function FilaServicio({
  servicio: s,
  puedeDiagnosticar,
  alDiagnosticar,
}: {
  servicio: Servicio;
  puedeDiagnosticar: boolean;
  alDiagnosticar: () => void;
}) {
  const navegar = useNavegar();
  return (
    <tr data-servicio={s.hembra}>
      <td>{formatearFecha(s.fecha)}</td>
      <td>
        <button type="button" className="enlace" onClick={() => navegar({ pantalla: "animal", id: s.hembraId, pestana: "reproduccion" })}>
          {s.hembra}
        </button>
      </td>
      <td>{textos.comun.tipoServicio[s.tipo]}</td>
      <td>
        {s.machoId ? (
          <button type="button" className="enlace" onClick={() => navegar({ pantalla: "animal", id: s.machoId!, pestana: "servicios" })}>
            {machoDeServicio(s)}
          </button>
        ) : (
          machoDeServicio(s)
        )}
        {s.machoExterno && <span className="insignia">{t.otraFinca}</span>}
      </td>
      <td>
        <span className={`insignia insignia--${s.resultado}`}>{textos.comun.resultadoServicio[s.resultado]}</span>
        {s.fechaDiagnostico && <span className="nota"> {formatearFecha(s.fechaDiagnostico)}</span>}
      </td>
      <td>{s.resultado === "vacia" || s.resultado === "aborto" || !s.fechaProbableParto ? textos.comun.sinDato : formatearFecha(s.fechaProbableParto)}</td>
      {puedeDiagnosticar && (
        <td>
          {(s.resultado === "pendiente" || s.resultado === "prenada") && (
            <button type="button" className="boton boton--secundario boton--pequeno" onClick={alDiagnosticar} data-prueba="diagnosticar">
              {t.diagnosticar}
            </button>
          )}
        </td>
      )}
    </tr>
  );
}

function FormularioDiagnostico({ servicio, alTerminar }: { servicio: Servicio; alTerminar: (guardado: boolean) => void }) {
  const conexion = useConexion();
  const contexto = useContextoCambio();
  const [resultado, setResultado] = useState<Exclude<ResultadoServicio, "pendiente">>(
    servicio.resultado === "prenada" ? "aborto" : "prenada",
  );
  const [fecha, setFecha] = useState(fechaLocal());
  const [error, setError] = useState<unknown>(null);

  return (
    <form
      className="fila-editable"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await diagnosticarServicio(conexion, servicio.id, resultado, fecha, contexto());
          alTerminar(true);
        } catch (err) {
          setError(err);
        }
      }}
    >
      <div>
        <p className="destacado">{t.diagnosticoTitulo(servicio.hembra)}</p>
        <ListaMotivos error={error} />
      </div>
      <Campo etiqueta={t.resultado} ancho="corto" ayuda={t.diagnosticoAyuda}>
        <select value={resultado} onChange={(e) => setResultado(e.target.value as typeof resultado)} data-prueba="resultado">
          {(["prenada", "vacia", "aborto"] as const).map((r) => (
            <option key={r} value={r}>
              {textos.comun.resultadoServicio[r]}
            </option>
          ))}
        </select>
      </Campo>
      <Campo etiqueta={t.fechaDiagnostico} ancho="corto">
        <input type="date" value={fecha} min={servicio.fecha} max={fechaLocal()} onChange={(e) => setFecha(e.target.value)} />
      </Campo>
      <button type="submit" className="boton" data-prueba="guardar-diagnostico">
        {textos.comun.guardar}
      </button>
      <button type="button" className="boton boton--secundario" onClick={() => alTerminar(false)}>
        {textos.comun.cancelar}
      </button>
    </form>
  );
}

function SeccionProximos() {
  const conexion = useConexion();
  const navegar = useNavegar();
  const puedeParto = usePermiso("registrar_parto");
  const hoy = fechaLocal();
  const { datos: proximos } = useCarga(() => listarPartosProximos(conexion, hoy), [conexion, hoy]);

  return (
    <div>
      <p className="nota">{t.proximosAyuda}</p>
      {proximos === null ? (
        <p>{textos.comun.cargando}</p>
      ) : proximos.length === 0 ? (
        <p className="nota">{t.proximosVacio}</p>
      ) : (
        <TablaPartosProximos proximos={proximos} hoy={hoy} alRegistrar={puedeParto ? (id) => navegar({ pantalla: "registrarParto", hembraId: id }) : null} />
      )}
    </div>
  );
}

/** También la usa el Inicio. */
export function TablaPartosProximos({
  proximos,
  hoy,
  alRegistrar,
}: {
  proximos: readonly Servicio[];
  hoy: string;
  alRegistrar: ((hembraId: string) => void) | null;
}) {
  const navegar = useNavegar();
  return (
    <table className="tabla" data-prueba="tabla-proximos">
      <thead>
        <tr>
          <th>{t.columnas.hembra}</th>
          <th>{t.columnas.fpp}</th>
          <th>{t.columnas.fecha}</th>
          <th>{t.columnas.resultado}</th>
          {alRegistrar && <th />}
        </tr>
      </thead>
      <tbody>
        {proximos.map((s) => (
          <tr key={s.id}>
            <td>
              <button type="button" className="enlace" onClick={() => navegar({ pantalla: "animal", id: s.hembraId, pestana: "reproduccion" })}>
                {s.hembra}
              </button>
            </td>
            <td>
              {formatearFecha(s.fechaProbableParto!)} <span className="nota">({t.faltan(diasEntre(hoy, s.fechaProbableParto!))})</span>
            </td>
            <td>
              {formatearFecha(s.fecha)} · {machoDeServicio(s)}
            </td>
            <td>{textos.comun.resultadoServicio[s.resultado]}</td>
            {alRegistrar && (
              <td>
                <button type="button" className="boton boton--pequeno" onClick={() => alRegistrar(s.hembraId)} data-prueba="registrar-parto">
                  {t.registrarParto}
                </button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SeccionIntervalos() {
  const conexion = useConexion();
  const navegar = useNavegar();
  const { datos: servicios } = useCarga(() => listarServicios(conexion), [conexion]);
  const { datos: intervalos } = useCarga(() => resumenIntervalos(conexion), [conexion]);
  const abortos = servicios?.filter((s) => s.resultado === "aborto") ?? null;
  const c = t.intervalosColumnas;

  return (
    <div>
      <h2>{t.abortosTitulo}</h2>
      {abortos === null ? (
        <p>{textos.comun.cargando}</p>
      ) : abortos.length === 0 ? (
        <p className="nota">{t.abortosVacio}</p>
      ) : (
        <table className="tabla" data-prueba="tabla-abortos">
          <thead>
            <tr>
              <th>{t.columnas.hembra}</th>
              <th>{t.fechaDiagnostico}</th>
              <th>{t.columnas.fecha}</th>
            </tr>
          </thead>
          <tbody>
            {abortos.map((s) => (
              <tr key={s.id}>
                <td>{s.hembra}</td>
                <td>{formatearFecha(s.fechaDiagnostico!)}</td>
                <td>
                  {formatearFecha(s.fecha)} · {machoDeServicio(s)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>{t.intervalosTitulo}</h2>
      <p className="nota">{t.intervalosAyuda}</p>
      {intervalos === null ? (
        <p>{textos.comun.cargando}</p>
      ) : intervalos.length === 0 ? (
        <p className="nota">{t.intervalosVacio}</p>
      ) : (
        <table className="tabla" data-prueba="tabla-intervalos">
          <thead>
            <tr>
              <th>{c.hembra}</th>
              <th className="numero">{c.partos}</th>
              <th className="numero">{c.ultimo}</th>
              <th className="numero">{c.promedio}</th>
            </tr>
          </thead>
          <tbody>
            {intervalos.map((r) => (
              <tr key={r.hembraId}>
                <td>
                  <button type="button" className="enlace" onClick={() => navegar({ pantalla: "animal", id: r.hembraId, pestana: "reproduccion" })}>
                    {r.hembra}
                  </button>
                </td>
                <td className="numero">{r.partos}</td>
                <td className="numero">{textos.comun.dias(r.ultimoIntervalo)}</td>
                <td className="numero">{textos.comun.dias(Math.round(r.intervaloPromedio))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
