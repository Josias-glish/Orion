# Protocolo entre el programa y el servidor (Etapa 10)

Contrato exacto de lo que el programa le pide al servidor. Complementa `docs/SINCRONIZACION.md` (el diseño aprobado): si algo de aquí
contradice ese documento, manda este archivo y se corrige el documento. Lo implementan las migraciones de Postgres de
`servidor/migraciones/` y lo usa el cliente de `src/sincronizacion/`.

## 1. Reglas generales

- Todo es Postgres (funciones SQL/plpgsql). Las tablas **no** tienen políticas de lectura ni escritura directa: a `anon` y
  `authenticated` se les quita todo permiso sobre las tablas (RLS activa y sin políticas, además de `revoke`). Solo pueden **ejecutar** las
  funciones públicas listadas abajo (`grant execute ... to authenticated`; `revoke ... from public, anon`). Todas son `security definer`,
  con `set search_path = ''` (todo calificado con esquema), y lo primero que hacen es comprobar `auth.uid()`.
- Se llaman por `POST {URL}/rest/v1/rpc/<función>` con un cuerpo JSON de parámetros con nombre (`p_...`) y devuelven un `jsonb`.
- **Errores:** `raise exception using errcode = 'P0001', message = '<codigo>'`. PostgREST los devuelve como HTTP 400 con
  `{"code":"P0001","message":"<codigo>"}`; el programa lee `message`. Nunca se pone en el mensaje un dato de otra cuenta. Una finca ajena y una
  finca inexistente dan el mismo error (`finca_inexistente`).
- **Tiempo:** el código del servidor lee la hora SOLO con `public.ahora_servidor()` (por defecto `clock_timestamp()`); las pruebas la
  reemplazan para fijar el reloj. Las horas que viajan son milisegundos desde 1970 (`bigint`).
- **Identificadores:** `finca_id`, `dispositivo_id`, `cambio_id`, `grupo_id` son `uuid`. `registro_id` es `text` (36 caracteres; los ids de las
  filas del programa son UUID, pero no se arriesga la sincronización a un cast).
- **Marcas (R17):** texto `AAAA-MM-DDTHH:MM:SS.mmmZ-cccc-dddddddd` (hora UTC, contador en 4 hex minúsculas, 8 hex del equipo). Se
  comparan **siempre con `COLLATE "C"`**. Validación: expresión regular
  `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z-[0-9a-f]{4}-[0-9a-f]{8}$` y fecha real.
- **Límites:** un envío tiene como máximo 500 operaciones y 2 MB de JSON (`demasiado_grande`). `entidad` cumple `^[a-z][a-z_]{0,39}$`.
  `campos` es un objeto cuyos valores son texto, número o null (nunca objetos ni arreglos).
- **Otros errores** (además de los de cada sección): `sin_sesion` (sin `auth.uid()`), `sin_permiso` (miembro que no es propietario), `parametro_invalido` (parámetros nulos, mal formados o en conflicto), `cambio_id_reutilizado` (un `p_cambio_id` ya usado por una función arbitrada distinta), `registro_inconsistente` (en `emitir_registros`, el borrador existente es de otro animal que el indicado) y, solo dentro de `rechazados`, `registro_invalido`. `emitir_registros` y `reemitir_registro` aceptan hasta 500 elementos u 8 MB; `importar_registros_emitidos`, hasta 2000 elementos u 8 MB.

## 2. Mezcla por campo (R16): las dos funciones puras

Se implementan en SQL como funciones **inmutables** que el resto del código y las pruebas usan:

- `public.fusionar_registro(p_campos jsonb, p_marcas jsonb, p_op_campos jsonb, p_op_marca text) returns jsonb`
  Devuelve `{"campos": {...}, "marcas": {"base": "...", "campos": {...}}}`. `p_campos` y `p_marcas` son `null` si el registro no existe.
  Regla: para cada campo de `p_op_campos`, se aplica si el campo no existía en `p_campos` **o** `p_op_marca >= marca_actual_del_campo`
  (con `COLLATE "C"`), donde `marca_actual_del_campo = p_marcas->'campos'->>campo` si existe, y si no `p_marcas->>'base'`. Después se pasa
  a forma canónica: `base` = la **menor** marca de todos los campos y `campos` = solo los campos cuya marca es distinta de `base`.
  Un `crear` es un `modificar` de todos los campos. Un `p_op_campos` vacío devuelve `null`.
- `public.registro_eliminado(p_campos jsonb, p_marcas jsonb) returns boolean`
  Verdadero si `p_campos->>'eliminado_en'` no es null **y** la marca de `eliminado_en` **no es anterior** a la mayor marca de los demás campos,
  sin contar `creado_en`, `modificado_en` ni `eliminado_en` (si no hay otros campos, es verdadero).

La especificación ejecutable de estas dos funciones es `servidor/vectores-fusion.json` (los mismos vectores corren contra la versión en
TypeScript). Cada caso trae `operaciones` (aplicadas desde un registro inexistente) y `esperado` (`valores`, `marcas`, `eliminado`). Salvo
`ordenFijo: true`, el resultado debe ser **igual en todas las permutaciones** de las operaciones. Una función auxiliar
`public.marca_maxima(p_marcas jsonb) returns text` devuelve la mayor marca de un registro (`base` o cualquiera de `campos`).

## 3. Tablas

Esquema `public`. Todas con `finca_id` donde corresponda y RLS activada sin políticas.

| Tabla | Columnas principales |
| --- | --- |
| `cuenta` | `id uuid pk` (= `auth.users.id`), `correo text` (minúsculas), `intentos_codigo int default 0`, `bloqueo_hasta timestamptz`, `creado_en` |
| `cuenta_autorizada` | `correo text pk` (minúsculas): quién puede crear una finca (S-89). La administra Josias desde el panel. |
| `finca_servidor` | `id uuid pk` (= `finca.id` local), `nombre text`, `creada_por uuid`, `version_esquema_minima int default 1`, `marca_ultima text default ''` (mayor marca aceptada o emitida), `siguiente_equipo int default 1`, `creado_en` |
| `membresia` | `cuenta_id`, `finca_id`, `rol text check (rol in ('propietario'))`, `creado_en`, pk (cuenta_id, finca_id) |
| `dispositivo` | `id uuid pk`, `finca_id`, `cuenta_id`, `nombre text`, `plataforma text`, `codigo_equipo text` (A, B, … Z, AA…; único por finca), `version_esquema int`, `ultima_sincronizacion timestamptz`, `revocado_en timestamptz`, `creado_en` |
| `invitacion` | `id uuid pk`, `finca_id`, `codigo_hash text unique` (SHA-256 hex del código normalizado), `rol text`, `creada_por uuid`, `vence_en timestamptz`, `usada_por uuid`, `usada_en timestamptz`, `creado_en` |
| `cambio` | `seq bigint generated always as identity pk`, `finca_id`, `cambio_id uuid`, `grupo_id uuid`, `orden int`, `dispositivo_id uuid`, `usuario_id text`, `entidad text`, `registro_id text`, `operacion text check in ('crear','modificar','eliminar')`, `campos jsonb`, `marca text`, `marca_original text` (solo si el servidor la acortó), `arbitrado boolean default false`, `recibido_en timestamptz`. Único (`finca_id`, `cambio_id`). Índice (`finca_id`, `seq`). Solo se agrega: disparadores que impiden `update` y `delete`. |
| `registro` | pk (`finca_id`, `entidad`, `registro_id`), `campos jsonb`, `marcas jsonb` (forma canónica), `actualizado_seq bigint` |
| `libro_numeracion` | pk (`finca_id`, `libro_id text`), `siguiente int not null check (siguiente >= 1)` |
| `llamada_arbitrada` | pk (`finca_id`, `cambio_id`), `resultado jsonb`: respuesta guardada de una llamada arbitrada (para reintentos idempotentes) |

Bucket de Storage `archivos` (privado) y sus políticas en la sección 8.

## 4. Cuentas, fincas y equipos

Parámetro `p_dispositivo` = `{"id": uuid, "nombre": texto, "plataforma": texto}`. Todas las respuestas de esta sección que registran un
equipo devuelven el **objeto de vínculo**:

```json
{ "finca_id": "…", "finca_nombre": "…", "dispositivo_id": "…", "codigo_equipo": "A",
  "hora_servidor_ms": 1790000000000, "seq_actual": 123, "version_esquema_minima": 9 }
```

- `registrar_cuenta()` → `{ "cuenta_id", "correo", "puede_crear_finca": bool }`. Crea o actualiza `cuenta` desde `auth.users` (correo en minúsculas).
  `puede_crear_finca` = el correo está en `cuenta_autorizada`.
- `crear_finca(p_finca_id uuid, p_nombre text, p_version_esquema int, p_dispositivo jsonb)` → objeto de vínculo. Exige `puede_crear_finca`
  (`no_autorizada`). Crea `finca_servidor`, la membresía `propietario` y el equipo (`codigo_equipo` según `siguiente_equipo`: 1→A … 26→Z, 27→AA).
  Si la finca ya existe y quien llama es miembro, y el equipo es el mismo, es idempotente; si existe y no es miembro: `finca_existente`.
- `mis_fincas()` → `[ { "finca_id", "nombre", "rol" } ]` de las fincas de las que la cuenta es miembro.
- `crear_invitacion(p_finca_id uuid)` → `{ "codigo": "ABCDE-FGHJK", "vence_en": "…" }`. Solo un propietario. Diez caracteres del alfabeto
  `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (sin letras que se confunden), al azar con `gen_random_uuid()` (sin depender de pgcrypto),
  guion en el medio solo para mostrar. Vence a las 24 horas, sirve una vez. Se guarda solo el SHA-256 hex (`encode(sha256(convert_to(normalizado,'UTF8')),'hex')`)
  del código en mayúsculas y sin guion.
- `unirse_a_finca(p_finca_id uuid, p_codigo text, p_dispositivo jsonb, p_version_esquema int)` → objeto de vínculo. Se da **uno** de los dos:
  `p_finca_id` (la cuenta ya es miembro) o `p_codigo`. Con código: se normaliza y se busca una invitación vigente (no vencida, no usada); si no
  coincide, vencida o usada, siempre el mismo resultado `{ "error": "codigo_invalido" }` (**se devuelve, no se lanza**: una excepción desharía la transacción y con ella la cuenta del intento, y el límite de 5 no serviría), y se cuenta el intento en `cuenta.intentos_codigo`; con 5 fallos seguidos la
  cuenta queda bloqueada una hora (`bloqueo_hasta`; mismo resultado `codigo_invalido`, aunque el código sea bueno). Si coincide: se marca usada,
  se crea la membresía con el rol de la invitación (si ya era miembro, no cambia) y se registra el equipo; el contador de intentos vuelve a 0.
  Registrar un equipo con un `id` que ya existe para esa cuenta y finca es idempotente; si existe para otra cuenta o finca: `dispositivo_desconocido`.
- `listar_dispositivos(p_finca_id uuid)` → `[ { "id", "nombre", "plataforma", "codigo_equipo", "ultima_sincronizacion_ms", "revocado": bool, "cuenta_correo" } ]`. Cualquier miembro.
- `revocar_dispositivo(p_finca_id uuid, p_dispositivo_id uuid)` → `{ "ok": true }`. Un propietario (puede ser el propio equipo: así se desvincula).
  Pone `revocado_en`. Un equipo revocado recibe `dispositivo_revocado` en `sincronizar` y en toda llamada que lo mencione.
  Límite conocido: revocar corta **el equipo**, no la cuenta. Una cuenta miembro puede registrar otro equipo con `unirse_a_finca(p_finca_id)`, y Storage (sección 8) se decide por cuenta. Quitar a una persona de la finca (retirar su membresía) queda para la Etapa 14.

## 5. `sincronizar`

```
sincronizar(p_finca_id uuid, p_dispositivo_id uuid, p_version_esquema int, p_desde bigint, p_cambios jsonb, p_limite int default 500)
```

`p_cambios` es un arreglo (puede estar vacío) en el orden de envío; cada elemento:

```json
{ "id": "<cambio_id uuid>", "grupo_id": "<uuid>", "orden": 0, "entidad": "animal", "registro_id": "<id>",
  "operacion": "crear|modificar|eliminar", "campos": { "nombre": "Luna" }, "marca": "…", "usuario_id": "<id local o null>" }
```

Pasos, todo en **una transacción**:

1. Comprobar sesión, membresía y equipo (`dispositivo_revocado`, `dispositivo_desconocido`). Tomar el candado de la finca:
   `pg_advisory_xact_lock(hashtext('finca:' || p_finca_id::text))`, para que un solo escritor a la vez asigne `seq` y el orden de `seq` sea el de confirmación.
2. `p_version_esquema < version_esquema_minima` → `esquema_antiguo`. Si es mayor, sube `version_esquema_minima`. Guardar `version_esquema` y `ultima_sincronizacion` del equipo.
3. Límites (`demasiado_grande`).
4. Agrupar por `grupo_id` conservando el orden de llegada y, dentro del grupo, el de `orden`. Cada grupo corre en su propia **subtransacción** (bloque `exception`):
   - si el `cambio_id` ya existe en `cambio` para esa finca → va a `ya_aplicados` y no se vuelve a aplicar;
   - validar cada operación; si algo falla, se revierte **todo el grupo** y sus `cambio_id` van a `rechazados` con el motivo (los demás grupos siguen). Motivos: `entidad_invalida`, `operacion_invalida`,
     `marca_invalida`, `campo_invalido` (valor que no es texto, número ni null, o `campos` vacío), `campo_reservado` (ver abajo);
   - **marca futura:** si la hora de la marca supera `ahora_servidor + 10 minutos`, se acorta a la hora del servidor (mismo contador y equipo), la original queda en `marca_original`
     y el cambio va también a `corregidos` con `{ "cambio_id", "marca_nueva" }`;
   - `eliminar` equivale a `modificar` de `{ "eliminado_en": <valor en campos> }`: el programa ya manda `campos = {"eliminado_en": "…"}`; el servidor solo acepta que `campos` tenga ese campo para `eliminar`;
   - mezclar con `fusionar_registro` sobre la fila de `registro` (bloqueada con `for update`; si no existe, `p_campos`/`p_marcas` null), insertar en `cambio` (`arbitrado = false`) y actualizar `finca_servidor.marca_ultima = greatest(marca_ultima, marca)` con `COLLATE "C"`;
   - los grupos aceptados van a `aceptados`.
   - **Campos reservados** (solo el servidor los escribe; se rechazan con `campo_reservado`): en `registro_genealogico`: `estado`, `consecutivo`, `numero`, `version`, `instantanea`, `motivo_anulacion`; en `libro`: `siguiente_numero`.
     Excepción: un `crear` de `registro_genealogico` que es un **borrador** se acepta: `estado` ausente o `'borrador'`, `version` ausente o 1, y `consecutivo`, `numero`, `instantanea`, `motivo_anulacion` ausentes o null.
     (El programa nunca manda `libro.siguiente_numero`, ni siquiera en un `crear`; el servidor lo rechaza si llega.)
5. Descargar: filas de `cambio` de la finca con `seq > p_desde`, ordenadas por `seq`, **hasta `p_limite`** (el tope es 500), contando también las propias. Se devuelven solo las que **no** son de este equipo o que son `arbitrado = true`.
   `seq_siguiente` = el `seq` de la última fila examinada (o `p_desde` si no hubo ninguna); `hay_mas` = existe alguna con `seq > seq_siguiente`.

Respuesta:

```json
{ "hora_servidor_ms": 1790000000000,
  "aceptados": ["<cambio_id>"], "ya_aplicados": ["<cambio_id>"],
  "rechazados": [ { "cambio_id": "…", "grupo_id": "…", "motivo": "campo_reservado" } ],
  "corregidos": [ { "cambio_id": "…", "marca_nueva": "…" } ],
  "cambios": [ { "seq": 1, "cambio_id": "…", "grupo_id": "…", "orden": 0, "dispositivo_id": "…", "usuario_id": "…", "entidad": "…", "registro_id": "…",
                 "operacion": "…", "campos": {}, "marca": "…", "arbitrado": false } ],
  "seq_siguiente": 1, "hay_mas": false, "version_esquema_minima": 9 }
```

El cliente guarda `seq_siguiente` como su cursor. `ya_aplicados` y `aceptados` los trata igual (su cola queda enviada).

## 6. Operaciones arbitradas (R31): números de registro

Las tres exigen conexión y se ejecutan bajo el mismo candado de la finca. Son **idempotentes por `p_cambio_id`**: la primera vez se guarda el resultado en
`llamada_arbitrada`; un reintento con el mismo `p_cambio_id` devuelve exactamente el mismo resultado sin consumir otro número. Los cambios que producen se insertan
en `cambio` con `arbitrado = true`, `dispositivo_id` = el equipo que llamó, un `grupo_id` por llamada, `orden` correlativo, y una marca **generada por el servidor**: la siguiente a
`finca_servidor.marca_ultima` (hora del servidor, o `marca_ultima` con el contador subido si la hora no la supera; equipo `00000000`), que se guarda de nuevo en `marca_ultima`.
Todas las respuestas llevan `seq_final` (el `seq` del último cambio producido) y `hora_servidor_ms`.

- `emitir_registros(p_finca_id, p_dispositivo_id, p_cambio_id uuid, p_registros jsonb)` con elementos
  `{ "registro_id", "animal_id", "libro_id", "fecha_registro", "instantanea" (texto JSON), "responsable", "observaciones" }`.
  La `instantanea` es un texto JSON que el programa arma **sin conocer el número** (manda `"numero": null` y `"version": 1`). Al asignar el consecutivo, el servidor la parsea como `jsonb` (si no es un objeto JSON válido:
  `parametro_invalido`), pone `numero` = el número asignado y `version` = 1, y la guarda otra vez como texto (`jsonb_set(...)::text`; el texto sale normalizado por Postgres, no con el orden ni los espacios originales).
  El campo `instantanea` del cambio `crear`/`modificar` y el de cada elemento de `resultados` llevan esa instantánea ya corregida. (En `reemitir_registro` el programa ya manda `numero` y `version` correctos: el servidor no la toca.)
  Valida todo antes de asignar (si algo falla, no se consume ningún número): el libro existe en `registro` (entidad `libro`) y tiene `prefijo` (`libro_sin_prefijo`, `libro_no_encontrado`);
  `registro_id` y `animal_id` no se repiten en la llamada; si el registro existe debe ser un borrador (`registro_ya_emitido`, `registro_anulado`); ningún otro registro vigente del mismo animal
  (estado distinto de `anulado` y no eliminado según `registro_eliminado`) (`animal_con_registro`). Asigna los consecutivos **en el orden recibido**: `consecutivo` = `libro_numeracion.siguiente`
  (si no hay fila, empieza en `libro.campos.siguiente_numero` o 1) y nunca menor que el mayor consecutivo ya existente del libro más uno; avanza el contador por cada registro.
  `numero` = `prefijo` + `separador_numero` (`''` o `'-'`) + consecutivo con ceros a la izquierda hasta `digitos_numero` (un consecutivo más largo no se recorta; no uses `lpad`, que recorta),
  tomados de `libro.campos` (`prefijo`, `separador_numero`, `digitos_numero`; por defecto `'-'` y 4).
  Produce por cada registro un cambio sobre `registro_genealogico`: `crear` si no existía (campos: `animal_id`, `libro_id`, `consecutivo`, `numero`, `fecha_registro`, `estado:'emitido'`, `version:1`, `instantanea`,
  `responsable`, `motivo_anulacion:null`, `observaciones`, `creado_en` = hora de la marca, `eliminado_en:null`) o `modificar` si era borrador (los mismos menos `animal_id` y `creado_en`); y al final un cambio `modificar` de la entidad `libro` con
  `{ "siguiente_numero": <nuevo contador> }` por cada libro tocado. Resultado: `{ "resultados": [ { "registro_id", "libro_id", "consecutivo", "numero", "version": 1, "instantanea" (texto, ya corregida) } ], "seq_final", "hora_servidor_ms" }`.
- `reemitir_registro(p_finca_id, p_dispositivo_id, p_cambio_id uuid, p_registro_id text, p_version_base int, p_campos jsonb)`: `p_campos` trae `instantanea` (obligatoria) y opcionalmente `fecha_registro`, `responsable`, `observaciones`.
  Errores: `registro_no_encontrado`, `registro_no_emitido` (borrador), `registro_anulado`, `version_cambio` (la versión actual no es `p_version_base`). Produce un `modificar` con `version = p_version_base + 1` y esos campos.
  Resultado: `{ "registro_id", "numero", "version", "seq_final", "hora_servidor_ms" }`.
- `anular_registro(p_finca_id, p_dispositivo_id, p_cambio_id uuid, p_registro_id text, p_motivo text)`: el motivo no puede estar vacío (`motivo_requerido`). Un registro ya anulado devuelve `{ "ya_anulado": true }` sin producir cambios. Un borrador anulado: `registro_no_emitido`.
  Produce un `modificar` con `estado:'anulado'` y `motivo_anulacion`. Resultado: `{ "registro_id", "numero", "seq_final", "hora_servidor_ms" }`.
- `fijar_siguiente_numero(p_finca_id, p_dispositivo_id, p_cambio_id uuid, p_libro_id text, p_valor int)`: solo si el libro no tiene registros con número (`libro_con_registros`); `p_valor >= 1` (`numero_invalido`). Fija
  `libro_numeracion.siguiente` y produce el `modificar` de `libro` con `siguiente_numero`. Resultado: `{ "siguiente", "seq_final", "hora_servidor_ms" }`.
- `importar_registros_emitidos(p_finca_id, p_dispositivo_id, p_cambio_id uuid, p_registros jsonb)` (primera subida): elementos `{ "registro_id", "campos": { …todas las columnas de la fila menos id y modificado_en… }, "marca" }`.
  Solo si la finca no tiene todavía ningún registro emitido ni anulado (`importacion_no_permitida`). Valida que cada libro tenga consecutivos contiguos y sin repetir, números únicos, estados `emitido` o `anulado`, y que los campos `libro_id`, `consecutivo`, `numero`, `instantanea` existan
  (`importacion_invalida`). Inserta cada fila como cambio arbitrado conservando su `marca` (acortada si es futura) y deja `libro_numeracion.siguiente = max(consecutivo) + 1` por libro.
  Resultado: `{ "importados": n, "seq_final", "hora_servidor_ms" }`.

## 7. Descarga inicial y verificación

- `iniciar_descarga(p_finca_id uuid, p_dispositivo_id uuid)` → `{ "seq_inicial": <seq actual>, "hora_servidor_ms", "conteos": { "<entidad>": n, … } }`.
- `descargar_pagina(p_finca_id uuid, p_dispositivo_id uuid, p_entidad text, p_despues_de text, p_limite int default 500)` → `{ "registros": [ { "registro_id", "campos", "marcas" } ], "siguiente": "<último registro_id>" | null }`,
  ordenados por `registro_id` (`COLLATE "C"`), `p_despues_de` vacío o null para empezar, `siguiente` null cuando no quedan más. El tope de `p_limite` es 500.
- `resumen_finca(p_finca_id uuid, p_dispositivo_id uuid)` → `{ "seq_actual", "hora_servidor_ms", "entidades": [ { "entidad", "filas", "huella" } ] }`. `filas` cuenta los registros de la entidad **incluidos los eliminados**.
  `huella` = SHA-256 hexadecimal (minúsculas) del texto que resulta de concatenar, por cada registro ordenado por `registro_id` (`COLLATE "C"`), la línea `registro_id || '|' || marca_maxima(marcas) || E'\n'`
  (codificado UTF-8). El cliente calcula lo mismo sobre sus filas.

## 8. Storage

Bucket `archivos`, **privado** (`public = false`), creado por la migración (`insert … on conflict do nothing`). Políticas sobre `storage.objects` para `authenticated`: **select** e **insert** solo cuando
`bucket_id = 'archivos'` y el primer segmento de la ruta (`(storage.foldername(name))[1]`) es el uuid de una finca de la que la cuenta es miembro (`membresia`). Sin políticas de `update` ni `delete`
(los archivos son inmutables). Ruta de un objeto: `<finca_id>/<ruta del archivo en el programa>`, por ejemplo `…/fotos/<uuid>.jpg`. En las pruebas el esquema `storage` es un doble mínimo
(`storage.buckets`, `storage.objects(bucket_id, name, owner)` y `storage.foldername`); en Supabase ya existe.

## 9. Lo que el servidor NO hace

No conoce el esquema de las tablas del programa (guarda cada registro como `jsonb`), no valida reglas del dominio (R1, R3, R11…: las valida cada equipo), no guarda contactos (`contacto`), no guarda `pin_hash`
ni `historial_cambios` como tabla, y no tiene roles distintos de `propietario` (Etapa 14).
