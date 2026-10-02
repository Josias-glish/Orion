// Qué tablas se sincronizan y cómo. Diseño: docs/SINCRONIZACION.md, sección 3.
// Una prueba (src/datos/sincronizacion/entidades.test.ts) exige que cada tabla de la base figure aquí o en TABLAS_LOCALES_O_EXCLUIDAS:
// una tabla nueva obliga a decidir qué hacer con ella.

export interface DefinicionEntidad {
  /** Nombre de la tabla (es también el nombre de la entidad en el servidor). */
  tabla: string;
  /** Columnas que se refieren a la misma tabla: al recibir un bloque de filas se asignan en una segunda pasada (R1 exige que el padre exista). */
  autorreferencias?: readonly string[];
  /** Columnas que nunca viajan, ni hacia el servidor ni desde él: son locales (`pin_pendiente`) o secretas (`pin_hash`). */
  excluidas?: readonly string[];
  /**
   * Columnas que solo escribe el servidor (R31): el programa nunca las manda, pero sí las recibe (el número y la versión
   * de un registro, el contador de un libro). Un cambio local que las toque se rechaza: pasa por el servidor.
   */
  reservadas?: readonly string[];
  /** Columnas con rutas de archivos que también hay que subir y bajar (sección 9 del diseño). */
  archivos?: readonly { columna: string; formato: "ruta" | "json" }[];
  /** Columnas que apuntan a `contacto` (R28): si el contacto no existe en este equipo, se crea un marcador. */
  contactos?: readonly string[];
  /** Tiene un índice de nombre único sin distinguir mayúsculas entre los registros no eliminados (S-86: se agrega « (2)»). */
  nombreUnico?: boolean;
}

/** En el orden en que se pueden crear: cada tabla va después de las que referencia. */
export const ENTIDADES_SINCRONIZADAS: readonly DefinicionEntidad[] = [
  { tabla: "finca" },
  { tabla: "usuario", excluidas: ["pin_hash", "pin_pendiente"], nombreUnico: true },
  { tabla: "raza", nombreUnico: true },
  { tabla: "libro", reservadas: ["siguiente_numero"], nombreUnico: true },
  { tabla: "categoria_economica" },
  { tabla: "lote", nombreUnico: true },
  {
    tabla: "animal",
    autorreferencias: ["padre_id", "madre_id"],
    archivos: [{ columna: "foto", formato: "ruta" }],
    contactos: ["contacto_id"],
  },
  { tabla: "identificador" },
  { tabla: "composicion_racial" },
  { tabla: "evento_reproductivo" },
  { tabla: "parto" },
  { tabla: "lactancia" },
  { tabla: "pesaje_leche" },
  { tabla: "pesaje_corporal" },
  { tabla: "meta_peso" },
  { tabla: "evento_salud" },
  { tabla: "certificado", archivos: [{ columna: "archivo", formato: "ruta" }] },
  {
    tabla: "registro_genealogico",
    reservadas: ["estado", "consecutivo", "numero", "version", "instantanea", "motivo_anulacion"],
  },
  { tabla: "movimiento_economico" },
  { tabla: "traspaso", archivos: [{ columna: "adjuntos", formato: "json" }], contactos: ["contacto_id"] },
];

/** Tablas de la base que no se sincronizan, con su motivo. */
export const TABLAS_LOCALES_O_EXCLUIDAS: Readonly<Record<string, string>> = {
  contacto: "R28: datos personales de terceros; solo viajan sus ids (marcadores en el otro equipo)",
  historial_cambios: "viaja dentro de cada operación; cada equipo escribe el suyo",
  dispositivo: "local: equipos de la finca",
  sincronizacion_estado: "local: estado de la sincronización de este equipo",
  cola_cambios: "local: la cola de envío",
  marca_registro: "local: las marcas de cada campo",
  aviso_sincronizacion: "local: avisos y conflictos",
  archivo_sincronizado: "local: qué archivos ya están en el servidor",
};

/** Columnas que ninguna operación lleva, en ninguna tabla: la fecha de modificación se calcula en cada equipo. */
export const COLUMNAS_NO_VIAJAN: ReadonlySet<string> = new Set(["modificado_en"]);

const POR_TABLA = new Map(ENTIDADES_SINCRONIZADAS.map((e) => [e.tabla, e]));

export function definicionDeEntidad(tabla: string): DefinicionEntidad | undefined {
  return POR_TABLA.get(tabla);
}

export function seSincroniza(tabla: string): boolean {
  return POR_TABLA.has(tabla);
}

/** ¿Esta columna viaja en las operaciones de la tabla (las que se reciben del servidor y las que se envían)? */
export function columnaViaja(tabla: string, columna: string): boolean {
  if (COLUMNAS_NO_VIAJAN.has(columna) || columna === "id") return false;
  return !(POR_TABLA.get(tabla)?.excluidas ?? []).includes(columna);
}

export function esColumnaReservada(tabla: string, columna: string): boolean {
  return (POR_TABLA.get(tabla)?.reservadas ?? []).includes(columna);
}

/** ¿Este equipo puede enviar la columna? Las reservadas solo las escribe el servidor. */
export function columnaSube(tabla: string, columna: string): boolean {
  return columnaViaja(tabla, columna) && !esColumnaReservada(tabla, columna);
}

/** Posición de la tabla en el orden de dependencias (para ordenar la subida y la descarga). */
export function ordenDeEntidad(tabla: string): number {
  return ENTIDADES_SINCRONIZADAS.findIndex((e) => e.tabla === tabla);
}
