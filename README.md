# Registro Caprino

Programa de escritorio para **Windows y Mac** con el que un criador de cabras lecheras en Colombia lleva, **sin
internet**, la genealogía, la reproducción, la leche, los pesajes y la salud de cada animal, y prepara el expediente
que pide ANCO. El primer usuario es el Aprisco El Paraíso.

Versión actual: **0.1.0** (primera versión para usar en el aprisco).

## Qué hace

- **Animales**: ficha con identificadores (arete, tatuaje, microchip, registro de asociación), raza y composición
  racial, foto, lote y estado. Búsqueda y filtros.
- **Genealogía**: padre y madre (con «sin verificar»), árbol de tres generaciones y consanguinidad. El programa
  rechaza pedigríes imposibles y explica por qué.
- **Reproducción**: servicios (monta o inseminación), diagnóstico de preñez, fecha probable de parto, partos con una
  ficha por cría, abortos e intervalo entre partos.
- **Leche**: ordeño en lote con teclado numérico y Enter, lactancias, curva y proyección.
- **Pesos**: peso corporal, ganancia diaria y metas por edad que define el aprisco.
- **Salud**: vacunas y desparasitaciones con calendario, tratamientos con los campos del Registro de Tratamientos del
  ICA, condición corporal y alertas de retiro de leche y carne (en el Inicio, el ordeño y la ficha).
- **Documentos**: certificado interno del criadero en PDF (no reemplaza el certificado de ANCO), expediente para ANCO
  en PDF y CSV con aviso de los campos que faltan, y copia de respaldo de todos los datos.
- **Usuarios**: propietario y operarios, con PIN opcional (guardado cifrado). Cada cambio queda en un historial.

Los datos quedan **solo en el computador**: el programa no se conecta a internet, no envía datos a ningún lado y no
tiene telemetría.

## Instalar

Descargue el instalador de la página de versiones (Releases) del repositorio y siga
[docs/INSTALACION.md](docs/INSTALACION.md). Los instaladores no tienen firma de código: Windows y macOS mostrarán
advertencias la primera vez; la guía explica cómo continuar.

## Construir desde el código

Necesita Git, Node.js 24, Rust 1.90 o superior y lo que pide Tauri en cada sistema. La guía paso a paso, con los
comandos exactos y lo que debería ver, está en [docs/PREPARAR_EQUIPO.md](docs/PREPARAR_EQUIPO.md).

```bash
git clone https://github.com/Josias-glish/Orion.git
cd Orion
npm install                        # instalar dependencias
npm test                           # pruebas automáticas (Vitest)
npm run tauri dev                  # abrir el programa en modo desarrollo (usa una base de datos aparte)
npm run semillas                   # opcional: datos de ejemplo en la base de desarrollo
npm run semillas -- --rendimiento  # opcional: además, 500 animales de prueba (CA-09)
npm run documentos-de-ejemplo      # opcional: PDF y CSV de ejemplo en documentos-de-ejemplo/
npm run tauri build                # construir el instalador para este computador
```

Los instaladores oficiales (Windows `.msi` y `.exe`, Mac `.dmg` universal) los construye GitHub Actions
(`.github/workflows/instaladores.yml`) al crear una etiqueta `v*`, por ejemplo `v0.1.0`, que debe coincidir con la
versión de `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` y `package.json`. El resultado queda como borrador
en Releases.

Tecnología: Tauri 2, React, TypeScript, Vite y SQLite. Guía para quien mantiene el código: [CLAUDE.md](CLAUDE.md).

## Cómo reportar errores

1. Anote **qué hizo** (los pasos, uno por uno), **qué esperaba** que pasara y **qué pasó**.
2. Anote la **versión** (abajo en la barra lateral, por ejemplo «Versión 0.1.0») y el sistema (Windows 10, Windows 11
   o Mac, y si el Mac tiene chip Apple o Intel).
3. Si apareció un mensaje, tome una captura de pantalla. Si dice «Detalle técnico», ábralo y copie el texto.
4. Abra un *issue* en <https://github.com/Josias-glish/Orion/issues/new/choose> con la plantilla «Reportar un error».
   Si no tiene cuenta en GitHub, envíe lo mismo por escrito a la persona que le instaló el programa.

**No adjunte** la copia de respaldo ni el archivo de la base de datos: tienen todos los datos de la finca y de los
usuarios. Si hace falta para encontrar el error, se acuerda aparte cómo compartirlos.

## Documentos

- [Especificación](docs/ESPECIFICACION.md): qué debe hacer el programa (fuente de verdad).
- [Instalar el programa](docs/INSTALACION.md): descarga, advertencias de Windows y Mac, datos y copia de respaldo.
- [Preparar el computador para desarrollar](docs/PREPARAR_EQUIPO.md).
- [Pruebas](docs/PRUEBAS.md): qué prueba cada criterio de aceptación y cómo ejecutarlas.
- [Prueba manual de instalación (CA-12)](docs/PRUEBA_CA12.md) y [prueba con un operario](docs/PRUEBA_USABILIDAD.md).
- [Suposiciones](docs/SUPOSICIONES.md): lo que falta confirmar con ANCO, el ICA y el aprisco.
- [Prueba técnica](docs/PRUEBA_TECNICA.md): resultados de las pruebas con el programa real en Linux.
- [Ejemplos de documentos](docs/ejemplos/): certificado interno y expediente generados por el programa.
