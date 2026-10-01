# PROMPT MAESTRO: Registro Caprino, programa de escritorio para Windows y Mac

## 0. Qué debes hacer primero

1. Guarda este documento completo, sin cambios, en `docs/ESPECIFICACION.md`.
2. Crea `CLAUDE.md` en la raíz con: un resumen de diez líneas, la regla «lee `docs/ESPECIFICACION.md` antes de empezar cada etapa», los comandos para desarrollar, probar y construir, y una lista donde anotes las decisiones que se vayan tomando.
3. Crea `docs/SUPOSICIONES.md`, vacío por ahora. Ahí se anota todo lo que no esté definido en este documento.
4. No escribas código de la aplicación todavía. Responde con: (a) tu plan por etapas, en tus palabras; (b) tus dudas, numeradas y agrupadas; (c) qué programas faltan en mi computador. Espera a que yo escriba «Etapa 1».

## 1. Rol y forma de trabajar

Eres un ingeniero de software senior que construye un programa de escritorio para criadores de cabras. Yo soy estudiante y estoy aprendiendo: no asumas que domino programación. Cuando necesites que yo ejecute algo, dame el comando exacto y dime qué debería ver. Responde siempre en español.

Reglas:
- Trabaja por etapas. Cada etapa termina en algo que yo pueda probar. Al terminar una etapa entrégame: un resumen de diez líneas, los pasos para probarla, la lista de pruebas automáticas ejecutadas con su resultado real y un commit con mensaje claro. No pases a la etapa siguiente hasta que yo lo pida.
- No inventes. Si falta un dato (formato de ANCO, formato del ICA, una fórmula), no lo supongas en silencio: deja el marcador `SUPOSICION:` en el código, anótalo en `docs/SUPOSICIONES.md` y avísame.
- Verifica en la documentación oficial vigente de Tauri 2, de SQLite y de cada librería que uses los comandos, versiones y APIs. No los uses de memoria.
- Ejecuta las pruebas antes de decir que algo funciona. Si algo falla, dilo y explica la causa.
- Si una decisión técnica de este documento no funciona, propón una alternativa con su justificación y espera mi respuesta antes de cambiarla.
- Haz solo las preguntas necesarias, todas juntas y numeradas.

## 2. Objetivo

Construir «Registro Caprino» (nombre provisional): un programa de escritorio para Windows y macOS con el que un criador de cabras lecheras en Colombia lleva, sin internet, la genealogía, la reproducción, la leche, los pesajes y la salud de cada animal, y exporta el expediente que pide ANCO. El primer usuario es el Aprisco El Paraíso; después lo usarán otros criadores (gratis al principio, con suscripción más adelante). Los usuarios son criadores y operarios rurales, con poca práctica digital.

## 3. Contexto de la investigación

- De 20 programas revisados, ninguno une registro genealógico colombiano, control lechero y gestión completa de cabras. Los más cercanos están en inglés, pensados para EE. UU., o son solo para bovinos.
- ANCO (asociación colombiana de caprinos y ovinos) lleva cinco libros genealógicos por raza y emite el certificado de registro (CRG), que incluye padres y abuelos con su propio CRG. No hay una interfaz pública de ANCO: no inventes ninguna integración; el programa solo exporta un expediente.
- El ICA exige, mediante la Resolución 20148 de 2016, el Registro Oficial de Tratamientos Veterinarios (producto, número de registro ICA, lote, dosis, vía, animal, fechas, tiempo de retiro y veterinario). Si aplica a un aprisco lechero está por confirmar; por eso el programa guarda todos esos campos desde el inicio.
- La cabra lechera exige partos múltiples con una ficha por cría, lactancias normalizadas y tiempos de retiro de leche y carne.
- Razas que reconoce ANCO: Saanen, Alpina, Boer, Lamancha, Anglonubiana, Toggenburg y Santandereana. El catálogo de razas debe ser editable.

## 4. Alcance

Dentro de este prompt: núcleo de animales, genealogía y certificado interno, reproducción, salud y vacunación, producción de leche, pesajes, exportación del expediente para ANCO, copia de respaldo y empaquetado para Windows y Mac.

Fuera de este prompt (no lo construyas, aunque parezca fácil): sincronización con servidor y resolución de conflictos, versión móvil, finanzas, calidad de leche (grasa, proteína, células somáticas), documento oficial del ICA con su formato, traspasos y hoja de venta, página pública con código QR, varias fincas y suscripciones, integración con ANCO, lector de microchips, ADN, evaluación genética, ovinos y firma de los instaladores.

## 5. Plataforma, stack y estructura

- Aplicación de escritorio con Tauri 2 para Windows 10/11 y macOS.
- Interfaz: React, TypeScript y Vite. Todos los textos de la interfaz van en `src/textos/es.ts`, nunca escritos dentro de los componentes.
- Base de datos: SQLite local mediante el plugin SQL de Tauri, con migraciones en archivos `.sql` numerados. Usa consultas recursivas para recorrer ancestros.
- Lógica del dominio (reglas y cálculos): funciones puras en TypeScript en `src/dominio`, sin depender de la interfaz ni de la base de datos, con pruebas en Vitest.
- PDF: generado en el equipo, sin red (por ejemplo con `pdf-lib`; elige una librería mantenida y justifícala).
- Estilos: elige una sola opción (CSS propio o Tailwind) y mantenla.
- Estructura sugerida: `src/dominio`, `src/datos` (repositorios y migraciones), `src/pantallas`, `src/componentes`, `src/textos`, `src-tauri`, `docs`, `.github/workflows`.
- Instaladores: un flujo de GitHub Actions con `tauri-action` que, al crear una etiqueta `v*` o al ejecutarlo a mano, construya Windows (`.msi` y `.exe`) y macOS (`.dmg` universal, para Apple Silicon e Intel) y los publique como borrador de release en GitHub. Sin firma de código en el MVP; documenta las advertencias de seguridad que verá el usuario al instalar.
- El programa no debe hacer ninguna llamada de red en el MVP.

## 6. Modelo de datos

Reglas comunes: toda tabla lleva `id` (UUID generado en el programa), `creado_en`, `modificado_en` y `eliminado_en` (borrado lógico; nulo si está activo). Nunca borres filas de forma física. La tabla `historial_cambios` registra cada modificación. No edites una migración ya aplicada: crea una nueva.

Entidades y campos clave:
- `finca`: nombre, criadero (nombre de hato), municipio, registro_sanitario_predio, dias_gestacion (150 por defecto, SUPOSICION), dias_lactancia (305 por defecto, SUPOSICION).
- `usuario`: nombre, rol (`propietario` u `operario`), pin_hash (opcional), contacto.
- `raza` y `libro` (catálogos editables): nombre, activo. Precarga las siete razas de ANCO y estos cinco libros: pureza por pedigrí, pureza por cruzamiento, mestizo, fundadores y pureza de origen.
- `lote`: nombre, descripcion.
- `animal`: nombre, sexo (`hembra` o `macho`), fecha_nacimiento, color_senas, libro_id, estado (`activo`, `vendido`, `muerto`), foto (ruta de un archivo local copiado a la carpeta de datos), padre_id y madre_id (opcionales), padre_sin_verificar y madre_sin_verificar (booleanos), forma_concepcion, lote_id, observaciones.
- `identificador`: animal_id, tipo (`tatuaje`, `microchip`, `arete`, `registro_asociacion`), valor, fecha, vigente, principal.
- `composicion_racial`: animal_id, raza_id, fraccion.
- `evento_reproductivo`: hembra_id, macho_id (opcional), pajilla (texto opcional), tipo (`monta` o `inseminacion`), fecha, resultado (`pendiente`, `prenada`, `vacia`, `aborto`), fecha_diagnostico, fecha_probable_parto, observaciones.
- `parto`: hembra_id, evento_reproductivo_id (opcional), fecha, numero_crias, observaciones.
- `lactancia`: hembra_id, parto_id, fecha_inicio, fecha_secado (opcional).
- `pesaje_leche`: lactancia_id, fecha, jornada (`manana` o `tarde`, SUPOSICION), kilos.
- `pesaje_corporal`: animal_id, fecha, kilos, tipo (`nacimiento`, `destete` o `control`).
- `evento_salud`: animal_id o lote_id, tipo (`vacuna`, `desparasitacion`, `tratamiento`, `condicion_corporal`), producto, numero_registro_ica, lote_producto, dosis, via, fecha_inicio, fecha_fin, retiro_leche_dias, retiro_carne_dias, aplicador, veterinario, condicion_corporal (de 1 a 5, SUPOSICION), proxima_fecha, observaciones.
- `certificado`: animal_id, tipo (`propio` o `asociacion`), numero, fecha, archivo.
- `historial_cambios`: entidad, registro_id, campo, valor_anterior, valor_nuevo, marca_tiempo, usuario_id.

## 7. Reglas de negocio

- R1. Integridad de la genealogía: un animal no puede ser su propio ancestro (detecta ciclos de cualquier profundidad), el padre debe ser macho, la madre hembra y el animal debe nacer después de sus padres. Si se viola, se rechaza el cambio con un mensaje claro que explique el motivo.
- R2. Identificadores: un animal puede tener varios, exactamente uno es el principal y el valor es único por tipo y finca entre los vigentes.
- R3. Composición racial: las fracciones de un animal suman 100 %.
- R4. Fecha probable de parto: fecha del servicio más los días de gestación de la finca.
- R5. Parto: crea una ficha de animal por cada cría, con la madre asignada y el padre tomado del último servicio de esa hembra con resultado `prenada` anterior al parto; si no existe, el padre queda vacío y marcado «sin verificar». El libro de la cría queda vacío para que el propietario lo asigne. Además abre la lactancia de la madre.
- R6. Consanguinidad: coeficiente de Wright sobre el pedigrí, hasta un máximo de generaciones configurable (SUPOSICION: seis). Un ancestro desconocido se trata como no emparentado. Verificación: hijo de dos hermanos completos = 25 %; hijo de medios hermanos = 12,5 %.
- R7. Retiro: la fecha de fin del retiro es fecha_fin (o fecha_inicio si no hay fecha_fin) más los días de retiro. La alerta de leche o de carne está vigente hasta esa fecha inclusive. Con retiro de 5 días y tratamiento el día D, la alerta termina el día D+5.
- R8. Proyección de lactancia: la investigación no define la fórmula. SUPOSICION: producción acumulada hasta la fecha más el promedio diario de los últimos 7 días con registro, multiplicado por los días que faltan hasta los días de lactancia de la finca. Documenta la fórmula en `docs/SUPOSICIONES.md`.
- R9. Intervalo entre partos: días entre dos partos consecutivos de la misma hembra.
- R10. Ganancia diaria de peso: diferencia de kilos dividida por los días entre dos pesajes.
- R11. Un animal vendido o muerto deja de aparecer en el ordeño y en los servicios, pero conserva todo su historial.
- R12. Certificado interno: debe decir «Registro interno del criadero. No es el certificado oficial de ANCO», sin imitar el diseño ni el nombre del CRG y sin código QR.
- R13. Expediente para ANCO: incluye nombre, número de CRG (identificador `registro_asociacion`, si existe), criador, propietario, criadero, sexo, composición racial, libro, forma de concepción, marcas, color, nacimiento y ascendencia hasta abuelos (con su CRG si lo tienen). Avisa qué campos faltan. Esta lista de campos es SUPOSICION hasta tener un CRG real. Formatos: PDF y CSV (SUPOSICION).
- R14. Roles: el propietario puede todo. El operario puede ver las fichas y crear registros de leche, partos, pesos y tratamientos; no edita la genealogía ni los ajustes y no exporta la copia completa.

## 8. Requisitos funcionales del MVP

Núcleo
- RF-01 (Alta) Registrar animales: nombre, sexo, fecha de nacimiento, color y señas, foto y estado.
- RF-02 (Alta) Varios identificadores por animal, con uno principal.
- RF-03 (Alta) Raza y composición racial por fracciones.
- RF-04 (Alta) Catálogos editables de razas y libros.
- RF-05 (Media) Lotes.
- RF-06 (Alta) Crear la finca y usuarios locales con rol propietario u operario. Al abrir el programa se elige el usuario; el PIN es opcional y se guarda con hash (SUPOSICION).
- RF-07 (Media) Buscar y filtrar animales por identificador, nombre, sexo, estado y lote.

Genealogía y certificados
- RF-08 (Alta) Padre y madre de cada animal; opcionales en los fundadores.
- RF-09 (Alta) Árbol genealógico de tres generaciones como mínimo.
- RF-10 (Media) Consanguinidad (R6).
- RF-11 (Alta) Asignar un libro a cada animal.
- RF-12 (Alta) Validaciones de integridad (R1).
- RF-13 (Media) Marcar padre o madre como «sin verificar».
- RF-14 (Alta) Certificado interno en PDF (R12).
- RF-15 (Alta) Exportar el expediente para ANCO (R13).

Reproducción
- RF-18 (Alta) Servicios (monta o inseminación) con macho o pajilla y fecha.
- RF-19 (Alta) Diagnóstico de preñez y fecha probable de parto (R4).
- RF-20 (Alta) Parto con una ficha por cría (R5).
- RF-21 (Media) Abortos e intervalo entre partos (R9).

Salud
- RF-22 (Alta) Vacunas y desparasitaciones con calendario de próximas fechas.
- RF-23 (Alta) Tratamientos con todos los campos del ICA.
- RF-24 (Alta) Alertas de retiro de leche y de carne (R7), visibles en la ficha, en el ordeño y en el inicio.
- RF-25 (Baja) Condición corporal.

Leche
- RF-26 (Alta) Peso de leche por cabra y por jornada.
- RF-27 (Alta) Lactancias por parto, con inicio y secado.
- RF-28 (Media) Curva de lactancia y proyección (R8).
- RF-29 (Media) Pantalla de ordeño en lote: lista de hembras en lactancia con entrada numérica rápida.

Pesajes
- RF-30 (Alta) Peso corporal por fecha, con tipo (nacimiento, destete, control).
- RF-31 (Media) Ganancia diaria (R10) y comparación con metas por edad que define el usuario (SUPOSICION).

Transversales
- RF-39 (Alta) Todo funciona sin conexión sobre la base local.
- RF-42 (Alta) Identificadores UUID creados en el programa.
- RF-43 (Media) Exportar todos los datos de la finca a un archivo de respaldo y restaurarlo (restaurar es SUPOSICION).
- Historial de cambios registrado desde el primer día.

## 9. Pantallas y flujos

Navegación lateral: Inicio, Animales, Reproducción, Leche, Pesos, Salud, Documentos y Ajustes (solo propietario). Inicio muestra las alertas de retiro vigentes, los partos próximos, las vacunas por vencer y las hembras en lactancia.

Flujos:
- Flujo 0, carga inicial del hato: crear la finca; registrar cada animal con sus datos, raza e identificadores; anotar padres cuando se conocen (los fundadores quedan sin padres); el programa valida el pedigrí.
- Flujo 1, nacimiento: ficha de la hembra, Registrar parto, fecha, número de crías y observaciones; el programa crea las fichas de las crías con madre y padre, se asignan identificadores y se abre la lactancia; opcionalmente se emite el certificado interno.
- Flujo 2, ordeño diario: abrir el ordeño, elegir la jornada, anotar los kilos de cada cabra, ver el aviso si su leche está retenida y guardar.
- Flujo 3, tratamiento: elegir animal o lote, Registrar tratamiento, completar los campos, indicar el retiro; la alerta queda activa hasta que venza.
- Flujo 5, expediente para ANCO: elegir el animal, Exportar expediente, ver los campos que faltan, generar PDF y CSV.

Principios de uso: pocos pasos, letra grande, buen contraste, mensajes en español sencillo y sin términos técnicos, confirmación antes de acciones que modifican muchos datos, y en el ordeño teclado numérico y Enter para guardar.

## 10. Requisitos no funcionales

- Sin conexión: ninguna función exige internet y el programa no hace llamadas de red.
- Rendimiento: guardar un pesaje responde en menos de un segundo con 500 animales y 5 usuarios (SUPOSICION).
- Seguridad y privacidad: los datos quedan en el equipo, sin telemetría, y el PIN se guarda con hash.
- Integridad: validaciones en el dominio y restricciones en la base de datos.
- Compatibilidad: Windows 10 y 11, y macOS en las versiones que soporte Tauri 2.
- Mantenibilidad: lo mantendrán dos personas; código simple, con los nombres del dominio en español (animal, parto, lactancia) y comentarios breves.

## 11. Pruebas y criterios de aceptación

Pruebas automáticas: Vitest para el dominio; pruebas de los repositorios con SQLite en memoria que apliquen las mismas migraciones; `npm test` debe pasar antes de construir los instaladores, y el flujo de GitHub Actions ejecuta las pruebas primero.

- CA-01 (R1) Rechaza asignar como padre a una hembra, a un descendiente del animal o a un animal nacido después, y explica el motivo.
- CA-02 (R6) Hijo de hermanos completos: 25 %; hijo de medios hermanos: 12,5 %.
- CA-03 (R5) Un parto de tres crías crea tres fichas con la madre asignada y abre la lactancia.
- CA-04 (R7) Con retiro de 5 días, la alerta se muestra hasta el quinto día después del tratamiento y desaparece al vencer.
- CA-05 (R13) El expediente trae todos los campos y la ascendencia hasta abuelos.
- CA-06 (R2) No admite dos animales con el mismo identificador del mismo tipo vigente en la finca.
- CA-07 (R3) Rechaza una composición racial que no sume 100 %.
- CA-08 (R8) La proyección coincide con el cálculo manual de la fórmula documentada.
- CA-09 Guardar un pesaje de leche tarda menos de un segundo con los datos de ejemplo de 500 animales.
- CA-10 Con la red del equipo desactivada, funcionan los flujos 0 a 3 y 5.
- CA-11 Los datos permanecen al cerrar y abrir el programa, y restaurar un respaldo reproduce los mismos datos.
- CA-12 (manual, lo verifico yo) Los instaladores se instalan y abren sin errores en un Windows y en un Mac.

## 12. Datos de ejemplo

Crea `npm run semillas`, que cargue datos ficticios rotulados como ejemplo: 12 animales en tres generaciones, con un par de hermanos completos y un par de medios hermanos apareados para probar la consanguinidad, varias lactancias con pesajes y un tratamiento con retiro vigente. Es solo para desarrollo: no debe incluirse en el instalador final.

## 13. Prohibiciones

- No agregues funciones fuera del alcance de la sección 4.
- No hagas llamadas de red ni uses servicios en la nube.
- No imites el diseño ni el nombre del certificado de ANCO.
- No inventes formatos de ANCO ni del ICA: usa SUPOSICION.
- No guardes el PIN en texto plano.
- No borres datos de forma física.
- No edites migraciones ya aplicadas.
- No avances de etapa sin mi autorización.
