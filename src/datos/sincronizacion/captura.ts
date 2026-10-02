// R15 y R16: lo que `Cambios.aplicar` suma a su lote en un equipo vinculado: una fila de la cola por cada operación, las
// marcas de cada campo tocado y el reloj híbrido guardado. Todo va en la misma transacción que el cambio, así un corte no
// deja un dato que nunca se enviará. Diseño: docs/SINCRONIZACION.md, secciones 4 y 5.
import { nuevoId } from "../../dominio/identidad";
import { codigoDeDispositivo, marcaMayor, nuevaMarca } from "../../dominio/sincronizacion/hlc";
import { columnaSube, definicionDeEntidad, esColumnaReservada, seSincroniza } from "../../dominio/sincronizacion/entidades";
import type { ContextoCambio, Sentencia, ValorSql } from "../conexion";
import type { Conexion } from "../conexion";
import { ErrorDeRegistro } from "../errores";
import { relojDe } from "./contexto";
import { columnasQueSuben, columnasQueViajan, entreComillas } from "./esquema";
import { CLAVES, sentenciaEstado, type Vinculo } from "./estado";
import { clave, estaEliminadoRegistro, leerMarcas, marcaMaximaDe, marcarCampos, sentenciaMarcas, type RegistroMarcado } from "./marcas";

/** Un grupo (una operación del usuario) más grande que esto se parte: el servidor acepta hasta 500 operaciones por envío. */
export const MAX_OPERACIONES_POR_GRUPO = 400;

export interface OperacionLocal {
  tabla: string;
  id: string;
  tipo: "crear" | "modificar" | "eliminar";
  /** crear: los valores que se pasaron al insertar; modificar: los campos que cambiaron; eliminar: `eliminado_en`. */
  campos: Readonly<Record<string, ValorSql>>;
}

export interface Captura {
  sentencias: Sentencia[];
  /** La marca de cada operación recibida (en el mismo orden); null si la tabla no se sincroniza. */
  marcas: (string | null)[];
}

const requiereServidor = (): ErrorDeRegistro => new ErrorDeRegistro([{ codigo: "requiere_servidor" }]);

/** R31: lo que solo escribe el servidor (número, versión, estado de un registro; contador de un libro) no se cambia desde aquí. */
function exigirQueNoSeaReservado(op: OperacionLocal): void {
  const reservadas = definicionDeEntidad(op.tabla)?.reservadas ?? [];
  if (reservadas.length === 0) return;
  if (op.tipo === "crear") {
    // Un borrador sí se crea sin red: es un registro sin número. Cualquier otro estado lo asigna el servidor.
    if (op.tabla === "registro_genealogico" && (op.campos.estado ?? "borrador") !== "borrador") throw requiereServidor();
    return;
  }
  if (Object.keys(op.campos).some((campo) => esColumnaReservada(op.tabla, campo))) throw requiereServidor();
}

export async function prepararCaptura(
  conexion: Conexion,
  vinculo: Vinculo,
  contexto: ContextoCambio,
  operaciones: readonly OperacionLocal[],
): Promise<Captura> {
  const marcas: (string | null)[] = operaciones.map(() => null);

  interface Util {
    indice: number;
    op: OperacionLocal;
    columnas: string[];
    campos: Record<string, ValorSql>;
  }
  const utiles: Util[] = [];
  for (const [indice, op] of operaciones.entries()) {
    if (!seSincroniza(op.tabla)) continue;
    exigirQueNoSeaReservado(op);
    const columnas = await columnasQueViajan(conexion, op.tabla);
    let campos: Record<string, ValorSql> = { ...op.campos };
    if (op.tipo !== "crear") {
      campos = Object.fromEntries(Object.entries(op.campos).filter(([campo]) => columnaSube(op.tabla, campo) && columnas.includes(campo)));
      if (Object.keys(campos).length === 0) continue; // solo cambió algo local (por ejemplo, el hash del PIN)
    }
    utiles.push({ indice, op, columnas, campos });
  }
  if (utiles.length === 0) return { sentencias: [], marcas };

  // Las marcas que ya tienen los registros que se modifican: la marca nueva tiene que ser posterior a todas.
  const pendientes = new Map<string, string[]>();
  for (const { op } of utiles) if (op.tipo !== "crear") (pendientes.get(op.tabla) ?? pendientes.set(op.tabla, []).get(op.tabla)!).push(op.id);
  const existentes = new Map<string, RegistroMarcado>();
  for (const [entidad, ids] of pendientes) for (const [k, v] of await leerMarcas(conexion, entidad, ids)) existentes.set(k, v);

  const codigo = codigoDeDispositivo(vinculo.dispositivoId);
  const ahoraMs = relojDe(conexion).ahoraMs() + vinculo.desfaseMs;
  let ultima = vinculo.marcaUltima ?? "";
  for (const { op, columnas } of utiles) {
    const previo = existentes.get(clave(op.tabla, op.id));
    if (previo) ultima = marcaMayor(ultima, marcaMaximaDe(previo, columnas));
  }

  const grupos: { id: string; marca: string; operaciones: number }[] = [];
  const cola: Sentencia[] = [];
  const efectos: Sentencia[] = [];
  const trabajo = new Map<string, RegistroMarcado>();

  for (const [k, { indice, op, columnas, campos }] of utiles.entries()) {
    const numeroGrupo = Math.floor(k / MAX_OPERACIONES_POR_GRUPO);
    if (!grupos[numeroGrupo]) {
      const marca = nuevaMarca(ultima, ahoraMs, codigo);
      ultima = marca;
      grupos[numeroGrupo] = { id: nuevoId(), marca, operaciones: 0 };
    }
    const grupo = grupos[numeroGrupo];
    const { marca } = grupo;
    marcas[indice] = marca;

    const llave = clave(op.tabla, op.id);
    const actual = trabajo.get(llave) ?? existentes.get(llave) ?? null;
    let nuevo: RegistroMarcado;
    if (op.tipo === "crear") {
      nuevo = { marcas: marcarCampos(null, columnas, columnas, marca), eliminadoValor: (op.campos.eliminado_en as string | null | undefined) ?? null };
    } else {
      const eliminadoValor = "eliminado_en" in campos ? (campos.eliminado_en as string | null) : (actual?.eliminadoValor ?? null);
      nuevo = { marcas: marcarCampos(actual?.marcas ?? null, columnas, Object.keys(campos), marca), eliminadoValor };
      // Una edición posterior a un borrado restaura el registro (S-85): la fila local tiene que decirlo igual que en los demás equipos.
      if (op.tipo === "modificar" && actual && !("eliminado_en" in campos) && columnas.includes("eliminado_en")) {
        if (estaEliminadoRegistro(actual, columnas) && !estaEliminadoRegistro(nuevo, columnas)) {
          efectos.push({ sql: `UPDATE ${entreComillas(op.tabla)} SET eliminado_en = NULL WHERE id = ?`, parametros: [op.id] });
        }
      }
    }
    trabajo.set(llave, nuevo);

    const orden = grupo.operaciones++;
    const comunes = [marca, contexto.usuarioId, vinculo.dispositivoId, contexto.marcaTiempo, contexto.marcaTiempo] as const;
    if (op.tipo === "crear") {
      // Los valores completos de la fila (con los que dejan los valores por defecto de la base) se toman al final del lote.
      const subidas = await columnasQueSuben(conexion, op.tabla);
      cola.push({
        sql: `INSERT INTO cola_cambios (id, grupo_id, orden, entidad, registro_id, operacion, campos, marca, usuario_id, dispositivo_id, enviado, creado_en, modificado_en)
              SELECT ?, ?, ?, ?, id, 'crear', json_object(${subidas.map((c) => `'${c}', ${entreComillas(c)}`).join(", ")}), ?, ?, ?, 0, ?, ?
                FROM ${entreComillas(op.tabla)} WHERE id = ?`,
        parametros: [nuevoId(), grupo.id, orden, op.tabla, ...comunes, op.id],
      });
    } else {
      cola.push({
        sql: `INSERT INTO cola_cambios (id, grupo_id, orden, entidad, registro_id, operacion, campos, marca, usuario_id, dispositivo_id, enviado, creado_en, modificado_en)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        parametros: [nuevoId(), grupo.id, orden, op.tabla, op.id, op.tipo, JSON.stringify(campos), ...comunes],
      });
    }
  }

  const sentencias: Sentencia[] = [...efectos, ...cola];
  for (const [llave, registro] of trabajo) {
    const [entidad, id] = [llave.slice(0, llave.indexOf("|")), llave.slice(llave.indexOf("|") + 1)];
    sentencias.push(sentenciaMarcas(entidad, id, registro, contexto.marcaTiempo));
  }
  sentencias.push(sentenciaEstado(CLAVES.marcaUltima, ultima, contexto.marcaTiempo));
  return { sentencias, marcas };
}
