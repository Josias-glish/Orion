# PROMPT MAESTRO 2: Registro Caprino después del MVP

## 0. Qué debes hacer primero

1. Lee `docs/ESPECIFICACION.md`, `CLAUDE.md` y `docs/SUPOSICIONES.md`.
2. Comprueba que el MVP esté completo: `npm test` pasa, el release `v0.1.0` existe y `docs/SUPOSICIONES.md` está completo. Si algo falta, dímelo y detente.
3. Guarda este documento, sin cambios, en `docs/ESPECIFICACION_2.md`. Actualiza `CLAUDE.md` para que lo referencie y para que recuerde la regla de red de la sección 4.
4. No escribas código todavía. Responde con: (a) tu plan por etapas, en tus palabras; (b) tus dudas, numeradas y agrupadas; (c) qué cuentas o servicios tendría que crear yo. Espera a que yo escriba el número de una etapa.

## 1. Rol y forma de trabajar

Sigues siendo el ingeniero de software senior del primer prompt. Mantén todas las reglas de trabajo y las prohibiciones de `docs/ESPECIFICACION.md`: etapas que terminan en algo que yo pueda probar, no inventar, verificar la documentación vigente, ejecutar las pruebas antes de decir que algo funciona, proponer alternativas antes de cambiar una decisión y hacer las preguntas necesarias todas juntas. Recuerda que soy estudiante: dame los comandos exactos y dime qué debería ver. Responde en español.

Reglas adicionales:
- Puertas: algunas etapas tienen una PUERTA, es decir, una respuesta o decisión que debo darte antes de que escribas código. Si no la tengo, haz solo lo que la etapa permite sin ella y detente.
- Secretos: nunca me pidas que pegue contraseñas, claves, certificados o tokens en el chat. Dime en qué panel guardarlos (secretos de GitHub o panel del servicio). No los escribas en el repositorio ni en los registros.
- Costos: antes de recomendar un servicio, lista lo que cuesta según su página oficial vigente y si tiene capa gratuita. No inventes precios.
- Datos reales: no uses los datos reales del aprisco en pruebas ni los subas a ningún servicio sin mi permiso.
- Migraciones: sigue sin editar migraciones ya aplicadas. Quien instaló la versión 0.1.0 debe poder actualizar sin perder datos (CA-33).
- Versiones: cada etapa publica la versión siguiente a la última publicada, con el mismo flujo de GitHub.

## 2. Estado de partida

El MVP es un programa de escritorio (Tauri 2, React, TypeScript y SQLite local) para Windows y macOS, sin red, con animales, genealogía, reproducción, salud, leche, pesajes, certificado interno, expediente para ANCO y respaldo. Este documento lo amplía.

## 3. Alcance

Dentro: las etapas 6 a 15. Etapa 6, sementales y montas de otras fincas. Etapa 7, generador de registros genealógicos. Etapa 8, calidad de leche y finanzas. Etapa 9, compra y venta de animales, inventario y hoja de venta. Etapa 10, sincronización con servidor. Etapa 11, página pública con QR. Etapa 12, firma de instaladores y actualizaciones. Etapa 13, integración con ANCO. Etapa 14, varias fincas, permisos y suscripción. Etapa 15, mejora de la interfaz, con fotos de cabras, difuminados y mejor maquetación.

Fuera, por ahora: la versión móvil; el documento con el formato del ICA (el programa ya guarda los campos de los tratamientos); un mercado en línea donde otros usuarios publiquen y compren animales; ovinos; ADN; evaluación genética; lector de microchips; y cualquier cosa que no esté listada arriba.

## 4. Regla de red (reemplaza la del MVP)

En el MVP el programa no hace llamadas de red. Desde ahora la red se permite solo para: sincronización (etapa 10), página pública (etapa 11), actualizaciones (etapa 12), integración con ANCO (etapa 13) y suscripción (etapa 14). Todas son opcionales:
- El programa debe abrir y funcionar completo sin red.
- Nada puede quedarse esperando la red.
- El usuario debe ver si está en línea y cuántos cambios están pendientes de enviar.
- Cada dirección a la que se conecte debe estar declarada en los permisos de Tauri, con la lista mínima.

## 5. Stack y servicios nuevos

- Servidor: PostgreSQL con una API en TypeScript sobre un servicio gestionado (SUPOSICION, igual que la especificación). Propón dos opciones con sus costos y espera mi elección.
- Sincronización: evalúa bibliotecas existentes antes de escribir una propia. Verifica que sigan activas, que soporten SQLite en el cliente y PostgreSQL en el servidor, que funcionen en el programa de escritorio y que no cierren la puerta a una versión móvil futura. Entrégame una comparación corta y una recomendación; yo decido.
- Archivos: almacenamiento de objetos para fotos, adjuntos y certificados, con las fotos comprimidas en el dispositivo.
- Arquitectura: `src/dominio` no depende de la plataforma. Crea una capa de almacenamiento con adaptadores (Tauri SQL y API del servidor) para poder añadir otros más adelante.
- Pruebas: Vitest para el dominio y pruebas de integración de la sincronización con dos clientes simulados.

## 6. Datos nuevos

Toda tabla nueva sigue las reglas comunes del primer documento (id UUID, creado_en, modificado_en y eliminado_en).
- `animal` (migración): agrega `origen` (`nacido_aqui`, `comprado` o `externo`; los animales existentes quedan como `nacido_aqui`), `contacto_id` (opcional: propietario de un animal externo o vendedor de uno comprado) y `fecha_ingreso` (opcional).
- `contacto`: nombre, criadero, municipio, telefono, correo, notas. Guarda datos personales de terceros: ver R28.
- `evento_reproductivo` (migración): agrega `costo` (opcional, en pesos) y `condiciones` (texto libre).
- `libro` (migración): agrega `prefijo` y `siguiente_numero`.
- `registro_genealogico`: animal_id, libro_id, numero (texto: prefijo más consecutivo), fecha_registro, estado (`borrador`, `emitido` o `anulado`), version, instantanea (JSON con los datos y el pedigrí al emitir), responsable, motivo_anulacion, observaciones.
- `certificado` (migración): agrega el tipo `registro_propio`.
- `pesaje_leche`: agrega grasa_pct, proteina_pct y celulas_somaticas (células por ml; la unidad es SUPOSICION), todos opcionales.
- `categoria_economica` (catálogo editable): nombre, tipo (`ingreso` o `gasto`).
- `movimiento_economico`: fecha, tipo (`ingreso` o `gasto`), categoria_id, valor (pesos colombianos, SUPOSICION), animal_id y lote_id (opcionales), descripcion.
- `traspaso`: animal_id, tipo (`compra` o `venta`), contacto_id, fecha, precio, observaciones, adjuntos (rutas de archivos locales, opcional).
- `dispositivo`: nombre, plataforma, ultima_sincronizacion.
- `cola_cambios`: entidad, registro_id, operacion (`crear`, `modificar` o `eliminar`), campos (JSON), marca_tiempo, dispositivo_id, enviado.
- `publicacion_animal`: animal_id, token (aleatorio), campos_publicados (JSON), activa.
- Solo en el servidor: `cuenta` (correo), `membresia` (cuenta_id, finca_id, rol) y, en la etapa 14, `plan` (finca_id, nombre, tope_animales, vigente_hasta).

## 7. Reglas de negocio nuevas

- R15. Cola de cambios: cada modificación local entra en `cola_cambios` en la misma transacción que el cambio. Los envíos se reintentan de forma segura: reenviar un cambio no lo duplica ni lo pierde (idempotencia por id de cambio).
- R16. Conflictos: se resuelven por campo, con marca de tiempo, y el valor anterior se conserva en `historial_cambios`. Dos cambios en campos distintos del mismo registro se conservan ambos. Si un dispositivo borra un registro y otro lo edita después, gana la marca más reciente por campo; si queda una edición posterior al borrado, el registro se restaura y se avisa al usuario (SUPOSICION).
- R17. Reloj: no confíes solo en el reloj del dispositivo, que puede estar mal ajustado. Propón y justifica una solución, por ejemplo un reloj lógico híbrido o la hora del servidor al recibir (SUPOSICION).
- R18. Calidad de leche: grasa, proteína y células somáticas son opcionales. La comparación entre cabras usa promedios por lactancia e ignora los valores vacíos.
- R19. Finanzas: los gastos sin animal ni lote se muestran aparte como «gastos generales». El prorrateo entre animales es una opción que yo activo, rotulada SUPOSICION. Costo por cabra = gastos asignados a ese animal. Rentabilidad = ingresos menos gastos, por animal, lote o finca y por periodo.
- R20. Venta: marca al animal como vendido, queda en su historial y no modifica su genealogía ni anula su registro propio. Si hay precio, ofrece crear el ingreso en finanzas. Puede entregar la hoja de venta y el certificado de registro propio.
- R21. Hoja de venta: PDF y Excel con los datos del animal, identificadores, raza, composición racial, libro y árbol de tres generaciones. La producción de leche es opcional y la elige el vendedor. Debe decir que es un documento informativo del criadero y no un certificado oficial.
- R22. Página pública: apagada por defecto; muestra solo los campos que el criador autorice por animal; se abre con un token aleatorio y revocable (nunca con un id secuencial); no muestra datos de compradores, vendedores, contactos ni usuarios; con un token inválido o revocado muestra un mensaje neutro sin datos; no es indexable por buscadores y tiene límite de solicitudes. El código QR puede ir también en el certificado de registro propio (R31), solo si el animal está publicado.
- R23. Permisos: el propietario puede todo. El operario, como en R14 y sin finanzas, compras, ventas ni registros genealógicos. El veterinario lee el historial y registra tratamientos, sin finanzas ni ajustes, en una o varias fincas.
- R24. Plan gratuito: el tope de animales es configurable, sin valores fijos en el código (los números los defino yo) y cuenta solo animales propios, no externos. Al superarlo, el programa pasa a solo lectura y exportación; los datos nunca se borran ni se bloquean para el usuario. El periodo de gracia sin conexión es configurable; propón un valor (SUPOSICION).
- R25. Precios y topes: no los inventes; salen de la configuración.
- R26. Reservada: el documento con el formato del ICA está fuera por ahora y este número no se reutiliza.
- R27. ANCO: ninguna integración ni formato inventado; la exportación se adapta solo a lo que ANCO responda por escrito.
- R28. Datos personales: los contactos de terceros (compradores, vendedores, propietarios de sementales) se guardan solo con los datos mínimos, nunca se publican y deben poder excluirse de la sincronización (SUPOSICION). Antes de cobrar o de publicar datos de terceros hace falta una revisión legal (en Colombia, la normativa de protección de datos personales, que confirma un abogado). Implementa el consentimiento y la eliminación definitiva de una cuenta a pedido de su titular, con confirmación; es la única excepción a no borrar datos de forma física.
- R29. Animales externos: un animal externo es una fila de `animal` con `origen` = `externo`. Sirve solo como padre, madre o ancestro de un animal propio. No cuenta en el inventario, el tope de animales, el ordeño, los servicios propios, las alertas ni las listas de trabajo. Datos mínimos: nombre, sexo y contacto del propietario; opcionales: identificadores (incluido el registro de asociación), raza y composición racial, libro, nacimiento, foto, padre y madre. Aplican R1, R2, R3 y R6. Un animal externo que sea ancestro de un animal propio no se puede eliminar. Si luego se compra, se promueve a propio (R32) conservando su id y su genealogía.
- R30. Montas con machos de otras fincas: el servicio acepta como macho un macho propio, un macho externo (R29) o solo una pajilla (texto). Para un macho externo se guardan además el costo (opcional) y las condiciones acordadas con su dueño (texto libre). Si hay costo, ofrece crear el gasto en finanzas cuando la etapa 8 esté hecha. R5 no cambia: el padre de la cría sale del último servicio confirmado, sea propio o externo. Si una hembra tuvo servicios con machos distintos dentro de la ventana de gestación antes del parto, con un margen configurable (propón un valor, SUPOSICION), la paternidad es incierta: el programa lo avisa, deja elegir al padre y permite marcarlo «sin verificar». Cada macho externo muestra su historial de servicios y sus resultados.
- R31. Registro genealógico propio: es el libro del propio criadero.
  - Número: prefijo del libro más un consecutivo por libro, con formato configurable (SUPOSICION). Un número nunca se reutiliza ni se reordena, ni siquiera si el registro se anula.
  - Estados: `borrador` (editable), `emitido` (genera documentos) y `anulado` (conserva número e historial; exige un motivo). Un animal tiene un solo registro vigente.
  - Requisitos para emitir, con una lista de verificación visible: nombre, sexo, fecha de nacimiento, identificador principal vigente, raza o composición racial que suma 100 %, libro, padre y madre (o libro «fundadores» sin padres), criador, propietario y criadero. La genealogía debe pasar R1. Si falta algo, no se emite y se muestra qué falta.
  - Instantánea: al emitir se guarda una copia fija de los datos y del pedigrí. Los cambios posteriores no alteran el documento ya emitido. Para corregir se reemite: versión nueva con el mismo número, y la anterior queda en el historial como reemplazada.
  - Certificado de registro propio (PDF): número y versión, datos del animal, identificadores, composición racial, libro, criador, propietario y criadero, pedigrí de tres generaciones (con opción de cuatro), fecha de emisión y línea de firma del responsable. Debe llevar el rótulo de R12: «Registro propio del criadero. No es el certificado oficial de ANCO». Nunca el nombre, el logo ni el diseño del certificado de ANCO.
  - Libro genealógico del criadero: listado exportable (PDF y Excel) por libro, raza y periodo, con número, nombre, identificador principal, nacimiento, padre y madre.
  - Generación en lote: se eligen varios animales; el programa emite los que cumplen, muestra los que no (con lo que les falta) y asigna consecutivos sin saltos a los emitidos.
  - Pedigrí imprimible en PDF de cualquier animal, tenga o no registro. Los ancestros externos aparecen con su número de asociación si lo tienen.
  - Solo el propietario crea, emite y anula registros.
- R32. Compra: registrar una compra (a) promueve a `origen` = `comprado` a un animal que ya existe como externo, conservando su id y su genealogía, o (b) crea el animal con ese origen. Guarda fecha de ingreso, vendedor (`contacto`), precio y documentos de origen: el número de registro de asociación (identificador de tipo `registro_asociacion`) y adjuntos opcionales (PDF o imagen). Ofrece crear el gasto en finanzas. Desde la fecha de ingreso el animal cuenta en el inventario. No se reemiten certificados del criador anterior.
- R33. Interfaz: solo cambia la presentación, no las reglas ni los datos. Las fotos de cabras se descargan una sola vez durante el desarrollo, de fuentes cuya licencia permita su uso en un programa que puede venderse (comprobada foto por foto), se empaquetan en el instalador y se acreditan en `CREDITOS.md` y en Ajustes. El programa nunca pide por red fotos, fuentes tipográficas ni íconos al ejecutarse. Una foto de referencia de una raza solo se rotula con esa raza si la fuente la identifica así, y siempre dice que no es el animal registrado. Los difuminados y degradados se usan con moderación, el texto sobre ellos mantiene un contraste mínimo AA y un «Modo simple» por usuario, guardado solo en el equipo, los desactiva. Todos los textos siguen en `src/textos/es.ts` y la interfaz funciona completa sin red.

## 8. Requisitos funcionales nuevos

- RF-47 (Alta) Animales y sementales externos, con contactos (R29). Etapa 6.
- RF-48 (Alta) Montas con machos de otras fincas o con pajillas (R30). Etapa 6.
- RF-49 (Alta) Generador de registros genealógicos: libro propio, numeración, estados, certificado de registro propio, libro exportable, lote y pedigrí imprimible (R31). Etapa 7.
- RF-32 (Media) Calidad de leche: grasa, proteína y células somáticas por muestra. Etapa 8.
- RF-33 (Media) Ingresos y gastos por categoría, con animal o lote opcional. Etapa 8.
- RF-34 (Baja) Costo por cabra y por lote, y rentabilidad. Etapa 8.
- RF-50 (Alta) Compra de animales (R32). Etapa 9.
- RF-16 (Alta) Venta o traspaso de animales (R20). Etapa 9.
- RF-36 (Media) Inventario del hato y hoja de venta con pedigrí, en PDF y Excel. Etapa 9.
- RF-40 (Alta) Sincronizar con el servidor al volver la red mediante la cola de cambios. Incluye cuenta con correo, vincular la finca, registro de dispositivos y estado de sincronización visible. Etapa 10.
- RF-41 (Alta) Resolver conflictos por campo con marca de tiempo y conservar el historial. Etapa 10.
- RF-17 (Media) Página pública de verificación con código QR, y QR en los certificados. Etapa 11.
- RF-45 (Media, SUPOSICION) Instaladores firmados y actualización opcional del programa. Etapa 12.
- RF-46 (Media, SUPOSICION) Exportación o envío a ANCO según su respuesta. Etapa 13.
- RF-37 (Media) Varias fincas por usuario y permisos por rol, incluido el veterinario. Etapa 14.
- RF-38 (Baja) Plan gratuito con tope de animales y planes de pago por tramos. Etapa 14.
- RF-51 (Media) Mejora de la interfaz: sistema de diseño, maquetación renovada, fotos de cabras con licencia empaquetadas, difuminados con modo simple y accesibilidad básica (R33). Etapa 15.
- Fuera por ahora: RF-35 (documento con el formato del ICA) y RF-44 (versión móvil).

## 9. Criterios de aceptación nuevos

- CA-13 (R29) Un animal externo aparece en el pedigrí, pero no en el inventario, el ordeño, los servicios propios, las alertas ni el conteo del tope; no se puede eliminar si es ancestro de un animal propio.
- CA-14 (R30) Un parto de una hembra servida por un macho externo crea la cría con ese macho como padre, y el pedigrí muestra su nombre y su propietario.
- CA-15 (R30) Dos servicios con machos distintos dentro de la ventana de gestación hacen que el programa avise la incertidumbre, deje elegir al padre y permita marcarlo «sin verificar».
- CA-16 (R31) No se emite un registro al que le falte un requisito, y el programa muestra cuál.
- CA-17 (R31) Los números son consecutivos por libro; un registro anulado conserva su número y este no se reutiliza; una emisión en lote no deja saltos.
- CA-18 (R31) Cambiar el padre de un animal después de emitir no altera el certificado ya emitido; reemitir crea una versión nueva con el mismo número.
- CA-19 (R31) El certificado de registro propio trae el rótulo obligatorio y el pedigrí correcto de tres generaciones, sin el nombre ni el diseño del certificado de ANCO.
- CA-20 (R31) El libro genealógico exportado coincide con los registros emitidos.
- CA-21 (R18) Con datos de prueba, el promedio de células somáticas por lactancia coincide con el cálculo manual e ignora los valores vacíos.
- CA-22 (R19) Con movimientos de prueba, el costo por cabra, el costo por lote y la rentabilidad coinciden con el cálculo manual, y los gastos sin asignar salen aparte.
- CA-23 (R32) Comprar un animal que ya existe como externo lo promueve a comprado conservando su id y su genealogía; la compra crea el gasto si el usuario lo acepta.
- CA-24 (R20) Una venta marca al animal como vendido, conserva su historial y lo quita del ordeño.
- CA-25 (R21) La hoja de venta en PDF y en Excel trae los identificadores, la composición racial, el libro y el árbol correctos.
- CA-26 (R15) Un ordeño, un tratamiento y un parto registrados sin red aparecen en el segundo dispositivo, sin duplicados ni pérdidas, al volver la red.
- CA-27 (R16) Dos cambios en campos distintos del mismo animal se conservan ambos; en el mismo campo gana la marca más reciente y el valor anterior queda en el historial; una edición posterior a un borrado restaura el registro y avisa.
- CA-28 (R15) Un corte de red a mitad del envío no duplica ni pierde cambios al reintentar.
- CA-29 (R22) La página pública muestra solo los campos autorizados; un token inválido o revocado muestra un mensaje neutro sin datos; no es indexable.
- CA-30 (sección 4) Sin red, el programa abre y funciona completo; la actualización es opcional y se prueba aparte.
- CA-31 (R23) Propietario, operario y veterinario ven y hacen solo lo que su rol permite, comprobado con pruebas automáticas.
- CA-32 (R24) Al superar el tope, el programa queda en solo lectura y exportación, y no se pierde ningún dato.
- CA-33 Instalar una versión nueva sobre la 0.1.0 conserva todos los datos (se prueba con una copia de datos de ejemplo, no con los reales).
- CA-34 (R33) Sin red, todas las pantallas muestran sus fotos, fuentes e íconos, y ninguna hace solicitudes de red para cargarlos.
- CA-35 (R33) Cada foto empaquetada tiene su registro de autor, fuente, licencia y fecha en `CREDITOS.md`, y los créditos se muestran en Ajustes.
- CA-36 (R33) El «Modo simple» desactiva difuminados, degradados y animaciones, y todas las pantallas siguen siendo utilizables.
- CA-37 (R33) El texto sobre difuminados, degradados y fotos cumple el contraste mínimo AA, y las alertas de retiro no dependen solo del color.
- CA-38 La ventana se puede redimensionar entre su tamaño mínimo y uno grande sin que se corten textos ni se solapen elementos en ninguna pantalla.
- CA-39 Todas las pruebas de las etapas anteriores siguen pasando después del rediseño.

## 10. Puertas

- Etapa 10: yo elijo la biblioteca de sincronización y el servicio del servidor entre las opciones que propongas.
- Etapa 11: revisión legal de datos personales antes de activar la página pública para terceros.
- Etapa 12, firma: los certificados de Windows y de Apple, que yo debo obtener.
- Etapa 13: la respuesta escrita de ANCO, que yo guardo en `docs/ANCO_RESPUESTA.md`.
- Etapa 14: revisión legal y tributaria (incluida la facturación), precios y topes definidos por mí, y la pasarela de pago elegida por mí.
- Etapa 15: yo elijo la dirección visual (paleta, tipografía, tono y uso de fotos y difuminados) entre dos opciones que propongas.

## 11. Prohibiciones

- No agregues funciones fuera del alcance de la sección 3, ni un mercado en línea de compra y venta.
- No inventes formatos de ANCO.
- No imites el nombre, el logo ni el diseño del certificado de ANCO.
- No hagas llamadas de red fuera de las permitidas en la sección 4.
- No pidas ni guardes secretos en el chat o en el repositorio.
- No uses datos reales del aprisco sin mi permiso.
- No publiques datos de contactos de terceros.
- No uses imágenes, fuentes ni íconos sin licencia verificada, ni los cargues desde internet cuando el programa se ejecuta.
- No cobres ni integres pagos sin mi decisión.
- No borres datos de forma física, salvo la eliminación de una cuenta pedida por su titular.
- No edites migraciones ya aplicadas.
- No avances de etapa sin mi autorización.
