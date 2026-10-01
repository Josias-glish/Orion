/** Fecha y hora UTC con el formato que guarda la base: «2026-10-01T18:49:00.123Z». */
export function marcaDeTiempo(momento: Date = new Date()): string {
  return momento.toISOString();
}

/** Fecha del calendario local en formato «AAAA-MM-DD». */
export function fechaLocal(momento: Date = new Date()): string {
  const anio = momento.getFullYear();
  const mes = String(momento.getMonth() + 1).padStart(2, "0");
  const dia = String(momento.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

/** «2026-10-01» → «01/10/2026». Devuelve el texto sin cambios si no tiene ese formato. */
export function formatearFecha(fecha: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : fecha;
}

/** Marca de tiempo UTC → «01/10/2026 13:49» en la hora local del equipo. */
export function formatearMarcaDeTiempo(marca: string): string {
  const momento = new Date(marca);
  if (Number.isNaN(momento.getTime())) return marca;
  const hora = String(momento.getHours()).padStart(2, "0");
  const minuto = String(momento.getMinutes()).padStart(2, "0");
  return `${formatearFecha(fechaLocal(momento))} ${hora}:${minuto}`;
}

/** ¿Es una fecha real con formato «AAAA-MM-DD»? (rechaza, por ejemplo, el 30 de febrero) */
export function esFechaValida(fecha: string): boolean {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!partes) return false;
  const [anio, mes, dia] = partes.slice(1).map(Number);
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/** Edad en años y meses cumplidos entre dos fechas «AAAA-MM-DD». */
export function edadEnMeses(nacimiento: string, hoy: string): number {
  const [a1, m1, d1] = nacimiento.split("-").map(Number);
  const [a2, m2, d2] = hoy.split("-").map(Number);
  return (a2 - a1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
}

/** Suma (o resta, si es negativo) días a una fecha «AAAA-MM-DD». */
export function sumarDias(fecha: string, dias: number): string {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

/** Días de `desde` a `hasta` (positivo si `hasta` es posterior). */
export function diasEntre(desde: string, hasta: string): number {
  const utc = (f: string) => {
    const [anio, mes, dia] = f.split("-").map(Number);
    return Date.UTC(anio, mes - 1, dia);
  };
  return Math.round((utc(hasta) - utc(desde)) / 86_400_000);
}
