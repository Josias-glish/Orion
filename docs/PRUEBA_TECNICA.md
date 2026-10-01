# Prueba técnica de la Etapa 1

Objetivo: validar la tecnología (Tauri 2, React, TypeScript, Vite y SQLite con el plugin SQL de Tauri)
antes de construir funciones. Fecha: 2026-10-01.

## Resumen

**El stack funciona y recomiendo mantenerlo**, con un ajuste: el plugin SQL no sirve para transacciones
(varias escrituras que deben guardarse todas o ninguna). Propongo resolverlo con un comando pequeño en Rust
(decisión D-004) antes de la Etapa 2, y espero tu aprobación.

| Prueba | Resultado | Dónde se verificó |
| --- | --- | --- |
| a) Crear un animal con su identificador | Funciona | Programa real en Linux + Vitest |
| b) Crear tres generaciones con padre y madre | Funciona | Programa real en Linux + Vitest |
| c) Consulta recursiva de ancestros | Funciona (6 ancestros, parentesco correcto) | Programa real en Linux + Vitest |
| d) Los datos persisten al cerrar y volver a abrir | Funciona | Programa real en Linux (cerrado y reabierto por la prueba) |
| Migración aplicada por el plugin y catálogos precargados | Funciona (7 razas, 5 libros) | Programa real en Linux + Vitest |
| Claves foráneas activas en la conexión del plugin | Sí | Programa real en Linux |
| `npm run tauri dev` abre la ventana | Funciona | Linux (en este contenedor); **falta tu prueba en Windows o Mac** |
| `npm test` | 41 de 41 pruebas pasan | Linux; GitHub Actions en Linux, Windows y macOS |
| Instaladores de Windows y Mac | Ver sección «Instaladores» | GitHub Actions |
| Transacciones con el plugin SQL | **Falla** | Programa real en Linux (19 de 20 intentos) |

## Cómo se probó

El desarrollo ocurre en un contenedor Linux en la nube, sin Windows ni Mac. Por eso hubo tres niveles:

1. **Pruebas automáticas (Vitest).** 41 pruebas sobre SQLite en memoria que aplican las mismas migraciones
   del programa: dominio (UUID, fechas, caminos genealógicos), restricciones de la base (formatos, R2,
   claves foráneas, prohibición de borrar), repositorio de animales, consulta recursiva y la pantalla de diagnóstico.
   Para comprobar que las pruebas sirven, se dañó el código a propósito (límite de generaciones y un cambio en
   la migración) y las pruebas fallaron; al restaurarlo, volvieron a pasar.
2. **Programa real, manejado por una prueba automática.** Se compiló el programa con Tauri en Linux y se manejó con
   `tauri-driver` (la herramienta oficial de Tauri para WebDriver), sin intervención humana: abre la ventana,
   pulsa los botones de las pruebas a), b) y c), cierra el programa, lo vuelve a abrir y compara los datos (prueba d).
   Se ejecutó en los dos modos: programa construido (`registro-caprino.db`) y modo desarrollo (`registro-caprino-desarrollo.db`).
   Resultado en ambos: **8 de 8 comprobaciones correctas**. El script de esa pantalla temporal se retiró en la Etapa 2,
   junto con la pantalla; puede verse en el commit `004f5b4` (`pruebas-e2e/prueba-tecnica.mjs`).
3. **GitHub Actions.** Ejecuta `npm test` en Linux, Windows y macOS, y construye los instaladores en Windows y macOS.

Lo que **no** se pudo comprobar desde aquí y debes probar tú: que la ventana abra en tu Windows o Mac con
`npm run tauri dev`, que la prueba técnica funcione allí y que los instaladores se instalen (CA-12).

## Qué funcionó

- **Tauri 2.12 + React 19 + TypeScript 6 + Vite 8.** La plantilla oficial (`create-tauri-app` 4.7.4) arrancó sin cambios
  y compiló en Linux en unos 2 minutos (la primera vez; luego, segundos).
- **Plugin SQL 2.5.** Crea el archivo de la base en la carpeta de configuración del programa, aplica la migración al
  abrirla y registra la versión aplicada en `_sqlx_migrations`. SQLite del plugin: 3.46.0.
- **Consultas recursivas** (`WITH RECURSIVE`): devuelven padres, abuelos y generaciones siguientes con su parentesco,
  respetan el límite de generaciones y terminan aunque los datos tengan un ciclo.
- **Integridad en la base**: rechaza fechas imposibles (29 de febrero de 2023), sexos desconocidos, padres inexistentes,
  identificadores repetidos y el borrado físico de filas.
- **Persistencia**: los datos siguen ahí al cerrar y abrir el programa, con la misma hora de creación.
- **Seguridad**: la política de contenido (CSP) de la ventana no permite conexiones a internet, y los estilos funcionan con ella.

## Qué falló o hay que vigilar

1. **Transacciones con el plugin SQL (importante).** El plugin reparte cada orden entre varias conexiones
   (un *pool*). Si se envían `BEGIN`, `INSERT` y `ROLLBACK` por separado, pueden caer en conexiones distintas.
   El experimento `pruebas-e2e/transacciones.mjs` lo confirmó: en **19 de 20 rondas** el `ROLLBACK` no deshizo el
   `INSERT` o dio errores como «cannot rollback - no transaction is active» y «database is locked».
   Es un problema conocido y abierto del plugin ([plugins-workspace#886](https://github.com/tauri-apps/plugins-workspace/issues/886)).
   - **Riesgo:** en etapas siguientes, un parto de tres crías que falle a la mitad dejaría datos incompletos.
     Peor aún: un `BEGIN` perdido deja una conexión bloqueando las demás escrituras.
   - **Qué se hizo en esta etapa:** el programa nunca envía `BEGIN`. Cada escritura se confirma sola, y antes de
     escribir se revisa lo que podría fallar (por ejemplo, un arete repetido) para no dejar un animal a medias.
   - **Alternativa propuesta (D-004):** un comando de unas 50 líneas en Rust que reciba la lista de órdenes y las ejecute
     dentro de una transacción, usando el mismo pool del plugin. Toda la lógica sigue en TypeScript; el plugin sigue
     siendo el de la especificación. La otra opción es reemplazar el plugin por una capa propia con una sola conexión,
     pero eso es más Rust para mantener. **Espero tu aprobación antes de implementarlo.**
2. **El plugin crea un pool nuevo cada vez que se abre la base.** Si la interfaz la abriera dos veces, quedarían dos pools
   y la migración podría aplicarse en uno mientras el otro ya consulta. Solución aplicada: la base se abre una sola vez (D-011).
3. **El plugin usa el modo WAL de SQLite.** Junto al archivo `.db` aparecen `-wal` y `-shm`, que son parte de la base.
   Importa para la copia de respaldo (Etapa 9): no basta con copiar el `.db` con el programa abierto.
4. **Versiones de SQLite distintas.** Las pruebas usan la de Node 24 (3.53) y el programa la del plugin (3.46).
   No hay que usar funciones de SQLite más nuevas que la 3.46.
5. **Mac sin firma.** En un Mac con chip Apple, un programa descargado sin ninguna firma aparece como «dañado».
   Se configuró la firma *ad hoc* que recomienda la guía de Tauri (no es un certificado y no cuesta). Las advertencias
   de Gatekeeper siguen, y desde macOS 15 se abre desde *Privacidad y seguridad* → «Abrir igualmente», no con clic derecho.
   Detalles en `docs/INSTALACION.md`.
6. **Windows 11 con «Control inteligente de aplicaciones».** Si está activo, bloquea cualquier programa sin firma y no ofrece
   continuar. Solo se resuelve con firma de código (fuera del alcance del MVP) o desactivando ese control.

## Instaladores (GitHub Actions)

El flujo «Instaladores» del pull request (ejecución 2, commit `68087a2`) terminó bien:

| Sistema | Archivo | Tamaño | Tiempo de construcción |
| --- | --- | --- | --- |
| Windows | `Registro Caprino_0.1.0_x64-setup.exe` (NSIS, en español) | 2,2 MB | 5 min 33 s |
| Windows | `Registro Caprino_0.1.0_x64_es-ES.msi` (WiX, en español) | 3,0 MB | (mismo trabajo) |
| macOS | `.dmg` y `.app` universales (chip Apple e Intel) | 6,0 MB | 7 min 56 s |

Antes de construir, las pruebas pasaron en Linux, Windows y macOS. Los instaladores quedan como *artifacts* del flujo
(se descargan desde la pestaña Actions con sesión iniciada en GitHub). El borrador de release se crea solo con una
etiqueta `v*` o al ejecutar el flujo a mano. **Falta tu prueba de instalación en un Windows y en un Mac (CA-12).**

## Recomendación

**Mantener el stack** (Tauri 2, React, TypeScript, Vite, SQLite con el plugin SQL), **aprobar D-004** para las
transacciones y empezar la Etapa 2 cuando confirmes que en tu computador funcionan `npm run tauri dev`,
la pantalla de diagnóstico y el instalador.

## Cómo repetir las pruebas de extremo a extremo (Linux)

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev \
  libayatana-appindicator3-dev librsvg2-dev webkit2gtk-driver xvfb
cargo install tauri-driver --locked
npx tauri build --debug --no-bundle
rm -f ~/.config/co.registrocaprino.escritorio/registro-caprino.db*
xvfb-run -a node pruebas-e2e/etapa2.mjs "$PWD/src-tauri/target/debug/registro-caprino" capturas
```

`pruebas-e2e/etapa2.mjs` es la prueba vigente (Flujo 0, desde la Etapa 2).

### Etapa 3: Flujos 1 y 2 sin red

`pruebas-e2e/etapa3.mjs` abre el programa real, carga los datos de ejemplo (`pruebas-e2e/cargar-datos.ts`) y
comprueba: partos próximos y hembras en lactancia en el Inicio; el Flujo 1 (parto de dos crías con madre y padre);
el Flujo 2 (ordeño en lote con Enter, corrección, valor inválido, persistencia); la curva y la proyección; R11 (una
hembra vendida sale del ordeño y de los servicios, pero conserva su historial); servicio y diagnóstico; pesos y
metas; y CA-09 con 500 animales. Todo corre dentro de un espacio de red vacío, así que el programa no tiene red:

```bash
npx tauri build --debug --no-bundle
rm -f ~/.config/co.registrocaprino.escritorio/registro-caprino.db*
# «unshare -n» crea una red vacía; hay que levantar la interfaz local (lo) para que tauri-driver funcione.
sudo unshare -n sh -c 'ip link set lo up; xvfb-run -a node pruebas-e2e/etapa3.mjs "$PWD/src-tauri/target/debug/registro-caprino" capturas'
```

Resultado en el contenedor Linux de desarrollo (WebKitGTK, 2026-10-01), tres ejecuciones seguidas: **24 de 24**.
Tiempos de CA-09 (de Enter a «Guardado» en pantalla): 68 a 253 ms con los datos de ejemplo; 146 a 352 ms con 500
animales y 233 cabras en el ordeño (abrir la lista: 414 a 459 ms).

### Etapa 4: Flujos 3 y 5, certificado interno y CA-11, sin red

`pruebas-e2e/etapa4.mjs` comprueba con el programa real: las alertas de retiro en el Inicio, el ordeño y la ficha;
que la leche retenida se pesa igual; el Flujo 3 (tratamiento a un animal con los campos del ICA y desparasitación a
un lote); el Flujo 5 (campos que faltan, PDF y CSV guardados con el diálogo «Guardar»); el certificado interno
(texto de R12, sin imágenes ni código QR, sin la sigla CRG); el registro de cada documento; la copia de respaldo; y
CA-11: aparta la base y la carpeta de documentos (como un computador nuevo), restaura la copia desde la primera
pantalla, entra, vuelve a crear una copia y compara las dos tabla por tabla.

Los diálogos «Guardar» y «Abrir» son los reales de GTK: los responde `pruebas-e2e/dialogo.py` con el teclado.
Además de lo de la Etapa 3 hace falta `poppler-utils` (`pdftotext`, `pdfimages`):

```bash
sudo apt install poppler-utils
npx tauri build --debug --no-bundle
rm -rf ~/.config/co.registrocaprino.escritorio/{registro-caprino.db*,documentos,fotos}
sudo unshare -n sh -c 'ip link set lo up; xvfb-run -a node pruebas-e2e/etapa4.mjs "$PWD/src-tauri/target/debug/registro-caprino" capturas'
```

Resultado en el contenedor Linux de desarrollo (WebKitGTK, 2026-10-01), dos ejecuciones seguidas: **27 de 27**.
En la misma corrida, sin regresiones: Etapa 2, 25 de 25; Etapa 3, 24 de 24. La copia de los datos de ejemplo pesa
unos 280 kB y la restauración reproduce las 17 tablas fila por fila (3505 filas de historial).

