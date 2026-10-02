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
9. Funciona completo sin red (la red solo se usa como dice la regla de red), no borra filas (borrado lógico) y registra cada cambio en `historial_cambios`.
10. Se construye por etapas autorizadas: 0 a 5 = MVP (versión 0.1.0); 6 a 15 en `docs/ESPECIFICACION_2.md` (hecha hasta la 9, versión 0.5.0). Instaladores con GitHub Actions y `tauri-action`.

## Regla principal

**Lee `docs/ESPECIFICACION.md` antes de empezar cada etapa, y desde la Etapa 6 también `docs/ESPECIFICACION_2.md`** (etapas 6 a 15: amplía la primera y reemplaza su regla de red). Son la fuente de verdad. Lo que no esté definido ahí se anota en `docs/SUPOSICIONES.md` y en el código con el marcador `SUPOSICION:`, y se le avisa al usuario.

Otras reglas de trabajo (resumen de la especificación, secciones 1 y 13, y de la especificación 2, secciones 1 y 11):

- No avances de etapa sin que el usuario lo pida («Etapa N»).
- Al cerrar una etapa: resumen de diez líneas, pasos para probar, pruebas ejecutadas con su resultado real y un commit claro.
- Verifica comandos, versiones y APIs en la documentación oficial vigente (Tauri 2, SQLite, cada librería). No de memoria.
- No edites una migración ya aplicada: crea una nueva con el número siguiente. Quien instaló la 0.1.0 debe poder actualizar sin perder datos (CA-33: se prueba con datos de ejemplo).
- No guardes el PIN en texto plano. No agregues funciones fuera del alcance (sección 4 de la especificación y sección 3 de la especificación 2).
- Puertas (especificación 2, sección 10): si a una etapa le falta la decisión del usuario, haz solo lo que se puede sin ella y detente.
- Secretos: nunca pedirlos en el chat ni escribirlos en el repositorio o en los registros; van en los secretos de GitHub o en el panel del servicio.
- Costos: antes de recomendar un servicio, lo que cuesta según su página oficial vigente y si tiene capa gratuita. No inventar precios.
- Datos reales del aprisco: no usarlos en pruebas ni subirlos a ningún servicio sin permiso del usuario.
- Cada etapa publica la versión siguiente a la última publicada (borrador con «Run workflow» y luego publicar; ver D-041).
- El usuario es estudiante: dale comandos exactos y dile qué debería ver. Responde en español.

## Regla de red (especificación 2, sección 4)

Reemplaza el «sin red» del MVP. La red solo se permite para: sincronización (Etapa 10), página pública (Etapa 11),
actualizaciones (Etapa 12), integración con ANCO (Etapa 13) y suscripción (Etapa 14). Todo es opcional:

- El programa abre y funciona completo sin red, y nada se queda esperando la red.
- El usuario ve si está en línea y cuántos cambios faltan por enviar.
- Cada dirección a la que se conecte se declara en los permisos de Tauri, con la lista mínima, y en
  `src/seguridad.test.ts`. Hasta que una etapa autorizada agregue una dirección, esa prueba sigue exigiendo cero red.
- Nunca se piden por red fotos, fuentes tipográficas ni íconos (R33).

## Comandos

| Para qué | Comando |
| --- | --- |
| Instalar dependencias (una vez, o tras `git pull` si cambió `package.json`) | `npm install` |
| Abrir el programa en modo desarrollo (usa la base `registro-caprino-desarrollo.db`) | `npm run tauri dev` |
| Ejecutar todas las pruebas automáticas (Vitest) | `npm test` |
| Revisar tipos de TypeScript | `npm run tipos` |
| Cargar los datos de ejemplo en la base de desarrollo (abrir antes `npm run tauri dev` una vez) | `npm run semillas` |
| Además, 500 animales de prueba y la medición de CA-09 | `npm run semillas -- --rendimiento` |
| (`npm run semillas` también carga una compra y una venta de ejemplo: Aurora, comprada, y Cacique, vendido) | — |
| Generar ejemplos de los documentos (certificado interno, expediente, certificado de registro propio, libro genealógico en PDF y Excel, pedigrí) sin abrir el programa | `npm run documentos-de-ejemplo` (los de `docs/ejemplos/`: `npm run documentos-de-ejemplo -- docs/ejemplos`) |
| Pruebas de la parte en Rust (documentos y respaldo .zip) | `cd src-tauri && cargo test` |
| Construir el instalador en el propio equipo | `npm run tauri build` |
| Publicar instaladores (borrador de release) desde GitHub Actions | subir la versión en `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` y `package.json`; luego `git tag v0.1.0` y `git push origin v0.1.0`, o en GitHub: Actions → Instaladores → «Run workflow» (ver D-041) |
| Publicar el borrador de release (crea la etiqueta) | en GitHub: Actions → Instaladores → «Run workflow» con «publicar» marcado (ver D-041) |
| Prueba de extremo a extremo en Linux (ver `docs/PRUEBA_TECNICA.md`) | `xvfb-run -a node pruebas-e2e/etapa2.mjs <binario> <carpeta>` |
| Lo mismo para la Etapa 3, sin red (Flujos 1 y 2, R11, CA-09) | ver el encabezado de `pruebas-e2e/etapa3.mjs` |
| Lo mismo para la Etapa 4, sin red (Flujos 3 y 5, R12, CA-11) | ver el encabezado de `pruebas-e2e/etapa4.mjs` |
| Lo mismo para la Etapa 6, sin red (R29, R30, CA-13 a CA-15, R23) | ver el encabezado de `pruebas-e2e/etapa6.mjs` |
| Lo mismo para la Etapa 7, sin red (R31, CA-16 a CA-20, R23; necesita `pdftotext` y `pdfimages`) | ver el encabezado de `pruebas-e2e/etapa7.mjs` |
| Lo mismo para la Etapa 8, sin red (R18, R19, CA-21, CA-22, R30, R23) | ver el encabezado de `pruebas-e2e/etapa8.mjs` |
| Lo mismo para la Etapa 9, sin red (R32, R20, R21, CA-23 a CA-25, R23; necesita `pdftotext`) | ver el encabezado de `pruebas-e2e/etapa9.mjs` |
| CA-33 con los programas reales: base creada por la 0.1.0, abierta con la versión nueva | ver el encabezado de `pruebas-e2e/actualizacion.mjs` |
| CA-10: las pruebas del programa real (etapas 2, 3, 4, 6, 7, 8 y 9) seguidas y sin red (Linux) | `sudo sh pruebas-e2e/todas.sh capturas` |

## Mapa del código

- `src/dominio/`: reglas puras, sin React ni base de datos. `genealogia.ts` (R1), `identificadores.ts` (R2),
  `composicion.ts` (R3), `consanguinidad.ts` (R6), `permisos.ts` (R14), `pin.ts`, `usuarios.ts`, `fechas.ts`, `tipos.ts`,
  `reproduccion.ts` (R4, R5, R9), `leche.ts` (R8: la fórmula vive solo en `calcularProyeccion`), `pesos.ts` (R10, metas),
  `salud.ts` (R7, calendario, validaciones), `expediente.ts` (R13: campos, faltantes y avisos), `externos.ts` (R29:
  animales de otras fincas), `contactos.ts`, `registros.ts` (R31: formato del número, lista de verificación, numeración por
  libro, estados, instantánea y lote), `pedigri.ts` (columnas del pedigrí a partir de la instantánea) y
  `libro-genealogico.ts` (filas del libro por libro, raza y periodo). En `reproduccion.ts` también R30: `validarServicio`, `ventanaDeGestacion`,
  `analizarPaternidad` y `elegirPadre` (paternidad incierta). `calidad-leche.ts` (R18: leer y validar la muestra, promedios que
  ignoran los vacíos, comparación entre lactancias y su orden), `finanzas.ts` (R19: validar un movimiento, periodo y
  `resumirFinanzas`: costo por cabra y por lote, rentabilidad, gastos generales aparte y prorrateo opcional) y `orden.ts`
  (`ordenarFilas`, con los vacíos siempre al final). `traspasos.ts` (R32 y R20: `validarCompra`, `validarVenta`, el gasto
  o ingreso que se ofrece y los totales del historial), `inventario.ts` (RF-36: quién cuenta y los totales) y
  `hoja-venta.ts` (R21: qué lleva la hoja de venta, igual para el PDF y el Excel).
- `src/datos/`: `conexion.ts` (interfaz), `conexion-tauri.ts` (plugin SQL), `conexion-memoria.ts` (node:sqlite, pruebas
  y scripts), `bases.ts` (nombres de las bases, sin Vite), `cambios.ts` (**toda escritura pasa por `Cambios`**, que
  anota el historial y revisa permisos), `errores.ts` (`ErrorDeRegistro` con motivos), `arranque.ts`, `fotos.ts`,
  `repositorios/` (finca, usuarios, catálogos, lotes, contactos, animales, genealogía, historial, reproducción, leche,
  pesos, salud, documentos, registros, finanzas, traspasos), `respaldo.ts` (RF-43: exportar y restaurar), `archivos.ts` (comandos Rust de documentos y
  respaldo), `migraciones/`. R11 (vendido o muerto fuera del ordeño y los servicios) se aplica en las consultas y al guardar.
- R29: «del hato» = `en_hato = 1` (y `origen` distinto de `externo`); un externo siempre tiene `en_hato = 0`
  (disparador de la 0005), así que todas las listas de trabajo que ya filtraban `en_hato = 1` lo ignoran.
  `listarExternos` trae los de otras fincas y los «solo genealogía» de la 0.1.0.
- R31: un registro (`registro_genealogico`) es un número del libro del criadero. El número se asigna al emitir (el borrador
  no tiene), la base vigila que los consecutivos de un libro no tengan saltos ni se repitan (disparadores e índices
  únicos de la 0006) y `libro.siguiente_numero` es el contador. Reemitir sube `version` y reemplaza la instantánea (JSON);
  la anterior queda en `historial_cambios`. Cada versión emitida tiene su fila en `certificado` (`PPE-0001-v2`). El PDF sale
  siempre de la instantánea, nunca de los datos de hoy. Al restaurar un respaldo los registros se insertan en orden de número.
- R18: la calidad de la leche (`grasa_pct`, `proteina_pct`, `celulas_somaticas` de `pesaje_leche`, migración 0007) es opcional.
  `guardarPesajeLeche` solo escribe los datos que le llegan (`undefined` = no tocar, `null` = dejar vacío) y
  `listarComparacionCalidad` trae únicamente los pesajes con algún dato para promediarlos con `resumirCalidad` (promedio
  simple, sin contar vacíos). Las células somáticas son células por ml (S-67).
- R19: `categoria_economica` (catálogo editable, precargado con ids fijos) y `movimiento_economico` (valor entero de pesos;
  animal o lote, nunca los dos; el tipo debe ser el de su categoría, vigilado por disparadores). Solo el propietario
  (`ver_finanzas`, `gestionar_finanzas`). `resumenFinanciero` carga los movimientos y delega todo el cálculo en
  `resumirFinanzas`. Un gasto de una monta con costo se enlaza por `evento_reproductivo_id` (un gasto vigente por servicio).
  Al restaurar un respaldo, los catálogos precargados (razas, libros y categorías) se actualizan antes de insertar los nuevos.
- R32 y R20: `traspaso` (migración 0008) guarda cada compra y cada venta: animal, contacto, fecha, precio opcional,
  observaciones, adjuntos (JSON con rutas `documentos/adjunto-<uuid>.<ext>`) y el `movimiento_id` del gasto o ingreso
  creado. `registrarCompra` promueve a «comprado» (conservando el id y la genealogía) a un animal de otra finca o crea
  uno nuevo, y carga padre y madre como externos; `registrarVenta` solo cambia el estado a «vendido» (R11). Los dos validan
  todo antes de escribir y las compras y ventas las ve y registra solo el propietario (`ver_traspasos`,
  `gestionar_traspasos`). El gasto «Compra de animales» lo agrega la 0008 con id fijo. `datosInventario` y
  `datosHojaVenta` reúnen los datos; el cálculo vive en el dominio.
- CA-33: `src/datos/actualizacion.test.ts` aplica las migraciones nuevas sobre `src/datos/muestras/respaldo-0.1.0-ejemplo.json`
  (hecha por el código de la 0.1.0; no se edita a mano) y `pruebas-e2e/actualizacion.mjs` lo hace con los programas reales.
- `src/datos/migraciones/`: `NNNN_nombre.sql` + `huellas.json` (SHA-256). Una migración nueva necesita: el archivo, su
  huella y su registro en `src-tauri/src/lib.rs`; las pruebas fallan si falta algo.
- `src/documentos/`: PDF, CSV y Excel. `certificado.ts` (R12), `expediente.ts` (R13), `registro-propio.ts` (R31: certificado
  de registro propio, solo desde la instantánea), `pedigri.ts` (tabla del pedigrí y pedigrí imprimible), `libro.ts` (libro
  genealógico en PDF y hoja de Excel), `excel.ts` (`generarXlsx`, con `write-excel-file`, D-046), `comun.ts` (formato y
  estilos), `inventario.ts` (RF-36: inventario del hato en PDF y Excel), `hoja-venta.ts` (R21: hoja de venta con pedigrí en
  PDF y Excel), `pdf-navegador.ts` (pdfmake en la ventana, con las fuentes incluidas) y `pdf-node.ts` (solo pruebas y scripts).
- `src-tauri/src/archivos.rs`: escribir documentos en `<datos>/documentos/`, copiar los adjuntos de una compra (PDF o
  imagen), copias donde elija el usuario y el `.zip` del respaldo (`datos.json` + `fotos/` + `documentos/`), con sus pruebas en Rust.
- `src/pantallas/` (Asistente, ElegirUsuario, Inicio, `animales/`, `reproduccion/`, `leche/`, `pesos/`, `salud/`,
  `documentos/`, `registros/` (solo propietario: lista, lista de verificación y emisión en lote, libro, configuración, pestaña
  «Registro» de la ficha), `finanzas/` (solo propietario: movimientos, resumen, categorías y la oferta de gasto de una
  monta), `traspasos/` (solo propietario: registrar compra, registrar venta e historial de compras y ventas; el inventario y la
  hoja de venta son pestañas de `documentos/`), `ajustes/`), `src/componentes/`
  (contextos de conexión, sesión y navegación; campos reutilizables), `src/textos/es.ts` (todos los textos y los
  mensajes de cada motivo de rechazo), `src/estilos.css`.
- `scripts/`: `semillas.ts`, `datos-de-ejemplo.ts`, `reproduccion-de-ejemplo.ts`, `salud-de-ejemplo.ts`,
  `calidad-y-finanzas-de-ejemplo.ts` (muestras de calidad y movimientos; sus promedios y totales están en el encabezado),
  `traspasos-de-ejemplo.ts` (una compra y una venta, solo desde `semillas.ts`), `datos-de-rendimiento.ts` (CA-09) y `documentos-de-ejemplo.ts` (fuera de `src`, nunca entran al instalador).
- `pruebas-e2e/`: pruebas con el programa real en Linux (`tauri-driver`); `cargar-datos.ts` carga los datos de ejemplo
  en la base que se le indique; `dialogo.py` responde los diálogos «Guardar» y «Abrir» de GTK con el teclado.
- `docs/ejemplos/`: PDF y CSV de ejemplo generados por el programa real (para revisarlos a ojo).
- `src/seguridad.test.ts` y `src/aceptacion.test.ts` vigilan reglas de todo el proyecto: sin código ni dependencias
  de red, permisos de Tauri exactos, PIN nunca en texto plano, cada CA con prueba, contraste de colores, textos sin
  jerga y `docs/SUPOSICIONES.md` completo. Si una de ellas falla tras un cambio, revise el cambio antes que la prueba.
- Una tabla nueva debe agregarse a `TABLAS_RESPALDO` (`src/datos/respaldo.ts`); una prueba falla si se olvida, y
  `VERSION_ESQUEMA` debe subir con cada migración.
- Parámetros SQL con `?` (valen en sqlx y en node:sqlite). Nunca enviar `BEGIN`/`COMMIT` por el plugin (ver D-004).
- Los errores esperados se lanzan como `ErrorDeRegistro([...motivos])`; la interfaz los muestra con `ListaMotivos`.

## Decisiones

Formato: número, fecha, etapa, decisión y motivo. Estado: **Vigente**, **Propuesta** (espera aprobación del usuario) o **Reemplazada por D-xxx**.

- **D-001** · 2026-10-01 · Etapa 0 · Vigente. La especificación se guarda sin cambios en `docs/ESPECIFICACION.md`.
- **D-002** · 2026-10-01 · Etapa 0 · Vigente. Estilos con CSS propio y variables CSS, sin Tailwind. Motivo: lo mantendrán dos personas que están aprendiendo; CSS simple no añade otra herramienta ni otro vocabulario.
- **D-003** · 2026-10-01 · Etapa 0 · Vigente. PDF con `pdfmake` (MIT, versión 0.3.11, publicada en junio de 2026), no con `pdf-lib`. Motivo: `pdf-lib` no publica versiones desde noviembre de 2021 (1.17.1); `pdfmake` está mantenida, funciona sin red y describe tablas y columnas de forma declarativa, que es lo que necesitan el certificado y el expediente. Verificado en la Etapa 4: genera los PDF dentro de la ventana (WebKitGTK, con la CSP estricta) y en Node con las mismas definiciones.
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
- **D-019** · 2026-10-01 · Etapa 2 · Vigente. Escrituras con `Cambios` (`src/datos/cambios.ts`): junta los INSERT/UPDATE de una operación y su historial, y los aplica con `Conexion.ejecutarLote`. En memoria es una transacción real; en el programa son sentencias seguidas hasta que se apruebe D-004, por eso los repositorios validan todo antes de escribir.
- **D-020** · 2026-10-01 · Etapa 2 · Vigente. R1 se valida en el dominio (mensajes claros, ciclos de cualquier profundidad con consulta recursiva de descendientes) y en la base con disparadores (sexo de padres, orden de nacimiento, sexo de quien ya es padre) como red de seguridad. SQLite no admite consultas recursivas dentro de disparadores.
- **D-021** · 2026-10-01 · Etapa 2 · Vigente. Consanguinidad con el método tabular del coeficiente de parentesco (equivalente a los caminos de Wright), con memoria y orden por generaciones; probado con hermanos completos (25 %), medios hermanos (12,5 %), padre × hija (25 %), primos (6,25 %) y ancestro común consanguíneo.
- **D-022** · 2026-10-01 · Etapa 2 · Vigente. PIN con PBKDF2-SHA256: primero `crypto.subtle` (nativo; 106 ms para 600 000 iteraciones en WebKitGTK) y, si la ventana no lo ofrece, `@noble/hashes` en JavaScript puro (1,8 s en Linux, 4 s en el Windows de GitHub Actions). Una prueba con vectores publicados comprueba que los dos dan el mismo hash.
- **D-023** · 2026-10-01 · Etapa 2 · Vigente. Fotos: el diálogo del plugin `dialog` elige el archivo y el comando Rust `copiar_foto` lo copia a `<datos>/fotos/<uuid>.<ext>`; se muestran con el protocolo `asset` (alcance `$APPCONFIG/fotos/**`, CSP `img-src asset:`). Un comando propio (y no el plugin `fs`) permite probar la copia sin el diálogo nativo.
- **D-024** · 2026-10-01 · Etapa 2 · Vigente. Campo `animal.en_hato` (SUPOSICION S-12) para ancestros que solo existen en la genealogía.
- **D-025** · 2026-10-01 · Etapa 2 · Vigente. Navegación por `Ruta` en un contexto; las pantallas comprueban el permiso (R14) además de ocultar botones, y los repositorios lo vuelven a exigir con `exigirPermiso`.
- **D-026** · 2026-10-01 · Etapa 2 · Vigente. `npm run semillas` usa `tsx` y escribe solo en la base de desarrollo; exige que la base ya tenga todas las migraciones del plugin (si no, sqlx no arrancaría). GitHub Actions comprueba que el script carga (`--donde`).
- **D-027** · 2026-10-01 · Etapa 2 · Vigente. La pantalla temporal de diagnóstico de la Etapa 1 se retiró; su información técnica y la limpieza de los datos de prueba están en Ajustes → Base de datos.
- **D-028** · 2026-10-01 · Etapa 3 · Vigente. El parto (R5) se escribe en un solo `Cambios`: parto, fichas de las crías (con `prepararAnimalNuevo`), pesos al nacer, secado de la lactancia anterior y lactancia nueva. Todo se valida antes (R1 y R2 de cada cría, aretes repetidos entre ellas), porque en el programa el lote no es atómico hasta que se apruebe D-004.
- **D-029** · 2026-10-01 · Etapa 3 · Vigente. La lista de lactancias calcula el resumen de R8 en SQLite (funciones de ventana: acumulado, últimos 7 días con registro, último día) y aplica la misma `calcularProyeccion` del dominio; el detalle de una lactancia la calcula desde los pesajes. Así la fórmula está en un solo lugar.
- **D-030** · 2026-10-01 · Etapa 3 · Vigente. Ordeño en lote: Enter guarda la fila y pasa el foco a la siguiente (flechas para moverse sin guardar); la pantalla no muestra la lista de otra fecha o jornada mientras carga la nueva, para que nada se anote en la jornada equivocada.
- **D-031** · 2026-10-01 · Etapa 3 · Vigente. Curva de lactancia en SVG propio (sin librería de gráficos): una serie, línea de 2 px en `#2f7d4a` (validado con el script de la guía de visualización: banda de luminosidad, croma y contraste sobre blanco), relleno al 10 %, cruz con el valor del día más cercano y la tabla de pesajes como vista accesible.
- **D-032** · 2026-10-01 · Etapa 3 · Vigente. CA-09 se mide en tres lugares: Vitest en memoria (`scripts/datos-de-rendimiento.test.ts`), `npm run semillas -- --rendimiento` sobre el archivo real de desarrollo, y `pruebas-e2e/etapa3.mjs` en el programa real (Enter → «Guardado»). Los 500 animales: 20 machos, 250 hembras y 230 crías, con 230 lactancias abiertas y unos 46 000 pesajes.
- **D-033** · 2026-10-01 · Etapa 3 · Vigente. «Sin red» se prueba en Linux corriendo el programa y `tauri-driver` dentro de un espacio de red vacío (`unshare -n`, solo la interfaz `lo`).
- **D-034** · 2026-10-01 · Etapa 4 · Vigente. Los documentos se definen como objetos de pdfmake con funciones puras (`src/documentos/`), así se prueban sin generar el PDF (texto de R12, sin QR, campos de R13). Se generan en la ventana (`pdf-navegador.ts`, fuentes Roboto incluidas: unos 850 kB más en el instalador) y en Node para pruebas y ejemplos (`pdf-node.ts`, sin acceso a red ni a otros archivos).
- **D-035** · 2026-10-01 · Etapa 4 · Vigente. Cada documento emitido se guarda en `<datos>/documentos/<número>.pdf` (y `.csv`) y se anota en `certificado`; además el usuario puede guardar una copia donde quiera con el diálogo «Guardar». Los archivos los escribe Rust (`archivos.rs`) con nombres validados y escritura atómica (archivo temporal y renombrar), sin el plugin `fs`.
- **D-036** · 2026-10-01 · Etapa 4 · Vigente. Respaldo: `.zip` armado en Rust (crate `zip` 8.6, MIT, solo con deflate en Rust puro) con `datos.json` + `fotos/` + `documentos/`. Los datos se leen por partes en orden de id; la restauración valida tablas y columnas contra `pragma_table_info` antes de escribir (los nombres van en el SQL), inserta los animales padres antes que sus crías (R1 en la base) y actualiza los catálogos precargados. Mientras D-004 no se apruebe, la restauración en el programa no es atómica: si fallara a mitad, la instalación quedaría a medias (por eso valida todo antes y solo se hace en una instalación vacía).
- **D-037** · 2026-10-01 · Etapa 4 · Vigente. Las pruebas de extremo a extremo responden los diálogos reales de GTK con `pruebas-e2e/dialogo.py` (libX11 + libxdo por ctypes). No se puede interceptar el `invoke` de Tauri desde la página (está protegido con `defineProperty`), y no se agregan puertas traseras de prueba al programa.
- **D-038** · 2026-10-01 · Etapa 5 · Vigente. Permisos mínimos de Tauri (`src-tauri/capabilities/default.json`): solo leer la versión, dos funciones de rutas, cargar/consultar/ejecutar SQL y los diálogos de abrir y guardar. Se quitaron `core:default` (ventanas, menús, bandeja, eventos…), `sql:close` y los mensajes del plugin de diálogos. La prueba del programa real comprueba que lo quitado queda bloqueado. Un permiso nuevo exige actualizar `src/seguridad.test.ts`.
- **D-039** · 2026-10-01 · Etapa 5 · Vigente. CA-10 se prueba de dos formas: revisión estática en Vitest (sin `fetch`, WebSocket ni URLs en el código del programa, CSP sin orígenes externos, lista cerrada de dependencias de npm y de Rust, plugin SQL solo con SQLite) y el programa real dentro de un espacio de red vacío (`pruebas-e2e/todas.sh`), con los flujos 0, 1, 2, 3 y 5.
- **D-040** · 2026-10-01 · Etapa 5 · Vigente. Las pruebas de Rust (`cargo test`) corren en Windows y macOS dentro del flujo de instaladores, antes de construir (necesitan `dist/`, por eso se construye la interfaz primero). No se agregan al flujo de pruebas de cada envío porque compilar Tauri en tres sistemas tarda mucho más que Vitest.
- **D-041** · 2026-10-01 · Etapa 5 · Vigente. Versión 0.1.0 publicada desde la rama de trabajo, en el commit `95c2451` (el pull request no se ha fusionado: fusionarlo lo decide el usuario). Las sesiones de Claude Code en la nube solo pueden subir a su rama: subir la etiqueta dio error 403. Por eso el flujo de instaladores se ejecutó a mano («Run workflow», previsto en D-017): `tauri-action` crea el borrador «Registro Caprino v0.1.0» con la etiqueta `v0.1.0` sobre el commit de la ejecución (`releaseCommitish`, por defecto el SHA actual). GitHub crea la etiqueta cuando se publica el borrador. A pedido del usuario, el borrador se publicó con la opción «publicar» del mismo flujo: un trabajo aparte, sin construir, revisa que el borrador tenga el `.exe`, el `.msi` y el `.dmg` y lo publica con `gh release edit --draft=false` y el token de GitHub Actions. Para versiones siguientes: «Run workflow» para construir y, después de revisar el borrador, «Run workflow» con «publicar»; o, con permiso, `git push origin vX.Y.Z`.
- **D-042** · 2026-10-01 · Prompt maestro 2 · Vigente. La especificación de las etapas 6 a 15 se guarda sin cambios en `docs/ESPECIFICACION_2.md`. Su regla de red (sección 4) reemplaza la del MVP. El release v0.1.0 se publicó antes de empezar (la sección 0 lo exige): etiqueta `v0.1.0` sobre `95c2451`.
- **D-043** · 2026-10-02 · Etapa 6 · Vigente. Animales de otras fincas (R29) en la misma tabla `animal`, con `origen = 'externo'`, `contacto_id` y siempre `en_hato = 0`: así todas las consultas de trabajo que ya filtraban `en_hato = 1` (inventario, ordeño, servicios, alertas, salud, pesos) los ignoran sin cambios, y la genealogía y la consanguinidad los incluyen. Los animales «solo genealogía» de la 0.1.0 quedan `nacido_aqui` como pide la especificación 2 (S-55) y se muestran en «De otras fincas».
- **D-044** · 2026-10-02 · Etapa 6 · Vigente. Paternidad incierta (R30): el margen de la ventana de gestación es un dato de la finca (`finca.margen_gestacion`, 10 días, S-52). Si hay dos o más padres posibles, `registrarParto` no guarda sin una elección explícita (motivo `elegir_padre`); la pantalla propone el último servicio «preñada» marcado «sin verificar». R5 deja de usar servicios anteriores al parto previo de la hembra.
- **D-045** · 2026-10-02 · Etapa 6 · Vigente. CA-33 se prueba en cada versión con una copia de respaldo de los datos de ejemplo hecha por el código de la etiqueta `v0.1.0` (`src/datos/muestras/`, con su receta en `LEEME.md`), en Vitest, y con los programas reales 0.1.0 y nuevo (`pruebas-e2e/actualizacion.mjs`). La versión 0.2.0 se publica con el mismo flujo que la 0.1.0 (D-041).
- **D-046** · 2026-10-02 · Etapa 7 · Vigente. Librería de Excel: `write-excel-file` 4.1.1 (MIT; una sola dependencia, `fflate`, MIT; 25 versiones en 2026, la última el 2026-06-08; funciona igual en la ventana y en Node; sin red). Comparadas el 2026-10-02 en el registro de npm: `xlsx` (SheetJS) está estancada en la 0.18.5 de npm (2022) y sus versiones nuevas solo se publican en el sitio del autor; `exceljs` es MIT pero su última versión es de diciembre de 2024, ocupa 21 MB y arrastra nueve dependencias; `xlsx-populate` pesa 15 MB y edita plantillas, que no necesitamos; `rust_xlsxwriter` es buena, pero obligaría a pasar los datos por un comando Rust nuevo y a mantener otra dependencia de Rust. `write-excel-file` escribe varias hojas, anchos, negrita, fechas reales y encabezado fijo, que es lo que pedirán la hoja de venta (Etapa 9) y las finanzas. `src/seguridad.test.ts` la admite en la lista cerrada de dependencias y revisa que ni ella ni `fflate` usen red. El diálogo «Guardar» y `guardar_copia` (Rust) aceptan ahora `.xlsx`.
- **D-047** · 2026-10-02 · Etapa 7 · Vigente. Registros genealógicos (R31): una fila por número, con estado `borrador` (sin número), `emitido` o `anulado`; la reemisión sube `version` y deja la instantánea anterior en `historial_cambios`; el número se asigna al emitir y la base impide saltos, repeticiones y cambios de número, libro o animal (migración 0006, que también reconstruye `certificado` para admitir el tipo `registro_propio` copiando todas sus filas). La emisión (sola o en lote) es la misma función: valida a todos antes de escribir, asigna los consecutivos a los que cumplen y escribe todo junto. Versión 0.3.0 publicada con el mismo flujo de la D-041.
- **D-048** · 2026-10-02 · Etapa 8 · Vigente. Calidad de la leche (R18): tres columnas opcionales en `pesaje_leche` (una muestra por cabra y jornada, no una tabla aparte, porque la muestra se toma al ordeñar). La captura en el ordeño es una casilla opcional que agrega las columnas: sin marcarla, la pantalla es la de siempre (CA-09 y el flujo 2 no cambian). La comparación es una tabla ordenable (`ordenarFilas`: vacíos siempre al final, empates en el orden original) y un gráfico de barras en SVG propio, sin librería de gráficos, como la curva de lactancia (D-031); la tabla es su vista accesible. Los promedios son simples y se calculan en el dominio; SQLite solo trae los pesajes que tienen algún dato.
- **D-049** · 2026-10-02 · Etapa 8 · Vigente. Finanzas (R19): costo por cabra = gastos asignados al animal y costo por lote = gastos asignados al lote (sin sumar lo de sus animales, para no contar dos veces); los gastos sin animal ni lote salen siempre aparte; el prorrateo entre animales es opcional, está apagado por defecto y se rotula como suposición (S-71). El valor es un entero de pesos (S-70). El gasto de una monta con costo (R30) se crea desde el servicio, asignado a la hembra servida, con un enlace único para no ofrecerlo dos veces. Restaurar un respaldo actualiza primero los catálogos precargados para que un nombre reutilizado no choque con el índice de nombres únicos. Versión 0.4.0 publicada con el mismo flujo de la D-041.
- **D-050** · 2026-10-02 · Etapa 9 · Vigente. Compra y venta (R32 y R20) en una sola tabla `traspaso` (migración 0008) con tipo `compra` o `venta`, animal, contacto (vendedor o comprador), fecha, precio entero de pesos opcional, observaciones, adjuntos y el `movimiento_id` del gasto o ingreso que se haya creado. Una compra promueve a «comprado» al animal que ya existe como externo (misma fila, mismo id, así su genealogía y sus montas no se tocan) o crea uno nuevo, y carga padre y madre como externos en el mismo lote de escrituras; una venta solo cambia el estado a «vendido» (R11) y no toca la genealogía ni el registro propio. Se validan todas las reglas antes de escribir (D-019). Motivo: una sola lista para el historial y para filtrar por periodo, tipo y contacto, y una promoción que no copia nada.
- **D-051** · 2026-10-02 · Etapa 9 · Vigente. Adjuntos de una compra: el comando Rust `copiar_adjunto` copia el PDF o la imagen elegidos a `<datos>/documentos/adjunto-<uuid>.<ext>` y la base solo admite esas rutas (`esRutaDeAdjunto`), así viajan en el respaldo .zip y una ruta escrita a mano no puede apuntar a otro lugar del equipo; `guardar_copia_de_adjunto` guarda una copia donde el usuario elija. No hay permisos de Tauri nuevos (son comandos propios, como `copiar_foto`).
- **D-052** · 2026-10-02 · Etapa 9 · Vigente. Inventario (RF-36) y hoja de venta (R21): las reglas son funciones puras (`src/dominio/inventario.ts`, `hoja-venta.ts`) y los documentos salen de ellas, con los mismos datos en el PDF y en el Excel (CA-25) y la librería de la D-046. Se generan en el momento y no se anotan en `certificado`; el certificado de registro propio acompaña la hoja como otro PDF (`generarCertificadoDeRegistro`). La hoja no lleva precios ni datos de contactos (R28).
- **D-053** · 2026-10-02 · Etapa 9 · Vigente. La versión 0.4.0 (Etapa 8, PR #4) no se publicó: la rama de la Etapa 9 parte de la de la Etapa 8 y publica la 0.5.0, la versión siguiente a la última numerada. Motivo: la regla de D-041 (cada etapa publica la versión siguiente) y no repetir un número que ya está en los archivos de versión de la rama anterior.
