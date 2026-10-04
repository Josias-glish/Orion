# Servidor de sincronización: cómo ponerlo en marcha (Etapa 10)

Esta guía es para quien administra el servidor (hoy, Josias). Dice qué crear, en qué orden, **dónde va cada secreto** y qué deberías ver en cada paso.
El diseño está en [SINCRONIZACION.md](SINCRONIZACION.md), el contrato exacto en [`servidor/PROTOCOLO.md`](../servidor/PROTOCOLO.md) y el detalle técnico de la carpeta en
[`servidor/LEEME.md`](../servidor/LEEME.md).

**Importante: qué se comprobó y qué no.** El sitio `supabase.com` (panel, precios y páginas públicas) sigue bloqueado en el entorno donde se construyó la etapa. Por eso **los pasos del panel de
Supabase están descritos en general** (los nombres de los menús pueden haber cambiado) y **no se dan precios como hechos**. Sí se comprobó: las funciones y tablas del servidor con Postgres (PGlite y Postgres 16 real) y,
el 2026-10-04, **el contrato completo por internet contra el proyecto de pruebas real** (Auth, la API de funciones y Storage, con sesiones reales; ver 3b y [PRUEBAS.md](PRUEBAS.md)). Los límites del plan gratuito y el comportamiento del
correo de Auth vienen de la documentación oficial, consultada ese día con el conector de Supabase (que puede leerla aunque el sitio esté bloqueado). Lo que **todavía no se ha probado**: el programa de escritorio hablando con el servidor,
los dos computadores y el correo de confirmación.

## 1. Qué hay que tener

- Una cuenta en Supabase (https://supabase.com). **Costos:** la decisión tomada es «gratis para construir y probar; plan de pago antes de cobrar a las primeras fincas». No hay cifras de precio en este repositorio
  porque no se pudieron verificar: confírmalas en la página oficial (https://supabase.com/pricing) antes de contratar. Según la documentación oficial (consultada el 2026-10-04), el plan gratuito permite **dos proyectos activos en total**
  (cuentan todas las organizaciones donde eres propietario o administrador; los pausados no cuentan), con 500 MB de base de datos por proyecto, 1 GB de archivos y 5 GB de tráfico de salida; **pausa los proyectos con poca actividad durante 7 días**
  (avisa por correo una semana antes y se pueden restaurar durante 90 días) y no ofrece copias de seguridad descargables.
- **Dos proyectos separados**: uno de **pruebas** (para las pruebas con tus dos computadores y los datos de ejemplo) y uno de **producción** (los datos reales del aprisco, solo cuando tú
  lo decidas). Hoy el plan gratuito ya está lleno (`rutina` y `registro-caprino-pruebas`), así que la producción no puede ser un tercer proyecto gratuito. Un plan de pago es por organización (un proyecto de pago y uno gratuito no pueden convivir
  en la misma), de modo que la producción iría en una organización aparte con plan de pago, que no se pausa por inactividad. Es decisión tuya y el costo se confirma antes de contratar.
- Node.js 24 y `npm install` hechos en el repositorio.

## 2. Dónde va cada dato (y dónde nunca)

| Dato | ¿Es secreto? | Dónde se guarda | Dónde nunca |
| --- | --- | --- | --- |
| Dirección del proyecto (`https://xxxx.supabase.co`) | No | Variable del repositorio `SERVIDOR_URL` (GitHub → Settings → Secrets and variables → Actions → **Variables**) y, en tu computador, la variable de la terminal | — |
| Clave **pública** (`anon` o «publishable») | No (está hecha para ir en el programa; la protegen las reglas de la base) | Variable del repositorio `SERVIDOR_CLAVE_PUBLICA` | — |
| Clave **secreta** (`service_role` o `sb_secret_…`) | **Sí** | En ningún lado de este proyecto: el programa y el servidor de sincronización **no la necesitan** | Chat, repositorio, programa, registros |
| Cadena de conexión de la base (`postgresql://postgres:…@…`) | **Sí** (trae la contraseña de la base) | Solo en tu terminal, en la variable `SERVIDOR_DB_URL`, mientras aplicas las migraciones | Chat, repositorio, archivos `.env` subidos a git, registros |
| Contraseña de tu cuenta de Supabase y de las cuentas de la finca | **Sí** | Tu gestor de contraseñas | Cualquier archivo |

Reglas: nunca me pegues una clave secreta ni la cadena de conexión en el chat; si por error lo haces, cambia la contraseña de la base en el panel (Project Settings → Database).
`scripts/configurar-servidor.mjs` rechaza una clave secreta, así que pegar la equivocada en `SERVIDOR_CLAVE_PUBLICA` no llega al programa. Las pruebas automáticas **nunca**
usan el servidor real: corren contra una base en memoria.

## 3. Crear el proyecto de pruebas

1. En el panel de Supabase crea un proyecto nuevo (nombre sugerido: `registro-caprino-pruebas`), elige una región cercana a Colombia (la lista de regiones la muestra el panel) y
   define la contraseña de la base. Guárdala en tu gestor de contraseñas.
2. Cuando esté listo, abre **Project Settings** y anota (sin pegarlos en el chat): la **URL del proyecto**, la **clave pública** (la llamada `anon` o `publishable`) y, más adelante, la **cadena de conexión** de la base.
3. En **Authentication**, deja el acceso por **correo y contraseña** activado. Comprobado en el proyecto de pruebas (2026-10-04): el registro de cuentas nuevas está activado y **Auth pide confirmar el correo** antes de dejar entrar.
   El remitente de correo integrado de Supabase **solo envía a las personas del equipo de tu organización** (Organization → Team; a los demás les responde «Email address not authorized»), tiene un tope bajo de mensajes por hora
   que cambia sin aviso y no garantiza la entrega: sirve para probar, no para el aprisco. Para las pruebas tienes dos caminos: usar un correo que sea miembro de ese equipo, o desactivar «Confirm email» en
   Authentication → Providers → Email (los nombres del panel pueden haber cambiado). Para producción, déjala activada y configura un remitente propio (SMTP). Sube también la longitud mínima de la contraseña a 8 o más (la documentación no recomienda menos).
   Al pulsar el enlace del correo, Supabase manda a la persona a la «Site URL» del proyecto, que por defecto es `http://localhost:3000`: el navegador mostrará un error de conexión (la cuenta debería quedar confirmada de todos modos; no
   está comprobado). Mientras no haya una página propia para eso, es lo esperado.

## 3b. El proyecto de pruebas que ya existe (2026-10-04)

Este paso ya está hecho en la organización de Supabase de Josias, con el conector de Supabase de Claude (no hizo falta ninguna clave por el chat):

- Proyecto **`registro-caprino-pruebas`** (región `us-east-1`, plan gratuito de la organización), dirección `https://drhmqbtrcahbmyerizvh.supabase.co`. Es un proyecto aparte del que ya tenías (`rutina`), que no se tocó.
- Las 7 migraciones están aplicadas (el conector las registra con marca de tiempo en `supabase_migrations`; se enviaron sin los comentarios del archivo, el código es el mismo). Para que `servidor/aplicar.mjs` y el conector no choquen, se anotaron también en `migraciones_servidor.aplicada` con las huellas de `huellas.json`: `node servidor/aplicar.mjs --ver` debe decir «Todo está al día».
- Revisado en la base real: `anon` no puede ejecutar ninguna función, `authenticated` solo las 16 públicas del protocolo y `interno.es_miembro_de_finca` (para Storage), ninguna tabla es legible por la API (RLS sin políticas), el bucket `archivos` es privado y tiene sus 2 políticas. El asesor de seguridad de Supabase solo marca lo esperado: 10 avisos informativos «RLS sin políticas» (a propósito), 16 avisos «función ejecutable por usuarios con sesión» (son las 16 funciones del protocolo; cada una exige ser miembro de la finca) y 1 aviso de Auth, «protección contra contraseñas filtradas desactivada» (esa protección solo existe en el plan Pro o superior).
- Probado dentro de una transacción que se deshizo (no quedó ningún dato): crear finca, sincronizar y repetir el mismo envío (0 aceptados, 2 ya aplicados), emitir registros (`PPE-0001`, `PPE-0002`; un reintento devuelve el mismo número), invitación y segundo equipo (letra B, descarga completa), código malo o ya usado (`codigo_invalido`), una cuenta ajena (`finca_inexistente`) y una cuenta no autorizada (`no_autorizada`). Un envío de 500 operaciones tardó 0,8 s; el límite de Supabase para la API es de 8 s por consulta, así que hay margen.
- **Probado por internet contra el servidor real (2026-10-04):** la sesión de desarrollo no puede salir a `*.supabase.co`, así que las llamadas HTTPS se hicieron desde dentro de la base del proyecto de pruebas (extensión `pgsql-http`,
  con el conector) a su dirección pública, con las cabeceras del programa y tres cuentas de prueba (99 filas de resultados; resumen y tiempos en [PRUEBAS.md](PRUEBAS.md)). Cubrió inicio, renovación y cierre de sesión; permisos sin sesión y entre cuentas;
  cuentas, fincas, invitaciones y equipos; `sincronizar` (reintentos sin duplicar, marca adelantada, envíos de 200 y 500 acciones, 501 rechazado, descarga de 700 cambios, huella de verificación); números de registro (emitir, reemitir, anular, importar);
  y archivos (subir, bajar, ajenos rechazados, bucket privado). No apareció ningún defecto del servidor. Los errores llegan como el programa los espera (`P0001` → HTTP 400 con el motivo en `message`). Un envío de 500 acciones (301 kB) tardó 1,5 s,
  lejos de los 8 s que permite la API (el tiempo es optimista: la llamada nace en el mismo centro de datos).
- **Lo que sigue sin probar:** el programa de escritorio hablando con el servidor (ventana, plugin HTTP, llavero), los dos computadores, el alta de cuentas nuevas por `/auth/v1/signup` (Auth rechaza los correos de `example.com`), el correo de
  confirmación (el entorno no recibe correos) y los cortes de internet reales a mitad de un envío.
- **Límite que la prueba confirmó:** todo miembro es propietario, así que puede invitar y retirar cualquier equipo de la finca, también los de otras cuentas (roles: Etapa 14).
- Tu correo ya está **autorizado** (paso 5; se hizo el 2026-10-04 a pedido de Josias). Falta fijar las variables del repositorio (paso 6): la clave pública se ve en el panel (Project Settings → API Keys, la llamada «publishable» o «anon»).
- Si ves cuentas `prueba-red-N@example.com`, el esquema `prueba_red` o la extensión `http` en ese proyecto, son restos de la prueba por internet del 2026-10-04 (se limpian con un SQL que corre Josias; ver el informe en la carpeta de archivos del proyecto,
  `etapa10/prueba-real-supabase-2026-10-04.md`).

## 4. Instalar las tablas y funciones (migraciones)

Desde la raíz del repositorio, en **tu terminal** (no en el chat):

```bash
export SERVIDOR_DB_URL='…la cadena de conexión de la base (Project Settings → Database → Connection string)…'
node servidor/aplicar.mjs --ver     # muestra qué se aplicaría y no cambia nada
node servidor/aplicar.mjs           # aplica las pendientes
```

Usa la cadena de conexión directa o la del *pooler* en modo sesión, no la de modo transacción. **Qué deberías ver:** una línea «aplicada» por cada migración y
«Se aplicaron 7 migración(es)»; si lo repites, «Todo está al día». Si una migración falla, se deshace sola y el script se detiene en esa: no la edites, avísame con el mensaje.

Cuando termines, cierra la sesión de la terminal o borra la variable (`unset SERVIDOR_DB_URL`).

**Dos cosas que solo se veían en el proyecto real** (comprobadas el 2026-10-04): (a) que se puedan crear las políticas de archivos en `storage.objects` (la migración 0007): con el conector funcionó; con la cadena de conexión y
`aplicar.mjs` no se ha probado, y si falla ahí el mensaje lo dirá y se resuelve en una migración nueva; (b) cómo responde la API de Supabase a los errores de las funciones: `P0001` llega como HTTP 400 con `{"code":"P0001","message":"<motivo>"}`, que es lo que lee el programa.

**Regla de oro:** una migración ya aplicada **no se edita nunca más**; los cambios van en una migración nueva con el número siguiente (y su huella: `node servidor/regenerar-huellas.mjs`).

## 5. Autorizar quién puede crear una finca

Solo los correos autorizados pueden crear la finca en el servidor (SUPOSICION S-89). En el editor SQL del panel:

```sql
insert into public.cuenta_autorizada (correo) values ('tu-correo@ejemplo.com');
```

Quien se una a una finca que ya existe (con la misma cuenta o con un código de invitación) no necesita estar en esa lista. En el proyecto de pruebas ya está autorizado el correo de Josias (2026-10-04).

## 6. Poner la dirección y la clave pública en el programa

El programa viene **sin servidor** (`src/sincronizacion/servidor.json` tiene una dirección de relleno que no existe): sin configurar, no hace ninguna llamada de red y todo
funciona como antes (CA-30). Para activar la sincronización hay que fijar dos valores antes de construir el instalador.

**En tu computador** (para `npm run tauri dev` o `npm run tauri build`):

```bash
SERVIDOR_URL='https://xxxx.supabase.co' SERVIDOR_CLAVE_PUBLICA='…la clave pública…' npm run configurar-servidor
```

Debería decir «Servidor configurado: https://xxxx.supabase.co». Cambia dos archivos del árbol de trabajo (`servidor.json` y `src-tauri/capabilities/sincronizacion.json`, la
única dirección que la ventana puede usar). **No subas esos dos cambios a git** (`git checkout src/sincronizacion/servidor.json src-tauri/capabilities/sincronizacion.json` los deshace).

**En los instaladores de GitHub Actions:** en el repositorio, Settings → Secrets and variables → Actions → pestaña **Variables**, crea `SERVIDOR_URL` y
`SERVIDOR_CLAVE_PUBLICA`. El flujo «Instaladores» las lee y ejecuta el mismo script antes de construir. Si no existen, los instaladores salen sin sincronización.
Un instalador apunta a **un solo** servidor: para probar usa los valores del proyecto de pruebas; para el instalador del aprisco, los de producción.
**El instalador de prueba** se saca así: en GitHub, **Actions → Instaladores → Run workflow**, marca la casilla que empieza por **«Solo probar»** y pulsa el botón verde **Run workflow**. Tarda unos 20 minutos (la prueba hecha el 2026-10-04 tardó 18).
Al terminar (marca verde), abre esa ejecución y baja el instalador de **Artifacts**: en Windows `windows-x64-nsis` (el `.exe`) o `windows-x64-msi`; en Mac `darwin-universal-dmg`. Llega como `.zip`. Esa forma **no crea ningún release**: en la pestaña Releases no debe aparecer nada nuevo.
**No uses «Run workflow» sin marcar «Solo probar» con los valores de pruebas puestos:** eso crea el borrador del release de la versión con el servidor de pruebas dentro, y publicarlo lo repartiría a todos.
Antes de construir el instalador del aprisco, cambia las dos variables a los valores de producción.

## 7. Primera prueba

Sigue **«Prueba con dos computadores»** en [PRUEBAS.md](PRUEBAS.md). En resumen: el computador 1 inicia sesión, vincula y sube sus datos; el 2 se une con la misma cuenta o con un código
y descarga; luego se prueban los cortes de internet y la numeración de registros. **Usa datos de ejemplo** (`npm run semillas`) en el proyecto de pruebas, no los reales.
Antes, resuelve la confirmación del correo (sección 3, paso 3): sin eso no podrás crear tu cuenta en el programa.

## 8. Mantenimiento y operación

- **Equipo perdido o robado:** Ajustes → Sincronización → Equipos → **Retirar**. Eso corta la sincronización de ese equipo, pero **no quita a la persona de la finca** ni cierra su sesión de archivos:
  cambia también la contraseña de la cuenta en Supabase. Una función para retirar miembros queda propuesta para la Etapa 14. Hoy cualquier miembro de la finca puede retirar cualquier equipo (todos son propietarios; confirmado en el
  servidor real), incluidos los de otras cuentas: invita solo a gente de confianza.
- **Copia de seguridad del servidor (SUPOSICION S-94):** el plan gratuito no se debe dar por hecho que traiga copias (confírmalo en la página oficial de precios). Cada computador ya guarda una réplica completa
  y el respaldo `.zip` local; el diseño proponía además un flujo semanal de GitHub para volcar la base, pero **no se construyó en esta etapa** (necesita un secreto tuyo y que el repositorio sea privado). Mientras tanto,
  para una copia manual desde tu terminal: `pg_dump "$SERVIDOR_DB_URL" --no-owner -Fc -f copia-servidor.dump` (guárdala fuera del repositorio; contiene los datos de la finca).
- **Proyecto pausado:** si el plan gratuito pausa los proyectos inactivos (confírmalo en la página oficial), el programa muestra que el servidor no responde, sigue funcionando sin red y se reanuda al reactivarlo desde el panel.
- **Tamaño:** la bitácora de cambios (`cambio`) solo crece. No se compacta todavía; si te acercas al tope de base de datos del plan, avísame (tarea de mantenimiento propuesta).
- **Versiones:** si un equipo tiene una versión menor que la que ya usó otro equipo, deja de sincronizar y pide actualizar. Las migraciones del servidor nuevas se aplican **antes** de repartir un instalador que las necesite.
- **Pruebas del servidor:** `npx vitest run servidor`. El candado de cada finca con Postgres real corre en GitHub Actions (trabajo «Candado con Postgres real»); en tu computador necesita un Postgres desechable
  (ver `servidor/LEEME.md`).

## 9. Qué falta o queda como límite conocido

Está en [SINCRONIZACION.md](SINCRONIZACION.md), sección 18: el equipo que se une no recibe el historial anterior, dos tipos de choque se resuelven a mano, la verificación compara conteos y huellas (no campo por campo)
y todo miembro es propietario (puede retirar equipos de otras cuentas). El servidor se probó por internet contra un Supabase real (sección 3b), pero el programa de escritorio y los dos computadores aún no. Los costos del servicio y
de los correos de confirmación quedan por confirmar en las páginas oficiales.
