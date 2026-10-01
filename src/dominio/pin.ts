import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";

/** SUPOSICION: el PIN tiene de 4 a 6 dígitos. */
export function esPinValido(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

/** SUPOSICION: PBKDF2-SHA256 con 600 000 iteraciones (recomendación de OWASP) y sal aleatoria de 16 bytes. */
export const ITERACIONES_PIN = 600_000;
const ALGORITMO = "pbkdf2-sha256";
const BYTES_SAL = 16;
const BYTES_HASH = 32;

/**
 * Devuelve el texto que se guarda en usuario.pin_hash: «pbkdf2-sha256$iteraciones$sal$hash» (en base64).
 * Nunca se guarda el PIN. Se usa @noble/hashes (JavaScript puro) para que funcione igual en Windows,
 * macOS y en las pruebas, sin depender de que la ventana ofrezca crypto.subtle.
 */
export async function crearHashPin(pin: string, iteraciones: number = ITERACIONES_PIN): Promise<string> {
  const sal = new Uint8Array(BYTES_SAL);
  crypto.getRandomValues(sal);
  const hash = await derivar(pin, sal, iteraciones);
  return [ALGORITMO, String(iteraciones), aBase64(sal), aBase64(hash)].join("$");
}

export async function verificarPin(pin: string, hashGuardado: string): Promise<boolean> {
  const partes = hashGuardado.split("$");
  if (partes.length !== 4 || partes[0] !== ALGORITMO) return false;
  const iteraciones = Number(partes[1]);
  if (!Number.isInteger(iteraciones) || iteraciones < 1) return false;
  const esperado = deBase64(partes[3]);
  const obtenido = await derivar(pin, deBase64(partes[2]), iteraciones);
  return igualesEnTiempoConstante(esperado, obtenido);
}

function derivar(pin: string, sal: Uint8Array, iteraciones: number): Promise<Uint8Array> {
  return pbkdf2Async(sha256, new TextEncoder().encode(pin), sal, { c: iteraciones, dkLen: BYTES_HASH });
}

function igualesEnTiempoConstante(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a[i] ^ b[i];
  return diferencia === 0;
}

function aBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function deBase64(texto: string): Uint8Array {
  return Uint8Array.from(atob(texto), (c) => c.charCodeAt(0));
}
