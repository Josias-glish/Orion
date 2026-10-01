# Registro Caprino

Programa de escritorio para Windows y Mac con el que un criador de cabras lecheras en Colombia lleva, sin internet,
la genealogía, la reproducción, la leche, los pesajes y la salud de cada animal, y exporta el expediente que pide ANCO.

Estado: **Etapa 4** (salud y documentos): además de la finca, los usuarios, los animales, el pedigrí, la
reproducción, la leche y los pesos, ya registra vacunas, desparasitaciones y tratamientos con los campos del ICA,
avisa los retiros de leche y carne (en el Inicio, el ordeño y la ficha), emite el certificado interno y el
expediente para ANCO (PDF y CSV) y crea y restaura copias de respaldo.

## Documentos

- [Especificación](docs/ESPECIFICACION.md): qué debe hacer el programa (fuente de verdad).
- [Preparar el computador](docs/PREPARAR_EQUIPO.md): instalar Git, Node.js, Rust y lo que pide Tauri.
- [Instalar el programa](docs/INSTALACION.md): descargar el instalador y las advertencias de Windows y Mac.
- [Prueba técnica de la Etapa 1](docs/PRUEBA_TECNICA.md): qué funcionó, qué falló y la recomendación.
- [Suposiciones](docs/SUPOSICIONES.md): lo que la especificación no define todavía.
- [Ejemplos de documentos](docs/ejemplos/): certificado interno y expediente para ANCO generados por el programa.

## Comandos

```bash
npm install           # instalar dependencias
npm run tauri dev     # abrir el programa en modo desarrollo
npm test              # pruebas automáticas
npm run semillas      # datos de ejemplo en la base de desarrollo
npm run semillas -- --rendimiento   # además, 500 animales de prueba (CA-09)
npm run documentos-de-ejemplo       # PDF y CSV de ejemplo en documentos-de-ejemplo/
npm run tauri build   # construir el instalador en este equipo
```

Los instaladores oficiales los construye GitHub Actions (`.github/workflows/instaladores.yml`).

Tecnología: Tauri 2, React, TypeScript, Vite y SQLite.
