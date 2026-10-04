// Aplica las migraciones de servidor/migraciones/ a una base de Postgres (el proyecto de Supabase), en orden y una sola vez cada una.
//
// Por qué existe: la CLI de Supabase (`supabase db push`) espera archivos con marca de tiempo (`20261002120000_nombre.sql`) y estas
// migraciones se llaman `0001_nombre.sql` (las referencian el protocolo, las pruebas y las huellas). Este script las aplica tal como están.
// Detalles del tema: servidor/LEEME.md, sección «Cómo se aplican las migraciones».
//
// Uso (desde la raíz del repositorio; la cadena de conexión NUNCA se escribe en un archivo ni en el chat):
//   export SERVIDOR_DB_URL='<cadena de conexión de la base, del panel de Supabase: Project Settings > Database>'
//   node servidor/aplicar.mjs --ver        muestra qué se aplicaría y no cambia nada
//   node servidor/aplicar.mjs              aplica las pendientes
//
// Cómo recuerda lo aplicado: en un esquema propio `migraciones_servidor` (Supabase no lo expone por la API) guarda el nombre y la huella
// SHA-256 de cada migración aplicada. Si una ya aplicada cambió de contenido, se detiene con error: no se editan migraciones aplicadas,
// se crea una nueva. Cada migración corre en su propia transacción (si falla, no queda a medias) y el script se detiene en la primera que falla.
// Necesita el paquete `pg` (dependencia de desarrollo del repositorio: `npm install`).
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

const soloVer = process.argv.includes("--ver");
const url = process.env.SERVIDOR_DB_URL;
if (!url) {
  console.error("Falta la variable de entorno SERVIDOR_DB_URL (la cadena de conexión de Postgres). Ver servidor/LEEME.md.");
  process.exit(2);
}

const carpeta = new URL("./migraciones/", import.meta.url);
const migraciones = readdirSync(carpeta)
  .filter((nombre) => /^\d{4}_.+\.sql$/.test(nombre))
  .sort()
  .map((archivo) => {
    const sql = readFileSync(new URL(archivo, carpeta), "utf8");
    return { archivo, sql, huella: createHash("sha256").update(sql).digest("hex") };
  });

const registradas = JSON.parse(readFileSync(new URL("huellas.json", carpeta), "utf8"));
for (const m of migraciones) {
  if (registradas[m.archivo] !== m.huella) {
    console.error(`${m.archivo} no coincide con servidor/migraciones/huellas.json. Corre: node servidor/regenerar-huellas.mjs (solo si esa migración aún no se aplicó en ningún servidor).`);
    process.exit(2);
  }
}

const { default: pg } = await import("pg");
const cliente = new pg.Client({ connectionString: url });
try {
  await cliente.connect();
} catch (error) {
  // El mensaje de `pg` no incluye la contraseña, pero por prudencia solo se muestra el código.
  console.error(`No pude conectarme a la base (${error?.code ?? "error de conexión"}). Revisa SERVIDOR_DB_URL.`);
  process.exit(1);
}

try {
  await cliente.query(`create schema if not exists migraciones_servidor`);
  await cliente.query(`create table if not exists migraciones_servidor.aplicada (
    nombre text primary key, huella text not null check (huella ~ '^[0-9a-f]{64}$'), aplicada_en timestamptz not null default now())`);
  const aplicadas = new Map((await cliente.query(`select nombre, huella from migraciones_servidor.aplicada`)).rows.map((f) => [f.nombre, f.huella]));

  for (const nombre of aplicadas.keys()) {
    if (!migraciones.some((m) => m.archivo === nombre)) throw new Error(`La base tiene aplicada ${nombre}, que ya no está en servidor/migraciones/.`);
  }
  let pendientes = 0;
  for (const m of migraciones) {
    if (aplicadas.has(m.archivo)) {
      if (aplicadas.get(m.archivo) !== m.huella) {
        throw new Error(`${m.archivo} ya se aplicó con otro contenido. No se editan migraciones aplicadas: crea una nueva con el número siguiente.`);
      }
      console.log(`  ya aplicada   ${m.archivo}`);
      continue;
    }
    pendientes++;
    if (soloVer) {
      console.log(`  se aplicaría  ${m.archivo}`);
      continue;
    }
    await cliente.query("begin");
    try {
      await cliente.query(m.sql);
      await cliente.query(`insert into migraciones_servidor.aplicada (nombre, huella) values ($1, $2)`, [m.archivo, m.huella]);
      await cliente.query("commit");
    } catch (error) {
      await cliente.query("rollback").catch(() => undefined);
      throw new Error(`La migración ${m.archivo} falló y se deshizo: ${error.message}`);
    }
    console.log(`  aplicada      ${m.archivo}`);
  }
  console.log(pendientes === 0 ? "Todo está al día." : soloVer ? `${pendientes} pendiente(s).` : `Se aplicaron ${pendientes} migración(es).`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await cliente.end().catch(() => undefined);
}
