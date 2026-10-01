# Cómo instalar Registro Caprino

Guía para instalar el programa en un computador con **Windows 10 u 11** o con **Mac**.
No necesita internet para usar el programa; solo para descargar el instalador.

> **Aviso importante.** Esta versión no tiene «firma de código» (un certificado pagado que identifica al autor
> ante Microsoft y Apple). Por eso Windows y macOS mostrarán advertencias de seguridad la primera vez.
> Abajo se explica qué ver y qué hacer. Instale solo archivos descargados del repositorio oficial del proyecto.

- [1. Descargar el instalador](#1-descargar-el-instalador)
- [2. Instalar en Windows](#2-instalar-en-windows)
- [3. Instalar en Mac](#3-instalar-en-mac)
- [4. Dónde quedan los datos](#4-dónde-quedan-los-datos)
- [5. Desinstalar](#5-desinstalar)

---

## 1. Descargar el instalador

### Desde la página de versiones (Releases)

1. Abra el repositorio en GitHub: <https://github.com/Josias-glish/Orion>.
2. A la derecha, en **Releases**, entre a la versión más reciente (por ejemplo «Registro Caprino v0.1.0»).
3. Baje hasta **Assets** y descargue el archivo para su computador:

   | Computador | Archivo que debe descargar |
   | --- | --- |
   | Windows (recomendado) | el que termina en **`_x64-setup.exe`** |
   | Windows, para todos los usuarios del equipo | el que termina en **`.msi`** (pide permisos de administrador) |
   | Mac con chip Apple (M1, M2, M3, M4…) o con Intel | el que termina en **`_universal.dmg`** |

> Los releases se crean como **borrador**. Mientras sean borrador, solo los ve el dueño del repositorio.
> Para que otras personas puedan descargarlos, el dueño entra al release, pulsa **Edit** y luego **Publish release**.

### Para probar una versión en revisión (solo el equipo de desarrollo)

Cada pull request construye los instaladores sin publicarlos:

1. En GitHub, pestaña **Actions** → flujo **Instaladores** → elija la ejecución más reciente (con marca verde).
2. Abajo, en **Artifacts**, descargue el que corresponda (Windows: `nsis` o `msi`; Mac: `dmg`).
3. Llega como `.zip`: haga doble clic para descomprimirlo y obtener el instalador.

Para esto hay que haber iniciado sesión en GitHub.

---

## 2. Instalar en Windows

### Paso 1. Si el navegador avisa al descargar

Edge o Chrome pueden decir que el archivo «no se descarga habitualmente» o que «podría ser peligroso».

- En **Edge**: pase el ratón sobre la descarga → botón **…** → **Conservar** → **Mostrar más** → **Conservar de todos modos**.
- En **Chrome**: en la lista de descargas, pulse **Conservar** (o los tres puntos → **Descargar archivo no seguro**).

### Paso 2. La pantalla azul de SmartScreen

Al abrir el instalador aparece una ventana azul: **«Windows protegió su PC»**.

1. Pulse el texto **«Más información»**.
2. Aparece el nombre del archivo y «Editor: Editor desconocido». Pulse **«Ejecutar de todas formas»**.

Esto ocurre porque el instalador no tiene firma de código; no significa que tenga un virus.

> Si en cambio aparece **«Control inteligente de aplicaciones bloqueó…»** (Smart App Control, en algunos Windows 11),
> no hay botón para continuar: ese modo bloquea todo programa sin firma. Las opciones son instalar en otro equipo
> o que el dueño del computador desactive ese control en *Seguridad de Windows → Control de aplicaciones y navegador*.
> Es una decisión de seguridad del dueño del equipo; la solución definitiva es firmar los instaladores (fuera del alcance del MVP).

### Paso 3. El asistente de instalación

El asistente está en español:

1. **Siguiente** → elija la carpeta (puede dejar la que propone) → **Instalar**.
2. Al terminar, deje marcada la casilla para abrir el programa y pulse **Terminar**.

Si su Windows 10 es muy antiguo y le falta el componente WebView2, el instalador lo descarga solo
(«Descargando el bootstrapper de WebView2…»). **Solo en ese caso hace falta internet durante la instalación.**

### Paso 4. Abrir el programa

Menú Inicio → **Registro Caprino**. Debe abrirse una ventana con la barra lateral verde: Inicio, Animales, Ajustes y Diagnóstico.

---

## 3. Instalar en Mac

### Paso 1. Copiar el programa a Aplicaciones

1. Haga doble clic en el archivo `.dmg` descargado. Se abre una ventana con el ícono de **Registro Caprino** y la carpeta **Aplicaciones**.
2. Arrastre el ícono de Registro Caprino sobre la carpeta Aplicaciones.
3. Expulse el disco «Registro Caprino» (clic derecho → Expulsar).

### Paso 2. Abrirlo la primera vez

La primera vez macOS dice algo como **«No se puede abrir "Registro Caprino" porque Apple no puede comprobar si contiene software malicioso»**
(el texto exacto cambia según la versión). Pulse **Aceptar** o **Listo** (no pulse «Trasladar a la papelera»). Después:

**macOS 15 Sequoia o más reciente** (Apple quitó el atajo del clic derecho en esta versión):

1. Abra **Ajustes del Sistema** → **Privacidad y seguridad**.
2. Baje hasta la sección **Seguridad**. Verá el mensaje «Se bloqueó el uso de "Registro Caprino"…».
3. Pulse **Abrir igualmente** y escriba la contraseña del Mac.
4. En la ventana que aparece, pulse **Abrir igualmente** otra vez.

**macOS 14 Sonoma o anterior**:

1. Abra el Finder → **Aplicaciones**.
2. Haga **clic derecho** (o Control + clic) sobre **Registro Caprino** → **Abrir**.
3. En el aviso, pulse **Abrir**.

Solo hay que hacerlo una vez; después el programa abre normalmente desde Aplicaciones o el Launchpad.

> Para saber su versión de macOS: menú  (manzana) → **Acerca de este Mac**.

### Si dice «está dañado y no se puede abrir»

No debería ocurrir: el programa lleva una firma *ad hoc* precisamente para evitarlo. Si aun así aparece,
abra la Terminal y ejecute (copie la línea completa):

```bash
xattr -dr com.apple.quarantine "/Applications/Registro Caprino.app"
```

Luego ábralo de nuevo siguiendo el paso 2.

---

## 4. Dónde quedan los datos

Los datos se guardan **solo en el computador**, en un archivo de base de datos:

| Sistema | Carpeta |
| --- | --- |
| Windows | `C:\Users\<su usuario>\AppData\Roaming\co.registrocaprino.escritorio\` |
| Mac | `~/Library/Application Support/co.registrocaprino.escritorio/` |

El archivo principal se llama `registro-caprino.db` (a su lado pueden aparecer `-wal` y `-shm`, que son parte de la misma base).
La ruta exacta también se ve dentro del programa, en **Ajustes**.

---

## 5. Desinstalar

- **Windows**: Configuración → Aplicaciones → Aplicaciones instaladas → Registro Caprino → **Desinstalar**.
  El desinstalador ofrece la casilla «Eliminar los datos de aplicación»: **déjela sin marcar** si quiere conservar sus registros.
- **Mac**: arrastre Registro Caprino desde Aplicaciones a la Papelera. Los datos quedan en la carpeta indicada arriba.
