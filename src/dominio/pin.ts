/** SUPOSICION: el PIN tiene de 4 a 6 dígitos. */
export function esPinValido(pin: string): boolean {
  void pin;
  throw new Error("esPinValido: no implementado");
}

/** SUPOSICION: PBKDF2-SHA256 con 600 000 iteraciones (recomendación de OWASP) y sal aleatoria de 16 bytes. */
export const ITERACIONES_PIN = 600_000;

/** Devuelve el texto que se guarda en usuario.pin_hash. Nunca se guarda el PIN. */
export async function crearHashPin(pin: string, iteraciones: number = ITERACIONES_PIN): Promise<string> {
  void pin;
  void iteraciones;
  throw new Error("crearHashPin: no implementado");
}

export async function verificarPin(pin: string, hashGuardado: string): Promise<boolean> {
  void pin;
  void hashGuardado;
  throw new Error("verificarPin: no implementado");
}
