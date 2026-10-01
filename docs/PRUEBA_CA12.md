# Prueba manual de instalación (CA-12)

> CA-12: «Los instaladores se instalan y abren sin errores en un Windows y en un Mac.»

Esta prueba la hace una persona del aprisco en un computador real, una vez con Windows y una vez con Mac. Tarda unos
30 minutos en cada uno. Al final, copie la tabla de resultados y envíela (ver «Cómo informar el resultado»).

Necesita: el computador, internet **solo para descargar**, y una memoria USB o una carpeta para la copia de respaldo.

---

## Windows (10 u 11)

**Antes de empezar.** Anote la versión de Windows: tecla Windows + R, escriba `winver` y Enter. Si el computador ya
tenía Registro Caprino con datos de verdad, haga primero una copia de respaldo.

| N.º | Paso | Qué debe ver |
| --- | --- | --- |
| W1 | Abra <https://github.com/Josias-glish/Orion/releases/tag/v0.1.0> y descargue el archivo que termina en `_x64-setup.exe`. | El archivo queda en Descargas (unos 3 MB). Si el navegador avisa, elija «Conservar». |
| W2 | Doble clic en el archivo. | Pantalla azul «Windows protegió su PC». |
| W3 | Pulse «Más información» y luego «Ejecutar de todas formas». | Se abre el instalador **en español**. No pide contraseña de administrador. |
| W4 | Pulse «Siguiente» hasta «Instalar» y luego «Terminar». | Termina sin errores. |
| W5 | **Desconecte internet** (modo avión o desconecte el cable y el wifi). | El icono de red muestra «Sin conexión». |
| W6 | Abra Registro Caprino desde el menú Inicio. | Ventana «Registro Caprino» con la bienvenida «Bienvenida a Registro Caprino». |
| W7 | Complete la finca y el propietario, **con un PIN** de 4 números. | Entra al Inicio con el nombre de la finca. |
| W8 | Animales → Registrar animal: una hembra «Prueba Madre» (arete PM-1) y un macho «Prueba Padre» (arete PP-1). Luego una cría «Prueba Cría» con ese padre y esa madre. | Las tres fichas se guardan. La cría muestra padre y madre. |
| W9 | Salud → Registrar: un tratamiento a «Prueba Madre» con producto «Prueba», retiro de leche 5. | Inicio muestra la alerta de retiro de Prueba Madre. |
| W10 | Documentos → Certificado interno → «Prueba Cría» → Generar → «Guardar una copia del PDF…» en el Escritorio. Ábralo. | El PDF dice «Registro interno del criadero. No es el certificado oficial de ANCO.» y no tiene código QR. |
| W11 | Documentos → Copia de respaldo → «Crear copia de respaldo…» en la memoria USB o en Documentos. | Mensaje «Copia guardada en …». Aparece un archivo `.zip`. |
| W12 | Cierre el programa (X de la ventana) y vuelva a abrirlo. Entre con el PIN. | Pide el PIN; con un PIN equivocado no deja entrar. Los tres animales siguen ahí. |
| W13 | Abra la carpeta `%APPDATA%\co.registrocaprino.escritorio` (tecla Windows + R, péguelo y Enter). | Está `registro-caprino.db` y la carpeta `documentos`. |
| W14 | Vuelva a conectar internet. Configuración → Aplicaciones → Registro Caprino → Desinstalar. **No** marque «Eliminar los datos de aplicación». | Se desinstala sin errores. |
| W15 | Instale otra vez (pasos W1 a W4) y ábralo. | Pide el usuario y el PIN: los datos siguen (no aparece la bienvenida). |
| W16 (opcional) | Repita W1 a W6 con el archivo `.msi` en otro computador o después de desinstalar. | Pide permiso de administrador; luego funciona igual. |

## Mac (chip Apple o Intel)

**Antes de empezar.** Anote la versión de macOS y el chip: menú Apple  → «Acerca de esta Mac».

| N.º | Paso | Qué debe ver |
| --- | --- | --- |
| M1 | Abra <https://github.com/Josias-glish/Orion/releases/tag/v0.1.0> y descargue el archivo que termina en `_universal.dmg`. | El archivo queda en Descargas (unos 8 MB). |
| M2 | Doble clic en el `.dmg`. | Se abre una ventana con el icono de Registro Caprino y la carpeta Aplicaciones. |
| M3 | Arrastre Registro Caprino a Aplicaciones. Expulse el disco del `.dmg`. | El programa queda en Aplicaciones. |
| M4 | **Desconecte internet** (wifi apagado y sin cable). | Sin conexión. |
| M5 | Abra Registro Caprino desde Aplicaciones. | Aviso: «No se puede abrir porque Apple no puede comprobar…». Pulse «Aceptar» (no lo mueva a la papelera). |
| M6 | Siga [INSTALACION.md, sección 3, paso 2](INSTALACION.md#paso-2-abrirlo-la-primera-vez): en macOS 15 o más reciente, Ajustes del Sistema → Privacidad y seguridad → «Abrir igualmente»; en macOS 14 o anterior, clic derecho sobre el programa → Abrir. | Se abre la ventana con la bienvenida. Si en cambio dice «está dañado», siga [esta sección](INSTALACION.md#si-dice-está-dañado-y-no-se-puede-abrir) y anótelo. |
| M7 a M12 | Repita los pasos W7 a W12 de Windows. | Lo mismo que en Windows. |
| M13 | En Finder: menú Ir → «Ir a la carpeta…» → `~/Library/Application Support/co.registrocaprino.escritorio`. | Está `registro-caprino.db` y la carpeta `documentos`. |
| M14 | Cierre el programa y vuelva a abrirlo desde Aplicaciones. | Abre directamente, sin advertencias. |
| M15 | Arrastre Registro Caprino de Aplicaciones a la Papelera. Vuelva a instalarlo (M1 a M6). | Al abrir pide el usuario: los datos siguen. |

---

## Cómo informar el resultado

Copie y complete esto (una vez por computador) y envíelo como comentario en el pull request o en un *issue*:

```
CA-12 · Windows / Mac (tache uno)
Sistema y versión: ______  (Mac: chip Apple / Intel)
Instalador usado: setup.exe / msi / dmg
Pasos que fallaron (número y qué pasó): ______
Advertencias que no coinciden con la guía: ______
Tiempo total: ___ minutos
Resultado: PASA / NO PASA
```

CA-12 **pasa** si en los dos computadores se completan todos los pasos obligatorios (W1–W15 y M1–M15) sin errores.
Las advertencias de seguridad de los pasos W2–W3 y M5–M6 son esperadas: la versión no tiene firma de código.
