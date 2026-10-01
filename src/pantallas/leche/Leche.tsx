import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Campo, Casilla } from "../../componentes/Campo";
import { useConexion, useContextoCambio, useNavegar, usePermiso, type SeccionLeche } from "../../componentes/contextos";
import { mensajesDeError } from "../../componentes/mensajeDeError";
import { Pestanas } from "../../componentes/Pestanas";
import { useCarga } from "../../componentes/useCarga";
import { guardarPesajeLeche, listarLactancias, listarOrdeno, type FilaOrdeno } from "../../datos/repositorios/leche";
import { fechaLocal, formatearFecha } from "../../dominio/fechas";
import { JORNADAS, leerKilos, type Jornada } from "../../dominio/leche";
import { textos } from "../../textos/es";

const t = textos.leche;

/** RF-26 a RF-29: ordeño en lote y lactancias. */
export function Leche({ seccion }: { seccion: SeccionLeche }) {
  const navegar = useNavegar();
  return (
    <section className="pantalla pantalla--ancha">
      <h1>{t.titulo}</h1>
      <Pestanas
        opciones={(["ordeno", "lactancias"] as const).map((valor) => ({ valor, texto: t.secciones[valor] }))}
        actual={seccion}
        alElegir={(s) => navegar({ pantalla: "leche", seccion: s })}
      />
      {seccion === "ordeno" ? <Ordeno /> : <ListaLactancias />}
    </section>
  );
}

/** SUPOSICION: antes del mediodía se propone la jornada de la mañana; después, la de la tarde. */
const jornadaPorHora = (): Jornada => (new Date().getHours() < 12 ? "manana" : "tarde");

type EstadoFila = { tipo: "guardando" } | { tipo: "guardado" } | { tipo: "error"; mensaje: string } | { tipo: "editado" };

/**
 * Flujo 2 y RF-29: una sola pantalla con las hembras en lactancia. Se escribe el peso y Enter guarda y pasa a la
 * siguiente cabra. R11: la lista ya excluye a las vendidas y muertas.
 */
function Ordeno() {
  const conexion = useConexion();
  const contexto = useContextoCambio();
  const puedeRegistrar = usePermiso("registrar_leche");
  const [fecha, setFecha] = useState(fechaLocal());
  const [jornada, setJornada] = useState<Jornada>(jornadaPorHora);
  const clave = `${fecha}|${jornada}`;
  const { datos: cargadas } = useCarga(
    async () => ({ clave: `${fecha}|${jornada}`, filas: await listarOrdeno(conexion, fecha, jornada) }),
    [conexion, fecha, jornada],
  );
  // Mientras llega la lista de otra fecha o jornada no se muestra la anterior: así nada se anota en la jornada equivocada.
  const filas = cargadas?.clave === clave ? cargadas.filas : null;
  const [guardados, setGuardados] = useState<Record<string, number>>({});
  const [valores, setValores] = useState<Record<string, string>>({});
  const [estados, setEstados] = useState<Record<string, EstadoFila>>({});
  const entradas = useRef<(HTMLInputElement | null)[]>([]);

  // Al cambiar de fecha o jornada se parte de lo que ya estaba guardado.
  useEffect(() => {
    if (!filas) return;
    setGuardados(Object.fromEntries(filas.filter((f) => f.kilos !== null).map((f) => [f.lactanciaId, f.kilos!])));
    setValores(Object.fromEntries(filas.map((f) => [f.lactanciaId, f.kilos === null ? "" : textos.comun.kilos(f.kilos, 1, false)])));
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
    const texto = valores[fila.lactanciaId] ?? "";
    if (!texto.trim()) return pasarA(i + 1);
    const kilos = leerKilos(texto);
    if (kilos === null) {
      setEstados((e) => ({ ...e, [fila.lactanciaId]: { tipo: "error", mensaje: textos.errores.motivo({ codigo: "kilos_invalidos" }) } }));
      return;
    }
    if (guardados[fila.lactanciaId] === kilos) return pasarA(i + 1);
    setEstados((e) => ({ ...e, [fila.lactanciaId]: { tipo: "guardando" } }));
    try {
      await guardarPesajeLeche(conexion, { lactanciaId: fila.lactanciaId, fecha, jornada, kilos }, contexto());
      setGuardados((g) => ({ ...g, [fila.lactanciaId]: kilos }));
      setValores((v) => ({ ...v, [fila.lactanciaId]: textos.comun.kilos(kilos, 1, false) }));
      setEstados((e) => ({ ...e, [fila.lactanciaId]: { tipo: "guardado" } }));
      pasarA(i + 1);
    } catch (error) {
      setEstados((e) => ({ ...e, [fila.lactanciaId]: { tipo: "error", mensaje: mensajesDeError(error).mensajes.join(" ") } }));
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
          <table className="tabla ordeno" data-prueba="tabla-ordeno">
            <thead>
              <tr>
                <th>{t.columnas.animal}</th>
                <th className="numero">{t.columnas.dia}</th>
                <th className="numero" title={t.anteriorAyuda}>
                  {t.columnas.anterior}
                </th>
                <th>{t.columnas.kilos}</th>
                <th>{t.columnas.estado}</th>
                <th>{t.columnas.retiro}</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => {
                const estado = estados[f.lactanciaId];
                return (
                  <tr key={f.lactanciaId} data-cabra={f.nombre ?? f.identificador ?? ""} className={estado?.tipo === "error" ? "fila-error" : undefined}>
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
                    <td className="ordeno__estado" data-prueba="estado-fila" role={estado?.tipo === "error" ? "alert" : undefined}>
                      {estado?.tipo === "guardando" && t.guardando}
                      {estado?.tipo === "guardado" && <span className="insignia insignia--activo">✓ {t.guardado}</span>}
                      {estado?.tipo === "error" && <span className="texto-error">{estado.mensaje}</span>}
                    </td>
                    <td data-prueba="retiro">
                      <AvisoRetiro hembraId={f.hembraId} fecha={fecha} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="nota">{t.retiroPendiente}</p>
        </>
      )}
    </div>
  );
}

/**
 * Lugar reservado para el aviso de leche retenida por un tratamiento (RF-24, R7). Se conecta en la etapa 4,
 * cuando existan los eventos de salud; hasta entonces no muestra nada.
 */
function AvisoRetiro(_: { hembraId: string; fecha: string }) {
  return null;
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
