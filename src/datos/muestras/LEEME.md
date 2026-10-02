# Muestras de datos para las pruebas

## `respaldo-0.1.0-ejemplo.json`

Copia de respaldo (el `datos.json` de RF-43) que hizo **el código de la versión 0.1.0**, etiqueta `v0.1.0`, con
los datos de ejemplo de `npm run semillas` y algunos casos más: un ancestro registrado solo para la genealogía,
un animal vendido, uno muerto, un operario con PIN (solo su hash) y un certificado interno emitido.
No tiene datos reales del aprisco.

La usa `src/datos/actualizacion.test.ts` para CA-33: instalar una versión nueva sobre la 0.1.0 conserva todos los
datos. No se edita a mano. Se generó así, en una copia de trabajo de la etiqueta `v0.1.0`
(`git worktree add ../v010 v0.1.0`, con `node_modules` enlazado), con `npx tsx generar-respaldo.ts salida.json`:

```ts
// Genera, con el código de la versión 0.1.0, una copia de respaldo de los datos de ejemplo (para CA-33):
// los datos de `npm run semillas` más un ancestro registrado solo para la genealogía, un animal vendido, uno
// muerto, un operario con PIN y un certificado interno emitido, para cubrir todas las tablas y columnas.
import { writeFileSync } from "node:fs";
import { crearBaseDePrueba } from "./src/datos/conexion-memoria";
import { exportarRespaldo } from "./src/datos/respaldo";
import { animalVacio, guardarAnimal, listarAnimales, obtenerAnimal } from "./src/datos/repositorios/animales";
import { registrarDocumento } from "./src/datos/repositorios/documentos";
import { crearUsuario } from "./src/datos/repositorios/usuarios";
import { asegurarFinca, cargarDatosDeEjemplo } from "./scripts/datos-de-ejemplo";

const HOY = "2026-10-01";
const conexion = crearBaseDePrueba();
const r = await cargarDatosDeEjemplo(conexion, HOY);
const { contexto } = await asegurarFinca(conexion);
const ctx = () => ({ ...contexto(), marcaTiempo: "2026-10-01T12:00:00.000Z" });

const abuelo = await guardarAnimal(conexion, {
  ...animalVacio(), nombre: "Abuelo de pajilla", sexo: "macho", enHato: false, fechaNacimiento: "2018-03-01",
  identificadores: [{ tipo: "registro_asociacion", valor: "ANCO-GEN-01", fecha: null, vigente: true, principal: true }],
}, ctx());
await guardarAnimal(conexion, {
  ...animalVacio(), nombre: "Nieta de prueba", sexo: "hembra", fechaNacimiento: "2025-01-15", padreId: abuelo, padreSinVerificar: true,
  identificadores: [{ tipo: "arete", valor: "CA33-01", fecha: "2025-01-15", vigente: true, principal: true }],
}, ctx());
const [vendida, muerta] = (await listarAnimales(conexion, { texto: "EJ-0" })).filter((a) => a.sexo === "hembra").slice(-2);
for (const [a, estado] of [[vendida, "vendido"], [muerta, "muerto"]] as const) {
  const ficha = (await obtenerAnimal(conexion, a.id))!;
  await guardarAnimal(conexion, { ...ficha, estado }, ctx(), a.id);
}
await crearUsuario(conexion, { nombre: "Operario de ejemplo", rol: "operario", contacto: null }, "1234", ctx());
const [cria] = await listarAnimales(conexion, { texto: "EJ-10" });
await registrarDocumento(conexion, { animalId: cria.id, tipo: "propio", numero: "CI-2026-0001", fecha: HOY, archivo: "documentos/CI-2026-0001.pdf" }, ctx());

const respaldo = await exportarRespaldo(conexion, ctx());
writeFileSync(process.argv[2], JSON.stringify(respaldo) + "\n");
console.log("animales de ejemplo:", r.creados, "| tablas:", Object.entries(respaldo.tablas).map(([t, f]) => `${t}=${f.length}`).join(" "));
```
