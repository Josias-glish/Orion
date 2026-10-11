// Arma las piezas de la sincronización para una conexión: la red, el ciclo, el servicio de fondo y el servidor de registros.
// Solo la ventana del programa lo usa (las pruebas arman las piezas a mano con una red simulada).
import type { Conexion } from "../datos/conexion";
import { fijarServidorDeRegistros } from "../datos/sincronizacion/servidor-registros";
import { leerVinculo } from "../datos/sincronizacion/estado";
import { VERSION_ESQUEMA } from "../datos/respaldo";
import { sincronizarArchivos } from "./archivos";
import { almacenDeArchivosDelSistema } from "./archivos-datos";
import { ClienteDeSincronizacion } from "./cliente";
import { configuracionDelServidor, servidorConfigurado } from "./config";
import { almacenDeSesionDelSistema } from "./llavero";
import { crearRedTauri, type Red } from "./red";
import { crearServidorDeRegistros } from "./registros-remotos";
import { ServicioDeSincronizacion } from "./servicio";

export interface Sincronizacion {
  /** ¿Este programa trae la dirección de un servidor? Si no, la sincronización no existe. */
  configurada: boolean;
  red: Red;
  cliente: ClienteDeSincronizacion;
  servicio: ServicioDeSincronizacion;
}

export function crearSincronizacion(conexion: Conexion): Sincronizacion {
  const configuracion = configuracionDelServidor();
  const red = crearRedTauri({ configuracion, almacen: almacenDeSesionDelSistema });
  const cliente = new ClienteDeSincronizacion(conexion, red, {
    versionEsquema: VERSION_ESQUEMA,
    alTerminar: async (c, r) => {
      const vinculo = await leerVinculo(c);
      if (vinculo) await sincronizarArchivos(c, r, almacenDeArchivosDelSistema, vinculo.fincaId);
    },
  });
  const servicio = new ServicioDeSincronizacion(conexion, cliente);
  fijarServidorDeRegistros(conexion, crearServidorDeRegistros(conexion, red, cliente));
  return { configurada: servidorConfigurado(configuracion), red, cliente, servicio };
}
