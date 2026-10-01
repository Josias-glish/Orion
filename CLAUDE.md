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

> Se activan en la Etapa 1, cuando exista el proyecto. Se verificarán y corregirán aquí si cambian.

| Para qué | Comando |
| --- | --- |
| Instalar dependencias (una vez, o tras `git pull` si cambió `package.json`) | `npm install` |
| Abrir el programa en modo desarrollo | `npm run tauri dev` |
| Ejecutar todas las pruebas automáticas | `npm test` |
| Cargar los datos de ejemplo (solo desarrollo) | `npm run semillas` |
| Construir el instalador en el propio equipo | `npm run tauri build` |
| Publicar instaladores desde GitHub Actions | `git tag v0.1.0` y luego `git push origin v0.1.0` |

## Decisiones

Formato: número, fecha, etapa, decisión y motivo. Estado: **Vigente**, **Propuesta** (espera aprobación del usuario) o **Reemplazada por D-xxx**.

- **D-001** · 2026-10-01 · Etapa 0 · Vigente. La especificación se guarda sin cambios en `docs/ESPECIFICACION.md`.
- **D-002** · 2026-10-01 · Etapa 0 · Vigente. Estilos con CSS propio y variables CSS, sin Tailwind. Motivo: lo mantendrán dos personas que están aprendiendo; CSS simple no añade otra herramienta ni otro vocabulario.
- **D-003** · 2026-10-01 · Etapa 0 · Vigente. PDF con `pdfmake` (MIT, versión 0.3.11, publicada en junio de 2026), no con `pdf-lib`. Motivo: `pdf-lib` no publica versiones desde noviembre de 2021 (1.17.1); `pdfmake` está mantenida, funciona sin red y describe tablas y columnas de forma declarativa, que es lo que necesitan el certificado y el expediente. Se verificará en la etapa de documentos.
- **D-004** · 2026-10-01 · Etapa 0 · **Propuesta**. Transacciones: el plugin SQL usa un *pool* de conexiones y no garantiza que `BEGIN` y `COMMIT` enviados por separado caigan en la misma conexión (issue abierto `tauri-apps/plugins-workspace#886`). Se propone un comando Rust pequeño que ejecute un lote de sentencias dentro de una transacción usando el mismo pool del plugin. Espera aprobación.
- **D-005** · 2026-10-01 · Etapa 0 · Vigente. Cada etapa agrega su propia migración numerada en `src/datos/migraciones/`; Rust las incluye con `include_str!` y las pruebas con SQLite en memoria leen los mismos archivos.
- **D-006** · 2026-10-01 · Etapa 0 · Vigente. Versiones de referencia verificadas el 2026-10-01: Node.js 24 LTS; Rust 1.90 o superior (mínimo que exige el plugin SQL); `@tauri-apps/cli` 2.12; `@tauri-apps/plugin-sql` 2.5; `tauri-action@v1`.
