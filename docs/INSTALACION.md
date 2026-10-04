# Cómo instalar Registro Caprino

Guía para instalar **Registro Caprino 0.4.0** en un computador con **Windows 10 u 11** (64 bits) o con **Mac**
(macOS 10.13 o posterior, con chip Apple o Intel). No necesita internet para usar el programa; solo para descargar
el instalador.

> **Aviso importante.** Esta versión no tiene «firma de código» (un certificado pagado que identifica al autor
> ante Microsoft y Apple). Por eso Windows y macOS mostrarán advertencias de seguridad la primera vez.
> Abajo se explica qué ver y qué hacer. Instale solo archivos descargados del repositorio oficial del proyecto.

- [1. Descargar el instalador](#1-descargar-el-instalador)
- [2. Instalar en Windows](#2-instalar-en-windows)
- [3. Instalar en Mac](#3-instalar-en-mac)
- [4. Dónde quedan los datos](#4-dónde-quedan-los-datos)
- [5. Copia de respaldo](#5-copia-de-respaldo)
- [6. Desinstalar](#6-desinstalar)
- [7. Actualizar a una versión nueva](#7-actualizar-a-una-versión-nueva)
- [8. Si algo falla](#8-si-algo-falla)

---

## 1. Descargar el instalador

### Desde la página de versiones (Releases)

1. Abra la página de la versión 0.4.0: <https://github.com/Josias-glish/Orion/releases/tag/v0.4.0>
   (o, en <https://github.com/Josias-glish/Orion>, a la derecha, **Releases** → «Registro Caprino v0.4.0»).
   Las versiones anteriores siguen en <https://github.com/Josias-glish/Orion/releases/tag/v0.2.0> y
   <https://github.com/Josias-glish/Orion/releases/tag/v0.1.0>.
2. Si el repositorio es privado, primero inicie sesión en GitHub con una cuenta que tenga acceso.
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

Sin pull request también se puede pedir a mano: **Actions** → flujo **Instaladores** → **Run workflow** → marque la casilla que empieza por
**«Solo probar»** y pulse **Run workflow**. La ejecución nueva deja los instaladores en **Artifacts**, igual que arriba, y no crea ningún release.

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

En la misma carpeta están `fotos/` (las fotos de los animales) y `documentos/` (cada certificado interno y cada
expediente que emite el programa, en PDF y CSV).

---

## 5. Copia de respaldo

### Crear una copia

1. Entre como **propietario** (el operario no puede crear la copia completa).
2. Vaya a **Documentos → Copia de respaldo** y pulse **Crear copia de respaldo…**.
3. Elija dónde guardarla. Lo mejor es una memoria USB o un disco externo, **fuera del computador**.

Se crea un archivo como `respaldo-registro-caprino-2026-10-01.zip` con todos los datos de la finca: animales,
genealogía, reproducción, leche, pesos, salud, usuarios (con el PIN cifrado), historial de cambios, fotos y
documentos emitidos. Haga una copia cada semana y guarde varias.

### Restaurar una copia en otro computador (o después de reinstalar)

1. Instale Registro Caprino y ábralo. Aparece la pantalla de bienvenida (todavía sin finca).
2. Abajo, en «¿Ya usaba Registro Caprino en otro computador?», pulse **Elegir copia de respaldo…** y elija el `.zip`.
3. Cuando termine verá «Se restauró la copia de …» y la lista de usuarios. Entre como siempre.

### Restaurar una copia en este mismo computador

Para no borrar ni mezclar datos sin querer, el programa **solo restaura en una instalación vacía**
(SUPOSICION S-44). Si necesita volver a una copia en el mismo computador:

1. Cierre Registro Caprino.
2. Abra la carpeta de datos (tabla de arriba) y cambie el nombre de `registro-caprino.db` a, por ejemplo,
   `registro-caprino-antes-2026-10-01.db`. Haga lo mismo con `registro-caprino.db-wal` y `registro-caprino.db-shm`
   si existen. **No los borre**: así sus datos actuales quedan guardados por si los necesita.
3. Abra Registro Caprino: verá la pantalla de bienvenida y podrá restaurar la copia como en el apartado anterior.

---

## 6. Desinstalar

- **Windows**: Configuración → Aplicaciones → Aplicaciones instaladas → Registro Caprino → **Desinstalar**.
  El desinstalador ofrece la casilla «Eliminar los datos de aplicación»: **déjela sin marcar** si quiere conservar sus registros.
- **Mac**: arrastre Registro Caprino desde Aplicaciones a la Papelera. Los datos quedan en la carpeta indicada arriba.

---

## 7. Actualizar a una versión nueva

1. Antes de actualizar, cree una **copia de respaldo** (sección 5).
2. Descargue el instalador nuevo e instálelo encima del anterior, como la primera vez. No hace falta desinstalar.
   En Windows, si el instalador pregunta, elija actualizar o reemplazar la versión instalada.
3. Al abrir, el programa actualiza la base de datos por su cuenta. Sus datos se conservan (CA-33: se prueba en cada
   versión con datos de ejemplo de la 0.1.0).
4. Compruebe que todo sigue ahí: entre con su usuario y su PIN, abra **Animales** y revise que estén sus animales.
   Abajo, en la barra lateral, debe decir la versión nueva (por ejemplo «Versión 0.4.0»).

**De la 0.1.0 a la 0.2.0.** Aparecen en Animales las pestañas **«De otras fincas»** (sementales y ancestros que no son
de la finca) y **«Contactos»** (sus propietarios). Si en la 0.1.0 registró animales «solo para la genealogía», ahora
están en «De otras fincas» como «Sin propietario registrado»; al editarlos, el programa le pedirá el propietario.
En Ajustes → Finca hay un dato nuevo, el **margen de la gestación** (10 días): sirve para avisar cuando no se sabe cuál
de dos machos es el padre de un parto.

**De la 0.2.0 a la 0.3.0.** Aparece en el menú **«Registros»** (solo para el propietario): lista de registros, lista de
verificación, libro genealógico y configuración. Cada libro recibe un prefijo para sus números (`PPE`, `PCR`, `MES`,
`FUN`, `POR`; los puede cambiar en Registros → Configuración mientras el libro no tenga registros). Sus datos, sus
certificados anteriores y sus copias de respaldo se conservan; las copias hechas con la 0.1.0 o la 0.2.0 se pueden
restaurar en la 0.3.0. En cada animal del hato aparece la pestaña **«Registro»**, y en **Genealogía** el botón del
pedigrí imprimible.

**De la 0.3.0 a la 0.4.0.** En **Leche** hay una pestaña nueva, **«Calidad»**, y en el **ordeño** una casilla para anotar
también la grasa, la proteína y las células somáticas de cada cabra (todo es opcional; los pesajes que ya tenía quedan
sin esos datos). Aparece en el menú **«Finanzas»** (solo para el propietario) con seis categorías ya creadas: alimento,
medicamentos, mano de obra y montas y pajillas (gastos), y venta de leche y de animales (ingresos); las puede renombrar o
desactivar. Al guardar una monta con costo, el programa le ofrece anotar el gasto. Sus datos y sus copias de respaldo
se conservan; las copias hechas con versiones anteriores se pueden restaurar en la 0.4.0.

---

## 8. Si algo falla

- **Windows dice que falta «WebView2»**: Windows 11 ya lo trae. En un Windows 10 muy desactualizado, el instalador lo
  descarga (para eso, y solo durante la instalación, necesita internet). También puede instalarlo desde Windows Update.
- **El programa muestra «No se pudo abrir la base de datos»**: abra «Detalle técnico», copie el texto y repórtelo
  (ver abajo). No borre la carpeta de datos.
- **Para reportar un error**: siga las indicaciones de la sección «Cómo reportar errores» del
  [README](../README.md#cómo-reportar-errores).

