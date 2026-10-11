import { puede } from "../dominio/permisos";
import { formatearMarcaDeTiempo } from "../dominio/fechas";
import type { Rol } from "../dominio/tipos";
import type { FaseVisible } from "../sincronizacion/servicio";
import { textos } from "../textos/es";
import { useEstadoDeSincronizacion, useNavegar } from "./contextos";

const t = textos.sincronizacion.indicador;

/** Qué se ve y con qué aspecto en cada fase. «aviso» llama la atención; «bien» es el estado tranquilo. */
function describir(fase: FaseVisible, pendientes: number): { texto: string; clase: "bien" | "espera" | "aviso" } | null {
  switch (fase) {
    case "sin_vincular":
      return null;
    case "al_dia":
      return { texto: t.alDia, clase: "bien" };
    case "sincronizando":
      return { texto: t.sincronizando, clase: "espera" };
    case "preparando":
      return { texto: t.preparando, clase: "espera" };
    case "pendiente":
      return { texto: t.pendiente(pendientes), clase: "espera" };
    case "sin_conexion":
      return { texto: t.sinConexion(pendientes), clase: "espera" };
    case "sesion_caducada":
      return { texto: t.sesionCaducada, clase: "aviso" };
    case "esquema_antiguo":
      return { texto: t.esquemaAntiguo, clase: "aviso" };
    case "revocado":
      return { texto: t.revocado, clase: "aviso" };
    case "problema":
      return { texto: t.problema, clase: "aviso" };
  }
}

/**
 * Pastilla de la barra lateral que dice si este equipo está al día, sin conexión o con cambios por enviar (RF-40).
 * La ven todos los roles; solo el propietario puede abrir la pantalla de Sincronización.
 */
export function IndicadorSincronizacion({ rol }: { rol: Rol }) {
  const estado = useEstadoDeSincronizacion();
  const navegar = useNavegar();
  const d = describir(estado.fase, estado.pendientes);
  if (!d) return null;
  const avisos = estado.rechazados + estado.conflictos;
  const ultima = estado.ultimaSincronizacion ? t.ultima(formatearMarcaDeTiempo(estado.ultimaSincronizacion)) : t.nuncaSincronizo;
  const contenido = (
    <>
      <span className="indicador-sync__estado">{d.texto}</span>
      <span className="indicador-sync__detalle">{ultima}</span>
      {avisos > 0 && <span className="indicador-sync__avisos">{t.avisos(avisos)}</span>}
    </>
  );
  const clase = `indicador-sync indicador-sync--${d.clase}`;
  return puede(rol, "ver_ajustes") ? (
    <button type="button" className={clase} onClick={() => navegar({ pantalla: "ajustes", seccion: "sincronizacion" })} aria-label={t.etiqueta} data-prueba="indicador-sincronizacion" data-fase={estado.fase}>
      {contenido}
    </button>
  ) : (
    <div className={clase} role="status" aria-label={t.etiqueta} data-prueba="indicador-sincronizacion" data-fase={estado.fase}>
      {contenido}
    </div>
  );
}
