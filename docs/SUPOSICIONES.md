# Suposiciones

Todo lo que `docs/ESPECIFICACION.md` no define y que el programa necesita para funcionar.
Cada suposición tiene un marcador `SUPOSICION:` en el código y se reemplaza cuando haya un dato real.

| Id | Etapa | Tema | Suposición | Dónde está | Estado |
| --- | --- | --- | --- | --- | --- |
| S-01 | 1 | Días de gestación | 150 días por defecto, editable por finca (ya marcado como SUPOSICION en la especificación). | `src/datos/migraciones/0001_esquema_inicial.sql` (tabla `finca`) | Abierta |
| S-02 | 1 | Días de lactancia | 305 días por defecto, editable por finca (ya marcado como SUPOSICION en la especificación). | `0001_esquema_inicial.sql` (tabla `finca`) | Abierta |
| S-03 | 1-2 | Forma de concepción | En la base es texto libre. Desde la Etapa 2 el formulario ofrece: monta natural, inseminación artificial, transferencia de embriones o desconocida. | `0001_esquema_inicial.sql` (tabla `animal`), `src/dominio/tipos.ts` | Abierta (pregunta 9) |
| S-04 | 1 | Nombre y nacimiento | La base admite animales sin nombre o sin fecha de nacimiento (ancestros de animales comprados, por ejemplo). El programa decidirá en cada pantalla cuándo exigirlos. | `0001_esquema_inicial.sql` (tabla `animal`) | Abierta |
| S-05 | 1 | Unicidad de identificadores (R2) | No distingue mayúsculas de minúsculas: «ar-7» y «AR-7» son el mismo arete. Con una sola finca en el MVP, «único por finca» es único en la base. | `0001_esquema_inicial.sql` (índice `identificador_valor_vigente_unico`) | Abierta |
| S-06 | 1 | Identificador principal (R2) | Un identificador que ya no está vigente no puede ser el principal. La base impide dos principales; que haya al menos uno lo validará el programa en la Etapa 2. | `0001_esquema_inicial.sql` (tabla `identificador`) | Abierta |
| S-07 | 1 | Ancestros eliminados | Un animal con borrado lógico se trata como desconocido en la genealogía y corta esa rama del árbol. | `src/datos/repositorios/genealogia.ts` (`consultarArbol`) | Abierta |
| S-08 | 1 | Generaciones recorridas | Seis como máximo (R6 lo propone para la consanguinidad); también evita bucles si hubiera un ciclo en los datos. Será configurable. | `src/dominio/genealogia.ts` | Abierta |
| S-09 | 1 | Historial al crear | Al crear un registro se guarda una fila por cada campo con valor, con «valor anterior» vacío. Los catálogos que precarga la migración no generan historial. | `src/datos/cambios.ts` | Abierta |
| S-10 | 1 | Identificador del programa | `co.registrocaprino.escritorio`. Define la carpeta de datos: cambiarlo después de cargar datos reales obligaría a mover los archivos. | `src-tauri/tauri.conf.json` | Provisional (pregunta 4) |
| S-11 | 1 | Formato de fechas | En pantalla: dd/mm/aaaa y hora local de 24 horas. En la base: ISO 8601 (fechas `AAAA-MM-DD`, marcas de tiempo en UTC). | `src/dominio/fechas.ts` | Abierta |
| S-12 | 2 | Animales solo de genealogía | Campo `en_hato` (sí/no) en `animal`: los ancestros que nunca estuvieron en la finca (abuelos de una cabra comprada, macho de una pajilla) se registran con «Pertenece al hato» desmarcado. No salen en la lista por defecto ni en los conteos, pero sí se pueden elegir como padre o madre. | `0002_nucleo_y_genealogia.sql`, `src/datos/repositorios/animales.ts` | Abierta (pregunta 6) |
| S-13 | 2 | Fechas desconocidas en R1 | Si falta la fecha de nacimiento del animal o del padre o la madre, no se puede comparar y no se rechaza. Se rechaza nacer el mismo día que un progenitor. | `src/dominio/genealogia.ts`, disparadores de `0002` | Abierta |
| S-14 | 2 | Fecha de nacimiento futura | No se acepta una fecha de nacimiento posterior a hoy. | `src/datos/repositorios/animales.ts` | Abierta |
| S-15 | 2 | Nombre o identificador | Un animal debe tener nombre o al menos un identificador para poder reconocerlo. | `src/datos/repositorios/animales.ts` | Abierta |
| S-16 | 2 | Identificador principal (R2) | Si el animal tiene identificadores vigentes, exactamente uno es el principal; un animal sin identificadores (por ejemplo, una cría recién nacida) es válido. | `src/dominio/identificadores.ts` | Abierta |
| S-17 | 2 | Composición racial vacía (R3) | Una composición vacía es válida (raza aún no registrada); si tiene razas, deben sumar 100 % con un margen de 0,01 puntos por redondeo. Se guarda como proporción entre 0 y 1. | `src/dominio/composicion.ts` | Abierta |
| S-18 | 2 | Consanguinidad con padres sin verificar | Los padres marcados «sin verificar» se usan en el cálculo, y la pantalla avisa que el resultado los incluye. Si un ancestro aparece por varios caminos, el recorte de seis generaciones usa el camino más corto. | `src/dominio/consanguinidad.ts`, `src/pantallas/animales/Genealogia.tsx` | Abierta |
| S-19 | 2 | PIN | De 4 a 6 números. Se guarda con PBKDF2-SHA256, 600 000 iteraciones (recomendación de OWASP) y sal aleatoria. Se calcula con la criptografía nativa de la ventana (unos 0,2 s al entrar, medido en Linux) y, si no existe, en JavaScript puro (de 2 a 4 s). Se puede cambiar el número sin perder los PIN guardados (el formato guarda las iteraciones). No hay bloqueo por intentos fallidos. El PIN separa usuarios; no cifra el archivo de datos. | `src/dominio/pin.ts` | Abierta |
| S-20 | 2 | Permisos del operario (R14) | Además de lo que R14 prohíbe (genealogía, ajustes, copia completa), el operario tampoco crea ni edita fichas de animales, porque R14 no lo incluye entre lo permitido. Solo consulta fichas, genealogía e historial. | `src/dominio/permisos.ts` | Abierta (pregunta 10) |
| S-21 | 2 | Usuarios | Siempre queda al menos un propietario; nadie retira su propio usuario; no hay dos usuarios activos con el mismo nombre. | `src/dominio/usuarios.ts`, `0002_nucleo_y_genealogia.sql` | Abierta |
| S-22 | 2 | Lotes | Solo se retira un lote vacío, para no cambiar muchos animales sin querer. | `src/datos/repositorios/lotes.ts` | Abierta |
| S-23 | 2 | Fotos | Se aceptan JPG, PNG y WebP; se copian sin reducir a la carpeta `fotos` junto a la base de datos. Quitar la foto de una ficha no borra el archivo. | `src-tauri/src/lib.rs` (`copiar_foto`) | Abierta |
| S-24 | 2 | Historial del PIN | El historial anota que el PIN cambió, pero guarda «[protegido]» en lugar del hash. | `src/datos/cambios.ts` | Abierta |
| S-25 | 3 | Fórmula de la proyección (R8) | Ver la sección «Fórmula de R8» más abajo. | `src/dominio/leche.ts` (`calcularProyeccion`) | Abierta |
| S-26 | 3 | Día de lactancia | El día del parto es el día 1. | `src/dominio/leche.ts` (`diaDeLactancia`) | Abierta |
| S-27 | 3 | Jornadas de ordeño | Dos: mañana y tarde. Un solo pesaje por lactancia, fecha y jornada; si se vuelve a anotar, se corrige el anterior (y queda en el historial). La pantalla propone la mañana antes del mediodía y la tarde después. | `0003_reproduccion_leche_pesos.sql`, `src/pantallas/leche/Leche.tsx` | Abierta (pregunta 11) |
| S-28 | 3 | Servicios | Una monta necesita el macho; una inseminación necesita el macho o el código de la pajilla. Para una inseminación también se puede elegir un macho registrado solo para la genealogía (el donante); para una monta, solo machos del hato. | `src/datos/repositorios/reproduccion.ts` | Abierta |
| S-29 | 3 | Diagnóstico | El diagnóstico no puede ser anterior al servicio; todo resultado distinto de «sin diagnóstico» lleva fecha. «Aborto» se anota sobre el servicio que estaba «preñada». | `0003_reproduccion_leche_pesos.sql` | Abierta |
| S-30 | 3 | Partos próximos | Servicios «preñada» o sin diagnóstico cuya fecha probable de parto cae entre hace 15 días y dentro de 30, de hembras activas del hato y sin un parto registrado después del servicio. | `src/datos/repositorios/reproduccion.ts` (`listarPartosProximos`) | Abierta |
| S-31 | 3 | Padre de las crías (R5) | Es el macho del último servicio «preñada» anterior al parto. Si no hay ninguno, o si fue una inseminación con pajilla sin macho registrado, el padre queda vacío y «sin verificar». La forma de concepción sale del tipo de servicio. | `src/dominio/reproduccion.ts` (`padreDelParto`) | Abierta |
| S-32 | 3 | Fichas de las crías (R5) | Una cría nacida muerta también tiene ficha, en estado «muerto». Cada cría necesita nombre o arete. Su composición racial es el promedio de la del padre y la madre (vacía si falta alguno). El formulario admite hasta 6 crías. | `src/dominio/reproduccion.ts`, `src/dominio/composicion.ts`, `src/pantallas/reproduccion/RegistrarParto.tsx` | Abierta (pregunta 8) |
| S-33 | 3 | Lactancia anterior | Si la madre tenía una lactancia abierta al parir, se seca el día anterior al parto. Una hembra tiene a lo sumo una lactancia abierta. No se puede secar antes del último pesaje anotado. | `src/datos/repositorios/reproduccion.ts`, `0003_reproduccion_leche_pesos.sql` | Abierta |
| S-34 | 3 | Ganancia diaria (R10) | Se calcula entre cada pesaje y el anterior del mismo animal. Dos pesajes el mismo día no tienen ganancia (no se divide por cero). | `src/dominio/pesos.ts` | Abierta |
| S-35 | 3 | Metas de peso por edad (RF-31) | El usuario anota el peso meta por sexo y edad en meses (solo el propietario las cambia). Entre dos metas, la meta de cada día se calcula en línea recta; fuera del rango anotado no se compara. Un mes = 30,4375 días. Las metas de `npm run semillas` son solo de ejemplo. | `0003_reproduccion_leche_pesos.sql`, `src/dominio/pesos.ts` | Abierta |
| S-36 | 3 | Servicios y diagnósticos del operario (R14) | R14 permite al operario registrar partos, leche y pesos, pero no menciona los servicios: por ahora solo el propietario registra servicios y diagnósticos. | `src/dominio/permisos.ts` | Abierta (pregunta 10) |
| S-37 | 3 | Partos de ejemplo | Para tener lactancias en curso, `npm run semillas` agrega cuatro crías nacidas en partos recientes (EJ-13 a EJ-16): quedan 16 animales en lugar de 12. La fecha de nacimiento de Gema pasó a 2022-03-10 para que Bella no tenga dos partos con 81 días de diferencia. | `scripts/reproduccion-de-ejemplo.ts`, `scripts/datos-de-ejemplo.ts` | Abierta |
| S-38 | 4 | Retiro (R7) | Sin días de retiro (vacío o 0) no hay retiro. La alerta está vigente desde el día de aplicación hasta el día de fin del retiro, ambos incluidos. La fecha de fin del tratamiento puede ser futura (un tratamiento que sigue); la de aplicación no. | `src/dominio/salud.ts` | Abierta |
| S-39 | 4 | Tratamiento a un lote | Se guarda una fila por cada animal activo del lote ese día (con el lote anotado). Así el retiro sigue al animal tratado y no a quien entre al lote después. Un lote sin animales activos no recibe tratamientos. | `0004_salud_y_documentos.sql`, `src/datos/repositorios/salud.ts` | Abierta |
| S-40 | 4 | Condición corporal (RF-25) | Escala de 1 a 5 en pasos de medio punto (1 = muy flaca, 3 = ideal, 5 = muy gorda). La especificación ya la marcaba como SUPOSICION. | `0004_salud_y_documentos.sql`, `src/dominio/salud.ts` | Abierta |
| S-41 | 4 | Calendario de vacunas (RF-22) | Muestra las próximas fechas de los siguientes 30 días y las ya vencidas. Una aplicación posterior del mismo tipo y producto al mismo animal cumple la fecha pendiente de la anterior. La próxima fecha debe ser posterior a la aplicación. | `src/dominio/salud.ts` (`proximasAplicaciones`) | Abierta |
| S-42 | 4 | R11 en salud | No se registran eventos de salud a animales vendidos o muertos, y sus retiros dejan de mostrarse (ya no hay leche ni carne que vender desde la finca). Su historial se conserva. | `src/datos/repositorios/salud.ts` | Abierta |
| S-43 | 4 | Permisos de salud y documentos (R14) | El operario registra vacunas, desparasitaciones, tratamientos y condición corporal (R14 le da «tratamientos»). Solo el propietario retira un evento anotado por error y solo él emite certificados y expedientes (R14 no se los da al operario). | `src/dominio/permisos.ts` | Abierta (pregunta 10) |
| S-44 | 4 | Copia de respaldo y restauración (RF-43) | La copia es un `.zip` con `datos.json` (todas las tablas, incluido el historial, los registros retirados y los hash de PIN), las fotos y los documentos. Restaurar solo se permite en una instalación vacía (primera pantalla), para no borrar ni mezclar datos; en el mismo computador, primero se aparta el archivo de la base (docs/INSTALACION.md, sección 5). Una copia hecha con una versión más nueva del programa se rechaza. La especificación ya marcaba «restaurar» como SUPOSICION. | `src/datos/respaldo.ts`, `src-tauri/src/archivos.rs` | Abierta |
| S-45 | 4 | Tabla `certificado` | Tipo «propio» = certificado interno del criadero; tipo «asociacion» = expediente preparado para ANCO. `archivo` es la ruta del PDF dentro de la carpeta de datos; el CSV del expediente queda al lado con el mismo nombre. | `0004_salud_y_documentos.sql` | Abierta |
| S-46 | 4 | Numeración de documentos | `CI-AAAA-NNNN` (certificado interno) y `EX-AAAA-NNNN` (expediente), correlativos por tipo y año. Un número no se reutiliza. | `src/datos/repositorios/documentos.ts` | Abierta |
| S-47 | 4 | Campos del expediente (R13) | Los de R13, en ese orden. Criador y propietario = el primer usuario propietario de la finca (el programa no registra el criador de un animal comprado); criadero = el de Ajustes → Finca; marcas = identificadores vigentes que no son el registro de asociación. El CRG del animal y el de sus ancestros no son obligatorios («si existe»); un padre o abuelo desconocido sí se avisa como faltante, y un vínculo «sin verificar» se avisa aparte. La especificación ya marca la lista como SUPOSICION hasta tener un CRG real. | `src/dominio/expediente.ts`, `src/datos/repositorios/documentos.ts` | Abierta |
| S-48 | 4 | Formatos del expediente | PDF tamaño carta con la nota «Formato provisional … no es un formato oficial de ANCO». CSV de una fila por animal, separado por punto y coma (lo que espera Excel en español), UTF-8 con BOM, fechas dd/mm/aaaa y una columna final con los campos que faltan. | `src/documentos/expediente.ts` | Abierta |
| S-49 | 4 | Contenido del certificado interno (R12) | Título «Certificado interno del criadero»; el aviso de R12 en un recuadro arriba y en el pie de cada página; datos del animal, identificadores, composición racial, consanguinidad y ascendencia hasta abuelos. Sin código QR, sin imágenes, sin sellos y sin la sigla CRG (el número de la asociación se rotula «Registro de asociación»). | `src/documentos/certificado.ts` | Abierta |

## Fórmula de R8 (proyección de la lactancia)

La especificación pide «una fórmula documentada». Se usa la más simple que se puede comprobar a mano:

```
proyección = acumulado + promedio × días que faltan

acumulado       = suma de todos los kilos anotados en la lactancia (mañana y tarde)
promedio        = kilos por día de los últimos 7 días que tienen algún pesaje
                  (o de los que haya, si hay menos de 7)
días que faltan = máximo(0, días de lactancia de la finca − día de lactancia del último pesaje)
día de lactancia: el día del parto es el día 1
```

Ejemplo (es la prueba de CA-08 en `src/dominio/leche.test.ts`): lactancia que empezó el 1 de agosto, 305 días de
lactancia en la finca, y 10 días con registro (días 2 a 11) con 3, 4, …, 12 kg por día entre mañana y tarde.

- Acumulado = 3 + 4 + … + 12 = 75 kg.
- Últimos 7 días con registro: 6, 7, …, 12 kg → suma 63 → promedio 9 kg por día.
- Día del último registro = 11 → días que faltan = 305 − 11 = 294.
- Proyección = 75 + 9 × 294 = **2721 kg**. La prueba comprueba exactamente ese número.

Limitaciones conocidas, para revisar con datos reales:

- No usa una curva de lactancia (Wood u otra): supone que la producción sigue igual al promedio reciente, así que
  sobreestima al comienzo de la lactancia (antes del pico) y subestima poco después.
- Un día con una sola jornada anotada cuenta como día con registro: mientras se ordeña, la proyección baja un poco
  hasta que se anota la otra jornada.
- Si una lactancia ya pasó los días de la finca, la proyección es igual al acumulado.
