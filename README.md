# Registro Caprino

Programa de escritorio para Windows y Mac con el que un criador de cabras lecheras en Colombia lleva, sin internet,
la genealogía, la reproducción, la leche, los pesajes y la salud de cada animal, y exporta el expediente que pide ANCO.

Estado: **Etapa 1** (esqueleto técnico con instaladores). Todavía no sirve para registrar un hato real.

## Documentos

- [Especificación](docs/ESPECIFICACION.md): qué debe hacer el programa (fuente de verdad).
- [Preparar el computador](docs/PREPARAR_EQUIPO.md): instalar Git, Node.js, Rust y lo que pide Tauri.
- [Instalar el programa](docs/INSTALACION.md): descargar el instalador y las advertencias de Windows y Mac.
- [Prueba técnica de la Etapa 1](docs/PRUEBA_TECNICA.md): qué funcionó, qué falló y la recomendación.
- [Suposiciones](docs/SUPOSICIONES.md): lo que la especificación no define todavía.

## Comandos

```bash
npm install           # instalar dependencias
npm run tauri dev     # abrir el programa en modo desarrollo
npm test              # pruebas automáticas
npm run tauri build   # construir el instalador en este equipo
```

Los instaladores oficiales los construye GitHub Actions (`.github/workflows/instaladores.yml`).

Tecnología: Tauri 2, React, TypeScript, Vite y SQLite.
