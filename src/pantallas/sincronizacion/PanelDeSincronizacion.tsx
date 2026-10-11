import { useState } from "react";
import { Aviso } from "../../componentes/Aviso";
import { GuardarCopias } from "../../componentes/GuardarCopias";
import { useConexion, useEstadoDeSincronizacion, useSincronizacion } from "../../componentes/contextos";
import { ListaMotivos } from "../../componentes/ListaMotivos";
import { useCarga } from "../../componentes/useCarga";
import { formatearMarcaDeTiempo, marcaDeTiempo } from "../../dominio/fechas";
import { listarAvisos, reintentarRechazo, resolverAviso, type AvisoDeSincronizacion } from "../../datos/sincronizacion/avisos";
import type { Vinculo } from "../../datos/sincronizacion/estado";
import { informeCsv } from "../../sincronizacion/informe";
import { verificarContraElServidor, type InformeDeVerificacion } from "../../sincronizacion/primera";
import { desvincular } from "../../sincronizacion/vinculacion";
import { textos } from "../../textos/es";
import { FormularioDeCuenta } from "./FormularioDeCuenta";

const t = textos.sincronizacion;

interface EquipoDeLaFinca {
  id: string;
  nombre: string;
  plataforma: string;
  codigo_equipo: string;
  ultima_sincronizacion_ms: number | null;
  revocado: boolean;
  cuenta_correo: string | null;
}

interface InvitacionCreada {
  codigo: string;
  vence_en: string;
}

/** Lo que ve el propietario de un equipo vinculado: estado, avisos, comprobación, invitaciones, equipos y desvincular. */
export function PanelDeSincronizacion({ vinculo, correo, alCambiar }: { vinculo: Vinculo; correo: string; alCambiar: () => void | Promise<void> }) {
  return (
    <div data-prueba="sincronizacion-vinculado">
      <Estado vinculo={vinculo} correo={correo} />
      <Avisos />
      <Comprobacion />
      <Invitacion vinculo={vinculo} />
      <Equipos vinculo={vinculo} />
      <Desvincular alCambiar={alCambiar} />
    </div>
  );
}

function Estado({ vinculo, correo }: { vinculo: Vinculo; correo: string }) {
  const conexion = useConexion();
  const { red, servicio } = useSincronizacion();
  const estado = useEstadoDeSincronizacion();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [ocupado, setOcupado] = useState(false);
  const [nuevaSesion, setNuevaSesion] = useState(false);
  const { datos: equipo } = useCarga(
    async () => (await conexion.consultar<{ nombre: string }>("SELECT nombre FROM dispositivo WHERE propio = 1 LIMIT 1"))[0]?.nombre ?? t.equipo.nombrePorDefecto,
    [conexion],
  );
  const indicador = t.indicador;
  const fase: Record<string, string> = {
    al_dia: indicador.alDia,
    sincronizando: indicador.sincronizando,
    preparando: indicador.preparando,
    pendiente: indicador.pendiente(estado.pendientes),
    sin_conexion: indicador.sinConexion(estado.pendientes),
    sesion_caducada: indicador.sesionCaducada,
    esquema_antiguo: indicador.esquemaAntiguo,
    revocado: indicador.revocado,
    problema: indicador.problema,
  };

  async function ahora() {
    setError(null);
    setMensaje(null);
    setOcupado(true);
    try {
      if (!red.sesionActual() && !(await red.restaurarSesion())) {
        setNuevaSesion(true);
        return;
      }
      const r = await servicio.sincronizarAhora();
      setMensaje(r.estado === "al_dia" ? t.sincronizadoAhora(r.enviados, r.recibidos) : fase[r.estado === "sin_conexion" ? "sin_conexion" : "problema"]);
    } catch (e) {
      setError(e);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="tarjeta">
      <h2>{t.estado.titulo}</h2>
      <dl className="ficha">
        <dt>{t.estado.cuenta}</dt>
        <dd>{correo || textos.comun.sinDato}</dd>
        <dt>{t.estado.equipo}</dt>
        <dd>
          {equipo} {vinculo.codigoEquipo && `(${vinculo.codigoEquipo})`}
        </dd>
        <dt>{t.estado.titulo}</dt>
        <dd data-prueba="sincronizacion-fase">{fase[estado.fase]}</dd>
        <dt>{t.estado.ultima}</dt>
        <dd>{estado.ultimaSincronizacion ? formatearMarcaDeTiempo(estado.ultimaSincronizacion) : indicador.nuncaSincronizo}</dd>
        <dt>{t.estado.pendientes}</dt>
        <dd data-prueba="sincronizacion-pendientes">{estado.pendientes}</dd>
      </dl>
      {estado.fase === "esquema_antiguo" && <Aviso tipo="error">{indicador.esquemaAntiguo}</Aviso>}
      {(estado.fase === "sesion_caducada" || nuevaSesion) && (
        <>
          <p className="nota">{t.sesionNueva}</p>
          <FormularioDeCuenta
            red={red}
            alIniciar={() => {
              setNuevaSesion(false);
              void ahora();
            }}
          />
        </>
      )}
      <ListaMotivos error={error} />
      {mensaje && (
        <p className="nota" role="status" data-prueba="sincronizacion-resultado">
          {mensaje}
        </p>
      )}
      <div className="acciones">
        <button type="button" className="boton" disabled={ocupado || estado.fase === "revocado"} onClick={() => void ahora()} data-prueba="sincronizar-ahora">
          {t.estado.sincronizarAhora}
        </button>
      </div>
    </div>
  );
}

function textoDelAviso(a: AvisoDeSincronizacion): string {
  const av = t.avisos;
  const d = a.detalle;
  switch (a.tipo) {
    case "restaurado":
      return av.restaurado(String(d.etiqueta ?? a.registroId ?? ""));
    case "renombrado":
      return av.renombrado(String(d.de ?? ""), String(d.a ?? ""));
    case "conflicto":
      return av.conflicto(t.entidades[a.entidad ?? ""] ?? a.entidad ?? "");
    case "rechazo":
      return av.rechazo;
    case "reloj":
      return av.reloj;
    default:
      return av.revision;
  }
}

function Avisos() {
  const conexion = useConexion();
  const { servicio } = useSincronizacion();
  const { datos, recargar } = useCarga(() => listarAvisos(conexion), [conexion]);
  const [error, setError] = useState<unknown>(null);
  async function actuar(accion: () => Promise<void>) {
    setError(null);
    try {
      await accion();
      await recargar();
      await servicio.refrescar();
    } catch (e) {
      setError(e);
    }
  }
  return (
    <div className="tarjeta" data-prueba="sincronizacion-avisos">
      <h2>{t.avisos.titulo}</h2>
      <ListaMotivos error={error} />
      {!datos ? (
        <p>{textos.comun.cargando}</p>
      ) : datos.length === 0 ? (
        <p className="nota">{t.avisos.ninguno}</p>
      ) : (
        <ul className="lista-avisos">
          {datos.map((a) => (
            <li key={a.id} data-prueba="aviso-sincronizacion">
              <p>{textoDelAviso(a)}</p>
              <p className="nota">{formatearMarcaDeTiempo(a.creadoEn)}</p>
              <div className="acciones">
                {a.tipo === "rechazo" && (
                  <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => void actuar(() => reintentarRechazo(conexion, a.id, marcaDeTiempo()))}>
                    {t.avisos.reintentar}
                  </button>
                )}
                <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => void actuar(() => resolverAviso(conexion, a.id, marcaDeTiempo()))}>
                  {a.tipo === "rechazo" || a.tipo === "conflicto" ? t.avisos.descartar : t.avisos.entendido}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Comprobacion() {
  const conexion = useConexion();
  const { red } = useSincronizacion();
  const [informe, setInforme] = useState<InformeDeVerificacion | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [ocupado, setOcupado] = useState(false);
  async function comprobar() {
    setError(null);
    setOcupado(true);
    try {
      setInforme(await verificarContraElServidor(conexion, red));
    } catch (e) {
      setError(e);
    } finally {
      setOcupado(false);
    }
  }
  const v = t.verificar;
  return (
    <div className="tarjeta">
      <h2>{v.titulo}</h2>
      <p>{v.explicacion}</p>
      <div className="acciones">
        <button type="button" className="boton boton--secundario" disabled={ocupado} onClick={() => void comprobar()} data-prueba="sincronizacion-comprobar">
          {v.boton}
        </button>
      </div>
      <ListaMotivos error={error} />
      {informe && (
        <div data-prueba="sincronizacion-informe">
          <Aviso tipo={informe.coincide ? "exito" : "error"}>{informe.coincide ? v.coincide : v.noCoincide}</Aviso>
          <table className="tabla">
            <thead>
              <tr>
                <th>{v.columnas.tabla}</th>
                <th>{v.columnas.aqui}</th>
                <th>{v.columnas.servidor}</th>
                <th>{v.columnas.estado}</th>
              </tr>
            </thead>
            <tbody>
              {informe.filas.map((f) => (
                <tr key={f.entidad} className={f.coincide ? undefined : "inactivo"}>
                  <td>{t.entidades[f.entidad] ?? f.entidad}</td>
                  <td>{f.locales}</td>
                  <td>{f.servidor}</td>
                  <td>{f.coincide ? v.igual : v.distinta}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <GuardarCopias
            archivos={[
              {
                nombre: "verificacion-sincronizacion.csv",
                bytes: new TextEncoder().encode(informeCsv(informe, (e) => t.entidades[e] ?? e, v)),
                filtro: { nombre: "CSV", extension: "csv" },
              },
            ]}
          />
        </div>
      )}
    </div>
  );
}

function Invitacion({ vinculo }: { vinculo: Vinculo }) {
  const { red } = useSincronizacion();
  const [invitacion, setInvitacion] = useState<InvitacionCreada | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [ocupado, setOcupado] = useState(false);
  async function generar() {
    setError(null);
    setOcupado(true);
    try {
      setInvitacion(await red.rpc<InvitacionCreada>("crear_invitacion", { p_finca_id: vinculo.fincaId }));
    } catch (e) {
      setError(e);
    } finally {
      setOcupado(false);
    }
  }
  const i = t.invitacion;
  return (
    <div className="tarjeta">
      <h2>{i.titulo}</h2>
      <p>{i.explicacion}</p>
      <div className="acciones">
        <button type="button" className="boton boton--secundario" disabled={ocupado} onClick={() => void generar()} data-prueba="invitacion-generar">
          {i.generar}
        </button>
      </div>
      <ListaMotivos error={error} />
      {invitacion && (
        <>
          <p className="destacado" data-prueba="invitacion-codigo">
            {i.codigo(invitacion.codigo)}
          </p>
          <p className="nota">{i.vence(formatearMarcaDeTiempo(new Date(invitacion.vence_en).toISOString()))}</p>
        </>
      )}
    </div>
  );
}

function Equipos({ vinculo }: { vinculo: Vinculo }) {
  const { red } = useSincronizacion();
  const { datos, error: errorDeCarga, recargar } = useCarga(() => red.rpc<EquipoDeLaFinca[]>("listar_dispositivos", { p_finca_id: vinculo.fincaId }), [red, vinculo.fincaId]);
  const [retirando, setRetirando] = useState<EquipoDeLaFinca | null>(null);
  const [error, setError] = useState<unknown>(null);
  async function retirar(e: EquipoDeLaFinca) {
    setError(null);
    try {
      await red.rpc("revocar_dispositivo", { p_finca_id: vinculo.fincaId, p_dispositivo_id: e.id });
      setRetirando(null);
      await recargar();
    } catch (x) {
      setError(x);
    }
  }
  const q = t.equipos;
  return (
    <div className="tarjeta">
      <h2>{q.titulo}</h2>
      <ListaMotivos error={error ?? errorDeCarga} />
      {datos && (
        <table className="tabla" data-prueba="sincronizacion-equipos">
          <thead>
            <tr>
              <th>{q.columnas.nombre}</th>
              <th>{q.columnas.letra}</th>
              <th>{q.columnas.ultima}</th>
              <th>{q.columnas.cuenta}</th>
              <th>{q.columnas.estado}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {datos.map((e) => {
              const este = e.id === vinculo.dispositivoId;
              return (
                <tr key={e.id} className={e.revocado ? "inactivo" : undefined}>
                  <td>
                    {e.nombre} {este && <span className="nota">({q.este})</span>}
                  </td>
                  <td>{e.codigo_equipo}</td>
                  <td>{e.ultima_sincronizacion_ms ? formatearMarcaDeTiempo(new Date(e.ultima_sincronizacion_ms).toISOString()) : q.nunca}</td>
                  <td>{e.cuenta_correo ?? textos.comun.sinDato}</td>
                  <td>{e.revocado ? q.retirado : q.activo}</td>
                  <td>
                    {!e.revocado && !este && (
                      <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => setRetirando(e)}>
                        {q.retirar}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {retirando && (
        <div className="aviso aviso--info" role="alertdialog">
          <p className="destacado">{q.retirarConfirmar(retirando.nombre)}</p>
          <div className="acciones">
            <button type="button" className="boton" onClick={() => void retirar(retirando)} data-prueba="equipo-retirar-confirmar">
              {q.retirar}
            </button>
            <button type="button" className="boton boton--secundario" onClick={() => setRetirando(null)}>
              {textos.comun.cancelar}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Desvincular({ alCambiar }: { alCambiar: () => void | Promise<void> }) {
  const conexion = useConexion();
  const { servicio } = useSincronizacion();
  const [confirmando, setConfirmando] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const d = t.desvincular;
  async function preguntar() {
    const [{ n }] = await conexion.consultar<{ n: number }>("SELECT count(DISTINCT grupo_id) AS n FROM cola_cambios WHERE enviado = 0 AND rechazo IS NULL");
    setConfirmando(n);
  }
  async function hacer() {
    setError(null);
    try {
      await desvincular(conexion, marcaDeTiempo());
      setConfirmando(null);
      await servicio.refrescar();
      await alCambiar();
    } catch (e) {
      setError(e);
    }
  }
  return (
    <div className="tarjeta">
      <h2>{d.titulo}</h2>
      <p>{d.explicacion}</p>
      <ListaMotivos error={error} />
      {confirmando === null ? (
        <div className="acciones">
          <button type="button" className="boton boton--secundario" onClick={() => void preguntar()} data-prueba="desvincular">
            {d.boton}
          </button>
        </div>
      ) : (
        <div className="aviso aviso--info" role="alertdialog">
          <p className="destacado">{d.confirmar(confirmando)}</p>
          <div className="acciones">
            <button type="button" className="boton" onClick={() => void hacer()} data-prueba="desvincular-confirmar">
              {d.boton}
            </button>
            <button type="button" className="boton boton--secundario" onClick={() => setConfirmando(null)}>
              {textos.comun.cancelar}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
