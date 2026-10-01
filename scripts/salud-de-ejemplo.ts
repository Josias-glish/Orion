// Datos ficticios de la etapa 4 (sección 12): un tratamiento con retiro vigente, una vacuna al lote de ordeño con su
// próxima fecha, una desparasitación vencida y la condición corporal. Solo para desarrollo; fechas contadas desde `hoy`.
// Los productos y números ICA son de ejemplo: no corresponden a productos reales.
import { sumarDias } from "../src/dominio/fechas";
import type { DatosEventoSalud } from "../src/dominio/salud";
import type { Conexion, ContextoCambio } from "../src/datos/conexion";
import { listarLotes } from "../src/datos/repositorios/lotes";
import { registrarEventoSalud, type DestinoSalud } from "../src/datos/repositorios/salud";

const evento = (datos: Partial<DatosEventoSalud> & Pick<DatosEventoSalud, "tipo" | "fechaInicio">): DatosEventoSalud => ({
  producto: null,
  numeroRegistroIca: null,
  loteProducto: null,
  dosis: null,
  via: null,
  fechaFin: null,
  retiroLecheDias: null,
  retiroCarneDias: null,
  aplicador: "Propietario de ejemplo",
  veterinario: null,
  condicionCorporal: null,
  proximaFecha: null,
  observaciones: "Dato de ejemplo (npm run semillas)",
  ...datos,
});

export async function cargarSaludDeEjemplo(conexion: Conexion, ids: Map<string, string>, contexto: () => ContextoCambio, hoy: string) {
  const atras = (dias: number) => sumarDias(hoy, -dias);
  const lotes = new Map((await listarLotes(conexion)).map((l) => [l.nombre, l.id]));
  const registrar = (destino: DestinoSalud, datos: DatosEventoSalud) => registrarEventoSalud(conexion, { destino, ...datos }, contexto());

  // Flujo 3: tratamiento de Bella (en lactancia) con retiro de leche vigente hasta dentro de 4 días.
  await registrar(
    { animalId: ids.get("EJ-07")! },
    evento({
      tipo: "tratamiento",
      producto: "Antibiótico intramamario (ejemplo)",
      numeroRegistroIca: "EJEMPLO-ICA-0001",
      loteProducto: "L-EJ-01",
      dosis: "1 jeringa por medio",
      via: "Intramamaria",
      fechaInicio: atras(2),
      fechaFin: atras(1),
      retiroLecheDias: 5,
      retiroCarneDias: 7,
      veterinario: "Veterinario de ejemplo",
    }),
  );
  // RF-22: vacuna a todo el lote de ordeño, con refuerzo en 10 días (aparece en el calendario y en el Inicio).
  await registrar(
    { loteId: lotes.get("Ordeño")! },
    evento({
      tipo: "vacuna",
      producto: "Vacuna clostridial (ejemplo)",
      numeroRegistroIca: "EJEMPLO-ICA-0002",
      loteProducto: "L-EJ-02",
      dosis: "2 ml",
      via: "Subcutánea",
      fechaInicio: atras(170),
      proximaFecha: sumarDias(hoy, 10),
    }),
  );
  // Desparasitación de los machos: la próxima fecha ya venció hace 5 días; su retiro de carne ya terminó.
  await registrar(
    { loteId: lotes.get("Machos")! },
    evento({
      tipo: "desparasitacion",
      producto: "Antiparasitario oral (ejemplo)",
      numeroRegistroIca: "EJEMPLO-ICA-0003",
      dosis: "10 ml",
      via: "Oral",
      fechaInicio: atras(95),
      retiroCarneDias: 14,
      proximaFecha: atras(5),
    }),
  );
  // RF-25: condición corporal.
  for (const [arete, valor] of [
    ["EJ-02", 3],
    ["EJ-07", 2.5],
    ["EJ-09", 3.5],
  ] as const) {
    await registrar({ animalId: ids.get(arete)! }, evento({ tipo: "condicion_corporal", fechaInicio: atras(10), condicionCorporal: valor }));
  }
}
