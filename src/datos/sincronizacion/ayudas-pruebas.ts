// Ayudas para las pruebas de la sincronización (Vitest). No las usa el programa.
import { nuevoId } from "../../dominio/identidad";
import type { Conexion } from "../conexion";
import { AHORA } from "../ayudas-pruebas";
import { CLAVES, escribirEstado } from "./estado";

export interface EquipoDePrueba {
  fincaId: string;
  dispositivoId: string;
  codigoEquipo: string;
}

/** Deja la base como la de un equipo ya vinculado a una finca del servidor (sin hablar con ningún servidor). */
export async function vincularParaPruebas(
  conexion: Conexion,
  datos: Partial<EquipoDePrueba> & { desfaseMs?: number; cursor?: number } = {},
): Promise<EquipoDePrueba> {
  const equipo: EquipoDePrueba = {
    fincaId: datos.fincaId ?? nuevoId(),
    dispositivoId: datos.dispositivoId ?? nuevoId(),
    codigoEquipo: datos.codigoEquipo ?? "A",
  };
  await conexion.ejecutar(
    `INSERT INTO dispositivo (id, nombre, plataforma, propio, codigo_equipo, creado_en, modificado_en) VALUES (?, 'Equipo de prueba', 'prueba', 1, ?, ?, ?)`,
    [equipo.dispositivoId, equipo.codigoEquipo, AHORA, AHORA],
  );
  await escribirEstado(
    conexion,
    {
      [CLAVES.fincaServidor]: equipo.fincaId,
      [CLAVES.dispositivoId]: equipo.dispositivoId,
      [CLAVES.codigoEquipo]: equipo.codigoEquipo,
      [CLAVES.desfaseMs]: String(datos.desfaseMs ?? 0),
      [CLAVES.cursorSeq]: String(datos.cursor ?? 0),
    },
    AHORA,
  );
  return equipo;
}

export interface FilaCola {
  secuencia: number;
  id: string;
  grupo_id: string;
  orden: number;
  entidad: string;
  registro_id: string;
  operacion: "crear" | "modificar" | "eliminar";
  campos: string | null;
  marca: string;
  usuario_id: string | null;
  dispositivo_id: string;
  enviado: number;
}

export function leerCola(conexion: Conexion): Promise<FilaCola[]> {
  return conexion.consultar<FilaCola>("SELECT * FROM cola_cambios ORDER BY secuencia");
}
