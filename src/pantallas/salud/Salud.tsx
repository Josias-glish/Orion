import { useState } from "react";
import { Aviso } from "../../componentes/Aviso";
import { Campo } from "../../componentes/Campo";
import { useConexion, useContextoCambio, useNavegar, usePermiso, type SeccionSalud } from "../../componentes/contextos";
import { ListaMotivos } from "../../componentes/ListaMotivos";
import { Pestanas } from "../../componentes/Pestanas";
import { SelectorAnimal } from "../../componentes/SelectorAnimal";
import { useCarga } from "../../componentes/useCarga";
import { ErrorDeRegistro, type Motivo } from "../../datos/errores";
import { listarAnimales } from "../../datos/repositorios/animales";
import { listarLotes } from "../../datos/repositorios/lotes";
import {
  listarAlertasRetiro,
  listarEventosSalud,
  listarProximasAplicaciones,
  registrarEventoSalud,
  retirarEventoSalud,
  type EventoSalud,
} from "../../datos/repositorios/salud";
import { fechaLocal, formatearFecha } from "../../dominio/fechas";
import { leerKilos } from "../../dominio/leche";
import { TIPOS_SALUD, type TipoSalud } from "../../dominio/salud";
import { textos } from "../../textos/es";

const t = textos.salud;

/** RF-22 a RF-25: vacunas, desparasitaciones, tratamientos (Flujo 3), condición corporal y retiros. */
export function Salud({ seccion, animalId }: { seccion: SeccionSalud; animalId: string | null }) {
  const navegar = useNavegar();
  return (
    <section className="pantalla pantalla--ancha">
      <h1>{t.titulo}</h1>
      <Pestanas
        opciones={(["registrar", "calendario", "retiros", "historial"] as const).map((valor) => ({ valor, texto: t.secciones[valor] }))}
        actual={seccion}
        alElegir={(s) => navegar({ pantalla: "salud", seccion: s })}
      />
      {seccion === "registrar" && <RegistrarEvento animalInicial={animalId} />}
      {seccion === "calendario" && <Calendario />}
      {seccion === "retiros" && <Retiros />}
      {seccion === "historial" && <TablaEventos filtro={{ limite: 200 }} />}
    </section>
  );
}

interface Formulario {
  tipo: TipoSalud;
  producto: string;
  numeroRegistroIca: string;
  loteProducto: string;
  dosis: string;
  via: string;
  fechaInicio: string;
  fechaFin: string;
  retiroLeche: string;
  retiroCarne: string;
  aplicador: string;
  veterinario: string;
  condicion: string;
  proximaFecha: string;
  observaciones: string;
}

const formularioVacio = (): Formulario => ({
  tipo: "tratamiento",
  producto: "",
  numeroRegistroIca: "",
  loteProducto: "",
  dosis: "",
  via: "",
  fechaInicio: fechaLocal(),
  fechaFin: "",
  retiroLeche: "",
  retiroCarne: "",
  aplicador: "",
  veterinario: "",
  condicion: "",
  proximaFecha: "",
  observaciones: "",
});

/** Días de retiro: vacío = sin retiro; un texto que no es entero se envía como -1 para que se rechace con su mensaje. */
const leerDias = (texto: string) => (texto.trim() === "" ? null : /^\d+$/.test(texto.trim()) ? Number(texto.trim()) : -1);

/** Flujo 3: elegir animal o lote, completar los campos, indicar el retiro y guardar. */
function RegistrarEvento({ animalInicial }: { animalInicial: string | null }) {
  const conexion = useConexion();
  const contexto = useContextoCambio();
  const puedeRegistrar = usePermiso("registrar_tratamiento");
  const { datos: animales } = useCarga(() => listarAnimales(conexion, { estado: "activo" }), [conexion]);
  const { datos: lotes } = useCarga(() => listarLotes(conexion), [conexion]);
  const [aLote, setALote] = useState(false);
  const [animalId, setAnimalId] = useState<string | null>(animalInicial);
  const [loteId, setLoteId] = useState("");
  const [f, setF] = useState<Formulario>(formularioVacio);
  const [error, setError] = useState<unknown>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const cambiar = (cambio: Partial<Formulario>) => setF((actual) => ({ ...actual, ...cambio }));
  const esCondicion = f.tipo === "condicion_corporal";
  const conProxima = f.tipo === "vacuna" || f.tipo === "desparasitacion";
  const lote = lotes?.find((l) => l.id === loteId);

  async function guardar() {
    setError(null);
    setExito(null);
    setGuardando(true);
    try {
      const faltaDestino: Motivo | null = aLote
        ? loteId
          ? null
          : { codigo: "dato_obligatorio", campo: "lote_id" }
        : animalId
          ? null
          : { codigo: "dato_obligatorio", campo: "animal_id" };
      if (faltaDestino) throw new ErrorDeRegistro([faltaDestino]);
      const ids = await registrarEventoSalud(
        conexion,
        {
          destino: aLote ? { loteId } : { animalId: animalId! },
          tipo: f.tipo,
          producto: f.producto,
          numeroRegistroIca: f.numeroRegistroIca,
          loteProducto: f.loteProducto,
          dosis: f.dosis,
          via: f.via,
          fechaInicio: f.fechaInicio,
          fechaFin: f.fechaFin || null,
          retiroLecheDias: leerDias(f.retiroLeche),
          retiroCarneDias: leerDias(f.retiroCarne),
          aplicador: f.aplicador,
          veterinario: f.veterinario,
          condicionCorporal: esCondicion ? (leerKilos(f.condicion) ?? Number.NaN) : null,
          proximaFecha: conProxima ? f.proximaFecha || null : null,
          observaciones: f.observaciones,
        },
        contexto(),
      );
      setExito(t.guardado(ids.length));
      // Se conservan el tipo, el producto y la fecha para anotar seguido a varios animales.
      setF((actual) => ({ ...formularioVacio(), tipo: actual.tipo, producto: actual.producto, numeroRegistroIca: actual.numeroRegistroIca, loteProducto: actual.loteProducto, dosis: actual.dosis, via: actual.via, fechaInicio: actual.fechaInicio, retiroLeche: actual.retiroLeche, retiroCarne: actual.retiroCarne, aplicador: actual.aplicador, veterinario: actual.veterinario, proximaFecha: actual.proximaFecha }));
      if (!aLote) setAnimalId(null);
    } catch (e) {
      setError(e);
    } finally {
      setGuardando(false);
    }
  }

  if (!puedeRegistrar) return <Aviso tipo="info">{textos.errores.motivo({ codigo: "sin_permiso" })}</Aviso>;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        guardar();
      }}
      data-prueba="formulario-salud"
    >
      <ListaMotivos error={error} />
      {exito && <Aviso tipo="exito">{exito}</Aviso>}
      <div className="tarjeta">
        <div className="rejilla">
          <Campo etiqueta={t.tipo} ancho="corto">
            <select value={f.tipo} onChange={(e) => cambiar({ tipo: e.target.value as TipoSalud })} data-prueba="salud-tipo">
              {TIPOS_SALUD.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {textos.comun.tipoSalud[tipo]}
                </option>
              ))}
            </select>
          </Campo>
          <fieldset className="opciones campo campo--medio">
            <legend className="campo__etiqueta">{t.destino}</legend>
            <label className="casilla">
              <input type="radio" name="destino" checked={!aLote} onChange={() => setALote(false)} data-prueba="destino-animal" />
              <span>{t.destinoAnimal}</span>
            </label>
            <label className="casilla">
              <input type="radio" name="destino" checked={aLote} onChange={() => setALote(true)} data-prueba="destino-lote" />
              <span>{t.destinoLote}</span>
            </label>
          </fieldset>
          {aLote ? (
            <Campo etiqueta={t.lote} ayuda={lote ? t.loteAyuda(lote.animales) : undefined}>
              <select value={loteId} onChange={(e) => setLoteId(e.target.value)} data-prueba="salud-lote">
                <option value="">{t.elegirLote}</option>
                {lotes?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nombre}
                  </option>
                ))}
              </select>
            </Campo>
          ) : (
            <SelectorAnimal etiqueta={t.animal} candidatos={animales ?? []} valor={animalId} alCambiar={setAnimalId} prueba="salud-animal" />
          )}
          <Campo etiqueta={t.fechaInicio} ancho="corto">
            <input type="date" value={f.fechaInicio} max={fechaLocal()} onChange={(e) => cambiar({ fechaInicio: e.target.value })} data-prueba="salud-fecha" />
          </Campo>
        </div>
      </div>

      {esCondicion ? (
        <div className="tarjeta">
          <Campo etiqueta={t.condicionCorporal} ancho="corto" ayuda={t.condicionAyuda}>
            <input inputMode="decimal" value={f.condicion} onChange={(e) => cambiar({ condicion: e.target.value })} data-prueba="salud-condicion" />
          </Campo>
        </div>
      ) : (
        <fieldset className="tarjeta">
          <legend>{t.camposIca}</legend>
          <p className="nota">{t.camposIcaAyuda}</p>
          <div className="rejilla">
            <Campo etiqueta={t.producto}>
              <input value={f.producto} onChange={(e) => cambiar({ producto: e.target.value })} data-prueba="salud-producto" />
            </Campo>
            <Campo etiqueta={t.numeroRegistroIca}>
              <input value={f.numeroRegistroIca} onChange={(e) => cambiar({ numeroRegistroIca: e.target.value })} data-prueba="salud-ica" />
            </Campo>
            <Campo etiqueta={t.loteProducto} ancho="corto">
              <input value={f.loteProducto} onChange={(e) => cambiar({ loteProducto: e.target.value })} />
            </Campo>
            <Campo etiqueta={t.dosis} ancho="corto">
              <input value={f.dosis} onChange={(e) => cambiar({ dosis: e.target.value })} data-prueba="salud-dosis" />
            </Campo>
            <Campo etiqueta={t.via} ayuda={t.viaAyuda}>
              <input value={f.via} onChange={(e) => cambiar({ via: e.target.value })} data-prueba="salud-via" />
            </Campo>
            <Campo etiqueta={t.fechaFin} ancho="corto">
              <input type="date" value={f.fechaFin} min={f.fechaInicio} onChange={(e) => cambiar({ fechaFin: e.target.value })} />
            </Campo>
            <Campo etiqueta={t.retiroLeche} ancho="corto" ayuda={t.retiroAyuda}>
              <input inputMode="numeric" value={f.retiroLeche} onChange={(e) => cambiar({ retiroLeche: e.target.value })} data-prueba="salud-retiro-leche" />
            </Campo>
            <Campo etiqueta={t.retiroCarne} ancho="corto">
              <input inputMode="numeric" value={f.retiroCarne} onChange={(e) => cambiar({ retiroCarne: e.target.value })} data-prueba="salud-retiro-carne" />
            </Campo>
            <Campo etiqueta={t.veterinario}>
              <input value={f.veterinario} onChange={(e) => cambiar({ veterinario: e.target.value })} data-prueba="salud-veterinario" />
            </Campo>
            {conProxima && (
              <Campo etiqueta={t.proximaFecha} ancho="corto" ayuda={t.proximaAyuda}>
                <input type="date" value={f.proximaFecha} min={f.fechaInicio} onChange={(e) => cambiar({ proximaFecha: e.target.value })} data-prueba="salud-proxima" />
              </Campo>
            )}
          </div>
        </fieldset>
      )}
      <div className="tarjeta">
        <div className="rejilla">
          <Campo etiqueta={t.aplicador}>
            <input value={f.aplicador} onChange={(e) => cambiar({ aplicador: e.target.value })} />
          </Campo>
          <Campo etiqueta={t.observaciones} ancho="largo">
            <input value={f.observaciones} onChange={(e) => cambiar({ observaciones: e.target.value })} />
          </Campo>
        </div>
      </div>
      <div className="acciones">
        <button type="submit" className="boton" disabled={guardando} data-prueba="guardar-salud">
          {guardando ? textos.comun.guardando : t.guardar}
        </button>
      </div>
    </form>
  );
}

function Calendario() {
  const conexion = useConexion();
  const navegar = useNavegar();
  const hoy = fechaLocal();
  const { datos } = useCarga(() => listarProximasAplicaciones(conexion, hoy), [conexion, hoy]);
  const c = t.columnas;
  return (
    <div>
      <p className="nota">{t.calendarioAyuda}</p>
      {datos === null ? (
        <p>{textos.comun.cargando}</p>
      ) : datos.length === 0 ? (
        <p className="nota">{t.calendarioVacio}</p>
      ) : (
        <TablaProximas proximas={datos} alAbrir={(id) => navegar({ pantalla: "animal", id, pestana: "salud" })} columnas={c} />
      )}
    </div>
  );
}

/** También la usa el Inicio. */
export function TablaProximas({
  proximas,
  alAbrir,
  columnas: c = t.columnas,
}: {
  proximas: readonly { eventoId: string; animalId: string; animal: string; lote: string | null; tipo: TipoSalud; producto: string | null; proximaFecha: string; vencida: boolean }[];
  alAbrir: (animalId: string) => void;
  columnas?: typeof t.columnas;
}) {
  return (
    <table className="tabla" data-prueba="tabla-proximas">
      <thead>
        <tr>
          <th>{c.proxima}</th>
          <th>{c.animal}</th>
          <th>{c.lote}</th>
          <th>{c.tipo}</th>
          <th>{c.producto}</th>
        </tr>
      </thead>
      <tbody>
        {proximas.map((p) => (
          <tr key={p.eventoId}>
            <td>
              {formatearFecha(p.proximaFecha)}
              {p.vencida && <span className="insignia insignia--vacia">{t.vencida}</span>}
            </td>
            <td>
              <button type="button" className="enlace" onClick={() => alAbrir(p.animalId)}>
                {p.animal}
              </button>
            </td>
            <td>{p.lote ?? textos.comun.sinDato}</td>
            <td>{textos.comun.tipoSalud[p.tipo]}</td>
            <td>{p.producto}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Retiros() {
  const conexion = useConexion();
  const hoy = fechaLocal();
  const { datos } = useCarga(() => listarAlertasRetiro(conexion, hoy), [conexion, hoy]);
  return (
    <div>
      <p className="nota">{t.retirosAyuda}</p>
      {datos === null ? <p>{textos.comun.cargando}</p> : datos.length === 0 ? <p className="nota">{t.retirosVacio}</p> : <TablaRetiros alertas={datos} />}
    </div>
  );
}

/** Alertas de retiro (RF-24). También en el Inicio. */
export function TablaRetiros({
  alertas,
}: {
  alertas: readonly { eventoId: string; animalId: string; animal: string; producto: string | null; tipo: "leche" | "carne"; hasta: string }[];
}) {
  const navegar = useNavegar();
  const c = t.columnas;
  return (
    <table className="tabla" data-prueba="tabla-retiros">
      <thead>
        <tr>
          <th>{c.animal}</th>
          <th>{c.retiro}</th>
          <th>{c.hasta}</th>
          <th>{c.producto}</th>
        </tr>
      </thead>
      <tbody>
        {alertas.map((a) => (
          <tr key={`${a.eventoId}-${a.tipo}`} data-retiro={a.animal}>
            <td>
              <button type="button" className="enlace" onClick={() => navegar({ pantalla: "animal", id: a.animalId, pestana: "salud" })}>
                {a.animal}
              </button>
            </td>
            <td>
              <span className={`insignia insignia--retiro-${a.tipo}`}>⚠ {textos.comun.tipoRetiro[a.tipo]}</span>
            </td>
            <td>{formatearFecha(a.hasta)}</td>
            <td>{a.producto}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Historial de eventos de salud (de todo el hato o de un animal). */
export function TablaEventos({ filtro }: { filtro: { animalId?: string; limite?: number } }) {
  const conexion = useConexion();
  const contexto = useContextoCambio();
  const navegar = useNavegar();
  const puedeRetirar = usePermiso("editar_animal");
  const { datos: eventos, recargar } = useCarga(() => listarEventosSalud(conexion, filtro), [conexion, filtro.animalId, filtro.limite]);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const c = t.columnas;
  if (eventos === null) return <p>{textos.comun.cargando}</p>;
  if (eventos.length === 0) return <p className="nota">{filtro.animalId ? t.fichaVacio : t.historialVacio}</p>;

  const retiro = (e: EventoSalud) =>
    [
      e.finRetiroLeche && t.retiroHasta(textos.comun.tipoRetiro.leche, formatearFecha(e.finRetiroLeche)),
      e.finRetiroCarne && t.retiroHasta(textos.comun.tipoRetiro.carne, formatearFecha(e.finRetiroCarne)),
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="tabla-con-scroll">
      <ListaMotivos error={error} />
      <table className="tabla" data-prueba="tabla-eventos-salud">
        <thead>
          <tr>
            <th>{c.fecha}</th>
            {!filtro.animalId && <th>{c.animal}</th>}
            <th>{c.tipo}</th>
            <th>{c.producto}</th>
            <th>{c.detalle}</th>
            <th>{c.retiro}</th>
            <th>{c.veterinario}</th>
            {puedeRetirar && <th />}
          </tr>
        </thead>
        <tbody>
          {eventos.map((e) => (
            <tr key={e.id}>
              <td>
                {formatearFecha(e.fechaInicio)}
                {e.fechaFin && ` – ${formatearFecha(e.fechaFin)}`}
              </td>
              {!filtro.animalId && (
                <td>
                  <button type="button" className="enlace" onClick={() => navegar({ pantalla: "animal", id: e.animalId, pestana: "salud" })}>
                    {e.animal}
                  </button>
                  {e.lote && <span className="nota"> ({e.lote})</span>}
                </td>
              )}
              <td>{textos.comun.tipoSalud[e.tipo]}</td>
              <td>
                {e.tipo === "condicion_corporal" ? `${c.condicion}: ${textos.comun.kilos(e.condicionCorporal!, 1, false)}` : e.producto}
                {e.numeroRegistroIca && <div className="nota">{`${c.registroIca}: ${e.numeroRegistroIca}`}</div>}
              </td>
              <td>{[e.dosis, e.via].filter(Boolean).join(" · ")}</td>
              <td>{retiro(e)}</td>
              <td>{e.veterinario}</td>
              {puedeRetirar && (
                <td className="acciones-fila">
                  {confirmando === e.id ? (
                    <>
                      <span className="nota">{t.retirarConfirmar}</span>
                      <button
                        type="button"
                        className="boton boton--peligro boton--pequeno"
                        onClick={async () => {
                          try {
                            await retirarEventoSalud(conexion, e.id, contexto());
                            setConfirmando(null);
                            await recargar();
                          } catch (err) {
                            setError(err);
                          }
                        }}
                      >
                        {textos.comun.confirmar}
                      </button>
                      <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => setConfirmando(null)}>
                        {textos.comun.cancelar}
                      </button>
                    </>
                  ) : (
                    <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => setConfirmando(e.id)}>
                      {t.retirar}
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
