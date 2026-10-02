// R32 (compra) y R20 (venta), especificación 2: reglas puras de los traspasos de animales. Sin React ni base de datos.
// Esto es solo el registro de lo que pasó; no hay mercado en línea (especificación 2, secciones 3 y 11).
import { esFechaValida } from "./fechas";
import { esDelHato } from "./externos";
import type { EstadoAnimal, OrigenAnimal } from "./tipos";

export type TipoTraspaso = "compra" | "venta";
export const TIPOS_TRASPASO: readonly TipoTraspaso[] = ["compra", "venta"];

/** Categoría de gasto «Compra de animales» (migración 0008). */
export const CATEGORIA_COMPRA_ANIMALES_ID = "f9cb4789-f088-469e-af6e-7ffb94db497b";
/** Categoría de ingreso «Venta de animales» (migración 0007). */
export const CATEGORIA_VENTA_ANIMALES_ID = "7dea0a40-e3d0-439d-b74a-55f88a6e7a76";

export type ErrorTraspaso =
  | { codigo: "traspaso_sin_contacto"; tipo: TipoTraspaso }
  | { codigo: "compra_animal_del_hato"; otro: string }
  | { codigo: "compra_animal_no_disponible"; otro: string }
  | { codigo: "venta_animal_no_del_hato"; otro: string }
  | { codigo: "venta_animal_no_activo"; otro: string }
  | { codigo: "venta_antes_del_ingreso" }
  | { codigo: "precio_invalido" }
  | { codigo: "adjunto_no_admitido" }
  | { codigo: "traspaso_ya_con_movimiento" }
  | { codigo: "traspaso_sin_precio" }
  | { codigo: "compra_ancestro_ya_registrado"; campo: "padre" | "madre" }
  | { codigo: "contacto_con_traspasos"; cantidad: number }
  | { codigo: "fecha_invalida"; campo: string }
  | { codigo: "fecha_futura"; campo: string }
  | { codigo: "fecha_anterior_al_nacimiento"; otro: string };

/** Lo que las reglas necesitan saber del animal que se compra o se vende. */
export interface AnimalParaTraspaso {
  nombre: string;
  origen: OrigenAnimal;
  /** Campo de la versión 0.1.0: false = registrado solo para la genealogía. */
  enHato: boolean;
  estado: EstadoAnimal;
  fechaNacimiento: string | null;
  fechaIngreso: string | null;
}

/** Pesos enteros mayores que cero (S-70). Vacío (null) es válido: «sin precio». */
export function esPrecioValido(precio: number | null): boolean {
  return precio === null || (Number.isSafeInteger(precio) && precio > 0);
}

const EXTENSIONES_ADJUNTO = "pdf|jpg|jpeg|png|webp";
const PATRON_ADJUNTO = new RegExp(`^documentos/adjunto-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(${EXTENSIONES_ADJUNTO})$`, "i");

/** Extensiones que se aceptan como adjunto (PDF o imagen), para el diálogo «Abrir». */
export const EXTENSIONES_DE_ADJUNTO: readonly string[] = EXTENSIONES_ADJUNTO.split("|");

/**
 * SUPOSICION (S-79): PDF o imagen (JPG, PNG, WebP), sin límite de tamaño.
 * Un adjunto es un archivo que el programa copió a su carpeta de documentos: `documentos/adjunto-<uuid>.<extensión>`.
 * Nada más se acepta, así una ruta escrita a mano no puede apuntar a otro lugar del equipo.
 */
export function esRutaDeAdjunto(ruta: string): boolean {
  return PATRON_ADJUNTO.test(ruta);
}

interface EntradaFecha {
  fecha: string;
  hoy: string;
}

function validarFecha({ fecha, hoy }: EntradaFecha, animal: AnimalParaTraspaso | null): ErrorTraspaso[] {
  if (!esFechaValida(fecha)) return [{ codigo: "fecha_invalida", campo: "fecha" }];
  if (fecha > hoy) return [{ codigo: "fecha_futura", campo: "fecha" }];
  if (animal?.fechaNacimiento && fecha < animal.fechaNacimiento) return [{ codigo: "fecha_anterior_al_nacimiento", otro: animal.nombre }];
  return [];
}

export interface EntradaCompra {
  /** El animal que ya existe (de otra finca o solo genealogía), o null si la compra crea un animal nuevo. */
  animal: AnimalParaTraspaso | null;
  vendedorId: string | null;
  /** Fecha de ingreso a la finca. */
  fecha: string;
  precio: number | null;
  adjuntos: readonly string[];
  hoy: string;
}

/**
 * R32: comprar es promover a «comprado» a un animal que existe como externo (conservando su id y su genealogía) o crear
 * uno nuevo con ese origen. No se compra un animal que ya es del hato, ni uno vendido o muerto. Pide el vendedor y la
 * fecha de ingreso (que no es futura: desde ese día el animal cuenta en el inventario). SUPOSICION (S-77): las fechas
 * no son futuras ni anteriores al nacimiento, y el inventario es el de hoy.
 */
export function validarCompra(e: EntradaCompra): ErrorTraspaso[] {
  const errores: ErrorTraspaso[] = [];
  if (e.animal) {
    if (esDelHato(e.animal)) errores.push({ codigo: "compra_animal_del_hato", otro: e.animal.nombre });
    else if (e.animal.estado !== "activo") errores.push({ codigo: "compra_animal_no_disponible", otro: e.animal.nombre });
  }
  if (!e.vendedorId) errores.push({ codigo: "traspaso_sin_contacto", tipo: "compra" });
  errores.push(...validarFecha(e, e.animal));
  if (!esPrecioValido(e.precio)) errores.push({ codigo: "precio_invalido" });
  if (e.adjuntos.some((a) => !esRutaDeAdjunto(a))) errores.push({ codigo: "adjunto_no_admitido" });
  return errores;
}

export interface EntradaVenta {
  animal: AnimalParaTraspaso;
  compradorId: string | null;
  fecha: string;
  precio: number | null;
  hoy: string;
}

/**
 * R20: vender un animal del hato que sigue activo. La venta no modifica la genealogía ni anula el registro propio (eso lo
 * garantiza que aquí no hay nada que lo toque); solo cambia su estado a «vendido» (R11).
 * SUPOSICION (S-78): no hay «anular» un traspaso, ni se vuelve a comprar un animal que se vendió; el precio es opcional.
 */
export function validarVenta(e: EntradaVenta): ErrorTraspaso[] {
  const errores: ErrorTraspaso[] = [];
  if (!esDelHato(e.animal)) errores.push({ codigo: "venta_animal_no_del_hato", otro: e.animal.nombre });
  else if (e.animal.estado !== "activo") errores.push({ codigo: "venta_animal_no_activo", otro: e.animal.nombre });
  if (!e.compradorId) errores.push({ codigo: "traspaso_sin_contacto", tipo: "venta" });
  const errorDeFecha = validarFecha(e, e.animal);
  errores.push(...errorDeFecha);
  if (errorDeFecha.length === 0 && e.animal.fechaIngreso && e.fecha < e.animal.fechaIngreso) errores.push({ codigo: "venta_antes_del_ingreso" });
  if (!esPrecioValido(e.precio)) errores.push({ codigo: "precio_invalido" });
  return errores;
}

export interface MovimientoOfrecido {
  tipo: "gasto" | "ingreso";
  categoriaId: string;
  valor: number;
  fecha: string;
}

/**
 * R32 y R20: el movimiento de Finanzas que se ofrece crear al guardar un traspaso con precio: un gasto «Compra de
 * animales» o un ingreso «Venta de animales», por el precio y en la fecha del traspaso. Sin precio no hay nada que ofrecer.
 */
export function movimientoDeTraspaso(t: { tipo: TipoTraspaso; precio: number | null; fecha: string }): MovimientoOfrecido | null {
  if (t.precio === null) return null;
  return t.tipo === "compra"
    ? { tipo: "gasto", categoriaId: CATEGORIA_COMPRA_ANIMALES_ID, valor: t.precio, fecha: t.fecha }
    : { tipo: "ingreso", categoriaId: CATEGORIA_VENTA_ANIMALES_ID, valor: t.precio, fecha: t.fecha };
}

export interface ResumenTraspasos {
  compras: { cantidad: number; total: number };
  ventas: { cantidad: number; total: number };
  /** Vendido menos comprado: lo mismo que la rentabilidad de Finanzas, pero solo de estos traspasos. */
  saldo: number;
}

/** Totales de la lista del historial. Un traspaso sin precio cuenta como uno más, pero no suma. */
export function resumirTraspasos(filas: readonly { tipo: TipoTraspaso; precio: number | null }[]): ResumenTraspasos {
  const compras = { cantidad: 0, total: 0 };
  const ventas = { cantidad: 0, total: 0 };
  for (const f of filas) {
    const grupo = f.tipo === "compra" ? compras : ventas;
    grupo.cantidad += 1;
    grupo.total += f.precio ?? 0;
  }
  return { compras, ventas, saldo: ventas.total - compras.total };
}
