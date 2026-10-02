import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Campo, Casilla } from "../../componentes/Campo";
import { useConexion, useContextoCambio, useNavegar, usePermiso, type SeccionLeche } from "../../componentes/contextos";
import { mensajesDeError } from "../../componentes/mensajeDeError";
import { Pestanas } from "../../componentes/Pestanas";
import { useCarga } from "../../componentes/useCarga";
import { guardarPesajeLeche, listarLactancias, listarOrdeno, type FilaOrdeno } from "../../datos/repositorios/leche";
import { leerMuestra, tieneCalidad, type MuestraCalidad, type TextosMuestra } from "../../dominio/calidad-leche";
import { retirosDeLechePorAnimal } from "../../datos/repositorios/salud";
import { fechaLocal, formatearFecha } from "../../dominio/fechas";
import { JORNADAS, leerKilos, type Jornada } from "../../dominio/leche";
import { textos } from "../../textos/es";
import { CalidadLeche } from "./CalidadLeche";

const t = textos.leche;

/** RF-26 a RF-29: ordeño en lote y lactancias. */
export function Leche({ seccion }: { seccion: SeccionLeche }) {
  const navegar = useNavegar();
  return (
    <section className="pantalla pantalla--ancha">
      <h1>{t.titulo}</h1>
      <Pestanas
        opciones={(["ordeno", "lactancias", "calidad"] as const).map((valor) => ({ valor, texto: t.secciones[valor] }))}
        actual={seccion}
        alElegir={(s) => navegar({ pantalla: "leche", seccion: s })}
      />
      {seccion === "ordeno" && <Ordeno />}
      {seccion === "lactancias" && <ListaLactancias />}
      {seccion === "calidad" && <CalidadLeche />}
    </section>
  );
}

/** SUPOSICION: antes del mediodía se propone la jornada de la mañana; después, la de la tarde. */
const jornadaPorHora = (): Jornada => (new Date().getHours() < 12 ? "manana" : "tarde");

type EstadoFila = { tipo: "guardando" } | { tipo: "guardado" } | { tipo: "error"; mensaje: string } | { tipo: "editado" };

const CALIDAD_VACIA: TextosMuestra = { grasa: "", proteina: "", celulas: "" };
const muestraDeFila = (f: Pick<FilaOrdeno, "grasaPct" | "proteinaPct" | "celulasSomaticas">): MuestraCalidad => ({
  grasaPct: f.grasaPct,
  proteinaPct: f.proteinaPct,
  celulasSomaticas: f.celulasSomaticas,
});
/** Lo que se muestra en las casillas de calidad: porcentajes con coma, células sin separadores. */
const textosDeMuestra = (m: MuestraCalidad): TextosMuestra => ({
  grasa: m.grasaPct === null ? "" : String(m.grasaPct).replace(".", ","),
  proteina: m.proteinaPct === null ? "" : String(m.proteinaPct).replace(".", ","),
  celulas: m.celulasSomaticas === null ? "" : String(m.celulasSomaticas),
});
/** Para saber si la calidad de una fila cambió desde que se guardó. */
const claveDeMuestra = (m: MuestraCalidad) => [m.grasaPct, m.proteinaPct, m.celulasSomaticas].join("|");

/**
 * Flujo 2 y RF-29: una sola pantalla con las hembras en lactancia. Se escribe el peso y Enter guarda y pasa a la
 * siguiente cabra. R11: la lista ya excluye a las vendidas y muertas.
 * RF-32: una casilla opcional agrega las columnas de calidad (grasa, proteína y células somáticas); sin marcarla, la
 * pantalla funciona igual que antes.
 */
function Ordeno() {
  const conexion = useConexion();
  const contexto = useContextoCambio();
  const puedeRegistrar = usePermiso("registrar_leche");
  const [fecha, setFecha] = useState(fechaLocal());
  const [jornada, setJornada] = useState<Jornada>(jornadaPorHora);
  const [conCalidad, setConCalidad] = useState(false);
  const clave = `${fecha}|${jornada}`;
  const { datos: cargadas } = useCarga(
    async () => ({ clave: `${fecha}|${jornada}`, filas: await listarOrdeno(conexion, fecha, jornada) }),
    [conexion, fecha, jornada],
  );
  // RF-24 y Flujo 2: leche retenida por un tratamiento en la fecha del ordeño (R7).
  const { datos: retiros } = useCarga(() => retirosDeLechePorAnimal(conexion, fecha), [conexion, fecha]);
  // Mientras llega la lista de otra fecha o jornada no se muestra la anterior: así nada se anota en la jornada equivocada.
  const filas = cargadas?.clave === clave ? cargadas.filas : null;
  const [guardados, setGuardados] = useState<Record<string, number>>({});
  const [valores, setValores] = useState<Record<string, string>>({});
  const [calidades, setCalidades] = useState<Record<string, TextosMuestra>>({});
  const [calidadGuardada, setCalidadGuardada] = useState<Record<string, string>>({});
  const [estados, setEstados] = useState<Record<string, EstadoFila>>({});
  const entradas = useRef<(HTMLInputElement | null)[]>([]);

  // Al cambiar de fecha o jornada se parte de lo que ya estaba guardado.
  useEffect(() => {
    if (!filas) return;
    setGuardados(Object.fromEntries(filas.filter((f) => f.kilos !== null).map((f) => [f.lactanciaId, f.kilos!])));
    setValores(Object.fromEntries(filas.map((f) => [f.lactanciaId, f.kilos === null ? "" : textos.comun.kilos(f.kilos, 1, false)])));
    setCalidades(Object.fromEntries(filas.map((f) => [f.lactanciaId, textosDeMuestra(muestraDeFila(f))])));
    setCalidadGuardada(Object.fromEntries(filas.map((f) => [f.lactanciaId, claveDeMuestra(muestraDeFila(f))])));
    setEstados({});
    const primeraVacia = filas.findIndex((f) => f.kilos === null);
    entradas.current[primeraVacia === -1 ? 0 : primeraVacia]?.focus();
  }, [filas]);

  const pasarA = (i: number) => {
    const siguiente = entradas.current[i];
    siguiente?.focus();
    siguiente?.select();
  };

  async function guardarFila(fila: FilaOrdeno, i: number) {
    const id = fila.lactanciaId;
    const marcarError = (mensaje: string) => setEstados((e) => ({ ...e, [id]: { tipo: "error", mensaje } }));
    const texto = valores[id] ?? "";
    // La calidad solo se lee y se guarda si la casilla está marcada.
    const lectura = conCalidad ? leerMuestra(calidades[id] ?? CALIDAD_VACIA) : null;
    if (lectura && lectura.errores.length > 0) return marcarError(lectura.errores.map((e) => textos.errores.motivo(e)).join(" "));
    if (!texto.trim()) {
      if (lectura && tieneCalidad(lectura.muestra)) return marcarError(textos.errores.motivo({ codigo: "calidad_sin_kilos" }));
      return pasarA(i + 1);
    }
    const kilos = leerKilos(texto);
    if (kilos === null) return marcarError(textos.errores.motivo({ codigo: "kilos_invalidos" }));
    const calidadIgual = !lectura || calidadGuardada[id] === claveDeMuestra(lectura.muestra);
    if (guardados[id] === kilos && calidadIgual) return pasarA(i + 1);
    setEstados((e) => ({ ...e, [id]: { tipo: "guardando" } }));
    try {
      await guardarPesajeLeche(conexion, { lactanciaId: id, fecha, jornada, kilos, ...(lectura?.muestra ?? {}) }, contexto());
      setGuardados((g) => ({ ...g, [id]: kilos }));
      setValores((v) => ({ ...v, [id]: textos.comun.kilos(kilos, 1, false) }));
      if (lectura) {
        setCalidadGuardada((g) => ({ ...g, [id]: claveDeMuestra(lectura.muestra) }));
        setCalidades((c) => ({ ...c, [id]: textosDeMuestra(lectura.muestra) }));
      }
      setEstados((e) => ({ ...e, [id]: { tipo: "guardado" } }));
      pasarA(i + 1);
    } catch (error) {
      marcarError(mensajesDeError(error).mensajes.join(" "));
    }
  }

  function alPresionar(e: KeyboardEvent<HTMLInputElement>, fila: FilaOrdeno, i: number) {
    if (e.key === "Enter") {
      e.preventDefault();
      guardarFila(fila, i);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      pasarA(i + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      pasarA(i - 1);
    }
  }

  const anotadas = filas?.filter((f) => guardados[f.lactanciaId] !== undefined).length ?? 0;
  const total = Object.values(guardados).reduce((s, k) => s + k, 0);
  const oc = t.ordenoCalidad;

  /** Casilla de calidad de una fila: Enter guarda la fila y pasa al kilo de la siguiente cabra. */
  const casillaCalidad = (f: FilaOrdeno, i: number, campo: keyof TextosMuestra, prueba: string, modo: "decimal" | "numeric") => (
    <td>
      <input
        className="ordeno__calidad"
        inputMode={modo}
        autoComplete="off"
        aria-label={`${oc.columnas[campo]}: ${f.nombre ?? f.identificador ?? ""}`}
        value={calidades[f.lactanciaId]?.[campo] ?? ""}
        disabled={!puedeRegistrar}
        onChange={(e) => {
          setCalidades((c) => ({ ...c, [f.lactanciaId]: { ...(c[f.lactanciaId] ?? CALIDAD_VACIA), [campo]: e.target.value } }));
          setEstados((s) => ({ ...s, [f.lactanciaId]: { tipo: "editado" } }));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            guardarFila(f, i);
          }
        }}
        onFocus={(e) => e.target.select()}
        data-prueba={prueba}
      />
    </td>
  );

  return (
    <div>
      <div className="filtros">
        <Campo etiqueta={t.fecha} ancho="corto">
          <input type="date" value={fecha} max={fechaLocal()} onChange={(e) => e.target.value && setFecha(e.target.value)} data-prueba="ordeno-fecha" />
        </Campo>
        <Campo etiqueta={t.jornada} ancho="corto">
          <select value={jornada} onChange={(e) => setJornada(e.target.value as Jornada)} data-prueba="ordeno-jornada">
            {JORNADAS.map((j) => (
              <option key={j} value={j}>
                {textos.comun.jornada[j]}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <p className="nota">{t.ordenoAyuda}</p>
      <Casilla etiqueta={oc.activar} marcada={conCalidad} alCambiar={setConCalidad} prueba="ordeno-calidad" />
      {conCalidad && <p className="nota">{oc.ayuda}</p>}

      {filas === null ? (
        <p>{textos.comun.cargando}</p>
      ) : filas.length === 0 ? (
        <p className="nota" data-prueba="ordeno-vacio">
          {t.ordenoVacio}
        </p>
      ) : (
        <>
          <p className="destacado" data-prueba="ordeno-progreso">
            {t.progreso(anotadas, filas.length)} · {t.total(textos.comun.kilos(total))}
          </p>
          <div className="tabla-ancha">
            <table className="tabla ordeno" data-prueba="tabla-ordeno">
              <thead>
                <tr>
                  <th>{t.columnas.animal}</th>
                  <th className="numero">{t.columnas.dia}</th>
                  <th className="numero" title={t.anteriorAyuda}>
                    {t.columnas.anterior}
                  </th>
                  <th>{t.columnas.kilos}</th>
                  {conCalidad && (
                    <>
                      <th>{oc.columnas.grasa}</th>
                      <th>{oc.columnas.proteina}</th>
                      <th>{oc.columnas.celulas}</th>
                    </>
                  )}
                  <th>{t.columnas.estado}</th>
                  <th>{t.columnas.retiro}</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => {
                  const estado = estados[f.lactanciaId];
                  return (
                    <tr
                      key={f.lactanciaId}
                      data-cabra={f.nombre ?? f.identificador ?? ""}
                      className={estado?.tipo === "error" ? "fila-error" : retiros?.has(f.hembraId) ? "fila-retiro" : undefined}
                    >
                      <td>
                        <span className="destacado">{f.identificador ?? textos.comun.sinDato}</span> {f.nombre ?? ""}
                      </td>
                      <td className="numero">{f.diaLactancia}</td>
                      <td className="numero">{f.kilosAnteriores === null ? textos.comun.sinDato : textos.comun.kilos(f.kilosAnteriores, 1, false)}</td>
                      <td>
                        <input
                          ref={(el) => {
                            entradas.current[i] = el;
                          }}
                          className="ordeno__kilos"
                          inputMode="decimal"
                          autoComplete="off"
                          aria-label={`${t.columnas.kilos}: ${f.nombre ?? f.identificador ?? ""}`}
                          value={valores[f.lactanciaId] ?? ""}
                          disabled={!puedeRegistrar}
                          onChange={(e) => {
                            setValores((v) => ({ ...v, [f.lactanciaId]: e.target.value }));
                            setEstados((s) => ({ ...s, [f.lactanciaId]: { tipo: "editado" } }));
                          }}
                          onKeyDown={(e) => alPresionar(e, f, i)}
                          onFocus={(e) => e.target.select()}
                          data-prueba="kilos"
                        />
                      </td>
                      {conCalidad && (
                        <>
                          {casillaCalidad(f, i, "grasa", "grasa", "decimal")}
                          {casillaCalidad(f, i, "proteina", "proteina", "decimal")}
                          {casillaCalidad(f, i, "celulas", "celulas", "numeric")}
                        </>
                      )}
                      <td className="ordeno__estado" data-prueba="estado-fila" role={estado?.tipo === "error" ? "alert" : undefined}>
                        {estado?.tipo === "guardando" && t.guardando}
                        {estado?.tipo === "guardado" && <span className="insignia insignia--activo">✓ {t.guardado}</span>}
                        {estado?.tipo === "error" && <span className="texto-error">{estado.mensaje}</span>}
                      </td>
                      <td data-prueba="retiro">
                        <AvisoRetiro retiro={retiros?.get(f.hembraId) ?? null} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * RF-24 en el ordeño: aviso de leche retenida por un tratamiento (R7). La leche se pesa igual (cuenta en la
 * lactancia), pero no se vende: el aviso no impide guardar.
 */
function AvisoRetiro({ retiro }: { retiro: { hasta: string; productos: string[] } | null }) {
  if (!retiro) return null;
  return (
    <span className="retiro-ordeno" role="status" data-prueba="leche-retenida">
      ⚠ {textos.salud.lecheRetenida(formatearFecha(retiro.hasta))}
      <span className="nota">{textos.salud.lecheRetenidaAyuda(retiro.productos.join(", "))}</span>
    </span>
  );
}

function ListaLactancias() {
  const conexion = useConexion();
  const navegar = useNavegar();
  const [soloAbiertas, setSoloAbiertas] = useState(true);
  const { datos: lactancias } = useCarga(() => listarLactancias(conexion, { soloAbiertas }), [conexion, soloAbiertas]);
  const c = t.lactanciasColumnas;

  return (
    <div>
      <Casilla etiqueta={t.soloAbiertas} marcada={soloAbiertas} alCambiar={setSoloAbiertas} />
      {lactancias === null ? (
        <p>{textos.comun.cargando}</p>
      ) : lactancias.length === 0 ? (
        <p className="nota">{t.lactanciasVacio}</p>
      ) : (
        <table className="tabla tabla--filas" data-prueba="tabla-lactancias">
          <thead>
            <tr>
              <th>{c.hembra}</th>
              <th>{c.inicio}</th>
              <th>{c.secado}</th>
              <th className="numero">{c.dias}</th>
              <th className="numero">{c.acumulado}</th>
              <th className="numero">{c.promedio}</th>
              <th className="numero">{c.proyeccion}</th>
            </tr>
          </thead>
          <tbody>
            {lactancias.map((l) => {
              const p = l.proyeccion;
              return (
                <tr key={l.id} onClick={() => navegar({ pantalla: "lactancia", id: l.id })} data-lactancia={l.hembra}>
                  <td>
                    <button
                      type="button"
                      className="enlace"
                      onClick={(e) => {
                        e.stopPropagation();
                        navegar({ pantalla: "lactancia", id: l.id });
                      }}
                    >
                      {l.hembra}
                    </button>
                  </td>
                  <td>{formatearFecha(l.fechaInicio)}</td>
                  <td>{l.fechaSecado ? formatearFecha(l.fechaSecado) : <span className="insignia insignia--activo">{t.enCurso}</span>}</td>
                  <td className="numero">{p ? p.diaActual : textos.comun.sinDato}</td>
                  <td className="numero">{p ? textos.comun.kilos(p.acumulado) : t.sinPesajes}</td>
                  <td className="numero">{p ? textos.comun.kilos(p.promedioDiario, 2) : textos.comun.sinDato}</td>
                  <td className="numero" data-prueba="proyeccion">
                    {p ? textos.comun.kilos(p.proyeccion, 0) : textos.comun.sinDato}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
