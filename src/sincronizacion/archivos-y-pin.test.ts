// Archivos que viajan con las filas (sección 9 del diseño) y el PIN, que es de cada equipo (S-90).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../servidor/pruebas/ayudas";
import { animalVacio, guardarAnimal } from "../datos/repositorios/animales";
import { comprobarPin, crearUsuario, definirPinDeEsteEquipo, listarUsuarios } from "../datos/repositorios/usuarios";
import { leerCola } from "../datos/sincronizacion/ayudas-pruebas";
import { sincronizarArchivos, rutasMencionadas, tipoDeArchivo, type AlmacenDeArchivos } from "./archivos";
import { crearEquipo, equipoConFinca, unirYDescargar, vincularYSubir, type EquipoSimulado } from "./equipos-de-prueba";
import { leerVinculo } from "../datos/sincronizacion/estado";

let servidor: ServidorDePrueba;
let abiertos: EquipoSimulado[] = [];
const archivosRemotos = new Map<string, Uint8Array>();
beforeAll(async () => {
  servidor = await crearServidorDePrueba();
});
afterAll(async () => {
  await servidor.cerrar();
});
beforeEach(async () => {
  await servidor.reiniciar();
  archivosRemotos.clear();
});
afterEach(() => {
  abiertos.forEach((e) => e.cerrar());
  abiertos = [];
});

function almacen(): AlmacenDeArchivos & { archivos: Map<string, Uint8Array> } {
  const archivos = new Map<string, Uint8Array>();
  return {
    archivos,
    async leer(ruta) {
      return archivos.get(ruta) ?? null;
    },
    async escribir(ruta, contenido) {
      if (archivos.has(ruta)) return false;
      archivos.set(ruta, contenido);
      return true;
    },
  };
}

async function dosEquipos() {
  const correo = "josias@ejemplo.com";
  const cuentaId = await servidor.crearCuenta(correo);
  await servidor.autorizarCorreo(correo);
  const a = await equipoConFinca({ servidor, cuentaId, correo, nombre: "A", archivos: archivosRemotos });
  abiertos.push(a);
  await vincularYSubir(a);
  const b = crearEquipo({ servidor, cuentaId, correo, nombre: "B", archivos: archivosRemotos });
  abiertos.push(b);
  await unirYDescargar(b);
  return { a, b };
}

describe("archivos que mencionan las filas", () => {
  it("tipoDeArchivo y rutasMencionadas: solo fotos y documentos con nombres seguros, también los adjuntos de una compra", async () => {
    expect(tipoDeArchivo("fotos/x.JPG")).toBe("image/jpeg");
    expect(tipoDeArchivo("documentos/x.pdf")).toBe("application/pdf");
    expect(tipoDeArchivo("documentos/x.zzz")).toBe("application/octet-stream");
    const { a } = await dosEquipos();
    await guardarAnimal(a.conexion, { ...animalVacio(), nombre: "Con foto", fechaNacimiento: "2022-01-01", foto: "fotos/abc-1.jpg" }, a.contexto());
    await a.conexion.ejecutarLote([{ sql: "UPDATE animal SET foto = ? WHERE nombre = 'Con foto'", parametros: ["fotos/abc-1.jpg"] }]);
    await guardarAnimal(a.conexion, { ...animalVacio(), nombre: "Foto rara", fechaNacimiento: "2022-01-01" }, a.contexto());
    await a.conexion.ejecutarLote([{ sql: "UPDATE animal SET foto = ? WHERE nombre = 'Foto rara'", parametros: ["../../etc/passwd"] }]);
    expect(await rutasMencionadas(a.conexion)).toEqual(["fotos/abc-1.jpg"]);
  });

  it("sube lo que este equipo tiene, el otro lo baja, y una segunda vuelta no repite nada", async () => {
    const { a, b } = await dosEquipos();
    const id = await guardarAnimal(a.conexion, { ...animalVacio(), nombre: "Luna", fechaNacimiento: "2022-01-01", foto: "fotos/luna-1.jpg" }, a.contexto());
    const almacenA = almacen();
    almacenA.archivos.set("fotos/luna-1.jpg", new Uint8Array([1, 2, 3, 4]));
    const fincaA = (await leerVinculo(a.conexion))!.fincaId;
    expect(id).toBeTruthy();
    const subida = await sincronizarArchivos(a.conexion, a.red, almacenA, fincaA);
    expect(subida).toEqual({ subidos: 1, bajados: 0, pendientes: 0 });
    expect(await sincronizarArchivos(a.conexion, a.red, almacenA, fincaA)).toEqual({ subidos: 0, bajados: 0, pendientes: 0 });

    // El otro equipo recibe la fila con la foto y baja el archivo.
    await a.cliente.sincronizar();
    await b.cliente.sincronizar();
    const almacenB = almacen();
    const bajada = await sincronizarArchivos(b.conexion, b.red, almacenB, fincaA);
    expect(bajada).toEqual({ subidos: 0, bajados: 1, pendientes: 0 });
    expect([...almacenB.archivos.get("fotos/luna-1.jpg")!]).toEqual([1, 2, 3, 4]);
  });

  it("sin red los archivos quedan pendientes y se reintentan sin romper nada", async () => {
    const { a } = await dosEquipos();
    const id = await guardarAnimal(a.conexion, { ...animalVacio(), nombre: "Luna", fechaNacimiento: "2022-01-01", foto: "fotos/sinred.jpg" } as never, a.contexto());
    expect(id).toBeTruthy();
    const almacenA = almacen();
    almacenA.archivos.set("fotos/sinred.jpg", new Uint8Array([9]));
    const fincaA = (await leerVinculo(a.conexion))!.fincaId;
    a.red.enLinea = false;
    const sinRed = await sincronizarArchivos(a.conexion, a.red, almacenA, fincaA);
    expect(sinRed.subidos).toBe(0);
    expect(sinRed.pendientes).toBeGreaterThan(0);
    a.red.enLinea = true;
    expect(await sincronizarArchivos(a.conexion, a.red, almacenA, fincaA)).toEqual({ subidos: 1, bajados: 0, pendientes: 0 });
  });
});

describe("el PIN es de cada equipo (S-90)", () => {
  it("un usuario creado con PIN en un equipo llega al otro sin PIN y pendiente; ahí define el suyo y nada de eso viaja", async () => {
    const { a, b } = await dosEquipos();
    const luis = await crearUsuario(a.conexion, { nombre: "Luis", rol: "operario", contacto: null }, "482913", a.contexto());
    await a.cliente.sincronizar();
    await b.cliente.sincronizar();

    const [enB] = (await listarUsuarios(b.conexion)).filter((u) => u.id === luis);
    expect(enB).toMatchObject({ nombre: "Luis", rol: "operario", tienePin: false, pinPendiente: true });
    // Mientras no defina su PIN, nadie entra como Luis en el equipo B (ni sin PIN ni con el de A).
    expect(await comprobarPin(b.conexion, luis, "")).toBe(false);
    expect(await comprobarPin(b.conexion, luis, "482913")).toBe(false);
    // El PIN del servidor: nada de la columna `pin_hash` ni `pin_pendiente` existe allá.
    const delServidor = await servidor.sql<{ campos: Record<string, unknown> }>("select campos from public.registro where entidad = 'usuario' and registro_id = $1", [luis]);
    expect(Object.keys(delServidor[0].campos)).not.toContain("pin_hash");
    expect(Object.keys(delServidor[0].campos)).not.toContain("pin_pendiente");
    expect(JSON.stringify(delServidor)).not.toMatch(/pbkdf2/);

    const colaAntes = (await leerCola(b.conexion)).length;
    await definirPinDeEsteEquipo(b.conexion, luis, "738291", "2026-10-02T12:00:00.000Z");
    expect(await comprobarPin(b.conexion, luis, "738291")).toBe(true);
    expect(await comprobarPin(b.conexion, luis, "482913")).toBe(false);
    // Definir el PIN no deja nada para enviar y no cambia el PIN de A.
    expect((await leerCola(b.conexion)).length).toBe(colaAntes);
    await b.cliente.sincronizar();
    await a.cliente.sincronizar();
    expect(await comprobarPin(a.conexion, luis, "482913")).toBe(true);
    expect((await listarUsuarios(a.conexion)).find((u) => u.id === luis)?.pinPendiente).toBe(false);
  });

  it("definir el PIN exige un PIN válido y que esté pendiente", async () => {
    const { a, b } = await dosEquipos();
    const luis = await crearUsuario(a.conexion, { nombre: "Luis", rol: "operario", contacto: null }, null, a.contexto());
    await a.cliente.sincronizar();
    await b.cliente.sincronizar();
    await expect(definirPinDeEsteEquipo(b.conexion, luis, "12", "2026-10-02T12:00:00.000Z")).rejects.toMatchObject({ motivos: [{ codigo: "pin_invalido" }] });
    await definirPinDeEsteEquipo(b.conexion, luis, "738291", "2026-10-02T12:00:00.000Z");
    await expect(definirPinDeEsteEquipo(b.conexion, luis, "111111", "2026-10-02T12:00:00.000Z")).rejects.toMatchObject({ motivos: [{ codigo: "sin_permiso" }] });
  });
});
