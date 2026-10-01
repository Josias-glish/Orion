# Registro Caprino — guía para Claude

## Resumen

1. «Registro Caprino» (nombre provisional) es un programa de escritorio para Windows 10/11 y macOS.
2. Sirve a criadores de cabras lecheras en Colombia; el primer usuario es el Aprisco El Paraíso.
3. Lleva sin internet la genealogía, la reproducción, la leche, los pesajes y la salud de cada animal.
4. Exporta el expediente que pide ANCO (PDF y CSV) y un certificado interno que no imita al CRG.
5. Guarda los campos del Registro de Tratamientos del ICA (Res. 20148 de 2016) y avisa los retiros de leche y carne.
6. Stack: Tauri 2, React, TypeScript, Vite y SQLite local (plugin SQL de Tauri) con migraciones `.sql` numeradas.
7. Las reglas del dominio son funciones puras en `src/dominio`, probadas con Vitest.
8. Los textos de la interfaz viven solo en `src/textos/es.ts`; el código usa los nombres del dominio en español.
9. El programa no hace llamadas de red, no borra filas (borrado lógico) y registra cada cambio en `historial_cambios`.
10. Se construye por etapas autorizadas por el usuario; los instaladores salen de GitHub Actions con `tauri-action`.

## Regla principal

**Lee `docs/ESPECIFICACION.md` antes de empezar cada etapa.** Es la fuente de verdad. Lo que no esté definido ahí se anota en `docs/SUPOSICIONES.md` y en el código con el marcador `SUPOSICION:`, y se le avisa al usuario.

Otras reglas de trabajo (resumen de la especificación, secciones 1 y 13):

- No avances de etapa sin que el usuario lo pida («Etapa N»).
- Al cerrar una etapa: resumen de diez líneas, pasos para probar, pruebas ejecutadas con su resultado real y un commit claro.
- Verifica comandos, versiones y APIs en la documentación oficial vigente (Tauri 2, SQLite, cada librería). No de memoria.
- No edites una migración ya aplicada: crea una nueva con el número siguiente.
- No guardes el PIN en texto plano. No hagas llamadas de red. No agregues funciones fuera de la sección 4.
- El usuario es estudiante: dale comandos exactos y dile qué debería ver. Responde en español.

## Comandos

| Para qué | Comando |
| --- | --- |
| Instalar dependencias (una vez, o tras `git pull` si cambió `package.json`) | `npm install` |
| Abrir el programa en modo desarrollo (usa la base `registro-caprino-desarrollo.db`) | `npm run tauri dev` |
| Ejecutar todas las pruebas automáticas (Vitest) | `npm test` |
| Revisar tipos de TypeScript | `npm run tipos` |
| Cargar los datos de ejemplo (solo desarrollo; llega en una etapa posterior) | `npm run semillas` |
| Construir el instalador en el propio equipo | `npm run tauri build` |
| Publicar instaladores (borrador de release) desde GitHub Actions | subir la versión en `src-tauri/tauri.conf.json` y `package.json`, luego `git tag v0.1.0` y `git push origin v0.1.0` |
| Prueba de extremo a extremo en Linux (ver `docs/PRUEBA_TECNICA.md`) | `xvfb-run -a node pruebas-e2e/prueba-tecnica.mjs <binario> <carpeta>` |

## Mapa del código

- `src/dominio/`: funciones puras (genealogía, fechas, UUID). Sin React ni base de datos.
- `src/datos/`: `conexion.ts` (interfaz), `conexion-tauri.ts` (plugin SQL), `conexion-memoria.ts` (node:sqlite, solo pruebas), `historial.ts`, `repositorios/`, `migraciones/`.
- `src/datos/migraciones/`: `NNNN_nombre.sql` + `huellas.json` (SHA-256). Una migración nueva necesita: el archivo, su huella y su registro en `src-tauri/src/lib.rs`; las pruebas fallan si falta algo.
- `src/pantallas/`, `src/componentes/`, `src/textos/es.ts` (todos los textos), `src/estilos.css`.
- Parámetros SQL con `?` (valen en sqlx y en node:sqlite). Nunca enviar `BEGIN`/`COMMIT` por el plugin (ver D-004).

## Decisiones

Formato: número, fecha, etapa, decisión y motivo. Estado: **Vigente**, **Propuesta** (espera aprobación del usuario) o **Reemplazada por D-xxx**.

- **D-001** · 2026-10-01 · Etapa 0 · Vigente. La especificación se guarda sin cambios en `docs/ESPECIFICACION.md`.
- **D-002** · 2026-10-01 · Etapa 0 · Vigente. Estilos con CSS propio y variables CSS, sin Tailwind. Motivo: lo mantendrán dos personas que están aprendiendo; CSS simple no añade otra herramienta ni otro vocabulario.
- **D-003** · 2026-10-01 · Etapa 0 · Vigente. PDF con `pdfmake` (MIT, versión 0.3.11, publicada en junio de 2026), no con `pdf-lib`. Motivo: `pdf-lib` no publica versiones desde noviembre de 2021 (1.17.1); `pdfmake` está mantenida, funciona sin red y describe tablas y columnas de forma declarativa, que es lo que necesitan el certificado y el expediente. Se verificará en la etapa de documentos.
- **D-004** · 2026-10-01 · Etapa 0 · **Propuesta**. Transacciones: el plugin SQL usa un *pool* de conexiones y no garantiza que `BEGIN` y `COMMIT` enviados por separado caigan en la misma conexión (issue abierto `tauri-apps/plugins-workspace#886`). Confirmado en la Etapa 1: 19 de 20 rondas fallaron (`pruebas-e2e/transacciones.mjs`). Se propone un comando Rust pequeño que ejecute un lote de sentencias dentro de una transacción usando el mismo pool del plugin. Espera aprobación; mientras tanto no se envía `BEGIN` por el plugin.
- **D-005** · 2026-10-01 · Etapa 0 · Vigente. Cada etapa agrega su propia migración numerada en `src/datos/migraciones/`; Rust las incluye con `include_str!` y las pruebas con SQLite en memoria leen los mismos archivos.
- **D-006** · 2026-10-01 · Etapa 0 · Vigente. Versiones de referencia verificadas el 2026-10-01: Node.js 24 LTS; Rust 1.90 o superior (mínimo que exige el plugin SQL); `@tauri-apps/cli` 2.12; `@tauri-apps/plugin-sql` 2.5; `tauri-action@v1`.
- **D-007** · 2026-10-01 · Etapa 1 · Vigente. Dos bases de datos: `registro-caprino.db` (programa instalado) y `registro-caprino-desarrollo.db` (`npm run tauri dev`). Rust registra las migraciones para ambas; la interfaz elige con `import.meta.env.DEV`. Motivo: las pruebas y las semillas nunca tocan datos reales.
- **D-008** · 2026-10-01 · Etapa 1 · Vigente. Pruebas de repositorios con `node:sqlite` (incluido en Node 24; sin compilar nada nativo). Ojo: Node trae SQLite 3.53 y el plugin (sqlx) 3.46; no usar funciones de SQLite posteriores a 3.46.
- **D-009** · 2026-10-01 · Etapa 1 · Vigente. Integridad en la base: tablas `STRICT`, `CHECK` de formatos (fechas, marcas de tiempo UTC, enumerados), disparadores que impiden `DELETE` en todas las tablas y cualquier cambio en `historial_cambios`. En los `CHECK` se usa `IS` (no `=`) para que un `NULL` no deje pasar valores inválidos.
- **D-010** · 2026-10-01 · Etapa 1 · Vigente. Migraciones protegidas: `huellas.json` con SHA-256 de cada archivo y `.gitattributes` con `eol=lf` (sqlx guarda una suma de cada migración; un cambio de saltos de línea en Windows impediría arrancar).
- **D-011** · 2026-10-01 · Etapa 1 · Vigente. `Database.load` se llama una sola vez (`abrirConexionTauri` memoriza la promesa): cada llamada crea un pool nuevo y reemplaza al anterior.
- **D-012** · 2026-10-01 · Etapa 1 · Vigente. macOS con firma *ad hoc* (`bundle.macOS.signingIdentity: "-"`), como recomienda la guía de Tauri cuando no hay certificado de Apple: evita que un Mac con chip Apple diga «está dañado». No es una firma con certificado y las advertencias de Gatekeeper siguen (coherente con «sin firma de código» del MVP).
- **D-013** · 2026-10-01 · Etapa 1 · Vigente. Instaladores en español (WiX `es-ES`, NSIS `Spanish`); el `.exe` instala para el usuario actual sin pedir administrador.
- **D-014** · 2026-10-01 · Etapa 1 · Vigente. CSP estricta sin orígenes externos (`default-src 'self'`, `connect-src ipc:`): la ventana no puede hacer llamadas de red (sección 10).
- **D-015** · 2026-10-01 · Etapa 1 · Vigente. Navegación con estado de React, sin librería de rutas; conexión compartida por contexto (`ConexionContexto`).
- **D-016** · 2026-10-01 · Etapa 1 · Vigente. `animal.lote_id` se agregará con `ALTER TABLE ... ADD COLUMN ... REFERENCES lote (id)` en la etapa que cree `lote`. `historial_cambios.usuario_id` no tiene clave foránea (auditoría).
- **D-017** · 2026-10-01 · Etapa 1 · Vigente. GitHub Actions: `pruebas.yml` (Linux, Windows y macOS en cada envío) y `instaladores.yml` (llama a las pruebas; en PR sube los instaladores como artifacts; con etiqueta `v*` o a mano crea borrador de release y exige que la etiqueta coincida con la versión).
- **D-018** · 2026-10-01 · Etapa 1 · Vigente. El ícono provisional es un monograma «RC» (`recursos/icono.png`); los tamaños se generan con `npx tauri icon recursos/icono.png`.
