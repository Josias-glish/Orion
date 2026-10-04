# Servidor de sincronización (Etapa 10)

Esta carpeta es **el lado del servidor** de la sincronización: la base de datos Postgres (en Supabase) que guarda una copia central de
los cambios de cada finca para que dos o más computadores del aprisco se mantengan iguales. El programa de escritorio no vive aquí
(está en `src/`); aquí solo hay SQL, pruebas y dos scripts pequeños.

El servidor **no tiene código propio que se ejecute aparte**: todo es SQL dentro de Postgres (funciones que el programa llama por la
API de Supabase). Los documentos de referencia son `PROTOCOLO.md` (el contrato exacto entre el programa y el servidor) y
`docs/SINCRONIZACION.md` (el diseño aprobado).

## Qué hay en la carpeta

| Archivo o carpeta | Para qué sirve |
| --- | --- |
| `PROTOCOLO.md` | El contrato: tablas, funciones, errores y qué devuelve cada una. Si algo cambia, se cambia aquí primero. |
| `migraciones/0001_…0007_*.sql` | Lo que se instala en la base, en orden: tablas (0001), mezcla por campo (0002), cuentas y fincas (0003), `sincronizar` (0004), números de registro (0005), descarga y verificación (0006) y archivos (0007). |
| `migraciones/huellas.json` | La huella SHA-256 de cada migración. Sirve para notar si alguien editó una migración ya publicada. |
| `regenerar-huellas.mjs` | Recalcula `huellas.json` (ver abajo). |
| `aplicar.mjs` | Aplica las migraciones pendientes a una base de Postgres, en orden y una sola vez cada una. |
| `vectores-fusion.json` | Casos de prueba de la mezcla por campo (R16); los usan la versión SQL y la de TypeScript del programa. |
| `pruebas/` | Pruebas automáticas (ver abajo). `ayudas.ts` arma un «Supabase de mentira» para probar sin internet. |

## Cómo correr las pruebas

Desde la raíz del repositorio (después de `npm install`):

| Para qué | Comando |
| --- | --- |
| Todas las pruebas del servidor | `npx vitest run servidor` |
| Una sola | `npx vitest run servidor/pruebas/aislamiento.test.ts` |
| Con Postgres de verdad (el candado) | ver la sección siguiente |

Las pruebas usan **PGlite**, un Postgres que corre dentro de Node (sin instalar nada y sin red). `pruebas/ayudas.ts` crea una base nueva, le
pone un doble mínimo de lo que Supabase ya trae (los roles `anon`, `authenticated` y `service_role`, `auth.users`, `auth.uid()` y el
esquema `storage`) y le aplica las migraciones. Cada prueba llama a las funciones como lo haría la API: con el rol de la cuenta
(`servidor.rpc("sincronizar", {...}, { como: cuentaId })`) o como `anon`.

| Archivo | Qué comprueba |
| --- | --- |
| `mezcla.test.ts` | La mezcla por campo (R16) con los vectores de `vectores-fusion.json` y todas las permutaciones. |
| `cuentas.test.ts` | Cuentas, fincas, equipos, invitaciones (vencen, sirven una vez, se bloquean tras 5 fallos). |
| `sincronizar.test.ts` | `sincronizar`: idempotencia, grupos atómicos, marcas futuras, campos reservados, límites, orden de `seq`. |
| `numeracion.test.ts` | Números de registro (R31): emitir, reemitir, anular, fijar el contador, importar; reintentos y entrelazados. |
| `aislamiento.test.ts` | Que una cuenta no pueda tocar la finca de otra, que `anon` no pueda nada, que las tablas no se lean ni escriban directo, y los equipos revocados. |
| `descarga.test.ts` | `iniciar_descarga`, `descargar_pagina`, `resumen_finca` (huella) y las políticas de Storage. |
| `huellas.test.ts` | Que ninguna migración cambie sin actualizar su huella. |
| `candado.real.test.ts` | El candado de la finca con **Postgres real** (se salta solo si no hay variable de entorno). |

### La prueba del candado con Postgres real

PGlite tiene una sola conexión, así que no puede probar de verdad que dos transacciones a la vez no se pisen. Esa prueba necesita un
Postgres normal (15 o superior). **Usa uno desechable, nunca el de Supabase ni uno con datos**: la prueba crea y borra una base de datos propia
(nombre al azar) y crea los tres roles de Supabase si no existen, por eso el usuario debe poder crear bases y roles (en un Postgres de pruebas, el
superusuario).

```bash
export POSTGRES_URL_PRUEBAS='postgres://USUARIO@127.0.0.1:5432/postgres'   # la contraseña, si hace falta, va en la URL o en PGPASSWORD
npx vitest run servidor/pruebas/candado.real.test.ts
```

Si la variable no existe, la prueba aparece como «skipped» y todo lo demás sigue verde. Usa el paquete `pg` (ya está en `package.json`). Para
levantar un Postgres desechable en Linux sin instalarlo en el sistema, sirve `initdb` + `pg_ctl` en una carpeta temporal, o
`docker run --rm -e POSTGRES_HOST_AUTH_METHOD=trust -p 5432:5432 postgres:16`.

## Cómo se aplican las migraciones a un proyecto de Supabase

Las migraciones **todavía no están aplicadas en ningún servidor**: se pueden editar (y regenerar sus huellas). Desde el momento en que una
se aplica en el proyecto de pruebas o en el real, **no se edita nunca más**: los cambios van en una migración nueva con el número siguiente.

**Forma recomendada hoy: `servidor/aplicar.mjs`.** No necesita instalar la CLI de Supabase ni renombrar archivos.

1. Crea el proyecto de pruebas en el panel de Supabase (la decisión de dónde y cuánto cuesta está en `docs/SINCRONIZACION.md`, sección 15).
2. Copia la **cadena de conexión** de la base (Project Settings → Database → Connection string; usa la de conexión directa o la del *pooler* en modo
   sesión, no la de modo transacción) y ponla en una variable de entorno **de tu terminal**. No la escribas en el chat ni en ningún archivo del repositorio:

   ```bash
   export SERVIDOR_DB_URL='…la cadena de conexión…'
   node servidor/aplicar.mjs --ver     # muestra qué se aplicaría, sin cambiar nada
   node servidor/aplicar.mjs           # aplica las pendientes
   ```

3. Qué deberías ver: una línea «aplicada» por cada migración y «Se aplicaron 7 migración(es)». Al repetirlo: «Todo está al día».
   Si una migración falla, se deshace sola y el script se detiene en esa.
4. Autoriza el correo de quien podrá crear la finca (la lista `cuenta_autorizada`, S-89), en el editor SQL del panel:
   `insert into public.cuenta_autorizada (correo) values ('correo@ejemplo.com');`

El script recuerda lo aplicado en su propio esquema, `migraciones_servidor`, que la API de Supabase no expone. Si una migración ya aplicada
cambió de contenido, se niega a continuar.

Variables de entorno que se usan (solo los nombres; los valores van en tu terminal o en los secretos de GitHub):

| Variable | Quién la usa | Para qué |
| --- | --- | --- |
| `SERVIDOR_DB_URL` | `aplicar.mjs` | Cadena de conexión de Postgres del proyecto de Supabase. **Secreta.** |
| `POSTGRES_URL_PRUEBAS` | `candado.real.test.ts` | Un Postgres **desechable** para la prueba del candado. Nunca el de Supabase. |

### Por qué no `supabase db push` (la duda de los nombres)

La CLI de Supabase guarda las migraciones como `<marca de tiempo>_nombre.sql` y la documentación oficial indica el formato
`YYYYMMDDHHMMSS_nombre.sql` (por ejemplo `20261002120000_tablas.sql`); la marca de tiempo define el orden y es la «versión» que anota en la tabla
`supabase_migrations.schema_migrations`. Nuestros archivos se llaman `0001_tablas.sql`, y `PROTOCOLO.md`, las pruebas, las huellas y los
comentarios de las propias migraciones los nombran así.

Qué pude y qué no pude comprobar (revisión del 2026-10-03): el sitio `supabase.com` está bloqueado por la red de esta sesión, así que **no
pude leer la documentación oficial vigente** ni el código de la CLI. Por búsquedas y por informes de problemas del repositorio de la CLI solo confirmé que
el formato documentado es la marca de 14 dígitos y que la CLI relaciona archivos y base **solo por esa versión numérica**. **No confirmé** si la CLI acepta o
ignora un prefijo `0001_`; no lo des por hecho. Cómo comprobarlo tú, sin riesgo, en un proyecto vacío: copia la carpeta de migraciones a `supabase/migrations/`, corre
`supabase db push --dry-run` y mira si lista las siete.

Si más adelante prefieres usar la CLI (por ejemplo, para el flujo de GitHub Actions que Supabase documenta), la forma más simple es **renombrar**
`0001_tablas.sql` → `20261003000001_tablas.sql`, etc. (prefijos crecientes de 14 dígitos). Eso exige cambiar a la vez: `leerMigraciones` y el filtro de nombres de
`pruebas/ayudas.ts`, `regenerar-huellas.mjs`, `aplicar.mjs`, `huellas.json`, la prueba de números seguidos de `huellas.test.ts` y las menciones
`0001`…`0007` en `PROTOCOLO.md` y en `docs/SINCRONIZACION.md`. Mientras tanto, `aplicar.mjs` no depende de nada de eso.

## Huellas de las migraciones

`migraciones/huellas.json` guarda el SHA-256 de cada migración (igual que `src/datos/migraciones/huellas.json` para el programa). La prueba
`huellas.test.ts` falla si una migración cambia sin actualizar su huella, o si falta o sobra alguna.

```bash
node servidor/regenerar-huellas.mjs              # recalcula y escribe huellas.json
node servidor/regenerar-huellas.mjs --comprobar  # solo comprueba (error si no coincide)
```

Úsalo solo al **agregar** una migración nueva o mientras la migración que editas no esté aplicada en ningún servidor. `.gitattributes` fuerza saltos de línea LF
en los `.sql`, así la huella es la misma en Windows, macOS y Linux.

## Diferencias con el protocolo y el diseño

Lo que encontré al comparar `PROTOCOLO.md` y `docs/SINCRONIZACION.md` con las migraciones (2026-10-03). Lo marcado «corregido» ya está arreglado. (Los comentarios de las migraciones 0003 y 0004 la llaman «Desviaciones del protocolo»: es esta sección.)

1. **`unirse_a_finca` con un código malo devuelve `{ "error": "codigo_invalido" }`; no lanza excepción.** El protocolo decía «el mismo error». Es a propósito: si lanzara, Postgres
   desharía la transacción junto con el contador de intentos fallidos y el límite de 5 no serviría. El programa (`src/sincronizacion/vinculacion.ts`) ya lo trata así. *Corregido: ahora lo dice `PROTOCOLO.md`, sección 4.*
2. **Errores que el protocolo no listaba:** `sin_sesion`, `sin_permiso`, `parametro_invalido`, `cambio_id_reutilizado`, `registro_inconsistente` y el motivo `registro_invalido`. *Corregido: sección 1 de `PROTOCOLO.md`.*
3. **Límites de tamaño:** `importar_registros_emitidos` acepta hasta 2000 elementos y 8 MB, y `emitir_registros` hasta 500 elementos y 8 MB (el protocolo solo hablaba de los 500 y 2 MB de `sincronizar`). *Corregido en `PROTOCOLO.md`.*
4. **Defecto encontrado por `aislamiento.test.ts` (corregido):** la función de disparador `interno.cambio_solo_se_agrega()` quedaba ejecutable por `public`/`anon`/`authenticated` (Postgres da `EXECUTE` a todos por defecto). No era explotable
   (un disparador no se puede llamar directo y `anon` no ve el esquema `interno`), pero rompía la regla «las funciones auxiliares no se ejecutan por la API». Se agregó el `revoke` en la migración 0001. La prueba ahora revisa **todas** las funciones de `public` e `interno` en el catálogo,
   así que una función nueva con permisos de más la hace fallar.
5. **Revocar un equipo no quita a la persona (límite de diseño, sin cambio):** `revocar_dispositivo` bloquea ese equipo, pero la cuenta sigue siendo miembro y puede registrar otro equipo con `unirse_a_finca(p_finca_id)`; además Storage se decide por cuenta, no por equipo
   (el equipo revocado con la sesión de la cuenta todavía puede leer y subir archivos de la finca). Hoy todos los miembros son propietarios y no existe «quitar miembro». Cubre el caso de un computador perdido solo si
   también se protege la cuenta (cambiar la contraseña en Supabase Auth). Sugerencia para la Etapa 14: una función para retirar la membresía.
6. **Hoy no existe un miembro que no sea propietario:** el `check` de `membresia.rol` y de `invitacion.rol` solo admite `propietario`. Las pruebas amplían ese `check` por un momento para comprobar que `crear_invitacion` y `revocar_dispositivo` miran el rol y no solo la membresía.
7. **Existencia de fincas:** `crear_finca` con el id de una finca ajena responde `no_autorizada` a quien no puede crear fincas y `finca_existente` a quien sí; esta última revela que ese uuid existe (a quien ya está autorizado). Es poco importante (el uuid es aleatorio y secreto), pero conviene saberlo.
8. **Mayúsculas en la carpeta de Storage:** la política acepta el uuid de la finca en mayúsculas o minúsculas (es el mismo uuid). El programa siempre usa minúsculas.
9. **Documento de diseño (`docs/SINCRONIZACION.md`, no lo toqué):** la sección 11 menciona el formato de `entidad` como `^[a-z_]{1,40}$` y el protocolo/migraciones usan `^[a-z][a-z_]{0,39}$`; la lista de funciones de esa sección no incluye `listar_dispositivos`, `reemitir_registro`, `anular_registro` ni `fijar_siguiente_numero`; y dice que `invitacion` guarda un «contador de intentos» cuando en realidad está en `cuenta` (`intentos_codigo`, `bloqueo_hasta`). Manda `PROTOCOLO.md`.
10. **`aplicar.mjs` y Supabase real, sin comprobar:** no tengo un proyecto de Supabase para probar. Probé `aplicar.mjs` y las migraciones en un Postgres 16 normal con el doble de Supabase. Actualización 2026-10-04: las siete migraciones se aplicaron en un proyecto real (`registro-caprino-pruebas`) con el conector de Supabase y la 0007 sí pudo crear las políticas de `storage.objects`. Siguen sin comprobarse el comportamiento de PostgREST con los errores `P0001` (la sesión no puede salir a `*.supabase.co`) y Supabase Auth.
