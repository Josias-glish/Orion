# Preparar el computador para desarrollar

Esta guía instala lo necesario para abrir el programa en modo desarrollo (`npm run tauri dev`).
Los pasos se tomaron de la documentación oficial de Tauri 2 (requisitos, consultada el 2026-10-01).

Haga los pasos **en orden**, uno por uno. Después de cada uno hay un comando para comprobarlo y lo que debería ver.
Si algo no coincide, deténgase y copie el mensaje completo.

- [Windows 10 u 11](#windows-10-u-11)
- [Mac](#mac)
- [Descargar el proyecto y abrir el programa](#descargar-el-proyecto-y-abrir-el-programa-windows-y-mac)
- [Problemas frecuentes](#problemas-frecuentes)

---

## Windows 10 u 11

Use **PowerShell** para los comandos: menú Inicio → escriba «PowerShell» → Windows PowerShell.
Después de instalar cada programa, **cierre PowerShell y ábralo de nuevo**, para que encuentre lo recién instalado.

### Paso 1. Git

1. Entre a <https://git-scm.com/downloads/win> y descargue «Git for Windows» de 64 bits.
2. Ejecute el instalador y acepte las opciones que vienen marcadas (Next, Next… Install).
3. Compruebe:

   ```powershell
   git --version
   ```

   Debe ver algo como `git version 2.51.0.windows.1` (el número puede ser otro).

### Paso 2. Node.js 24 LTS

1. Entre a <https://nodejs.org> y descargue la versión **LTS** (24.x) para Windows (archivo `.msi`).
2. Ejecute el instalador con las opciones por defecto. Si aparece la casilla «Automatically install the necessary tools», **déjela sin marcar**: las herramientas de compilación se instalan en el paso 3.
3. Compruebe:

   ```powershell
   node -v
   npm -v
   ```

   Debe ver `v24.` seguido de otros números (por ejemplo `v24.21.0`) y un número de versión de npm.

### Paso 3. Microsoft C++ Build Tools

Rust las usa para compilar en Windows.

1. Entre a <https://visualstudio.microsoft.com/visual-cpp-build-tools/> y descargue las **Build Tools**.
2. Ejecute el instalador. En la lista de cargas de trabajo marque **«Desarrollo para el escritorio con C++»** («Desktop development with C++»).
3. Pulse **Instalar**. Ocupa varios GB y puede tardar bastante. Reinicie el computador si lo pide.
4. Compruebe: abra «Visual Studio Installer» desde el menú Inicio; debe aparecer «Build Tools» como instalado.

### Paso 4. WebView2

Es el componente que dibuja la ventana del programa. **Ya viene incluido en Windows 10 (desde la versión de abril de 2018) y en Windows 11**, así que normalmente no hay que hacer nada.

Para comprobarlo: Configuración → Aplicaciones → Aplicaciones instaladas → busque «WebView2». Debe aparecer «Microsoft Edge WebView2 Runtime».
Si no aparece, descárguelo de <https://developer.microsoft.com/microsoft-edge/webview2/> («Evergreen Bootstrapper»).

### Paso 5. Rust

1. Entre a <https://www.rust-lang.org/tools/install> y descargue `rustup-init.exe` (64 bits).
   Otra opción, desde PowerShell: `winget install --id Rustlang.Rustup`
2. Ejecútelo. Cuando pregunte, elija la opción **1 (instalación por defecto)** y pulse Enter.
3. Cierre y vuelva a abrir PowerShell. Compruebe:

   ```powershell
   rustc --version
   rustup default
   ```

   Debe ver `rustc 1.90.0` **o un número mayor** (el plugin SQL exige 1.90 como mínimo),
   y una línea que termine en `-pc-windows-msvc`, por ejemplo `stable-x86_64-pc-windows-msvc (default)`.
   Si no termina en `msvc`, ejecute `rustup default stable-msvc`.

Continúe en [Descargar el proyecto y abrir el programa](#descargar-el-proyecto-y-abrir-el-programa-windows-y-mac).

---

## Mac

Use la aplicación **Terminal**: Aplicaciones → Utilidades → Terminal.

### Paso 1. Herramientas de línea de comandos de Xcode (incluyen Git)

Para programas de escritorio no hace falta Xcode completo; basta con sus herramientas de línea de comandos.

1. Ejecute:

   ```bash
   xcode-select --install
   ```

2. Aparece una ventana: pulse **Instalar** y acepte la licencia. Si dice que ya están instaladas, siga al punto 3.
3. Compruebe:

   ```bash
   xcode-select -p
   git --version
   ```

   Debe ver `/Library/Developer/CommandLineTools` (o una ruta dentro de `Xcode.app`) y `git version 2.…`.

### Paso 2. Rust

1. Ejecute (es el comando oficial de instalación):

   ```bash
   curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
   ```

2. Cuando pregunte, elija **1 (Proceed with standard installation)** y pulse Enter.
3. Cierre la Terminal y ábrala de nuevo. Compruebe:

   ```bash
   rustc --version
   ```

   Debe ver `rustc 1.90.0` o un número mayor.

### Paso 3. Node.js 24 LTS

1. Entre a <https://nodejs.org> y descargue la versión **LTS** (24.x) para macOS (archivo `.pkg`).
2. Ejecute el instalador con las opciones por defecto.
3. Compruebe:

   ```bash
   node -v
   ```

   Debe ver `v24.` seguido de otros números.

---

## Descargar el proyecto y abrir el programa (Windows y Mac)

El proyecto ya está en su repositorio de GitHub `Josias-glish/Orion`; no hace falta crearlo ni subirlo.

1. Elija una carpeta para sus proyectos y descárguelo (una sola vez):

   ```bash
   git clone https://github.com/Josias-glish/Orion.git
   cd Orion
   ```

2. Mientras la Etapa 1 esté en revisión, su código vive en una rama aparte. Cámbiese a ella:

   ```bash
   git checkout claude/registro-caprino-setup-859iqa
   ```

   Cuando el pull request se fusione con `main`, use `git checkout main` y `git pull`.

3. Instale las dependencias del proyecto (una vez, y de nuevo cuando cambie `package.json`):

   ```bash
   npm install
   ```

   Debe terminar con una línea `added … packages` (el número puede variar) y `found 0 vulnerabilities`.

4. Ejecute las pruebas automáticas:

   ```bash
   npm test
   ```

   Debe ver al final `Tests  41 passed (41)` (el número crecerá en etapas siguientes).

5. Abra el programa en modo desarrollo:

   ```bash
   npm run tauri dev
   ```

   La **primera vez tarda entre 5 y 15 minutos**: Rust compila cientos de piezas y verá muchas líneas `Compiling …`.
   Las siguientes veces tarda segundos. Cuando termine verá `Running target/debug/registro-caprino` y se abrirá
   una ventana titulada **Registro Caprino** con la barra lateral verde (Inicio, Animales, Ajustes, Diagnóstico).

6. Para cerrar el modo desarrollo, cierre la ventana o pulse `Ctrl + C` en la terminal.

Para traer los cambios de una etapa nueva: `git pull` y, si cambió `package.json`, `npm install`.

### Si en algún momento quiere subir el proyecto a otro repositorio vacío

```bash
git remote set-url origin https://github.com/USUARIO/REPOSITORIO.git
git push -u origin main
```

---

## Problemas frecuentes

- **Windows: «la ejecución de scripts está deshabilitada en este sistema»** al usar `npm` en PowerShell.
  Ejecute una vez `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, responda `S` y abra PowerShell de nuevo.
  Otra opción es usar «Símbolo del sistema» (cmd) en lugar de PowerShell.
- **«No se reconoce el comando»** (`git`, `node`, `rustc`): cierre y vuelva a abrir la terminal. Si sigue, reinstale ese programa.
- **Windows: error `link.exe not found`** al compilar: faltan las C++ Build Tools del paso 3 o no se marcó «Desarrollo para el escritorio con C++».
- **`Port 1420 is already in use`**: ya hay otro `npm run tauri dev` abierto. Ciérrelo o reinicie la terminal.
- **Los datos de desarrollo** se guardan en un archivo distinto al del programa instalado (`registro-caprino-desarrollo.db`), así que probar en modo desarrollo no toca los datos reales.
