// El servicio de fondo (RF-40) y CA-30: sin red el programa funciona completo y nada espera a la red.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../servidor/pruebas/ayudas";
import { animalVacio, guardarAnimal, listarAnimales } from "../datos/repositorios/animales";
import { registrarEventoSalud } from "../datos/repositorios/salud";
import { crearLote } from "../datos/repositorios/lotes";
import { crearEquipo, equipoConFinca, unirYDescargar, vincularYSubir, type EquipoSimulado } from "./equipos-de-prueba";
import { ServicioDeSincronizacion, type EstadoVisible } from "./servicio";

let servidor: ServidorDePrueba;
let abiertos: EquipoSimulado[] = [];
beforeAll(async () => {
  servidor = await crearServidorDePrueba();
});
afterAll(async () => {
  await servidor.cerrar();
});
beforeEach(async () => {
  await servidor.reiniciar();
});
afterEach(() => {
  abiertos.forEach((e) => e.cerrar());
  abiertos = [];
});

/** Un programador de tareas manual: las pruebas deciden cuándo «pasa el tiempo». */
function reloj() {
  const tareas = new Map<number, { tarea: () => void; ms: number }>();
  let siguiente = 1;
  return {
    programar: (tarea: () => void, ms: number) => {
      const id = siguiente++;
      tareas.set(id, { tarea, ms });
      return id;
    },
    cancelar: (id: unknown) => void tareas.delete(id as number),
    pendientes: () => [...tareas.values()].map((t) => t.ms),
    /** Ejecuta las tareas programadas con esa espera. */
    async disparar(ms: number) {
      for (const [id, t] of [...tareas]) {
        if (t.ms === ms) {
          tareas.delete(id);
          t.tarea();
        }
      }
      await new Promise((r) => setTimeout(r, 0));
    },
  };
}

async function equipoVinculado(nombre = "A") {
  const correo = "josias@ejemplo.com";
  const cuentaId = await servidor.crearCuenta(correo);
  await servidor.autorizarCorreo(correo);
  const e = await equipoConFinca({ servidor, cuentaId, correo, nombre });
  abiertos.push(e);
  await vincularYSubir(e);
  return { e, cuentaId, correo };
}
const esperar = async (cond: () => boolean, ms = 2000) => {
  const limite = Date.now() + ms;
  while (!cond() && Date.now() < limite) await new Promise((r) => setTimeout(r, 5));
  expect(cond()).toBe(true);
};

describe("servicio de sincronización en segundo plano", () => {
  it("un equipo sin vincular no llama a la red ni cambia de estado (CA-30)", async () => {
    const equipo = crearEquipo({ servidor, cuentaId: await servidor.crearCuenta("x@ejemplo.com") });
    abiertos.push(equipo);
    const r = reloj();
    const servicio = new ServicioDeSincronizacion(equipo.conexion, equipo.cliente, r);
    await servicio.iniciar();
    await guardarAnimal(equipo.conexion, { ...animalVacio(), nombre: "Luna", fechaNacimiento: "2022-01-01" }, equipo.contexto());
    expect(servicio.obtenerEstado().fase).toBe("sin_vincular");
    expect(equipo.red.llamadas).toEqual([]);
    servicio.detener();
  });

  it("guardar programa un envío unos segundos después; varios guardados seguidos se juntan en uno", async () => {
    const { e } = await equipoVinculado();
    const r = reloj();
    const servicio = new ServicioDeSincronizacion(e.conexion, e.cliente, { ...r, esperaTrasGuardarMs: 3000, intervaloMs: 300_000 });
    await servicio.iniciar();
    await esperar(() => servicio.obtenerEstado().fase === "al_dia");
    const llamadasAntes = e.red.llamadas.length;
    for (const nombre of ["Uno", "Dos", "Tres"]) await guardarAnimal(e.conexion, { ...animalVacio(), nombre, fechaNacimiento: "2022-01-01" }, e.contexto());
    await esperar(() => servicio.obtenerEstado().pendientes > 0);
    expect(r.pendientes().filter((ms) => ms === 3000)).toHaveLength(1);
    expect(e.red.llamadas.length).toBe(llamadasAntes);
    await r.disparar(3000);
    await esperar(() => servicio.obtenerEstado().pendientes === 0 && servicio.obtenerEstado().fase === "al_dia");
    servicio.detener();
  });

  it("sin conexión muestra «sin conexión» con los cambios por enviar, y al volver la red se sincroniza solo", async () => {
    const { e } = await equipoVinculado();
    const r = reloj();
    const servicio = new ServicioDeSincronizacion(e.conexion, e.cliente, r);
    const vistos: EstadoVisible[] = [];
    servicio.suscribir((s) => vistos.push(s));
    await servicio.iniciar();
    await esperar(() => servicio.obtenerEstado().fase === "al_dia");
    e.red.enLinea = false;
    servicio.redCambio(false);
    await guardarAnimal(e.conexion, { ...animalVacio(), nombre: "Sin red", fechaNacimiento: "2022-01-01" }, e.contexto());
    await servicio.sincronizarAhora();
    expect(servicio.obtenerEstado().fase).toBe("sin_conexion");
    expect(servicio.obtenerEstado().pendientes).toBeGreaterThan(0);
    e.red.enLinea = true;
    servicio.redCambio(true);
    await esperar(() => servicio.obtenerEstado().fase === "al_dia" && servicio.obtenerEstado().pendientes === 0);
    expect(servicio.obtenerEstado().ultimaSincronizacion).not.toBeNull();
    expect(vistos.some((v) => v.fase === "sincronizando")).toBe(true);
    servicio.detener();
  });

  it("un equipo retirado de la finca queda en «revocado» y no sigue enviando", async () => {
    const { e, cuentaId, correo } = await equipoVinculado();
    const b = crearEquipo({ servidor, cuentaId, correo, nombre: "B" });
    abiertos.push(b);
    await unirYDescargar(b);
    const dispositivoDeB = (await b.conexion.consultar<{ valor: string }>("SELECT valor FROM sincronizacion_estado WHERE clave = 'dispositivo_id'"))[0].valor;
    const finca = (await e.conexion.consultar<{ valor: string }>("SELECT valor FROM sincronizacion_estado WHERE clave = 'finca_servidor'"))[0].valor;
    await e.red.rpc("revocar_dispositivo", { p_finca_id: finca, p_dispositivo_id: dispositivoDeB });
    const servicio = new ServicioDeSincronizacion(b.conexion, b.cliente, reloj());
    await servicio.iniciar();
    await esperar(() => servicio.obtenerEstado().fase === "revocado");
    servicio.detener();
  });
});

describe("CA-30: sin red el programa abre y funciona completo", () => {
  it("un equipo vinculado sin red registra animales, un tratamiento y lotes sin esperar a nadie; los cambios quedan por enviar", async () => {
    const { e } = await equipoVinculado();
    e.red.enLinea = false;
    const inicio = Date.now();
    const lote = await crearLote(e.conexion, { nombre: "Sin red", descripcion: null }, e.contexto());
    const id = await guardarAnimal(e.conexion, { ...animalVacio(), nombre: "Luna", fechaNacimiento: "2022-01-01", loteId: lote }, e.contexto());
    await registrarEventoSalud(
      e.conexion,
      {
        destino: { animalId: id },
        tipo: "tratamiento",
        producto: "Oxitetraciclina",
        numeroRegistroIca: "ICA-1",
        loteProducto: "L-1",
        dosis: "10 ml",
        via: "intramuscular",
        fechaInicio: "2026-09-10",
        fechaFin: null,
        retiroLecheDias: 5,
        retiroCarneDias: 28,
        aplicador: "Luis",
        veterinario: null,
        condicionCorporal: null,
        proximaFecha: null,
        observaciones: null,
      },
      e.contexto(),
    );
    expect(Date.now() - inicio).toBeLessThan(3000);
    expect((await listarAnimales(e.conexion, { texto: "Luna" })).length).toBe(1);
    const servicio = new ServicioDeSincronizacion(e.conexion, e.cliente, reloj());
    await servicio.iniciar();
    await servicio.sincronizarAhora();
    expect(servicio.obtenerEstado().fase).toBe("sin_conexion");
    expect(servicio.obtenerEstado().pendientes).toBeGreaterThan(0);
    servicio.detener();
  });
});
