# Sincronización con servidor (Etapa 10): diseño

Estado: **diseño para aprobar (Puerta 2). Todavía no hay código.** Este documento es lo que se construirá si Josias da su visto bueno
(especificación 2, sección 10). Cubre RF-40 y RF-41, las reglas R15, R16 y R17, y los criterios CA-26, CA-27, CA-28, CA-30 y CA-33.

La biblioteca y el servidor ya los eligió Josias en la Puerta 1: **sincronización propia sobre Supabase**, gratis mientras se construye,
se prueba y se hace el piloto, y plan de pago antes de cobrarle a alguien. Las otras opciones comparadas (PowerSync, SQLite Sync, Render con
almacenamiento aparte) quedaron descartadas por: SDK de Tauri en alfa y sin resolver R16, R17 ni R31 (PowerSync); licencia y «el borrado gana»
(SQLite Sync); cuentas y copias a cargo nuestro (Render).

## 0. Resumen y decisiones que necesito de ti

Idea en cinco líneas:

1. Cada equipo sigue trabajando con su base SQLite local y sin red. Cada escritura queda también en una **cola de cambios**, dentro de la
   misma transacción (R15).
2. Cuando hay red, el equipo manda la cola al servidor y recibe lo que hicieron los demás. Reenviar un cambio no lo duplica (identificador de
   cambio) y un corte a mitad del envío no pierde nada (CA-28).
3. Los choques se resuelven **por campo**: gana la marca de tiempo más reciente y el valor que perdió queda en el historial (R16). La marca es
   un reloj híbrido (hora + contador + equipo) corregido con la hora del servidor (R17).
4. Los **números de registro genealógico** (R31) no se pueden repartir a ciegas entre equipos: emitir, reemitir y anular los decide el
   servidor, uno a la vez, y por eso requieren conexión. Los borradores se escriben sin red.
5. Los **contactos de terceros** (R28) y el **PIN** no salen del equipo.

Decisiones que necesito (cada una está explicada más abajo; sin ellas no escribo código):

| # | Decisión | Mi recomendación |
| --- | --- | --- |
| 1 | Aprobar D-004: un comando de Rust que ejecuta un lote de sentencias dentro de una transacción real. R15 exige que el cambio y su entrada en la cola vayan en la misma transacción; sin esto no se puede cumplir (sección 4.2). | Aprobar |
| 2 | En un equipo vinculado, emitir, reemitir y anular registros genealógicos exige conexión con el servidor (borradores sin red). Es lo único que no funciona sin red, y solo en equipos vinculados (sección 7). | Aprobar |
| 3 | Contactos (R28) fuera de la sincronización, con marcadores en el otro equipo; el PIN vive solo en cada equipo (sección 8). | Aprobar |
| 4 | Cuentas: correo y contraseña con Supabase Auth; el segundo equipo se une con la misma cuenta o con un código de invitación; solo correos autorizados por ti pueden crear una finca; un equipo nuevo debe estar vacío (sección 10). | Aprobar |
| 5 | Dependencias nuevas: el plugin HTTP oficial de Tauri y el crate `keyring` (guardar la sesión en el llavero del sistema), más `sqlx` directo en Rust para D-004, y PGlite como dependencia de desarrollo (sección 17). Cada una se verifica en su documentación oficial al agregarla. | Aprobar |
| 6 | Cuentas que tendrías que crear: Supabase (dos proyectos, pruebas y producción) y variables en GitHub. Nunca pegas claves en el chat (sección 15). | Crearlas cuando empiece el paso del servidor |

Lo que **no puedo comprobar desde mi entorno** y te toca a ti o queda marcado «verificar al implementar»: la conexión real a Supabase (mi
red bloquea esos dominios), la sincronización entre tus dos computadores y varios detalles del servicio (sección 18).

## 1. Punto de partida y límites

Reglas que este diseño respeta (resumen; el texto manda):

- **Regla de red** (especificación 2, sección 4): la sincronización es opcional, el programa abre y funciona completo sin red, nada se queda
  esperando la red, el usuario ve si está en línea y cuántos cambios faltan, y cada dirección está declarada en los permisos de Tauri.
- **Sin vincular, el programa es idéntico a la 0.5.0**: cero llamadas de red, cero filas nuevas en la cola. `src/seguridad.test.ts` sigue
  exigiendo cero red hasta que haya una dirección de servidor configurada (sección 14).
- No se borran filas (borrado lógico) y todo cambio queda en `historial_cambios`. La sincronización no cambia esto.
- Migraciones: la 0009 solo agrega tablas, columnas con valor por defecto e índices. No cambia ninguna fila (CA-33).
- Fuera de esta etapa: roles de servidor distintos de propietario (veterinario, operario con cuenta propia: Etapa 14, R23 y CA-31), la
  suscripción y el plan (Etapa 14), la página pública (Etapa 11), la actualización automática (Etapa 12), la eliminación definitiva de una
  cuenta a pedido de su titular (R28, Etapa 14) y la sincronización de contactos (sección 8).

## 2. Arquitectura

```
 Equipo A (Tauri)                                  Supabase (un proyecto por entorno)
 ┌─────────────────────────┐   HTTPS (plugin     ┌──────────────────────────────────────┐
 │ SQLite local            │   HTTP de Tauri,    │ Auth: correo y contraseña            │
 │  + cola_cambios         │   una sola URL)     │ Postgres: funciones `rpc` (SQL)      │
 │  + marca_registro       │ ──────────────────► │   cambio (bitácora, idempotente)     │
 │  + aviso_sincronizacion │ ◄────────────────── │   registro (estado actual + marcas)  │
 │ Archivos: fotos/, docs/ │                     │   libro_numeracion (R31)             │
 └─────────────────────────┘                     │ Storage privado: fotos y documentos  │
        Equipo B (igual)  ◄── mismo servidor ──► └──────────────────────────────────────┘
```

Decisiones de arquitectura (D-054 propuesta; sección 17):

- **Bitácora más estado.** El servidor guarda cada cambio aceptado en `cambio` (solo se agrega; es lo que los equipos descargan de forma
  incremental) y el estado actual de cada registro en `registro` (con la marca de cada campo; es lo que descarga un equipo nuevo). El
  servidor no conoce el esquema de las tablas del programa: guarda cada registro como `jsonb`. Una etapa futura que agregue tablas solo
  cambia el programa, no el servidor.
- **La lógica del servidor es SQL (funciones de Postgres), no Edge Functions.** Un `sincronizar` es una sola transacción: o entran todos los
  cambios del envío o ninguno. No hay que empaquetar código compartido y se prueba con Postgres real (PGlite y un servicio de Postgres en
  GitHub Actions). Los equipos no escriben en las tablas: solo llaman funciones (sección 11).
- **Cada regla de mezcla existe dos veces y se prueba con los mismos vectores.** Una en TypeScript (`src/dominio/sincronizacion/fusion.ts`,
  que usa el equipo al recibir) y otra en SQL (que usa el servidor al recibir). Un archivo de vectores de prueba (`servidor/vectores-fusion.json`)
  corre contra las dos. Si divergen, la prueba falla.
- **Sin `supabase-js`** (SUPOSICION S-83). Esa biblioteca trae un cliente de WebSocket (tiempo real) que `src/seguridad.test.ts` prohíbe, y no se necesita.
  El programa llama a Auth, a las funciones y a Storage con el plugin HTTP de Tauri, cuyo permiso lista **una sola dirección** (la del
  proyecto de Supabase), como pide la regla de red. La CSP de la ventana sigue sin orígenes externos: la red la hace Rust, no la ventana.
- **Una interfaz `Red`.** Todo el código del cliente habla con `Red` (`src/sincronizacion/red.ts`, el único archivo que hace llamadas de red).
  Las pruebas usan `RedSimulada`, que sabe perder una petición, perder una respuesta o duplicar una entrega (sección 16).
- **Tiempo real: no.** El programa sincroniza al guardar (con 3 segundos de espera para juntar cambios), cada 5 minutos, al volver la red
  y con el botón «Sincronizar ahora». Solo mientras el programa está abierto (S-93).

## 3. Qué se sincroniza

El registro de entidades vive en `src/dominio/sincronizacion/entidades.ts` (orden de dependencias, columnas excluidas, columnas que se
refieren a sí mismas). Una prueba exige que **toda tabla de la base figure como sincronizada o como local**, igual que ya pasa con
`TABLAS_RESPALDO`: una tabla nueva obliga a decidir qué hacer con ella.

| Tabla | ¿Se sincroniza? | Notas |
| --- | --- | --- |
| `finca` | Sí | Una sola fila; el mismo id en todos los equipos. |
| `usuario` | Sí, sin `pin_hash` | El PIN es de cada equipo (sección 8). |
| `raza`, `libro`, `categoria_economica` | Sí | Catálogos con id fijos que ya precarga la migración. `libro.siguiente_numero` no viaja: lo asigna el servidor (sección 7). |
| `lote`, `animal` (incluidos los de otras fincas), `identificador`, `composicion_racial` | Sí | `animal.padre_id` y `madre_id` se refieren a la misma tabla: se aplican en dos pasadas (sección 6.5). |
| `evento_reproductivo`, `parto`, `lactancia`, `pesaje_leche`, `pesaje_corporal`, `meta_peso`, `evento_salud` | Sí | |
| `certificado` | Sí | Su archivo viaja aparte (sección 9). |
| `registro_genealogico` | Sí, con campos reservados | `estado`, `consecutivo`, `numero`, `version`, `instantanea` y `motivo_anulacion` solo los escribe el servidor (sección 7). |
| `movimiento_economico`, `traspaso` | Sí | Compras, ventas y finanzas (sección 6.6). |
| `contacto` | **No** | R28 (sección 8). Sus ids sí viajan dentro de `animal.contacto_id` y `traspaso.contacto_id`. |
| `historial_cambios` | **No como tabla** | Pesa la mayor parte de la base (en la prueba de 500 animales: 70 de 85 MB). Viaja dentro de cada operación y cada equipo escribe el suyo. |
| `cola_cambios`, `marca_registro`, `aviso_sincronizacion`, `dispositivo`, `sincronizacion_estado` | No (locales) | Tablas nuevas de la migración 0009 (sección 13). Quedan fuera del respaldo `.zip` con su motivo. |

Las columnas `creado_en` y `modificado_en` no se mezclan campo por campo: `creado_en` lo fija quien crea el registro y `modificado_en` se
calcula en cada equipo como la hora de la marca más reciente del registro.

## 4. Cola de cambios (R15)

### 4.1 Qué entra en la cola

`Cambios` (`src/datos/cambios.ts`) es el único camino de escritura de datos del programa. En un equipo vinculado, `Cambios.aplicar` suma a
su lote, además de los `INSERT`/`UPDATE` y el historial de siempre:

- una fila en `cola_cambios` por cada operación;
- la actualización de `marca_registro` (la marca de cada campo tocado);
- la actualización del reloj híbrido guardado en `sincronizacion_estado`.

No uso disparadores de SQLite para capturar los cambios: no distinguirían un cambio del usuario de uno recibido del servidor, de una
restauración o de una migración, y perderían el significado de la operación. Para que un camino de escritura que se salte `Cambios` no pase
inadvertido, hay una prueba de **reproducción**: tras una batería de operaciones por los repositorios, se aplica solo la cola sobre una base
vacía y las dos bases deben quedar iguales.

`cola_cambios` (equivale a la de la especificación 2, con las columnas que hacen falta para que sea segura):

| Columna | Qué guarda |
| --- | --- |
| `id` | UUID del cambio: la clave de idempotencia (R15). |
| `secuencia` | Entero que crece; es el orden de envío. |
| `grupo_id` | UUID de la operación completa del usuario (un lote de `Cambios`: un parto con sus crías y su lactancia, una compra con su gasto). El servidor aplica un grupo entero o nada. |
| `orden` | Posición dentro del grupo (los padres antes que las crías). |
| `entidad`, `registro_id` | Tabla y fila. |
| `operacion` | `crear`, `modificar` o `eliminar`. |
| `campos` | JSON con los campos y sus valores nuevos (en `crear`, todos; en `modificar`, solo los que cambiaron; en `eliminar`, `eliminado_en`). Nunca lleva `pin_hash`. |
| `marca` | La marca híbrida del grupo (sección 5). Todas las operaciones de un grupo comparten la marca. |
| `usuario_id` | Quién lo hizo en el equipo (para el historial de los demás equipos). |
| `dispositivo_id` | Equipo que lo originó. |
| `enviado`, `enviado_en` | 0 o 1 y cuándo. Cuando el servidor confirma, `campos` se vacía (queda la fila, sin el contenido): así no se borra nada y la tabla no crece sin freno. |
| `rechazo` | Motivo, si el servidor rechazó el grupo (sección 4.4). |

### 4.2 La misma transacción y D-004

R15 pide que la cola y el cambio vayan «en la misma transacción». Hoy `Conexion.ejecutarLote` en el programa envía sentencias seguidas,
no una transacción: el plugin SQL usa un pool de conexiones y no garantiza que `BEGIN` y `COMMIT` caigan en la misma conexión (D-004, issue
`tauri-apps/plugins-workspace#886`, confirmado en la Etapa 1: 19 de 20 rondas fallaron). Con sentencias seguidas, un corte entre el cambio y
su entrada en la cola dejaría un dato que **nunca se enviará**. Es una pérdida silenciosa, justo lo que CA-26 y CA-28 prohíben.

Propuesta (D-004, que hoy está «Propuesta»): un comando de Rust, `ejecutar_lote`, que recibe la lista de sentencias y la ejecuta dentro de una
transacción de sqlx **sobre el mismo pool que ya abrió el plugin**. Comprobé en el código fuente de `tauri-plugin-sql` 2.5.0 que
`DbInstances` y `DbPool::Sqlite(Pool<Sqlite>)` son públicos, así que se puede hacer sin abrir una segunda conexión a la misma base. Hace falta
`sqlx` como dependencia directa, con la misma versión que usa el plugin. Si la aprobación llega, `Conexion.ejecutarLote` del programa pasa a
ser una transacción real y también mejora el parto (D-028), la restauración de respaldos (D-036) y todo lo que hoy depende de validar antes de escribir.

### 4.3 Ciclo de sincronización

1. **Despertar:** 3 segundos después de un guardado, cada 5 minutos, al volver la red, o con el botón.
2. **Armar el envío:** hasta 200 operaciones pendientes en orden de `secuencia`, sin partir un grupo. Un grupo más grande que el límite
   va solo.
3. **Llamar `sincronizar`** con el cursor (`desde`), la versión del esquema del programa, la hora del equipo y las operaciones.
4. **El servidor, en una transacción:** toma un candado por finca (un escritor a la vez, así el orden de `seq` es el de confirmación y ningún
   equipo se salta cambios al descargar), salta los cambios cuyo `id` ya conoce (`ya_aplicado`), mezcla los demás campo por campo, los agrega
   a `cambio`, y responde con los aceptados, los rechazados, las marcas corregidas, su hora y la siguiente página de cambios de **otros**
   equipos (hasta 500).
5. **El equipo, en una sola escritura local:** marca como enviados los aceptados, aplica los cambios ajenos (sección 6), guarda el cursor y la
   hora de la última sincronización.
6. Si hay más páginas o quedan pendientes, repite sin esperar; si no, duerme.

Los cambios propios que el servidor devuelve se ignoran al aplicar (ya están aplicados), salvo los que el servidor arbitró (sección 7).

### 4.4 Reintentos seguros (CA-28) y errores

- Si la petición **no llega**, no pasó nada: se reenvía lo mismo.
- Si la petición **llega y se procesa, pero la respuesta se pierde**, el equipo sigue viendo los cambios como pendientes, los reenvía y el
  servidor los reconoce por `id`, no los vuelve a aplicar y los responde como aceptados. Como todo el envío es una transacción, nunca queda a medias.
- Si el equipo se cierra entre la respuesta y su escritura local, pasa lo mismo que en el caso anterior.
- Los errores de red y las respuestas 5xx o 429 se reintentan con espera creciente (5 s, 15 s, 45 s… hasta 5 min, con algo de azar).
  Un 413 o un tiempo agotado reducen el tamaño del envío a la mitad. Una respuesta 401 renueva la sesión; si no se puede, el estado pasa a
  «inicia sesión otra vez» y el programa sigue funcionando.
- **Rechazos del servidor** (poco frecuentes, porque los choques de datos se mezclan en lugar de rechazarse): `finca_no_vinculada`,
  `dispositivo_revocado`, `esquema_antiguo`, `campo_reservado`, `entidad_invalida`, `demasiado_grande`. El grupo queda con `rechazo`,
  se avisa en el panel de sincronización y no se reintenta solo. No hace falta deshacer nada localmente porque las únicas operaciones que
  el servidor puede rechazar por reglas de negocio (emitir y anular registros) no se aplican en el equipo hasta que el servidor las acepta.
- **Tiempos de espera:** conectar 10 s; respuesta 30 s (60 s para un envío grande). Nada de la interfaz espera la sincronización: corre en
  segundo plano y la pantalla nunca se queda bloqueada por la red.

## 5. Reloj híbrido (R17)

**Problema:** el reloj de un equipo puede estar mal ajustado. Si se usara solo la hora local, un equipo adelantado ganaría todos los choques;
si se usara solo la hora de llegada al servidor, un cambio hecho sin red hace tres días le ganaría a uno hecho hoy en línea por otro equipo
(llegó después, pero se hizo antes). Ninguna de las dos refleja lo que pasó.

**Solución (SUPOSICION S-84):** reloj lógico híbrido (HLC) corregido con la hora del servidor.

- La marca es un texto que se compara byte a byte: `2026-10-02T19:23:27.123Z-0001-a1b2c3d4` = hora UTC con milisegundos, contador de
  4 dígitos hexadecimales y los primeros 8 caracteres del id del equipo. Orden total: primero la hora, luego el contador, luego el equipo.
  En Postgres se compara con `COLLATE "C"` (si no, el orden de la configuración regional lo estropearía).
- **Crear una marca:** hora = `max(hora corregida del equipo, hora de la última marca)`; si es igual a la última, el contador sube; si no, vuelve a 0.
  Así la marca nunca retrocede, aunque el reloj del sistema se atrase.
- **Recibir una marca ajena:** el reloj guardado pasa a ser el mayor entre el propio y el recibido (así lo que ya vio otro equipo queda
  «antes» de lo que se haga después).
- **Corrección:** en cada respuesta el servidor manda su hora. El equipo calcula `desfase = hora del servidor − punto medio de la petición` y
  la guarda. La hora corregida es la del reloj local más el desfase. Se mide al unirse (el equipo ya llega corregido) y en cada sincronización.
- **Protección contra relojes adelantados:** el servidor no acepta una marca más de **10 minutos** adelantada respecto de su hora: la acorta
  a su hora (conserva contador y equipo), la guarda con la marca original aparte, y le devuelve al equipo la marca corregida. El equipo
  reemplaza esa marca (exactamente igual) en su cola y en `marca_registro`. Sin esto, un equipo con la fecha en el año 2030 ganaría todos los
  choques para siempre y arrastraría el reloj de los demás.
- **Aviso:** si el desfase supera 2 minutos, el indicador de estado muestra «Reloj del equipo desajustado» con la diferencia.
- **Qué no resuelve:** un equipo que estuvo atrasado y sin red desde antes de unirse a la finca. Por eso un equipo que se une mide el desfase
  antes de poder escribir, y una edición hecha mientras el reloj estaba mal puede perder un choque que «merecía» ganar. Es el costo
  aceptado de no confiar en una autoridad central para cada cambio.

## 6. Conflictos (R16, RF-41, CA-27)

### 6.1 Mezcla por campo

`marca_registro` (una fila por registro: `entidad`, `registro_id`, `marca_base` y `campos`, un JSON `{campo: marca}` solo con los campos
que cambiaron después de crear el registro) guarda la marca de cada campo. La marca de un campo es `campos[campo] ?? marca_base`: un
pesaje que nunca se corrige ocupa una fila pequeña. El servidor guarda lo mismo en `registro.marcas`.

Regla para cada campo de una operación que llega: **se aplica si su marca es mayor o igual que la marca guardada.** (Igual solo ocurre al
reenviar la misma operación o al repetir un campo dentro del mismo grupo; en los dos casos aplicar de nuevo es inofensivo y conserva el
orden dentro del grupo.) Un `crear` es un `modificar` de todos los campos. Por eso la mezcla es **conmutativa, asociativa e idempotente**:
los equipos convergen aunque reciban los cambios en distinto orden o repetidos.

- Dos cambios en **campos distintos** del mismo animal se conservan los dos (CA-27, primera parte).
- En el **mismo campo** gana la marca más reciente; el equipo que recibe el cambio ganador escribe en su historial la fila
  «valor anterior → valor nuevo» como siempre. Si llega un cambio **perdedor** (marca menor que la guardada), no toca el registro pero queda
  en `historial_cambios` con `aplicado = 0` (el valor que se quedó en `valor_anterior`, el que perdió en `valor_nuevo`, con su hora y su
  autor originales). Así el valor que perdió no se pierde de vista (CA-27, segunda parte). La migración 0009 agrega a `historial_cambios`
  las columnas `marca`, `dispositivo_id` y `aplicado`.

### 6.2 Borrado y edición posterior: restauración con aviso (SUPOSICION S-85)

`eliminado_en` es un campo más con su propia marca, pero su efecto se **calcula** para que sea igual en todos los equipos:

> El registro está eliminado si `eliminado_en` tiene valor **y** su marca es mayor que la marca más reciente de cualquier otro campo
> (sin contar `creado_en` ni `modificado_en`). Si hay una edición posterior al borrado, el registro queda restaurado.

- Un equipo borra a las 10:00 y otro edita el nombre a las 10:05: el registro se restaura y los dos equipos muestran el aviso
  «X se eliminó en un equipo y se editó después en otro: se restauró» (`aviso_sincronizacion`, tipo `restaurado`).
- Un equipo edita a las 10:00 y otro borra a las 10:05: queda eliminado (gana el borrado, es posterior).
- Dentro de un mismo grupo la marca es la misma, así que borrar y tocar otros campos en la misma operación del usuario no se «restaura» a sí mismo.
- El aviso se genera cuando el estado calculado de un registro pasa de eliminado a vivo por una operación recibida; no se repite en reenvíos.

### 6.3 Choques con índices únicos y reglas de la base (SUPOSICION S-86)

Dos equipos sin red pueden crear cosas distintas que la base local no permite juntas. La regla general: **ningún cambio recibido se pierde
ni bloquea a los demás.** Si un cambio viola un índice único o un disparador, no se aplica: queda guardado completo en `aviso_sincronizacion`
(tipo `conflicto`, con la operación y el motivo) y el programa lo muestra en una lista «Conflictos de sincronización» para que el propietario
elija. Los cambios que dependían de él esperan en la misma lista y se reintentan solos al resolverlo. Para los casos frecuentes hay una
regla automática que se explica en el aviso:

| Choque | Qué pasa |
| --- | --- |
| Mismo nombre en `raza`, `libro`, `lote`, `usuario` o `categoria_economica` (índices de nombre único) | El que se creó después (marca de creación más reciente) queda con « (2)» al final (o « (3)»…). Los dos registros se conservan con su id, y el aviso lo dice. |
| `identificador_un_principal_por_animal` (dos equipos cambian el identificador principal del mismo animal) | Queda como principal el de marca más reciente en el campo `principal`; el otro pasa a no principal. Aviso. |
| `lactancia_una_abierta_por_hembra` (dos partos de la misma hembra registrados sin red) | Se aplica R5 al revés: la lactancia de menor fecha de inicio se seca el día anterior al inicio de la otra. Aviso. |
| `identificador_valor_vigente_unico` (el mismo arete o tatuaje en dos animales) | Conflicto: el propietario elige cuál queda. |
| `pesaje_leche_unico` (dos ordeñadores anotan el mismo animal, día y jornada) | Conflicto: se muestran los dos pesos (por ejemplo 3,2 y 3,4 L) y el propietario elige o deja uno. |
| `composicion_una_vez_por_raza`, `meta_peso_unica`, `libro_prefijo_unico`, `categoria_economica_nombre_unico` con distinto id, `registro_vigente_por_animal` (dos borradores para un animal), `movimiento_economico_un_gasto_por_servicio`, `traspaso_un_movimiento` | Conflicto manual. |
| Disparadores de R1 (sexo o orden de nacimiento de los padres), de R11 o de `traspaso` | Conflicto manual. |
| Falta el padre de una fila (la fila de la que depende no llegó o está en conflicto) | La operación espera y se reintenta después de cada sincronización. |

### 6.4 Revisión de integridad de dominio

Algunas reglas viven en el dominio y no en la base, así que el choque no lo detecta ningún índice. Después de aplicar cambios ajenos, el
equipo corre `revisarIntegridad` sobre los registros tocados y, si algo no cuadra, **solo avisa** (tipo `revision`; no cambia datos):
un ciclo en la genealogía (R1), una composición racial que no suma 100 % (R3) y un animal con dos ventas o dos compras (R20, R32).
La lista puede crecer sin tocar el servidor.

### 6.5 Orden de aplicación y referencias a sí mismas

Las operaciones se aplican en el orden del servidor (`seq`). Un cambio que depende de otro viene siempre después (el segundo equipo ya
había recibido el primero cuando lo hizo). `animal.padre_id` y `madre_id` se refieren a la misma tabla y R1 exige que el padre exista:
cuando llega un bloque de animales (descarga inicial), se insertan primero sin padres y luego se les asignan, con todos ya presentes.

### 6.6 Compras, ventas, finanzas y animales de otras fincas

Son tablas normales, sin trato especial, pero conviene dejar dicho cómo se comportan:

- Una **compra** promueve a «comprado» a un animal que ya existía como externo (R32, D-050). En la sincronización son cambios de campo del
  mismo animal (`origen`, `en_hato`, `estado`…) más un `crear` de `traspaso` y de `movimiento_economico`, todos en un grupo: o llegan juntos o no llegan.
- Una **venta** cambia el estado del animal y crea su `traspaso` y su ingreso. Dos equipos que vendan el mismo animal sin red producen dos
  ventas: el estado converge (es el mismo valor) y `revisarIntegridad` avisa de la venta doble.
- El **gasto de una monta** se enlaza por `evento_reproductivo_id` y hay un índice de un gasto vigente por servicio: dos equipos que lo
  ofrecen sin red chocan y quedan en la lista de conflictos.
- **Animales de otras fincas** (`origen = externo`, siempre `en_hato = 0`, D-043) viajan como cualquier animal, y su `contacto_id` apunta a un marcador (sección 8).

## 7. Registros genealógicos: números sin repetir ni saltar (R31, CA-17)

**Problema:** el número de un registro es el siguiente consecutivo de su libro, la base local impide saltos y repeticiones, y un número nunca
se reutiliza, ni siquiera si el registro se anula. Si dos equipos asignaran números cada uno por su lado, los dos entregarían el mismo número.
No hay mezcla por campo que lo arregle: uno de los dos tendría que cambiar un número ya impreso en un certificado.

**Solución (SUPOSICION S-87): el servidor asigna los números, de uno en uno.**

- **Sin red:** crear y editar **borradores** (no tienen número). Son registros normales y se sincronizan como los demás.
- **Con red:** `emitir_registros`, `reemitir_registro` y `anular_registro` son funciones del servidor, no cambios mezclables. Dentro del candado
  por finca, el servidor lee el siguiente número del libro (`libro_numeracion`), asigna los consecutivos a los registros pedidos **en el orden
  recibido** (así la emisión en lote no deja saltos, CA-17), actualiza el contador y registra el resultado como cambios arbitrados.
- **Flujo en el equipo:** (1) validar la lista de verificación y armar las instantáneas como hoy; (2) sincronizar (enviar y recibir) para emitir con
  lo último; (3) llamar a la función; (4) descargar hasta el `seq` del resultado: el equipo aplica los cambios de número, versión e instantánea
  como cualquier otro cambio recibido, en el orden en que el servidor los asignó, así los consecutivos llegan sin saltos y la base local no los rechaza;
  (5) generar los PDF y anotar los `certificado` (esos sí son cambios normales de la cola).
- **Idempotente:** la llamada lleva un `cambio_id`. Si la respuesta se pierde, el reintento devuelve el mismo resultado sin consumir otro número.
  Si el programa se cierra antes del paso 4, los números ya quedaron asignados en el servidor y se aplican en la siguiente sincronización
  (los PDF se pueden regenerar: salen de la instantánea).
- **Dos emisiones simultáneas** (dos equipos a la vez sobre el mismo libro): el candado las ordena; la segunda recibe los números siguientes.
  Nunca se repite ni se salta uno. Es la prueba más importante de esta sección (sección 16).
- **Reemitir** lleva la `version` que el equipo vio. Si otro equipo reemitió antes, el servidor responde `version_cambio` y el equipo debe
  mirar la nueva versión antes de volver a reemitir. **Anular** es idempotente (anular un anulado no hace nada) y no se puede reemitir después.
- **Reglas que siguen valiendo:** un animal tiene un solo registro vigente; un animal de otra finca no tiene registro propio; un
  número no cambia, no se reutiliza y no se reordena.
- **Configurar la numeración** (prefijo, separador, dígitos y número inicial) mientras no haya registros emitidos en el libro es un cambio
  normal. Subir el «siguiente número» después de haber emitido también lo decide el servidor, que no deja bajarlo por debajo del último emitido.
- **Un equipo sin vincular** sigue emitiendo con su contador local, como en la 0.5.0.
- **Certificados internos y expedientes** (`CP-AAAA-NNNN`, tipo `propio` o `asociacion`, no son registros genealógicos): no necesitan al
  servidor, pero el número es único en la base. En un equipo vinculado, el número lleva el código del equipo al final (`CP-2026-0007-B`; el
  servidor reparte las letras al unirse el equipo, SUPOSICION S-88), así dos equipos nunca producen el mismo. El contador local
  (`siguienteNumero`) toma los dígitos que siguen al año y se detiene en el guion, así que los certificados anteriores siguen contando.
- **Primera subida de datos con registros ya emitidos:** el servidor los acepta (con `importar_registros_emitidos`, una sola vez por finca, solo
  si el servidor aún no tiene registros emitidos), revisa que no haya saltos ni repeticiones por libro y fija el contador de cada libro en
  `último + 1` (sección 12).

## 8. Datos personales y PIN (R28, SUPOSICION S-90)

**Contactos.** `contacto` (compradores, vendedores, dueños de sementales) no se sincroniza nunca en esta etapa: R28 dice que debe poder
excluirse y antes de cobrar o publicar datos de terceros hace falta la revisión legal. Los id sí viajan, porque `animal.contacto_id` y
`traspaso.contacto_id` (obligatorio en una compra o venta) los necesitan. En el otro equipo, al recibir un id que no existe, el programa crea
un **marcador**: una fila de `contacto` con ese id, el nombre «Contacto guardado en otro equipo» y `marcador = 1` (columna nueva de la
migración 0009, con valor por defecto 0). La pantalla muestra «datos en otro equipo»; si el propietario escribe los datos del contacto
en este equipo, `marcador` pasa a 0 y siguen siendo solo de este equipo. Las filas de `contacto` nunca entran en la cola ni en la subida inicial. Sincronizar contactos entre tus
equipos podría ser un interruptor futuro, después de la revisión legal.

**PIN.** `usuario.pin_hash` (PBKDF2) **no sale del equipo**: un hash de un PIN de 4 a 6 dígitos se descifra en segundos por fuerza bruta,
así que subirlo a un servidor sería regalar los PIN si alguien accede a él. Los usuarios sí se sincronizan (nombre, rol, contacto del usuario).
En el equipo que los recibe llegan con `pin_pendiente = 1` (columna local nueva): no se pueden elegir en la pantalla de entrada hasta que
el propietario les defina un PIN **en ese equipo** (Ajustes → Usuarios). Quien une el equipo es el titular de la cuenta (ya demostró quién es
con su correo y contraseña): elige quién es y define su propio PIN durante la unión.

## 9. Archivos: fotos, adjuntos y certificados (SUPOSICION S-91)

Los archivos son **inmutables**: el nombre de una foto (`fotos/<uuid>.<ext>`), de un adjunto (`documentos/adjunto-<uuid>.<ext>`) o de un
certificado (`documentos/<número>.pdf`) no cambia ni se reescribe. Eso simplifica todo: no hay conflictos de contenido.

- **Subir:** cuando una operación nueva menciona un archivo (`animal.foto`, `certificado.archivo`, `traspaso.adjuntos`), el archivo entra en una
  cola aparte (`cola_cambios` con `entidad = archivo`). Se sube al almacenamiento privado `archivos` del proyecto, en la ruta
  `<finca_id>/<ruta del archivo>`, sin sobrescribir. La fila de datos se sincroniza sin esperar al archivo.
- **Descargar:** después de cada sincronización, el equipo busca filas que mencionan un archivo que no está en su carpeta de datos y lo baja en segundo
  plano, de a uno, con reintentos. Mientras no llega, la ficha muestra «Foto en camino» y los documentos «Archivo pendiente de descargar».
  Nada espera un archivo.
- **Seguridad:** el almacenamiento es privado; las políticas de Storage permiten leer y escribir solo bajo la carpeta de una finca de la que la
  cuenta es miembro (sección 11). No hay URL públicas.
- **Tamaño:** las fotos se copian sin reducir (S-23). El plan gratuito tiene un tope de almacenamiento de archivos (1 GB según lo que consulté
  en la Puerta 1; verificar). Es un riesgo de volumen, no de diseño: reducir las fotos al subirlas queda para la Etapa 15 (si hace falta antes,
  se decide con datos reales del piloto).
- Los PDF de un registro propio se pueden regenerar desde su instantánea; igual viajan, por ser archivos del equipo que los emitió.
- El respaldo `.zip` sigue siendo local y completo (`datos.json`, `fotos/`, `documentos/`).

## 10. Cuentas, fincas y dispositivos (RF-40, R23, SUPOSICION S-89)

- **Cuenta:** correo y contraseña con Supabase Auth. El programa no guarda la contraseña: la manda por HTTPS al iniciar sesión y recibe una sesión.
  La sesión (el token de renovación) se guarda en el **llavero del sistema** (Windows Credential Manager, llavero de macOS) con el crate
  `keyring`, no en la base ni en un archivo. Si el sistema no tiene llavero, el programa pide iniciar sesión otra vez al abrir: nunca guarda
  la sesión en texto plano. (Decisión 5.)
- **Quién puede crear una finca en el servidor:** solo los correos que tú autorices (`cuenta_autorizada`, una lista corta que administras en el
  panel de Supabase). Sin esto, quien conozca la dirección del proyecto podría crear cuentas y fincas vacías y gastar el plan gratuito.
  La Etapa 14 reemplaza esta lista por la suscripción. Un correo no autorizado puede registrarse, pero solo puede unirse a una finca con un código de invitación.
- **Tablas del servidor** (la especificación 2 pide `cuenta` y `membresia`): `cuenta` (id de Auth, correo), `finca_servidor` (id = el id de la
  `finca` local, nombre, `version_esquema_minima`), `membresia` (cuenta, finca, rol: hoy solo `propietario`), `dispositivo` (id, finca, cuenta,
  nombre, plataforma, `ultima_sincronizacion`, `revocado_en`) e `invitacion` (código guardado como hash, vence, un solo uso, contador de intentos).
- **Primer equipo (crea la finca en el servidor):** Ajustes → Sincronización → «Vincular este equipo» → iniciar sesión o crear la cuenta → el programa
  llama `crear_finca` con el id de la finca local → empieza la **primera sincronización** (sección 12).
- **Segundo equipo:** instala el programa; en la pantalla inicial elige «Ya tengo una finca» (en lugar de crearla) → inicia sesión → si la cuenta
  ya es miembro de la finca, la elige de la lista; si no, escribe un **código de invitación** → el equipo se registra, mide el reloj, descarga todo
  (sección 12) → el titular define su PIN en ese equipo (sección 8).
- **Código de invitación:** lo genera un propietario en Ajustes → Sincronización → «Agregar otro equipo». Diez caracteres (alfabeto sin letras que se
  confunden, unos 50 bits), vence a las 24 horas, sirve una vez, el servidor solo guarda su hash y bloquea después de 5 intentos fallidos.
  Quien lo canjea queda como miembro con el rol que traía la invitación (hoy `propietario`).
- **El segundo equipo debe estar vacío** (instalación nueva, sin animales). Un equipo que ya tiene datos no se puede unir a una finca ajena: no se mezclan
  dos bases. El programa lo dice y ofrece primero una copia de respaldo. Es la forma de no fabricar duplicados masivos (SUPOSICION).
- **Desvincular** un equipo: detiene la sincronización, los datos locales se quedan y se pide confirmar si hay cambios sin enviar (se avisa cuántos).
  Un propietario puede **revocar** otro equipo desde Ajustes: la próxima vez que ese equipo llame al servidor recibe `dispositivo_revocado`,
  se desvincula solo y avisa que sus datos locales siguen ahí.
- **Permisos (R23):** en el servidor solo existe el rol `propietario`; la separación propietario y operario de R14 sigue aplicándose en cada equipo. Los
  roles de servidor (veterinario, operario con cuenta propia) y CA-31 son de la Etapa 14. La pantalla de sincronización y la unión de equipos
  solo las ve el propietario; el indicador de estado lo ve cualquiera.
- **Restaurar un respaldo** no se permite en un equipo vinculado (primero se desvincula): la base restaurada no coincidiría con el cursor ni con las
  marcas, y mezclar eso es fabricar conflictos. Lo mismo para «Limpiar datos de prueba» en Ajustes → Base de datos.

## 11. Servidor: tablas, funciones y seguridad

Migraciones de Postgres en `servidor/migraciones/NNNN_*.sql` (numeradas, nunca editadas una vez aplicadas, con huellas como las del programa),
aplicadas con la CLI de Supabase (`docs/SERVIDOR.md` dirá cómo, paso a paso).

| Tabla | Para qué |
| --- | --- |
| `cuenta`, `cuenta_autorizada`, `finca_servidor`, `membresia`, `dispositivo`, `invitacion` | Cuentas y vínculos (sección 10). |
| `cambio` | Bitácora: `seq` (crece), `finca_id`, `cambio_id` (único por finca), `grupo_id`, `dispositivo_id`, `entidad`, `registro_id`, `operacion`, `campos`, `marca`, `marca_original`, `arbitrado`, `recibido_en`. Solo se agrega. |
| `registro` | Estado actual: `finca_id`, `entidad`, `registro_id`, `campos` (jsonb), `marcas` (jsonb, igual que `marca_registro`). |
| `libro_numeracion` | Siguiente consecutivo por finca y libro (R31). |

**Funciones** (SQL, `security definer`, `search_path` vacío, cada una comprueba que `auth.uid()` sea miembro de la finca): `registrar_cuenta`,
`crear_finca`, `mis_fincas`, `crear_invitacion`, `unirse_a_finca`, `revocar_dispositivo`, `sincronizar`, `iniciar_descarga` y `descargar_pagina`
(para un equipo nuevo), `emitir_registros`, `reemitir_registro`, `anular_registro`, `importar_registros_emitidos`, `resumen_finca`.

**Aislamiento entre cuentas (RLS y permisos):**

- Todas las tablas con RLS activa y **sin política de lectura ni escritura directa**; a `anon` y `authenticated` se les quita todo permiso sobre
  las tablas. Solo pueden ejecutar las funciones listadas. Aunque alguien obtuviera la clave pública del proyecto (que es pública por diseño),
  no puede leer ni escribir tablas por la API.
- Cada función acepta la finca como parámetro y la comprueba contra `membresia`, no contra lo que diga el cliente. Una cuenta de otra
  finca recibe el mismo error que si la finca no existiera (no se revela si existe).
- Storage: política por carpeta (`<finca_id>/...`) con la misma comprobación de membresía, para leer y para escribir.
- Límites de entrada: máximo 500 operaciones y 2 MB por envío, `entidad` con formato `^[a-z_]{1,40}$`, valores `jsonb` de tamaño acotado.
- El Auth de Supabase ya limita los intentos de inicio de sesión y de registro (los números exactos se verifican al implementar).

**Cómo se mezcla en el servidor** (resumen de `aplicar_cambio`): para cada campo de la operación, si su marca (comparada con `COLLATE "C"`) es
mayor o igual que la guardada en `registro.marcas`, se actualiza el valor y la marca; luego se recalcula el efecto de `eliminado_en` (sección 6.2).
Las operaciones que tocan campos reservados de `registro_genealogico`, o crean un registro que no sea borrador, se rechazan con `campo_reservado`.
Cada grupo va dentro de su propia subtransacción: si un grupo se rechaza, los demás del envío siguen.

**Versiones del programa:** el envío lleva la versión de esquema del programa (`VERSION_ESQUEMA`). `finca_servidor.version_esquema_minima` sube
cuando un equipo con una versión mayor sincroniza. Un equipo con una versión menor deja de sincronizar (el programa sigue funcionando sin red y
dice «Actualiza el programa para seguir sincronizando») hasta que se actualice (S-93). Orden de despliegue: primero el servidor, luego el instalador.

## 12. Primera sincronización y unión de un segundo equipo (CA-26, CA-33)

**Primer equipo con datos (por ejemplo, la base del piloto ya actualizada desde la 0.1.0):**

1. Antes de subir nada, el programa guarda una **copia de respaldo `.zip` automática** en la carpeta de datos (S-92). Si algo sale mal, el
   respaldo existe.
2. La subida **no** pasa por `cola_cambios` (duplicaría la base en la cola): lee tabla por tabla, en el orden de dependencias del registro de
   entidades, en lotes pequeños (200 filas, y mitad si el servidor responde con tiempo agotado). Cada fila viaja como un `crear` con todos sus
   campos, una marca derivada de su `modificado_en` y un `cambio_id` **determinista** (calculado a partir de finca, tabla y fila), así que repetirla no
   duplica nada.
3. Es **reanudable**: el progreso (`tabla`, `último id`) se guarda en `sincronizacion_estado`; si se corta, continúa donde quedó. Mientras sube,
   el equipo sigue funcionando; lo que el usuario edite va por la cola normal con marcas más nuevas y gana a lo ya subido.
4. Los contactos y los hash de PIN **no** se suben. Los registros ya emitidos entran por `importar_registros_emitidos`, que fija los contadores (sección 7).
5. **Verificación (lo que revisa Josias):** al terminar, el programa llama `resumen_finca` y compara con la base local, **tabla por tabla**:
   cantidad de filas (incluidas las eliminadas) y una huella (hash de los ids ordenados más la última modificación). Muestra una pantalla
   «Primera sincronización: 16 de 16 animales, 120 de 120 pesajes… todo coincide» o la lista de lo que no coincide, y la deja guardada como
   archivo de texto en la carpeta de documentos para que la puedas guardar. Si hay diferencias, el programa no da la sincronización por
   buena y propone repetir la subida de lo que falta.

**Segundo equipo (descarga):**

1. Se une (sección 10), mide el reloj y llama `iniciar_descarga`: el servidor responde con el `seq` actual (`seq_inicial`) y el orden de entidades.
2. Descarga el estado actual por páginas (500 filas) de cada entidad, en orden de dependencias, y escribe cada página en una sola transacción (D-004), con
   sus marcas. Una descarga a medias se retoma (el progreso queda guardado).
3. Termina pidiendo los cambios con `seq` mayor que `seq_inicial`. Como mezclar es idempotente, no importa que las páginas ya incluyeran algunos
   de esos cambios.
4. Se verifica igual que en el primer equipo y recién ahí el equipo pasa a «al día».
5. Los usuarios llegan con `pin_pendiente`; los contactos como marcadores; los archivos empiezan a bajar en segundo plano.

**Migración local de la 0.1.0 (CA-33):** la migración 0009 (sección 13) solo agrega tablas, columnas con valor por defecto e índices. Se prueba,
como las anteriores, con la copia de respaldo de la 0.1.0 (`src/datos/muestras/`), en Vitest y con los programas reales
(`pruebas-e2e/actualizacion.mjs`): todos los datos siguen ahí, el equipo queda **sin vincular** y no hay llamadas de red hasta que el usuario
vincule.

## 13. Cambios en la base local (migración 0009, `VERSION_ESQUEMA` 9)

Todo con las convenciones de siempre (tablas `STRICT`, UUID, marcas de tiempo UTC, disparadores que impiden `DELETE`):

- `dispositivo`: `id`, `nombre`, `plataforma`, `ultima_sincronizacion` (más `propio` 0 o 1; el equipo conoce a los demás por el servidor, solo para mostrar).
- `sincronizacion_estado`: pares `clave`, `valor` (`finca_servidor`, `cuenta_correo`, `cursor_seq`, `marca_ultima`, `desfase_ms`, `subida_inicial`,
  `descarga_inicial`, `codigo_equipo`, `version_esquema_servidor`). Nunca guarda contraseñas ni tokens.
- `cola_cambios`, `marca_registro` (clave primaria `entidad` y `registro_id`) y `aviso_sincronizacion` (`tipo`: `restaurado`, `renombrado`, `conflicto`,
  `revision`, `reloj`; `entidad`, `registro_id`, `detalle`, `operacion` opcional, `resuelto_en`).
- `contacto.marcador` (0 o 1, por defecto 0), `usuario.pin_pendiente` (0 o 1, por defecto 0).
- `historial_cambios`: columnas `marca`, `dispositivo_id`, `aplicado` (por defecto 1), con un índice para consultar por registro y campo.
- Las tablas locales se agregan a una lista de «sin respaldo» con su motivo; la prueba de `TABLAS_RESPALDO` sigue exigiendo que no se olvide ninguna.
- La migración, su huella y su registro en `src-tauri/src/lib.rs` (D-005 y D-010), como siempre.

## 14. Estado visible y funcionamiento sin red (RF-40, CA-30)

- **Indicador** en la barra lateral (todos los roles), con texto y no solo color: «Sin vincular», «En línea · al día · última sincronización hace 3 min»,
  «En línea · sincronizando…», «Sin conexión · 4 cambios por enviar», «Hay un problema (2)» (rechazos o conflictos), «Inicia sesión otra vez»,
  «Actualiza el programa para sincronizar», «Reloj del equipo desajustado».
- «En línea» no se deduce de `navigator.onLine`, que se equivoca con redes sin salida a internet: es el resultado del último intento de hablar con el servidor.
- **Panel** (Ajustes → Sincronización, solo propietario): estado, equipos vinculados con su última sincronización, cambios pendientes, rechazos y conflictos con
  sus botones de resolver, vincular o desvincular, agregar equipo, «Sincronizar ahora» y el informe de la primera sincronización.
- **Sin configurar** (la dirección del servidor aún es la de ejemplo): no aparece ninguna llamada, el indicador dice «Sin vincular» y los
  permisos de Tauri solo incluyen la dirección de ejemplo, que no resuelve nada. CA-30 y la prueba «cero red» (D-039) siguen valiendo como hoy.
- **Configurada:** la URL del proyecto y su clave pública (publishable) las escribe el flujo de GitHub desde **variables** del repositorio (no son
  secretos; la clave pública está pensada para ir en el programa) en el archivo de configuración del servidor y en el permiso de red de Tauri
  (`src-tauri/capabilities/sincronizacion.json`). El instalador de producción tiene la dirección de producción; `npm run tauri dev` usa la de
  pruebas, con una configuración de Tauri aparte. Una prueba compara el permiso con la lista exacta de direcciones declaradas, y `src/seguridad.test.ts`
  pasa de «cero red» a «solo `src/sincronizacion/red.ts` hace llamadas de red, solo a esa dirección».
- Textos solo en `src/textos/es.ts`, sin jerga («cola», «marca», «cursor» no aparecen en pantalla).

## 15. Seguridad y operación (SUPOSICION S-94)

- **Conexión cifrada:** el programa rechaza cualquier dirección que no sea `https://`; el plugin HTTP valida los certificados.
- **Secretos:** la clave `service_role` y la contraseña de la base de Supabase **nunca** van en el programa ni en el repositorio. En el programa solo está
  la URL y la clave pública (RLS y funciones son las que protegen). Las claves que sí son secretas (token de acceso de Supabase para desplegar,
  cadena de conexión para la copia del servidor) van en **secretos de GitHub** o en tu terminal, y tú las escribes ahí: no me las pasas por el chat.
- **Dos proyectos:** uno de pruebas y otro de producción, con direcciones y claves distintas. Las pruebas automáticas, los datos de ejemplo y las
  pruebas con tus dos computadores usan el de pruebas; los datos reales del aprisco solo entran al de producción cuando tú lo decidas.
  Si el plan gratuito no permite dos proyectos activos, se verifica al implementar y se te propone la alternativa.
- **Datos reales:** no los uso ni los subo a ningún servicio sin tu permiso.
- **Registro de actividad del servidor:** sin contraseñas ni tokens; el programa tampoco los escribe en sus archivos de registro.
- **Copia periódica de la base central:** el plan gratuito no trae copias automáticas. Un flujo semanal de GitHub Actions (apagado hasta que agregues el
  secreto) haría un volcado de la base y lo guardaría 14 días como artefacto del repositorio. Si el repositorio es público, **no** se activa. Cada equipo
  tiene una réplica completa de los datos y el respaldo `.zip` local; esta copia es una capa extra, y con el plan de pago se reemplaza por las copias del servicio.
- **Límites del plan gratuito que importan:** se pausa tras unos 7 días sin actividad (el programa muestra «Servidor en pausa; se reactiva desde el panel»
  y sigue funcionando sin red), 500 MB de base de datos y 1 GB de archivos. Mi estimación (sin medir) es que la base con la prueba de 500 animales cabe
  holgada; se mide en la implementación y se agrega al informe. La bitácora `cambio` crece sin parar: se deja anotado compactarla (guardar el estado y
  borrar cambios que todos los equipos ya recibieron) como tarea de mantenimiento futura. Todo esto se confirma contra la página oficial al implementar.

## 16. Pruebas

Se escriben antes que el cliente o a la par. Nada de esto toca datos reales ni el servicio real.

| Qué | Cómo |
| --- | --- |
| R15: la cola y el cambio van juntos; reenvío sin duplicados | `Cambios` con la base en memoria: si la sentencia de la cola falla, no queda ni el dato. Reenviar el mismo envío 3 veces deja una sola copia en el servidor. |
| R15 y reproducción | Una batería de operaciones por todos los repositorios; aplicar solo la cola sobre una base vacía da la misma base. |
| **CA-26** | Dos clientes simulados. El A, sin red, registra un ordeño, un tratamiento y un parto con sus crías; al volver la red el B los tiene, sin duplicados ni pérdidas, incluido el historial. |
| **CA-27** | (a) Campos distintos del mismo animal: se conservan ambos. (b) Mismo campo: gana la marca más reciente en los dos equipos y el valor que perdió queda con `aplicado = 0`. (c) Borrar en uno y editar después en el otro: se restaura con aviso; editar y luego borrar: queda borrado. |
| **CA-28** | `RedSimulada` con fallas: corte antes de llegar, corte después de procesar (respuesta perdida), entrega duplicada, páginas fuera de orden. En cada caso, la bitácora del servidor tiene cada cambio una vez, la cola queda vacía y el segundo equipo no tiene duplicados. |
| R16 y R17 con vectores | `servidor/vectores-fusion.json` corre contra la mezcla en TypeScript y contra la de SQL. Relojes desfasados ±2 días, marca adelantada (se acorta), marca que nunca retrocede. |
| Convergencia | Tres clientes con operaciones y cortes al azar (generador con semilla, sin dependencias nuevas): al final, todos los equipos y el servidor tienen el mismo estado. |
| **R31 (numeración)** | Dos clientes emiten a la vez sobre el mismo libro, también en lote y reintentando: los números son exactamente `1..n`, sin repetir ni saltar, y cada equipo los recibe en orden. Con PGlite se prueban todos los entrelazados posibles de dos emisiones; con **Postgres real en GitHub Actions** y conexiones en paralelo se prueba el candado. Reemisión con versión vieja, anulación doble, respuesta perdida y reintento. |
| Aislamiento entre cuentas | Cuenta A y cuenta B con fincas distintas: B no lee ni escribe en la finca de A por ninguna función, tabla ni ruta de Storage; un código de invitación falla si venció, ya se usó o se probó mal 5 veces; un equipo revocado ya no puede sincronizar; `anon` no puede nada. |
| Primera subida y unión | Base de ejemplo con datos de todas las tablas: se sube, se verifica, se descarga en un cliente vacío y los conteos y huellas coinciden; con un corte a mitad de la subida y de la descarga. Sin contactos ni PIN en el servidor. |
| Marcadores de contactos | Una compra sincronizada se ve en el otro equipo con su marcador y sin datos personales; el servidor no tiene ninguna fila de `contacto`. |
| **CA-30** | Sin red o con la sincronización sin configurar, el programa abre y funciona completo (las pruebas de extremo a extremo de las etapas 2 a 9 siguen corriendo en un espacio de red vacío, como en CA-10). |
| **CA-33** | `actualizacion.test.ts` con la copia de la 0.1.0 y `pruebas-e2e/actualizacion.mjs` con los programas reales, con la 0009 incluida. |
| Seguridad | `src/seguridad.test.ts` actualizado (sección 14 y 17): una sola dirección, solo `red.ts` hace llamadas, sin contraseñas ni tokens escritos en archivos de la base ni del repositorio, el PIN nunca en la cola. |

Lo que las pruebas automáticas **no** cubren, y queda para ti con los dos computadores y el proyecto de pruebas: la conexión real a Supabase (Auth con
correo, tiempos reales, límites del plan) y la primera sincronización con tu base del piloto. Te dejaré los pasos exactos y qué deberías ver en `docs/PRUEBAS.md`.

## 17. Cambios en el repositorio y dependencias

**Archivos nuevos o cambiados** (todo se construye después de tu visto bueno):

- `src/dominio/sincronizacion/`: `hlc.ts`, `fusion.ts`, `entidades.ts`, `cola.ts` (armado de envíos), `choques.ts`, `integridad.ts`, `estado.ts` (puras, con Vitest).
- `src/sincronizacion/`: `red.ts` (único con llamadas de red), `cuenta.ts`, `cliente.ts` (el ciclo), `aplicador.ts` (aplica lo recibido), `archivos.ts`, `primera.ts`.
- `src/datos/cambios.ts` (cola, marcas, reloj), `src/datos/conexion*.ts` (`ejecutarLote` transaccional), `src/datos/respaldo.ts` (lista de tablas locales),
  migración `0009_sincronizacion.sql` con su huella, `VERSION_ESQUEMA` 9, repositorios de sincronización.
- `src/pantallas/ajustes/` (Sincronización), indicador en `BarraLateral`, «Ya tengo una finca» en el asistente, lista de conflictos, textos en `es.ts`.
- `servidor/`: `migraciones/`, `pruebas/`, `vectores-fusion.json` y su `LEEME.md`; `docs/SERVIDOR.md` (despliegue, costo y dónde guardar secretos).
- `src-tauri`: `ejecutar_lote` (D-004), almacenamiento de la sesión (`keyring`), permiso del plugin HTTP.
- `src/seguridad.test.ts`, `src/aceptacion.test.ts` (listas cerradas actualizadas), `.github/workflows/` (Postgres para la prueba de candado, copia semanal apagada).

**Dependencias nuevas (se verifica versión, licencia y mantenimiento en su documentación oficial al agregarlas, no de memoria):**
`@tauri-apps/plugin-http` y `tauri-plugin-http` (oficiales de Tauri, MIT o Apache), `keyring` (crate), `sqlx` directo (la misma versión que usa el
plugin SQL), `@electric-sql/pglite` (desarrollo, para probar las funciones de SQL sin instalar Postgres) y, para el servicio de Postgres de CI, `pg` (desarrollo).
Las listas cerradas de `src/seguridad.test.ts` se actualizan una por una y la prueba de «sin red» se reescribe según la sección 14.

**Decisiones que se anotarán en `CLAUDE.md`** (cuando las apruebes): D-054 sincronización propia sobre Supabase con bitácora más estado y mezcla por campo; D-055
números de registro asignados por el servidor y emisión que requiere conexión; D-056 contactos y PIN fuera de la sincronización; D-057 red solo por el plugin HTTP con
una dirección declarada; y la aprobación de D-004.

## 18. Riesgos y lo que no cubre

- **Es la etapa más grande hasta ahora** y toca el único punto por el que pasan todas las escrituras (`Cambios`). Por eso hay una prueba de reproducción y una de convergencia.
- **No se puede probar la red real desde mi entorno** (Supabase está bloqueado). Dependo de las pruebas con Postgres local y de tu prueba con los dos computadores.
- **Verificar al implementar** (comportamientos de Supabase que no confirmé en su documentación oficial): límites del Auth con correo y confirmación (el remitente
  gratuito tiene límites muy bajos; puede hacer falta desactivar la confirmación en el piloto o usar tu propio remitente), cantidad de proyectos gratuitos,
  qué cuenta como actividad para la pausa de 7 días, tiempo máximo de una consulta con el rol `authenticated` (afecta el tamaño de los lotes), el tamaño máximo de un archivo
  y la forma de leer `auth.uid()`.
- **Sin seguimiento en tiempo real:** si dos personas ordeñan a la vez en dos equipos, ven lo del otro en minutos, no al instante.
- **Un equipo con el reloj muy mal puesto** antes de unirse puede perder choques que merecía ganar (sección 5).
- **Fusionar dos bases con datos** no se hace: el equipo que se une debe estar vacío (sección 10).
- **Conflictos manuales:** si el uso real genera muchos choques de un mismo tipo, se agregará una regla automática; la lista de la sección 6.3 está pensada para crecer.
- **Contactos** no se comparten entre tus equipos (por R28): las compras y ventas se ven en el otro equipo con un marcador.
- No cubre: la eliminación definitiva de una cuenta (R28), roles de servidor (Etapa 14), compactación de la bitácora, reducción de fotos, ni la sincronización en segundo plano con el programa cerrado.

## 19. Orden de construcción después de tu visto bueno

Corresponde a los pasos 3 a 9 de la Etapa 10:

1. Comando `ejecutar_lote` y su prueba (D-004), porque lo demás se apoya en él.
2. Migración 0009, reloj, `fusion.ts` con sus vectores y las pruebas de R15, R16 y R17.
3. Servidor: migraciones de Postgres, funciones, RLS y las pruebas de aislamiento y de numeración con PGlite y con Postgres real en CI.
4. Cliente: cola en `Cambios`, `Red` y `RedSimulada`, ciclo, aplicador, indicador y panel; CA-26, CA-27, CA-28.
5. Primera sincronización, descarga y verificación; archivos.
6. Pruebas de actualización desde la 0.1.0 (CA-33), seguridad y `docs/SERVIDOR.md`; versión **0.6.0** con instaladores (flujo de D-041).

Al cerrar: resumen de diez líneas, pasos para que pruebes con tus dos computadores, las pruebas ejecutadas con su resultado real y un commit claro.

## Glosario corto

- **Cola de cambios:** la lista de lo que este equipo hizo y el servidor aún no ha confirmado.
- **Idempotente:** hacerlo dos veces da lo mismo que hacerlo una. Es lo que permite reintentar sin miedo.
- **Marca / reloj híbrido (HLC):** una hora que además tiene contador y equipo, para que dos cambios siempre se puedan ordenar y nunca retroceda.
- **Mezcla por campo:** cada campo de un registro tiene su propia marca; gana el valor con la marca más reciente.
- **Arbitrado:** que lo decide el servidor, de uno en uno (los números de registro).
- **Marcador:** una fila de contacto vacía que ocupa el lugar de un contacto que vive solo en otro equipo.
