// Los registros genealógicos en un equipo vinculado: el servidor asigna los números (R31, S-87) y este equipo los recibe
// como cualquier otro cambio. Diseño: docs/SINCRONIZACION.md, sección 7.
import { nuevoId } from "../dominio/identidad";
import type { Conexion } from "../datos/conexion";
import { ErrorDeRegistro, type Motivo } from "../datos/errores";
import { leerVinculo } from "../datos/sincronizacion/estado";
import type { RegistroEmitido, RegistroParaEmitir, ServidorDeRegistros } from "../datos/sincronizacion/servidor-registros";
import type { ClienteDeSincronizacion } from "./cliente";
import { ErrorDeRed, ErrorDelServidor, type Red } from "./red";

/** Qué le dice el servidor al usuario: cada código del servidor se traduce a un motivo con su texto en es.ts. */
export function motivoDeServidor(codigo: string): Motivo {
  switch (codigo) {
    case "registro_ya_emitido":
    case "animal_con_registro":
      return { codigo: "registro_ya_vigente" };
    case "registro_anulado":
      return { codigo: "registro_anulado" };
    case "registro_no_emitido":
      return { codigo: "registro_no_emitido" };
    case "version_cambio":
      return { codigo: "registro_cambiado_en_otro_equipo" };
    case "motivo_requerido":
      return { codigo: "motivo_anulacion_obligatorio" };
    case "libro_con_registros":
      return { codigo: "libro_con_registros" };
    case "numero_invalido":
      return { codigo: "numero_inicial_invalido" };
    case "registro_no_encontrado":
    case "libro_no_encontrado":
      return { codigo: "no_encontrado" };
    default:
      return { codigo: "servidor_rechazo", motivo: codigo };
  }
}

export function crearServidorDeRegistros(conexion: Conexion, red: Red, cliente: ClienteDeSincronizacion): ServidorDeRegistros {
  async function llamar<T>(funcion: string, parametros: Record<string, unknown>): Promise<T> {
    const vinculo = await leerVinculo(conexion);
    if (!vinculo) throw new ErrorDeRegistro([{ codigo: "requiere_servidor" }]);
    try {
      if (!red.sesionActual() && !(await red.restaurarSesion())) throw new ErrorDeRed("sesion", "No hay sesión iniciada.");
      return await red.rpc<T>(funcion, {
        p_finca_id: vinculo.fincaId,
        p_dispositivo_id: vinculo.dispositivoId,
        p_cambio_id: nuevoId(),
        ...parametros,
      });
    } catch (error) {
      if (error instanceof ErrorDeRed) throw new ErrorDeRegistro([{ codigo: "requiere_servidor" }]);
      if (error instanceof ErrorDelServidor) throw new ErrorDeRegistro([motivoDeServidor(error.codigo)]);
      throw error;
    }
  }

  /** Recibe lo que el servidor produjo. Si no hay conexión justo ahora, los números ya están asignados y llegan después. */
  const recibir = async (): Promise<void> => {
    await cliente.sincronizar();
  };

  return {
    async alDia() {
      const resultado = await cliente.sincronizar();
      if (resultado.estado !== "al_dia") throw new ErrorDeRegistro([{ codigo: "requiere_servidor" }]);
    },
    async emitir(registros: readonly RegistroParaEmitir[]) {
      const r = await llamar<{ resultados: RegistroEmitido[] }>("emitir_registros", { p_registros: registros });
      await recibir();
      return r.resultados;
    },
    async reemitir(registroId, versionBase, campos) {
      const r = await llamar<{ numero: string; version: number }>("reemitir_registro", {
        p_registro_id: registroId,
        p_version_base: versionBase,
        p_campos: campos,
      });
      await recibir();
      return { numero: r.numero, version: r.version };
    },
    async anular(registroId, motivo) {
      await llamar("anular_registro", { p_registro_id: registroId, p_motivo: motivo });
      await recibir();
    },
    async fijarSiguienteNumero(libroId, valor) {
      await llamar("fijar_siguiente_numero", { p_libro_id: libroId, p_valor: valor });
      await recibir();
    },
  };
}
