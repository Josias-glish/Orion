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
 * Nunca se guarda el PIN.
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

/**
 * PBKDF2-SHA256. Usa la criptografía nativa de la ventana (crypto.subtle) cuando existe: es unas 15 veces más
 * rápida (106 ms frente a 1,8 s en Linux; en Windows, el JavaScript puro tardó 4 s). Si la ventana no la ofrece,
 * usa @noble/hashes en JavaScript puro. Las dos dan el mismo resultado: es un algoritmo estándar.
 */
async function derivar(pin: string, sal: Uint8Array, iteraciones: number): Promise<Uint8Array> {
  if (globalThis.crypto?.subtle) {
    try {
      return await derivarConWebCrypto(pin, sal, iteraciones);
    } catch {
      // Algunas ventanas no admiten PBKDF2 en crypto.subtle: se sigue con la versión en JavaScript.
    }
  }
  return derivarConJavaScript(pin, sal, iteraciones);
}

export async function derivarConWebCrypto(pin: string, sal: Uint8Array, iteraciones: number): Promise<Uint8Array> {
  const subtle = globalThis.crypto.subtle;
  const clave = await subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: new Uint8Array(sal), iterations: iteraciones },
    clave,
    BYTES_HASH * 8,
  );
  return new Uint8Array(bits);
}

export function derivarConJavaScript(pin: string, sal: Uint8Array, iteraciones: number): Promise<Uint8Array> {
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
