# Etapa 10 — estado al pausar (2026-10-02, noche)

Trabajo en pausa a pedido de Josias; se retoma «mañana a primera hora». Este archivo es temporal: se borra al cerrar la etapa.
La rama tiene todo el avance, pero **todavía no es una versión terminable**: faltan pantallas, pruebas de dos clientes y documentos.

## Hecho (compila con `npm run tipos`; `npx vitest run src` pasa salvo lo anotado abajo)

- Diseño aprobado: `docs/SINCRONIZACION.md` (PR #16). Protocolo del servidor: `servidor/PROTOCOLO.md`.
- Dominio: reloj híbrido, mezcla por campo, registro de entidades, instantáneas (`src/dominio/sincronizacion/`).
- Cliente de datos: marcas, captura en la cola, aplicador con conflictos, cola, huellas (`src/datos/sincronizacion/`); `Cambios` ya captura en equipos vinculados; migración 0009 (con la tabla local `archivo_sincronizado`).
- Red y ciclo: `src/sincronizacion/` (`red.ts` es el único archivo con red; `cliente.ts`, `vinculacion.ts`, `primera.ts`, `servicio.ts`, `archivos.ts`, `registros-remotos.ts`, `ensamblaje.ts`).
- Registros genealógicos (R31) en equipo vinculado: emitir, reemitir, anular y fijar número pasan por el servidor (`registros.ts` + `servidor-registros.ts`).
- Certificados internos: sufijo de letra del equipo (`CP-2026-0007-B`).
- Rust: `ejecutar_lote` (D-004), llavero, plugin HTTP con permiso de una sola dirección, lectura y escritura de archivos de datos (`cargo test` de archivos pasa).
- Interfaz: indicador en la barra lateral, «Ya tengo una finca en otro equipo» en el asistente (`UnirseAFinca`), PIN por definir en equipos que reciben usuarios, textos en `src/textos/es.ts`.
- Servidor Postgres (agente): migraciones 0001 a 0007 en `servidor/migraciones/` y pruebas en `servidor/pruebas/` (ver el informe del agente en la conversación; puede estar incompleto).

## Nota de la fusión (21:20)

Otra sesión ya había implementado D-004 en la rama (D-054, `src-tauri/src/lote.rs`, PR #17). Se fusionó y se dejó su versión: mi `ejecutar_lote` se descartó. Las decisiones propias de esta etapa empiezan en **D-055**.

## Servidor: estado final del agente

`npx vitest run servidor`: 202 pruebas pasan (mezcla, sincronizar, cuentas, numeracion). Migraciones 0006 (descarga) y 0007 (storage) escritas pero sin pruebas. Falta: `aislamiento.test.ts` (privilegios y políticas), `descarga.test.ts`, `candado-real.test.ts` (Postgres real con `POSTGRES_URL_PRUEBAS`), `huellas.json` de las migraciones del servidor y `servidor/LEEME.md`. Desviaciones del protocolo: `unirse_a_finca` devuelve `{error:"codigo_invalido"}` en vez de lanzar (para no perder el contador de intentos); errores extra `cambio_id_reutilizado` y `registro_inconsistente`. Duda: la CLI de Supabase exige prefijo de fecha y hora en los nombres de migración; verificar si valen `0001_…`.

## Falta (en este orden)

1. `servidor/`: revisar lo que dejó el agente (`npx vitest run servidor`), corregir el error de tipos de `servidor/pruebas/ayudas.ts`, y que `emitir_registros` ponga el número asignado dentro de la instantánea (el cliente manda un marcador).
2. `src/sincronizacion/red-simulada.ts` (cortes antes y después de procesar, entregas repetidas, páginas repetidas) y las pruebas con dos clientes: CA-26, CA-27, CA-28, reproducción de la cola (R15), convergencia con tres clientes, dos emisiones simultáneas, aislamiento entre fincas, primera subida/descarga/verificación con cortes, contactos marcador, CA-30. También pruebas de `vinculacion.ts`, `primera.ts`, `cliente.ts`, `servicio.ts`, `archivos.ts` y de `definirPinDeEsteEquipo`.
3. Pantalla Ajustes → Sincronización (`SeccionSincronizacion`, solo propietario): vincular el primer equipo y subir datos, estado, «Sincronizar ahora», código de invitación, lista y retiro de equipos, avisos (`src/datos/sincronizacion/avisos.ts` ya existe), informe de verificación (CSV), desvincular. Agregar la sección a `Ajustes.tsx`, y los permisos `ver_sincronizacion`/`gestionar_sincronizacion` si se necesitan.
4. Bloquear en equipos vinculados «restaurar copia» y «limpiar datos de prueba» (`restaurar_vinculado`).
5. `src/seguridad.test.ts`: reescribir las pruebas de «sin red» para que solo `src/sincronizacion/red.ts` llame a la red y solo a la dirección declarada.
6. CA-33 con la migración 0009 (`actualizacion.test.ts`), `docs/PRUEBAS.md` (pasos con sus dos computadores), `docs/SERVIDOR.md` (despliegue, costo, dónde van los secretos), CI (Postgres para la prueba de concurrencia, variables del repositorio), `CLAUDE.md` (D-004 vigente, D-054 en adelante, mapa, comandos).
7. Parches al diseño: §6.2 «no es anterior» (no «mayor»); §13 sin índice nuevo; limitaciones honestas (el equipo que se une no recibe el historial anterior; principal de identificador y lactancia abierta se resuelven a mano; no hay `revisarIntegridad`).
8. Versión 0.6.0 en `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` y la expectativa de `aceptacion.test.ts`; actualizar el PR #16; publicar con el flujo de la D-041 solo cuando Josias lo apruebe.

## Cosas que no se han podido comprobar (necesitan el servidor real)

Límites de Supabase Free (confirmación de correo, pausa por inactividad, tamaño de archivo), tiempos reales de la primera subida y el comportamiento de PostgREST con errores `P0001`. No hay servidor de Supabase configurado: `src/sincronizacion/servidor.json` trae una dirección de ejemplo y el programa no hace ninguna llamada de red hasta que se cambie.
