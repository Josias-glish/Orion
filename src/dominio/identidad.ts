/**
 * Crea un identificador UUID versión 4 (RF-42).
 * Usa crypto.getRandomValues, que existe en la ventana del programa y en Node,
 * en lugar de crypto.randomUUID, que algunas ventanas solo ofrecen en contextos seguros.
 */
export function nuevoId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // versión 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

const FORMATO_UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function esUuidV4(valor: string): boolean {
  return FORMATO_UUID_V4.test(valor);
}
