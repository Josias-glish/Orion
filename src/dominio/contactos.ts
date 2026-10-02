// Contactos (especificación 2, sección 6): propietarios de animales de otras fincas, y en la Etapa 9 vendedores y
// compradores. R28: datos personales de terceros; se guardan solo los mínimos y nunca se publican.

export interface DatosContacto {
  nombre: string;
  criadero: string | null;
  municipio: string | null;
  telefono: string | null;
  correo: string | null;
  notas: string | null;
}

export type ErrorContacto = { codigo: "dato_obligatorio"; campo: string } | { codigo: "correo_invalido" };

/** Solo el nombre es obligatorio (R28). El correo, si se escribe, debe tener forma de correo. */
export function validarContacto(datos: DatosContacto): ErrorContacto[] {
  const errores: ErrorContacto[] = [];
  if (!datos.nombre.trim()) errores.push({ codigo: "dato_obligatorio", campo: "nombre" });
  const correo = datos.correo?.trim();
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) errores.push({ codigo: "correo_invalido" });
  return errores;
}
