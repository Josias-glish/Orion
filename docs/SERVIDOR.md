# Servidor de sincronización: cómo ponerlo en marcha (Etapa 10)

Esta guía es para quien administra el servidor (hoy, Josias). Dice qué crear, en qué orden, **dónde va cada secreto** y qué deberías ver en cada paso.
El diseño está en [SINCRONIZACION.md](SINCRONIZACION.md), el contrato exacto en [`servidor/PROTOCOLO.md`](../servidor/PROTOCOLO.md) y el detalle técnico de la carpeta en
[`servidor/LEEME.md`](../servidor/LEEME.md).

**Importante: lo que esta guía no pudo comprobar.** El sitio `supabase.com` (documentación oficial, precios y panel) estaba bloqueado en el entorno donde se
construyó la etapa. Por eso **los pasos del panel de Supabase están descritos en general** (los nombres de los menús pueden haber cambiado) y **no se dan precios ni límites
como hechos**: cada vez que aparece uno, dice dónde confirmarlo. Las funciones y tablas del servidor sí se probaron con Postgres (PGlite y Postgres 16 real), pero la
conexión real a Supabase la verás tú por primera vez.

## 1. Qué hay que tener

- Una cuenta en Supabase (https://supabase.com). **Costos:** antes de contratar nada, mira la página oficial de precios (https://supabase.com/pricing) y confirma ahí si el plan
  gratuito sigue existiendo, cuántos proyectos permite, su tope de base de datos y de archivos, y si pausa los proyectos inactivos. La decisión tomada es «gratis para construir y probar;
  plan de pago antes de cobrar a las primeras fincas». No hay cifras de precio en este repositorio porque no se pudieron verificar.
- **Dos proyectos separados**: uno de **pruebas** (para las pruebas con tus dos computadores y los datos de ejemplo) y uno de **producción** (los datos reales del aprisco, solo cuando tú
  lo decidas). Si el plan gratuito no deja tener dos activos a la vez, empieza solo con el de pruebas y crea el otro antes del piloto real.
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
3. En **Authentication**, deja el acceso por **correo y contraseña** activado. El comportamiento exacto de la confirmación por correo (si manda un mensaje antes de dejar entrar,
   cuántos mensajes por hora permite el remitente gratuito) **no se pudo verificar**: pruébalo al crear tu primera cuenta y, si el correo tarda o no llega, revisa los ajustes de correo del panel.
   Para las pruebas puedes desactivar la confirmación por correo; para producción déjala activada.

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

**Dos cosas que solo se ven en el proyecto real** (no pude comprobarlas): (a) que el rol de la cadena de conexión pueda crear las políticas de archivos en `storage.objects` (la migración 0007 lo hace);
si falla ahí, el mensaje lo dirá y se resuelve en una migración nueva; (b) cómo responde la API de Supabase a los errores de las funciones.

**Regla de oro:** una migración ya aplicada **no se edita nunca más**; los cambios van en una migración nueva con el número siguiente (y su huella: `node servidor/regenerar-huellas.mjs`).

## 5. Autorizar quién puede crear una finca

Solo los correos autorizados pueden crear la finca en el servidor (SUPOSICION S-89). En el editor SQL del panel:

```sql
insert into public.cuenta_autorizada (correo) values ('tu-correo@ejemplo.com');
```

Quien se una a una finca que ya existe (con la misma cuenta o con un código de invitación) no necesita estar en esa lista.

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

## 7. Primera prueba

Sigue **«Prueba con dos computadores»** en [PRUEBAS.md](PRUEBAS.md). En resumen: el computador 1 inicia sesión, vincula y sube sus datos; el 2 se une con la misma cuenta o con un código
y descarga; luego se prueban los cortes de internet y la numeración de registros. **Usa datos de ejemplo** (`npm run semillas`) en el proyecto de pruebas, no los reales.

## 8. Mantenimiento y operación

- **Equipo perdido o robado:** Ajustes → Sincronización → Equipos → **Retirar**. Eso corta la sincronización de ese equipo, pero **no quita a la persona de la finca** ni cierra su sesión de archivos:
  cambia también la contraseña de la cuenta en Supabase. Una función para retirar miembros queda propuesta para la Etapa 14.
- **Copia de seguridad del servidor (SUPOSICION S-94):** el plan gratuito no se debe dar por hecho que traiga copias (confírmalo en la página oficial de precios). Cada computador ya guarda una réplica completa
  y el respaldo `.zip` local; el diseño proponía además un flujo semanal de GitHub para volcar la base, pero **no se construyó en esta etapa** (necesita un secreto tuyo y que el repositorio sea privado). Mientras tanto,
  para una copia manual desde tu terminal: `pg_dump "$SERVIDOR_DB_URL" --no-owner -Fc -f copia-servidor.dump` (guárdala fuera del repositorio; contiene los datos de la finca).
- **Proyecto pausado:** si el plan gratuito pausa los proyectos inactivos (confírmalo en la página oficial), el programa muestra que el servidor no responde, sigue funcionando sin red y se reanuda al reactivarlo desde el panel.
- **Tamaño:** la bitácora de cambios (`cambio`) solo crece. No se compacta todavía; si te acercas al tope de base de datos del plan, avísame (tarea de mantenimiento propuesta).
- **Versiones:** si un equipo tiene una versión menor que la que ya usó otro equipo, deja de sincronizar y pide actualizar. Las migraciones del servidor nuevas se aplican **antes** de repartir un instalador que las necesite.
- **Pruebas del servidor:** `npx vitest run servidor`. El candado de cada finca con Postgres real corre en GitHub Actions (trabajo «Candado con Postgres real»); en tu computador necesita un Postgres desechable
  (ver `servidor/LEEME.md`).

## 9. Qué falta o queda como límite conocido

Está en [SINCRONIZACION.md](SINCRONIZACION.md), sección 18: el equipo que se une no recibe el historial anterior, dos tipos de choque se resuelven a mano, la verificación compara conteos y huellas (no campo por campo),
y no se probó con un Supabase real. Los costos del servicio y de los correos de confirmación quedan por confirmar en las páginas oficiales.
