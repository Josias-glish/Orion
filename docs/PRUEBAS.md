# Pruebas de Registro Caprino

Qué prueba cada criterio de aceptación de la especificación (sección 11), cómo ejecutar las pruebas y el resultado
de la versión 0.1.0.

## Matriz de criterios de aceptación

| Criterio | Qué exige | Pruebas automáticas (Vitest) | Programa real (Linux, sin red) |
| --- | --- | --- | --- |
| **CA-01** (R1) | Rechaza como padre a una hembra, a un descendiente o a un animal nacido después, y explica el motivo | `src/dominio/genealogia.reglas.test.ts`, `src/datos/repositorios/animales.test.ts` | `pruebas-e2e/etapa2.mjs` |
| **CA-02** (R6) | Hijo de hermanos completos 25 %; de medios hermanos 12,5 % | `src/dominio/consanguinidad.test.ts`, `src/datos/repositorios/genealogia.test.ts` | `etapa2.mjs` (25 % en pantalla) |
| **CA-03** (R5) | Un parto de tres crías crea tres fichas con la madre y abre la lactancia | `src/dominio/reproduccion.test.ts`, `src/datos/repositorios/reproduccion.test.ts` | `etapa3.mjs` (parto de dos crías) |
| **CA-04** (R7) | Con retiro de 5 días, la alerta llega hasta el quinto día y desaparece al vencer | `src/dominio/salud.test.ts`, `src/datos/repositorios/salud.test.ts` | `etapa4.mjs` (alertas en Inicio, ordeño y ficha) |
| **CA-05** (R13) | El expediente trae todos los campos y la ascendencia hasta abuelos | `src/dominio/expediente.test.ts`, `src/documentos/documentos.test.ts`, `src/datos/repositorios/documentos.test.ts` | `etapa4.mjs` (PDF y CSV guardados) |
| **CA-06** (R2) | No admite dos animales con el mismo identificador vigente del mismo tipo | `src/dominio/identificadores.test.ts`, `src/datos/repositorios/animales.test.ts`, `src/datos/migraciones.test.ts` | `etapa2.mjs` |
| **CA-07** (R3) | Rechaza una composición racial que no sume 100 % | `src/dominio/composicion.test.ts`, `src/datos/repositorios/animales.test.ts` | `etapa2.mjs` |
| **CA-08** (R8) | La proyección coincide con el cálculo manual de la fórmula documentada | `src/dominio/leche.test.ts`, `src/datos/repositorios/leche.test.ts` | `etapa3.mjs` (curva y proyección) |
| **CA-09** | Guardar un pesaje de leche tarda menos de 1 s con 500 animales | `scripts/datos-de-rendimiento.test.ts` | `etapa3.mjs` (Enter → «Guardado» con 500 animales) |
| **CA-10** | Sin red funcionan los flujos 0 a 3 y 5 | `src/seguridad.test.ts` (sin código de red, CSP, dependencias, permisos) | `pruebas-e2e/todas.sh`: etapas 2, 3 y 4 dentro de un espacio de red vacío |
| **CA-11** | Los datos permanecen al cerrar y abrir; restaurar reproduce los mismos datos | `src/datos/respaldo.test.ts` | `etapa2.mjs` (cerrar y abrir), `etapa4.mjs` (restaurar y comparar tabla por tabla) |
| **CA-12** | Los instaladores se instalan y abren en un Windows y en un Mac | Manual: [PRUEBA_CA12.md](PRUEBA_CA12.md) | Lo hace el aprisco |

`src/aceptacion.test.ts` falla si algún criterio de CA-01 a CA-11 se queda sin prueba o si esta tabla deja de
nombrar alguno.

## Otras pruebas

- Migraciones (`src/datos/migraciones.test.ts`): huellas SHA-256, registro en Rust, restricciones de la base.
- Seguridad y privacidad (`src/seguridad.test.ts`): PIN siempre con hash (ni en la base, ni en el historial, ni en la
  copia de respaldo), sin telemetría, permisos mínimos de Tauri, datos en la carpeta del usuario.
- Usabilidad medible (`src/aceptacion.test.ts`): contraste WCAG AA de 17 combinaciones de colores, letra de 18 px y
  campos de 48 px de alto.
- Rust (`cd src-tauri && cargo test`): archivos de documentos y respaldo `.zip`. También corre en Windows y macOS
  dentro del flujo de instaladores.
- Etapa 1 (`pruebas-e2e/transacciones.mjs`): el experimento que dio origen a la decisión D-004.

## Cómo ejecutarlas

```bash
npm test                         # Vitest: dominio, repositorios, documentos, respaldo, seguridad
npm run tipos                    # revisión de tipos
cd src-tauri && cargo test       # Rust

# Programa real en Linux, sin red (ver docs/PRUEBA_TECNICA.md para preparar el equipo):
npx tauri build --debug --no-bundle
sudo sh pruebas-e2e/todas.sh capturas
```

## Resultado de la versión 0.1.0 (2026-10-01)

| Prueba | Resultado |
| --- | --- |
| Vitest | 303 de 303 |
| Rust | 4 de 4 |
| Programa real sin red, Etapa 2 (Flujo 0) | 25 de 25 |
| Programa real sin red, Etapa 3 (Flujos 1 y 2, CA-09) | 24 de 24 |
| Programa real sin red, Etapa 4 (Flujos 3 y 5, CA-11, permisos) | 28 de 28 |
| CA-12 en Windows y Mac | Pendiente: lo hace el aprisco con [PRUEBA_CA12.md](PRUEBA_CA12.md) |
