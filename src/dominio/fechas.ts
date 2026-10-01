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
