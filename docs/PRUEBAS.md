# Pruebas de Registro Caprino

Qué prueba cada criterio de aceptación de la especificación (sección 11) y de la especificación 2 (sección 9), cómo
ejecutar las pruebas y el resultado de cada versión.

## Matriz de criterios de aceptación

| Criterio | Qué exige | Pruebas automáticas (Vitest) | Programa real (Linux, sin red) |
| --- | --- | --- | --- |
| **CA-01** (R1) | Rechaza como padre a una hembra, a un descendiente o a un animal nacido después, y explica el motivo | `src/dominio/genealogia.reglas.test.ts`, `src/datos/repositorios/animales.test.ts` | `pruebas-e2e/etapa2.mjs` |
| **CA-02** (R6) | Hijo de hermanos completos 25 %; de medios hermanos 12,5 % | `src/dominio/consanguinidad.test.ts`, `src/datos/repositorios/genealogia.test.ts` | `etapa2.mjs` (25 % en pantalla) |
| **CA-03** (R5) | Un parto de tres crías crea tres fichas con la madre y abre la lactancia | `src/dominio/reproduccion.test.ts`, `src/datos/repositorios/reproduccion.test.ts` | `etapa3.mjs` (parto de dos crías) |
| **CA-04** (R7) | Con retiro de 5 días, la alerta llega hasta el quinto día y desaparece al vencer | `src/dominio/salud.test.ts`, `src/datos/repositorios/salud.test.ts` | `etapa4.mjs` (alertas en Inicio, ordeño y ficha) |
| **CA-05** (R13) | El expediente trae todos los campos y la ascendencia hasta abuelos | `src/dominio/expediente.test.ts`, `src/documentos/documentos.test.ts`, `src/datos/repositorios/documentos.test.ts` | `etapa4.mjs` (PDF y CSV guardados) |
| **CA-06** (R2) | No admite dos animales con el mismo identificador vigente del mismo tipo | `src/dominio/identificadores.test.ts`, `src/datos/repositorios/animales.test.ts`, `src/datos/migraciones.test.ts` | `etapa2.mjs` |
| **CA-07** (R3) | Rechaza una composición racial que no sume 100 % | `src/dominio/composicion.test.ts`, `src/datos/repositorios/animales.test.ts` | `etapa2.mjs` |
| **CA-08** (R8) | La proyección coincide con el cálculo manual de la fórmula documentada | `src/dominio/leche.test.ts`, `src/datos/repositorios/leche.test.ts` | `etapa3.mjs` (curva y proyección) |
| **CA-09** | Guardar un pesaje de leche tarda menos de 1 s con 500 animales | `scripts/datos-de-rendimiento.test.ts` | `etapa3.mjs` (Enter → «Guardado» con 500 animales) |
| **CA-10** | Sin red funcionan los flujos 0 a 3 y 5 | `src/seguridad.test.ts` (sin código de red, CSP, dependencias, permisos) | `pruebas-e2e/todas.sh`: etapas 2, 3, 4, 6, 7, 8 y 9 dentro de un espacio de red vacío |
| **CA-11** | Los datos permanecen al cerrar y abrir; restaurar reproduce los mismos datos | `src/datos/respaldo.test.ts` | `etapa2.mjs` (cerrar y abrir), `etapa4.mjs` (restaurar y comparar tabla por tabla) |
| **CA-12** | Los instaladores se instalan y abren en un Windows y en un Mac | Manual: [PRUEBA_CA12.md](PRUEBA_CA12.md) | Lo hace el aprisco |

### Especificación 2 (desde la versión 0.2.0)

| Criterio | Qué exige | Pruebas automáticas (Vitest) | Programa real (Linux, sin red) |
| --- | --- | --- | --- |
| **CA-13** (R29) | Un externo aparece en el pedigrí, pero no en el inventario, el ordeño, los servicios propios, las alertas ni el conteo del tope; no se retira si es ancestro de un animal propio | `src/dominio/externos.test.ts`, `src/datos/repositorios/externos.test.ts` | `pruebas-e2e/etapa6.mjs` |
| **CA-14** (R30) | El parto de una hembra servida por un macho externo crea la cría con ese padre, y el pedigrí muestra su nombre y su propietario | `src/datos/repositorios/externos.test.ts` | `etapa6.mjs` (monta, parto y pedigrí) |
| **CA-15** (R30) | Dos servicios con machos distintos en la ventana de gestación: avisa, deja elegir al padre y marcarlo «sin verificar» | `src/dominio/reproduccion.test.ts`, `src/datos/repositorios/externos.test.ts` | `etapa6.mjs` |
| **CA-16** (R31) | No se emite un registro al que le falta un requisito, y el programa muestra cuál | `src/dominio/registros.test.ts`, `src/datos/repositorios/registros.test.ts` | `pruebas-e2e/etapa7.mjs` (lista de verificación, botón desactivado y enlace «Corregir») |
| **CA-17** (R31) | Números consecutivos por libro; el anulado conserva su número y no se reutiliza; el lote no deja saltos | `src/dominio/registros.test.ts`, `src/datos/repositorios/registros.test.ts`, `src/datos/migraciones.test.ts` (disparadores de la base) | `etapa7.mjs` (emisión sola y en lote, anulación y nueva emisión) |
| **CA-18** (R31) | Cambiar el padre después de emitir no altera el certificado emitido; reemitir crea la versión 2 con el mismo número | `src/dominio/registros.test.ts`, `src/datos/repositorios/registros.test.ts` | `etapa7.mjs` (cambia el padre, reemite y compara los dos PDF) |
| **CA-19** (R31) | El certificado de registro propio trae el rótulo obligatorio y el pedigrí correcto de tres generaciones, sin el nombre ni el diseño del certificado de ANCO | `src/documentos/registros.test.ts`, `src/dominio/pedigri.test.ts` | `etapa7.mjs` (PDF real revisado con `pdftotext` y `pdfimages`) |
| **CA-20** (R31) | El libro genealógico exportado coincide con los registros emitidos | `src/dominio/libro-genealogico.test.ts`, `src/documentos/registros.test.ts` (Excel leído celda por celda), `src/datos/repositorios/registros.test.ts` | `etapa7.mjs` (PDF y Excel exportados contra la base) |
| **CA-21** (R18) | El promedio de células somáticas por lactancia coincide con el cálculo manual e ignora los valores vacíos | `src/dominio/calidad-leche.test.ts`, `src/datos/repositorios/leche.test.ts`, `scripts/datos-de-ejemplo.test.ts` | `pruebas-e2e/etapa8.mjs` (ordeño con calidad, comparación, tabla ordenable y gráfico) |
| **CA-22** (R19) | El costo por cabra, el costo por lote y la rentabilidad coinciden con el cálculo manual, y los gastos sin asignar salen aparte | `src/dominio/finanzas.test.ts`, `src/datos/repositorios/finanzas.test.ts`, `scripts/datos-de-ejemplo.test.ts` | `etapa8.mjs` (resumen por finca, lote y animal; el reparto se compara con un cálculo hecho con la base) |
| **CA-23** (R32) | Comprar un animal que ya estaba como externo lo promueve a comprado, conserva su identidad y su genealogía, y desde la fecha de ingreso cuenta en el inventario; la compra guarda vendedor, precio, registro de asociación y adjuntos, y ofrece crear el gasto | `src/dominio/traspasos.test.ts`, `src/datos/repositorios/traspasos.test.ts`, `src/dominio/inventario.test.ts`, `src/datos/migraciones.test.ts` | `pruebas-e2e/etapa9.mjs` (compra de un externo con padre y madre, adjunto copiado a la carpeta de datos, gasto y conteo del inventario) |
| **CA-24** (R20) | Vender un animal lo deja como vendido, sin tocar su historial, su genealogía ni su registro propio; sale del ordeño, de los servicios y del inventario, y ofrece crear el ingreso | `src/dominio/traspasos.test.ts`, `src/datos/repositorios/traspasos.test.ts` | `etapa9.mjs` (venta de una cabra con registro emitido: estado, genealogía, registro, ordeño e inventario comparados con la base) |
| **CA-25** (R21) | La hoja de venta (PDF y Excel) trae el pedigrí de tres generaciones, la producción y el certificado de registro propio solo si se pide y existe, y ningún precio ni dato del contacto | `src/dominio/hoja-venta.test.ts`, `src/documentos/hoja-venta.test.ts` (Excel leído celda por celda) | `etapa9.mjs` (PDF y Excel descargados con el diálogo real y revisados contra la base; certificado opcional) |
| **CA-26** (R15) | Un ordeño, un tratamiento y un parto hechos sin red aparecen en el segundo equipo, sin duplicados ni pérdidas, al volver la red | `src/sincronizacion/sincronizacion.test.ts` (dos equipos simulados contra el servidor de pruebas), `src/datos/sincronizacion/captura.test.ts`, `cola.test.ts` | Manual con sus dos computadores: ver «Prueba con dos computadores» abajo |
| **CA-27** (R16) | Campos distintos del mismo animal se conservan ambos; en el mismo campo gana la marca más reciente y el valor anterior queda en el historial; una edición posterior a un borrado restaura y avisa | `src/sincronizacion/sincronizacion.test.ts`, `src/dominio/sincronizacion/fusion.test.ts`, `src/datos/sincronizacion/aplicador.test.ts`, `servidor/pruebas/mezcla.test.ts` | Manual (ídem) |
| **CA-28** (R15) | Un corte de red a mitad del envío no duplica ni pierde cambios al reintentar | `src/sincronizacion/sincronizacion.test.ts` (corte antes y después de que el servidor responda, entrega repetida y corte al recibir), `servidor/pruebas/sincronizar.test.ts` | Manual (ídem) |
| **CA-30** | Sin red el programa abre y funciona completo y nada espera a la red | `src/sincronizacion/servicio.test.ts`, `src/seguridad.test.ts` (una sola vía de red, una sola dirección, ninguna llamada con la dirección de ejemplo) | `pruebas-e2e/todas.sh` (sin red) |
| **CA-33** | Instalar una versión nueva sobre la 0.1.0 conserva todos los datos (con datos de ejemplo), también la tabla de compras y ventas y las tablas de la sincronización (el equipo actualizado se vincula, sube y otro equipo lo descarga igual) | `src/datos/actualizacion.test.ts` y `src/sincronizacion/sincronizacion.test.ts` (muestra hecha por la 0.1.0: `src/datos/muestras/`) | `pruebas-e2e/actualizacion.mjs` (programa 0.1.0 → programa nuevo) |
| R23 (roles) | El operario ve los externos, pero no crea ni edita externos ni contactos; tampoco ve Registros, Finanzas ni Compras y ventas, aunque sí anota la calidad de la leche | `src/dominio/permisos.test.ts`, `src/datos/repositorios/externos.test.ts`, `src/datos/repositorios/registros.test.ts`, `src/datos/repositorios/finanzas.test.ts`, `src/datos/repositorios/traspasos.test.ts` | `etapa6.mjs`, `etapa7.mjs`, `etapa8.mjs`, `etapa9.mjs` |
| R30 (con finanzas) | Al guardar una monta con costo se ofrece anotar el gasto, sin duplicarlo | `src/datos/repositorios/finanzas.test.ts` | `etapa8.mjs` (al guardar y desde la ficha del semental) |
| RF-36 (inventario) | El inventario del hato (PDF y Excel) tiene una fila por animal del hato, igual al total de la pantalla, e incluye a los comprados y deja fuera a los vendidos | `src/dominio/inventario.test.ts`, `src/documentos/hoja-venta.test.ts` | `etapa9.mjs` (PDF y Excel contra la base) |
| RF-50 (historial) | El historial de compras y ventas filtra por periodo, tipo y contacto, suma por separado lo comprado y lo vendido, y permite guardar de nuevo un adjunto | `src/dominio/traspasos.test.ts`, `src/datos/repositorios/traspasos.test.ts` | `etapa9.mjs` |

`src/aceptacion.test.ts` falla si algún criterio de CA-01 a CA-11 (o de los ya implementados de la especificación 2)
se queda sin prueba o si estas tablas dejan de nombrar alguno.

## Otras pruebas

- Migraciones (`src/datos/migraciones.test.ts`): huellas SHA-256, registro en Rust, restricciones de la base.
- Seguridad y privacidad (`src/seguridad.test.ts`): PIN siempre con hash (ni en la base, ni en el historial, ni en la
  copia de respaldo), sin telemetría, permisos mínimos de Tauri, datos en la carpeta del usuario.
- Usabilidad medible (`src/aceptacion.test.ts`): contraste WCAG AA de 17 combinaciones de colores, letra de 18 px y
  campos de 48 px de alto.
- Rust (`cd src-tauri && cargo test`): archivos de documentos y respaldo `.zip`, y los lotes de escrituras en una sola
  transacción (`src-tauri/src/lote.rs`, D-054: lote correcto, lote que falla a mitad, lote vacío, parámetros no admitidos,
  enlace de enteros y tildes, y 20 rondas con consultas simultáneas). También corre en Windows y macOS dentro del flujo de instaladores.
- Conexión del programa (`src/datos/conexion-tauri.test.ts`, con la API de Tauri simulada): un lote va entero a `ejecutar_lote`,
  un lote vacío no llama a Rust, el error llega a quien lo pidió y lo suelto sigue por el plugin SQL.
- Transacciones con el programa real (`pruebas-e2e/transacciones.mjs`): nació en la Etapa 1 como el experimento que dio origen a
  la decisión D-004 (sin transacción, 19 de 20 rondas fallaban). Desde D-054 comprueba que los lotes son transacciones reales: 0 de 20
  rondas con filas colgadas, un lote correcto deja sus filas y 4 lotes simultáneos no se bloquean.

- Sincronización (Etapa 10), todo con equipos simulados (cada uno es una base SQLite con su reloj; el servidor es Postgres en memoria):
  `src/sincronizacion/sincronizacion.test.ts` (primera subida y descarga con los datos de ejemplo completos, con cortes; CA-26, CA-27 y CA-28;
  dos emisiones de registros a la vez, sin red y con la respuesta perdida; tres equipos con cambios al azar y semilla fija que terminan idénticos y
  coinciden con el servidor; aislamiento entre cuentas y fincas; invitaciones y equipos retirados; relojes adelantados; CA-33),
  `servicio.test.ts` (segundo plano y CA-30), `archivos-y-pin.test.ts` (fotos y adjuntos, PIN de cada equipo), `red.test.ts`, y en `servidor/pruebas/`
  las funciones de Postgres (mezcla, sincronizar, cuentas, numeración, aislamiento, descarga). Desde el entorno de desarrollo no se puede salir a Supabase; el servidor sí se probó por internet
  el 2026-10-04 (ver «Resultado de la prueba contra el servidor real» más abajo). El programa de escritorio contra el servidor y los dos computadores los prueba usted con la guía de abajo.

## Prueba con dos computadores (Etapa 10)

Necesita: el servidor de pruebas ya creado (docs/SERVIDOR.md), un instalador construido con su dirección (variables `SERVIDOR_URL` y `SERVIDOR_CLAVE_PUBLICA` del repositorio; el instalador de prueba sale de «Run workflow» con la casilla «Solo probar»
marcada, que deja los instaladores en «Artifacts» y no crea ningún release: ver SERVIDOR.md, sección 6), dos computadores con el programa y una forma de confirmar el correo de su cuenta: Auth pide confirmarlo y el remitente integrado de Supabase solo escribe a miembros del
equipo de la organización (SERVIDOR.md, sección 3, paso 3). Al pulsar el enlace del correo, el navegador mostrará un error de conexión a `localhost`: es lo esperado.

1. En el computador 1, abra el programa con los datos de la finca. Vaya a **Ajustes → Sincronización**, inicie sesión con su cuenta (o créela) y pulse **Vincular y subir los datos**.
   Debería ver el avance por tablas y, al final, «Equipo vinculado». Pulse **Comprobar ahora**: debe decir «Todo coincide».
2. Pulse **Generar código** y anótelo (sirve una vez y dura 24 horas).
3. En el computador 2, recién instalado, elija **Ya tengo una finca en otro equipo**, inicie sesión con la misma cuenta (o escriba el código) y espere la descarga.
   Debería ver los mismos animales, partos, ordeños y registros. Defina el PIN de cada usuario en ese equipo (el PIN no viaja).
4. CA-26: desconecte el computador 1 de internet, registre un ordeño, un tratamiento y un parto. La barra lateral dice «Sin conexión · N cambios por enviar».
   Vuelva a conectar: en un par de minutos dice «Al día». En el computador 2 (conectado) pulse **Sincronizar ahora**: aparecen los tres registros, una sola vez.
5. CA-27: con los dos sin internet, cambie el nombre del mismo animal en cada uno y, en otro animal, el nombre en uno y el color en el otro. Conecte los dos:
   en el segundo caso se conservan ambos cambios; en el primero queda el más reciente. En Ajustes → Sincronización no debería haber avisos de error.
6. CA-28: en el computador 1 registre varios cambios y desconecte internet justo después de pulsar **Sincronizar ahora**. Vuelva a conectar y pulse de nuevo:
   en el computador 2 no debe haber nada repetido ni faltante.
7. R31: con los dos conectados, emita un registro genealógico en cada uno del mismo libro casi a la vez. Los números deben ser consecutivos y distintos en ambos.
   Sin internet, **Emitir** debe decir que necesita conexión; guardar un borrador sí funciona.
8. Compruebe que Ajustes → Sincronización → **Comprobar ahora** dice «Todo coincide» en los dos y guarde el informe CSV.

## Cómo ejecutarlas

```bash
npm test                         # Vitest: dominio, repositorios, documentos, respaldo, seguridad, sincronización y servidor
npm run tipos                    # revisión de tipos
cd src-tauri && cargo test       # Rust

# Programa real en Linux, sin red (ver docs/PRUEBA_TECNICA.md para preparar el equipo):
npx tauri build --debug --no-bundle
sudo sh pruebas-e2e/todas.sh capturas
```

## Resultado de D-004 / D-054: transacciones reales (2026-10-02, sobre el código de la 0.5.0)

Sin versión nueva: el cambio llega a los instaladores con la siguiente publicación.

| Prueba | Resultado |
| --- | --- |
| Vitest | 700 de 700 (695 + 5 de `conexion-tauri.test.ts`) |
| Tipos (`npm run tipos`) | sin errores |
| Rust | 14 de 14 (8 + 6 de `lote.rs`, entre ellas las 20 rondas con consultas simultáneas) |
| Transacciones con el programa real (`pruebas-e2e/transacciones.mjs`) | 4 de 4: 0 de 20 rondas con filas colgadas (antes, sin transacción: 19 de 20 con fallos); lote correcto deja sus 2 filas; 4 lotes simultáneos dejan sus 8 filas |
| Programa real sin red, Etapa 2 (Flujo 0) | 25 de 25 |
| Programa real sin red, Etapa 3 (Flujos 1 y 2, CA-09) | 24 de 24 |
| Programa real sin red, Etapa 4 (Flujos 3 y 5, CA-11, permisos) | 28 de 28 |
| Programa real sin red, Etapa 6 (R29, R30, CA-13 a CA-15, R23) | 23 de 23 |
| Programa real sin red, Etapa 7 (R31, CA-16 a CA-20, R23) | 51 de 51 |
| Programa real sin red, Etapa 8 (R18, R19, CA-21, CA-22, R30, R23) | 56 de 56 |
| Programa real sin red, Etapa 9 (R32, R20, R21, CA-23 a CA-25, R23) | 65 de 65 |
| CA-33 con los programas reales (base de la 0.1.0 abierta con el programa nuevo) | 13 de 13 |

Las siete suites del programa real dan los mismos conteos que antes del cambio, ahora con todas las escrituras
pasando por `ejecutar_lote`. CA-12 sigue pendiente: lo hace el aprisco con [PRUEBA_CA12.md](PRUEBA_CA12.md).

## Resultado de la versión 0.6.0 (2026-10-03)

| Prueba | Resultado |
| --- | --- |
| Vitest (incluye `servidor/` con PGlite y la sincronización con equipos simulados) | 1182 pasaron, 8 omitidas (la prueba del candado necesita un Postgres real; corre en GitHub Actions y se verificó aparte con un Postgres 16 desechable) |
| Revisión de tipos (`npm run tipos`) | sin errores |
| Rust (`cargo test`) | 28 de 28 |
| Programa real sin red, Etapa 2 (Flujo 0) | 25 de 25 |
| Programa real sin red, Etapa 3 (Flujos 1 y 2, CA-09) | 24 de 24 |
| Programa real sin red, Etapa 4 (Flujos 3 y 5, CA-11, permisos) | 28 de 28 |
| Programa real sin red, Etapa 6 (R29, R30, CA-13 a CA-15, R23) | 23 de 23 |
| Programa real sin red, Etapa 7 (R31, CA-16 a CA-20, R23) | 51 de 51 |
| Programa real sin red, Etapa 8 (R18, R19, CA-21, CA-22, R30, R23) | 56 de 56 |
| Programa real sin red, Etapa 9 (R32, R20, R21, CA-23 a CA-25, R23) | 65 de 65 |
| CA-33 con los programas reales (base de la 0.1.0 abierta con la 0.6.0, migraciones 1 a 9) | 14 de 14 |

**No probado desde el entorno de desarrollo:** el programa de escritorio contra un servidor real y las pruebas con dos computadores de verdad (la conexión del servidor con Supabase sí se probó el 2026-10-04: ver la sección siguiente).
Eso lo hace usted con [SERVIDOR.md](SERVIDOR.md) y «Prueba con dos computadores» (arriba). CA-12 sigue pendiente (lo hace el aprisco con [PRUEBA_CA12.md](PRUEBA_CA12.md)).

## Resultado de la prueba contra el servidor real (2026-10-04, sobre el código de la 0.6.0)

Servidor probado: el proyecto de pruebas `registro-caprino-pruebas` de Supabase (plan gratuito, `us-east-1`). La sesión de desarrollo no puede salir a `*.supabase.co`, así que las llamadas HTTPS se hicieron desde dentro de su base
(extensión `pgsql-http`, con el conector de Supabase) a la dirección pública del proyecto, con las cabeceras del programa, tres cuentas de prueba y datos de ejemplo. **No prueba el programa de escritorio.** El informe completo (las 99 filas, los tiempos
y lo que queda por limpiar en el proyecto) está en la carpeta de archivos del proyecto: `etapa10/prueba-real-supabase-2026-10-04.md`.

| Bloque | Qué cubre | Verdes a la primera |
| --- | --- | --- |
| Auth y permisos sin sesión | inicio de sesión, renovación y contraseña mala; sin sesión no hay funciones ni tablas; el esquema interno no se expone | 13 de 13 |
| Cuentas, fincas e invitaciones | `registrar_cuenta`, `crear_finca`, invitación de un solo uso, equipos, aislamiento entre cuentas | 17 de 19 (2 expectativas reescritas: todo miembro es propietario) |
| Sincronizar y descargar | reintentos sin duplicar, campo reservado, marca adelantada, envíos de 200, 500 y 501 acciones, descarga de 700 cambios, huella de verificación, esquema viejo, equipo retirado | 21 de 26 (5 rojas por una expectativa mía de `seq`, repetidas bien) |
| Números de registro (R31) | emitir, reemitir, anular, importar, reintentos y contador | 11 de 12 (1 roja por una cuenta mía mal hecha, repetida bien) |
| Archivos (Storage) | subir, repetir, bajar; cuenta ajena y sin sesión rechazadas; bucket privado | 11 de 11 |
| Primera subida e importación | segunda finca, registros ya emitidos, libros con contador propio, segundo equipo | 12 de 12 |
| Sesiones y tokens | token alterado, cierre de sesión, renovar tras cerrar | 4 de 4 |
| Alta de cuenta por la API | `/auth/v1/signup` con un correo de `example.com` | sin concluir (Auth rechaza `example.com`) |

**Nueve discrepancias a la primera, ninguna del servidor:** ocho eran expectativas mías mal puestas (el contador de cambios ya iba en 506 por pruebas anteriores deshechas, una cuenta mal hecha y dos filas que esperaban un rol «sin permiso» que esta versión
no tiene) y una quedó sin concluir (el alta con `example.com`).

Tiempos (optimistas: la llamada nace en el mismo centro de datos que el servidor): inicio de sesión de 72 a 220 ms; `sincronizar` con 200 acciones 0,5 s y con 500 acciones (el máximo, 301 kB) 1,5 s frente a los 8 s que permite la API;
bajar 700 cambios en dos páginas, 93 ms la mayor.

**Sigue sin probarse:** el programa de escritorio contra el servidor, los dos computadores, el alta de cuentas nuevas con confirmación por correo (el remitente integrado de Supabase solo envía a miembros del equipo de la organización) y los cortes de internet reales a mitad de un envío.

## Resultado de la versión 0.5.0 (2026-10-02)

| Prueba | Resultado |
| --- | --- |
| Vitest | 695 de 695 |
| Rust | 8 de 8 |
| Programa real sin red, Etapa 2 (Flujo 0) | 25 de 25 |
| Programa real sin red, Etapa 3 (Flujos 1 y 2, CA-09) | 24 de 24 |
| Programa real sin red, Etapa 4 (Flujos 3 y 5, CA-11, permisos) | 28 de 28 |
| Programa real sin red, Etapa 6 (R29, R30, CA-13 a CA-15, R23) | 23 de 23 |
| Programa real sin red, Etapa 7 (R31, CA-16 a CA-20, R23) | 51 de 51 |
| Programa real sin red, Etapa 8 (R18, R19, CA-21, CA-22, R30, R23) | 56 de 56 |
| Programa real sin red, Etapa 9 (R32, R20, R21, CA-23 a CA-25, R23) | 65 de 65 |
| CA-33 con los programas reales (base de la 0.1.0 abierta con la 0.5.0) | 13 de 13 |

CA-12 (instalar en un Windows y en un Mac) no se puede probar aquí: lo hace el aprisco con
[PRUEBA_CA12.md](PRUEBA_CA12.md).

## Resultado de la versión 0.4.0 (2026-10-02)

| Prueba | Resultado |
| --- | --- |
| Vitest | 594 de 594 |
| Rust | 5 de 5 |
| Programa real sin red, Etapa 2 (Flujo 0) | 25 de 25 |
| Programa real sin red, Etapa 3 (Flujos 1 y 2, CA-09) | 24 de 24 |
| Programa real sin red, Etapa 4 (Flujos 3 y 5, CA-11, permisos) | 28 de 28 |
| Programa real sin red, Etapa 6 (R29, R30, CA-13 a CA-15, R23) | 23 de 23 |
| Programa real sin red, Etapa 7 (R31, CA-16 a CA-20, R23) | 51 de 51 |
| Programa real sin red, Etapa 8 (R18, R19, CA-21, CA-22, R30, R23) | 56 de 56 |
| CA-33 con los programas reales (base de la 0.1.0 abierta con la 0.4.0) | 12 de 12 |

## Resultado de la versión 0.3.0 (2026-10-02)

| Prueba | Resultado |
| --- | --- |
| Vitest | 504 de 504 |
| Rust | 5 de 5 |
| Programa real sin red, Etapa 2 (Flujo 0) | 25 de 25 |
| Programa real sin red, Etapa 3 (Flujos 1 y 2, CA-09) | 24 de 24 |
| Programa real sin red, Etapa 4 (Flujos 3 y 5, CA-11, permisos) | 28 de 28 |
| Programa real sin red, Etapa 6 (R29, R30, CA-13 a CA-15, R23) | 23 de 23 |
| Programa real sin red, Etapa 7 (R31, CA-16 a CA-20, R23) | 51 de 51 |
| CA-33 con los programas reales (base de la 0.1.0 abierta con la 0.3.0) | 10 de 10 |

## Resultado de la versión 0.2.0 (2026-10-02)

| Prueba | Resultado |
| --- | --- |
| Vitest | 365 de 365 |
| Rust | 4 de 4 |
| Programa real sin red, Etapa 2 (Flujo 0) | 25 de 25 |
| Programa real sin red, Etapa 3 (Flujos 1 y 2, CA-09) | 24 de 24 |
| Programa real sin red, Etapa 4 (Flujos 3 y 5, CA-11, permisos) | 28 de 28 |
| Programa real sin red, Etapa 6 (R29, R30, CA-13 a CA-15, R23) | 23 de 23 |
| CA-33 con los programas reales (base de la 0.1.0 abierta con la 0.2.0) | 8 de 8 |

## Resultado de la versión 0.1.0 (2026-10-01)

| Prueba | Resultado |
| --- | --- |
| Vitest | 303 de 303 |
| Rust | 4 de 4 |
| Programa real sin red, Etapa 2 (Flujo 0) | 25 de 25 |
| Programa real sin red, Etapa 3 (Flujos 1 y 2, CA-09) | 24 de 24 |
| Programa real sin red, Etapa 4 (Flujos 3 y 5, CA-11, permisos) | 28 de 28 |
| CA-12 en Windows y Mac | Pendiente: lo hace el aprisco con [PRUEBA_CA12.md](PRUEBA_CA12.md) |
