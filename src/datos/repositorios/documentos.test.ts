// Repositorio de documentos: datos del certificado interno (R12) y del expediente (R13, CA-05) tomados de la base,
// numeración y registro de cada documento emitido en la tabla certificado.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cargarDatosDeEjemplo } from "../../../scripts/datos-de-ejemplo";
import { armarExpediente } from "../../dominio/expediente";
import { OPERARIO, PROPIETARIO } from "../ayudas-pruebas";
import { crearBaseDePrueba, type ConexionMemoria } from "../conexion-memoria";
import { ErrorDeRegistro } from "../errores";
import { listarAnimales } from "./animales";
import { datosCertificado, datosExpediente, listarDocumentos, registrarDocumento, siguienteNumero } from "./documentos";

let db: ConexionMemoria;
beforeEach(async () => {
  db = crearBaseDePrueba();
  await cargarDatosDeEjemplo(db, "2026-09-15");
});
afterEach(() => db.cerrar());

const id = async (arete: string) => (await listarAnimales(db, { texto: arete, incluirSoloGenealogia: true }))[0].id;

describe("CA-05 con la base: expediente de Estrella (EJ-10)", () => {
  it("trae todos los campos y la ascendencia hasta abuelos con su registro de asociación", async () => {
    const entrada = await datosExpediente(db, await id("EJ-10"));
    const e = armarExpediente(entrada);
    expect(e.datos).toMatchObject({
      nombre: "Estrella",
      crg: null,
      // SUPOSICION: criador y propietario = el propietario de la finca; criadero = el de Ajustes → Finca.
      criador: "Propietario de ejemplo",
      propietario: "Propietario de ejemplo",
      criadero: "Criadero de ejemplo",
      sexo: "hembra",
      composicion: [{ raza: "Saanen", fraccion: 1 }],
      libro: "Pureza por pedigrí",
      formaConcepcion: "monta_natural",
      marcas: [{ tipo: "arete", valor: "EJ-10" }],
      color: "Blanca con estrella en la frente",
      nacimiento: "2021-02-22",
    });
    expect([e.datos.padre, e.datos.madre, e.datos.abueloPaterno, e.datos.abuelaPaterna, e.datos.abueloMaterno, e.datos.abuelaMaterna]).toEqual([
      { nombre: "Bruno", crg: null, sinVerificar: false },
      { nombre: "Bella", crg: null, sinVerificar: false },
      { nombre: "Zeus", crg: "EJEMPLO-0001", sinVerificar: false },
      { nombre: "Abril", crg: null, sinVerificar: false },
      { nombre: "Zeus", crg: "EJEMPLO-0001", sinVerificar: false },
      { nombre: "Abril", crg: null, sinVerificar: false },
    ]);
    expect(e.faltantes).toEqual([]);
  });

  it("un fundador sin padres tiene la ascendencia como faltante; un «sin verificar» da aviso", async () => {
    expect(armarExpediente(await datosExpediente(db, await id("EJ-01"))).faltantes).toEqual([
      "padre",
      "madre",
      "abueloPaterno",
      "abuelaPaterna",
      "abueloMaterno",
      "abuelaMaterna",
    ]);
    const gema = armarExpediente(await datosExpediente(db, await id("EJ-12")));
    expect(gema.avisos).toEqual([{ codigo: "ancestro_sin_verificar", campo: "padre" }]);
  });
});

describe("R12: datos del certificado interno", () => {
  it("trae la finca, el animal con todos sus identificadores, la consanguinidad y tres generaciones", async () => {
    const d = await datosCertificado(db, await id("EJ-10"), PROPIETARIO);
    expect(d.finca).toEqual({ nombre: "Aprisco de ejemplo", criadero: "Criadero de ejemplo", municipio: null });
    expect(d.animal).toMatchObject({ nombre: "Estrella", sexo: "hembra", libro: "Pureza por pedigrí" });
    expect(d.animal.consanguinidad).toBeCloseTo(0.25, 10);
    expect(d.ascendencia.abueloPaterno).toEqual({ nombre: "Zeus", crg: "EJEMPLO-0001", sinVerificar: false });
    expect(d.numero).toMatch(/^CI-\d{4}-0001$/);
  });
});

describe("registro de documentos emitidos (tabla certificado)", () => {
  it("numera por tipo y año, y guarda cada emisión", async () => {
    const estrella = await id("EJ-10");
    expect(await siguienteNumero(db, "propio", "2026-10-01")).toBe("CI-2026-0001");
    await registrarDocumento(db, { animalId: estrella, tipo: "propio", numero: "CI-2026-0001", fecha: "2026-10-01", archivo: "documentos/CI-2026-0001.pdf" }, PROPIETARIO);
    expect(await siguienteNumero(db, "propio", "2026-10-02")).toBe("CI-2026-0002");
    expect(await siguienteNumero(db, "asociacion", "2026-10-02")).toBe("EX-2026-0001");
    expect(await siguienteNumero(db, "propio", "2027-01-02")).toBe("CI-2027-0001");
    const lista = await listarDocumentos(db, {});
    expect(lista.map((d) => [d.animal, d.tipo, d.numero, d.archivo])).toEqual([["Estrella", "propio", "CI-2026-0001", "documentos/CI-2026-0001.pdf"]]);
  });

  it("solo el propietario emite documentos (SUPOSICION sobre R14)", async () => {
    await expect(
      registrarDocumento(db, { animalId: await id("EJ-10"), tipo: "propio", numero: "CI-2026-0001", fecha: "2026-10-01", archivo: null }, OPERARIO),
    ).rejects.toThrow(ErrorDeRegistro);
  });
});
