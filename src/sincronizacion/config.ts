// Dirección del servidor y su clave pública (Etapa 10, sección 14 del diseño).
// Mientras `servidor.json` tenga la dirección de ejemplo (dominio `.invalid`, que nunca existe) el programa no hace ninguna
// llamada de red. La clave pública (`anon` o `publishable`) está pensada para ir en el programa: lo que protege los datos
// son los permisos y las funciones del servidor, no esta clave. La clave `service_role` NUNCA va aquí.
import servidor from "./servidor.json";

export interface ConfiguracionDelServidor {
  url: string;
  claveAnonima: string;
}

export function configuracionDelServidor(): ConfiguracionDelServidor {
  return { url: servidor.url.replace(/\/+$/, ""), claveAnonima: servidor.claveAnonima };
}

/** ¿Hay un servidor configurado de verdad? Sin él, sincronizar no existe: el programa funciona como antes. */
export function servidorConfigurado(configuracion: ConfiguracionDelServidor = configuracionDelServidor()): boolean {
  try {
    const direccion = new URL(configuracion.url);
    return direccion.protocol === "https:" && !direccion.hostname.endsWith(".invalid") && configuracion.claveAnonima.length > 0;
  } catch {
    return false;
  }
}
