# Suposiciones

Todo lo que `docs/ESPECIFICACION.md` no define y que el programa necesita para funcionar.
Cada suposición tiene un marcador `SUPOSICION:` en el código y se reemplaza cuando haya un dato real.

| Id | Etapa | Tema | Suposición | Dónde está | Estado |
| --- | --- | --- | --- | --- | --- |
| S-01 | 1 | Días de gestación | 150 días por defecto, editable por finca (ya marcado como SUPOSICION en la especificación). | `src/datos/migraciones/0001_esquema_inicial.sql` (tabla `finca`) | Abierta |
| S-02 | 1 | Días de lactancia | 305 días por defecto, editable por finca (ya marcado como SUPOSICION en la especificación). | `0001_esquema_inicial.sql` (tabla `finca`) | Abierta |
| S-03 | 1 | Forma de concepción | Texto libre hasta definir sus valores. Propuesta pendiente de respuesta: monta natural, inseminación artificial, transferencia de embriones, desconocida. | `0001_esquema_inicial.sql` (tabla `animal`) | Abierta (pregunta 9) |
| S-04 | 1 | Nombre y nacimiento | La base admite animales sin nombre o sin fecha de nacimiento (ancestros de animales comprados, por ejemplo). El programa decidirá en cada pantalla cuándo exigirlos. | `0001_esquema_inicial.sql` (tabla `animal`) | Abierta |
| S-05 | 1 | Unicidad de identificadores (R2) | No distingue mayúsculas de minúsculas: «ar-7» y «AR-7» son el mismo arete. Con una sola finca en el MVP, «único por finca» es único en la base. | `0001_esquema_inicial.sql` (índice `identificador_valor_vigente_unico`) | Abierta |
| S-06 | 1 | Identificador principal (R2) | Un identificador que ya no está vigente no puede ser el principal. La base impide dos principales; que haya al menos uno lo validará el programa en la Etapa 2. | `0001_esquema_inicial.sql` (tabla `identificador`) | Abierta |
| S-07 | 1 | Ancestros eliminados | Un animal con borrado lógico se trata como desconocido en la genealogía y corta esa rama del árbol. | `src/datos/repositorios/animales.ts` (`consultarAncestros`) | Abierta |
| S-08 | 1 | Generaciones recorridas | Seis como máximo (R6 lo propone para la consanguinidad); también evita bucles si hubiera un ciclo en los datos. Será configurable. | `src/dominio/genealogia.ts` | Abierta |
| S-09 | 1 | Historial al crear | Al crear un registro se guarda una fila por cada campo con valor, con «valor anterior» vacío. Los catálogos que precarga la migración no generan historial. Sin usuarios todavía, `usuario_id` queda vacío hasta la Etapa 2. | `src/datos/historial.ts` | Abierta |
| S-10 | 1 | Identificador del programa | `co.registrocaprino.escritorio`. Define la carpeta de datos: cambiarlo después de cargar datos reales obligaría a mover los archivos. | `src-tauri/tauri.conf.json` | Provisional (pregunta 4) |
| S-11 | 1 | Formato de fechas | En pantalla: dd/mm/aaaa y hora local de 24 horas. En la base: ISO 8601 (fechas `AAAA-MM-DD`, marcas de tiempo en UTC). | `src/dominio/fechas.ts` | Abierta |
