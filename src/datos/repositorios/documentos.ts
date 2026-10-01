// RF-14 y RF-15: datos para el certificado interno (R12) y el expediente para ANCO (R13), numeración y registro
// de cada documento emitido en la tabla certificado.
import { CAMPOS_ASCENDENCIA, type Ancestro, type CampoAscendencia, type EntradaExpediente } from "../../dominio/expediente";
import { fechaLocal } from "../../dominio/fechas";
import type { DatosCertificado } from "../../documentos/certificado";
import { Cambios, exigirPermiso } from "../cambios";
import type { Conexion, ContextoCambio } from "../conexion";
import { ErrorDeRegistro } from "../errores";
import { obtenerAnimal, type Animal } from "./animales";
import { obtenerFinca } from "./finca";
import { calcularConsanguinidad, consultarArbol } from "./genealogia";

export type TipoDocumento = "propio" | "asociacion";

/** SUPOSICION: CI = certificado interno, EX = expediente; número correlativo por tipo y año (CI-2026-0001). */
const PREFIJO: Record<TipoDocumento, string> = { propio: "CI", asociacion: "EX" };

/** Camino en el árbol (P = padre, M = madre) de cada ancestro hasta abuelos. */
const CAMINO: Record<CampoAscendencia, string> = {
  padre: "P",
  madre: "M",
  abueloPaterno: "PP",
  abuelaPaterna: "PM",
  abueloMaterno: "MP",
  abuelaMaterna: "MM",
};

/** Padres y abuelos con su registro de asociación vigente, si lo tienen. Los eliminados cuentan como desconocidos. */
async function ascendencia(conexion: Conexion, animalId: string): Promise<Record<CampoAscendencia, Ancestro | null>> {
  const nodos = await consultarArbol(conexion, animalId, 2);
  const ids = nodos.map((n) => n.id);
  const registros = new Map(
    (
      await conexion.consultar<{ animalId: string; valor: string }>(
        `SELECT animal_id AS animalId, valor FROM identificador
         WHERE tipo = 'registro_asociacion' AND vigente = 1 AND eliminado_en IS NULL
           AND animal_id IN (${ids.map(() => "?").join(", ")})
         ORDER BY principal DESC, creado_en`,
        ids,
      )
    )
      .reverse()
      .map((r) => [r.animalId, r.valor]),
  );
  const resultado = {} as Record<CampoAscendencia, Ancestro | null>;
  for (const campo of CAMPOS_ASCENDENCIA) {
    const nodo = nodos.find((n) => n.camino === CAMINO[campo]);
    resultado[campo] = nodo
      ? { nombre: nodo.nombre ?? nodo.identificador, crg: registros.get(nodo.id) ?? null, sinVerificar: nodo.sinVerificar }
      : null;
  }
  return resultado;
}

/** SUPOSICION: criador y propietario = el primer usuario propietario de la finca (no se registra el criador de animales comprados). */
async function propietarioDeLaFinca(conexion: Conexion): Promise<string | null> {
  const [u] = await conexion.consultar<{ nombre: string }>(
    "SELECT nombre FROM usuario WHERE rol = 'propietario' AND eliminado_en IS NULL ORDER BY creado_en LIMIT 1",
  );
  return u?.nombre ?? null;
}

async function animalExistente(conexion: Conexion, animalId: string): Promise<Animal> {
  const animal = await obtenerAnimal(conexion, animalId);
  if (!animal) throw new ErrorDeRegistro([{ codigo: "no_encontrado" }]);
  return animal;
}

const vigentes = (a: Animal) => a.identificadores.filter((i) => i.vigente);

/** R13: datos del expediente para ANCO. */
export async function datosExpediente(conexion: Conexion, animalId: string): Promise<EntradaExpediente> {
  const animal = await animalExistente(conexion, animalId);
  const finca = await obtenerFinca(conexion);
  const propietario = await propietarioDeLaFinca(conexion);
  return {
    animal: {
      nombre: animal.nombre,
      crg: vigentes(animal).find((i) => i.tipo === "registro_asociacion")?.valor ?? null,
      sexo: animal.sexo,
      fechaNacimiento: animal.fechaNacimiento,
      colorSenas: animal.colorSenas,
      libro: animal.libro,
      formaConcepcion: animal.formaConcepcion,
      marcas: vigentes(animal)
        .filter((i) => i.tipo !== "registro_asociacion")
        .map((i) => ({ tipo: i.tipo, valor: i.valor })),
      composicion: animal.composicion.map((c) => ({ raza: c.raza, fraccion: c.fraccion })),
    },
    criador: propietario,
    propietario,
    criadero: finca?.criadero ?? null,
    ascendencia: await ascendencia(conexion, animalId),
  };
}

/** R12: datos del certificado interno, con el número que tendrá si se emite hoy. */
export async function datosCertificado(conexion: Conexion, animalId: string, contexto: ContextoCambio): Promise<DatosCertificado> {
  const animal = await animalExistente(conexion, animalId);
  const finca = await obtenerFinca(conexion);
  const fecha = fechaLocal();
  const [usuario] = contexto.usuarioId
    ? await conexion.consultar<{ nombre: string }>("SELECT nombre FROM usuario WHERE id = ?", [contexto.usuarioId])
    : [];
  return {
    numero: await siguienteNumero(conexion, "propio", fecha),
    fechaEmision: fecha,
    emitidoPor: usuario?.nombre ?? null,
    finca: { nombre: finca?.nombre ?? "", criadero: finca?.criadero ?? null, municipio: finca?.municipio ?? null },
    animal: {
      nombre: animal.nombre,
      sexo: animal.sexo,
      fechaNacimiento: animal.fechaNacimiento,
      colorSenas: animal.colorSenas,
      libro: animal.libro,
      formaConcepcion: animal.formaConcepcion,
      identificadores: vigentes(animal).map((i) => ({ tipo: i.tipo, valor: i.valor })),
      composicion: animal.composicion.map((c) => ({ raza: c.raza, fraccion: c.fraccion })),
      consanguinidad: (await calcularConsanguinidad(conexion, animalId)).coeficiente,
    },
    ascendencia: await ascendencia(conexion, animalId),
  };
}

/** Número siguiente para un tipo de documento en el año de `fecha`. Cuenta también los retirados (no se reutilizan). */
export async function siguienteNumero(conexion: Conexion, tipo: TipoDocumento, fecha: string): Promise<string> {
  const prefijo = `${PREFIJO[tipo]}-${fecha.slice(0, 4)}-`;
  const [{ ultimo }] = await conexion.consultar<{ ultimo: number | null }>(
    "SELECT max(CAST(substr(numero, ?) AS INTEGER)) AS ultimo FROM certificado WHERE numero LIKE ? || '%'",
    [prefijo.length + 1, prefijo],
  );
  return `${prefijo}${String((ultimo ?? 0) + 1).padStart(4, "0")}`;
}

export interface DatosDocumento {
  animalId: string;
  tipo: TipoDocumento;
  numero: string;
  fecha: string;
  /** Ruta del PDF dentro de la carpeta de datos del programa. */
  archivo: string | null;
}

/** Anota un documento emitido. SUPOSICION: solo el propietario emite documentos (R14 no lo da al operario). */
export async function registrarDocumento(conexion: Conexion, datos: DatosDocumento, contexto: ContextoCambio): Promise<string> {
  exigirPermiso(contexto, "emitir_documento");
  await animalExistente(conexion, datos.animalId);
  const cambios = new Cambios(contexto);
  const id = cambios.insertar("certificado", {
    animal_id: datos.animalId,
    tipo: datos.tipo,
    numero: datos.numero,
    fecha: datos.fecha,
    archivo: datos.archivo,
  });
  await cambios.aplicar(conexion);
  return id;
}

export interface DocumentoEmitido extends DatosDocumento {
  id: string;
  animal: string;
}

export async function listarDocumentos(conexion: Conexion, filtro: { animalId?: string }): Promise<DocumentoEmitido[]> {
  return conexion.consultar<DocumentoEmitido>(
    `SELECT c.id, c.animal_id AS animalId, coalesce(a.nombre, i.valor, '') AS animal, c.tipo, c.numero, c.fecha, c.archivo
     FROM certificado AS c
     JOIN animal AS a ON a.id = c.animal_id
     LEFT JOIN identificador AS i ON i.animal_id = a.id AND i.principal = 1 AND i.eliminado_en IS NULL
     WHERE c.eliminado_en IS NULL AND (? IS NULL OR c.animal_id = ?)
     ORDER BY c.fecha DESC, c.numero DESC`,
    [filtro.animalId ?? null, filtro.animalId ?? null],
  );
}
