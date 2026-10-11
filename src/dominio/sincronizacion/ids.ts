// Identificadores calculados (no al azar): reenviar la primera subida no duplica nada porque cada cambio tiene siempre el
// mismo `cambio_id`. Funciones puras. Diseño: docs/SINCRONIZACION.md, sección 12.
import { sha256 } from "@noble/hashes/sha2.js";

/** UUID (con forma de versión 4) calculado con SHA-256 de las partes: mismas partes, mismo identificador. */
export function idDeterminista(...partes: readonly string[]): string {
  const bytes = sha256(new TextEncoder().encode(partes.join("\u0000"))).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

/** SHA-256 hexadecimal (minúsculas) de un texto UTF-8. */
export function sha256Hex(texto: string): string {
  return Array.from(sha256(new TextEncoder().encode(texto)), (b) => b.toString(16).padStart(2, "0")).join("");
}
