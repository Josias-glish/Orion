-- Migración 0009: sincronización con servidor (Etapa 10, especificación 2: R15, R16, R17 y R28).
--
-- NO EDITAR una vez aplicada. Cualquier cambio va en una migración nueva con el número siguiente.
-- Mismas convenciones que la 0001 (marcas de tiempo UTC, tablas STRICT, disparadores que impiden DELETE).
-- CA-33: solo agrega tablas, columnas con valor por defecto y disparadores; no cambia ninguna fila existente.
-- Un equipo que no se vincula a un servidor deja estas tablas vacías y se comporta como en la versión anterior.
-- Diseño: docs/SINCRONIZACION.md (secciones 4 a 6, 8 y 13).

-- Equipos de la finca. `propio = 1` es este equipo; los demás los informa el servidor, solo para mostrarlos.
CREATE TABLE dispositivo (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  nombre TEXT NOT NULL CHECK (trim(nombre) <> ''),
  plataforma TEXT,
  propio INTEGER NOT NULL DEFAULT 0 CHECK (propio IN (0, 1)),
  -- Letra que el servidor le da al unirse (A, B, C…); va al final del número de los certificados internos (S-88).
  codigo_equipo TEXT CHECK (codigo_equipo IS NULL OR (trim(codigo_equipo) <> '' AND codigo_equipo NOT GLOB '*[^A-Z]*')),
  ultima_sincronizacion TEXT CHECK (ultima_sincronizacion IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', ultima_sincronizacion) IS ultima_sincronizacion),
  revocado INTEGER NOT NULL DEFAULT 0 CHECK (revocado IN (0, 1)),
  creado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', creado_en) IS creado_en),
  modificado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', modificado_en) IS modificado_en),
  eliminado_en TEXT CHECK (eliminado_en IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', eliminado_en) IS eliminado_en)
) STRICT;

CREATE UNIQUE INDEX dispositivo_un_propio ON dispositivo (propio) WHERE propio = 1 AND eliminado_en IS NULL;

-- Estado de la sincronización de este equipo: pares clave y valor (finca_servidor, cuenta_correo, cursor_seq, marca_ultima,
-- desfase_ms, subida_inicial, descarga_inicial, version_esquema_servidor…). Nunca guarda contraseñas ni tokens (van al
-- llavero del sistema). Sin filas = el equipo no está vinculado.
CREATE TABLE sincronizacion_estado (
  clave TEXT PRIMARY KEY NOT NULL CHECK (trim(clave) <> ''),
  valor TEXT,
  modificado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', modificado_en) IS modificado_en)
) STRICT;

-- R15: cola de cambios. Cada modificación entra aquí en la misma transacción que el cambio.
--   id: clave de idempotencia (reenviar un cambio no lo duplica). secuencia: el orden de envío.
--   grupo_id: todos los cambios de una misma operación del usuario (el servidor aplica un grupo entero o nada).
--   campos: JSON con los valores nuevos (en `crear`, todos los de la fila). Cuando el servidor confirma el envío se
--   vacía, así la tabla no crece sin freno y no se borra ninguna fila.
--   rechazo: motivo si el servidor rechazó el grupo (no se reintenta solo).
CREATE TABLE cola_cambios (
  secuencia INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE CHECK (length(id) = 36),
  grupo_id TEXT NOT NULL CHECK (length(grupo_id) = 36),
  orden INTEGER NOT NULL CHECK (orden >= 0),
  entidad TEXT NOT NULL CHECK (trim(entidad) <> ''),
  registro_id TEXT NOT NULL CHECK (trim(registro_id) <> ''),
  operacion TEXT NOT NULL CHECK (operacion IN ('crear', 'modificar', 'eliminar')),
  campos TEXT CHECK (campos IS NULL OR json_valid(campos)),
  marca TEXT NOT NULL CHECK (trim(marca) <> ''),
  usuario_id TEXT,
  dispositivo_id TEXT NOT NULL CHECK (length(dispositivo_id) = 36),
  enviado INTEGER NOT NULL DEFAULT 0 CHECK (enviado IN (0, 1)),
  enviado_en TEXT CHECK (enviado_en IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', enviado_en) IS enviado_en),
  rechazo TEXT,
  creado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', creado_en) IS creado_en),
  modificado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', modificado_en) IS modificado_en),
  CHECK (enviado = 1 OR campos IS NOT NULL)
) STRICT;

CREATE INDEX cola_cambios_pendientes ON cola_cambios (enviado, secuencia);
CREATE INDEX cola_cambios_por_grupo ON cola_cambios (grupo_id);

-- Archivos (fotos, PDF, adjuntos) que ya están en el servidor. Los archivos no cambian: el nombre lleva un uuid o el número
-- del documento, así que basta saber si ya se subieron. Solo local: no viaja.
CREATE TABLE archivo_sincronizado (
  ruta TEXT PRIMARY KEY NOT NULL CHECK (trim(ruta) <> ''),
  subido_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', subido_en) IS subido_en)
) STRICT;

-- R16 y R17: la marca (reloj híbrido) de cada campo de un registro. `marca_base` es la menor marca del registro y
-- `campos` un JSON {campo: marca} solo con los campos que tienen otra: un pesaje que nunca se corrige ocupa una fila
-- pequeña. `eliminado_valor` es el valor de `eliminado_en` tal cual se escribió: la fila muestra el efecto calculado
-- (un borrado con una edición posterior queda restaurado, S-85), y para recalcularlo hace falta el valor original.
CREATE TABLE marca_registro (
  entidad TEXT NOT NULL CHECK (trim(entidad) <> ''),
  registro_id TEXT NOT NULL CHECK (trim(registro_id) <> ''),
  marca_base TEXT NOT NULL CHECK (trim(marca_base) <> ''),
  campos TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(campos)),
  eliminado_valor TEXT,
  modificado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', modificado_en) IS modificado_en),
  PRIMARY KEY (entidad, registro_id)
) STRICT, WITHOUT ROWID;

-- Avisos y conflictos de la sincronización (S-85, S-86). `conflicto` guarda la operación completa que no se pudo aplicar
-- (nada se pierde); los demás son avisos para el usuario. `resuelto_en` lo marca el usuario o el programa al reintentar.
CREATE TABLE aviso_sincronizacion (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  tipo TEXT NOT NULL CHECK (tipo IN ('restaurado', 'renombrado', 'conflicto', 'revision', 'reloj', 'rechazo')),
  entidad TEXT,
  registro_id TEXT,
  detalle TEXT NOT NULL CHECK (json_valid(detalle)),
  operacion TEXT CHECK (operacion IS NULL OR json_valid(operacion)),
  visto_en TEXT CHECK (visto_en IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', visto_en) IS visto_en),
  resuelto_en TEXT CHECK (resuelto_en IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', resuelto_en) IS resuelto_en),
  creado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', creado_en) IS creado_en),
  modificado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', modificado_en) IS modificado_en),
  eliminado_en TEXT CHECK (eliminado_en IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', eliminado_en) IS eliminado_en)
) STRICT;

CREATE INDEX aviso_pendientes ON aviso_sincronizacion (resuelto_en, tipo, creado_en);

-- R28 (S-90): `contacto` nunca se sincroniza. Cuando otro equipo menciona un contacto que este equipo no tiene, se crea
-- una fila marcador con ese id (los datos del contacto quedan en el otro equipo). Si el propietario escribe los datos
-- aquí, `marcador` pasa a 0 y la fila sigue siendo solo de este equipo.
ALTER TABLE contacto ADD COLUMN marcador INTEGER NOT NULL DEFAULT 0 CHECK (marcador IN (0, 1));

-- S-90: el PIN no sale del equipo. Un usuario que llega por sincronización no se puede elegir al entrar hasta que el
-- propietario le defina un PIN en este equipo. Solo local: no viaja.
ALTER TABLE usuario ADD COLUMN pin_pendiente INTEGER NOT NULL DEFAULT 0 CHECK (pin_pendiente IN (0, 1));

-- R16: el historial de un cambio recibido guarda la marca y el equipo de origen. `aplicado = 0` es un cambio que perdió el
-- choque con otro más reciente (el valor que se quedó va en valor_anterior y el que perdió en valor_nuevo). Las filas de
-- antes quedan con marca vacía y aplicado = 1.
ALTER TABLE historial_cambios ADD COLUMN marca TEXT;
ALTER TABLE historial_cambios ADD COLUMN dispositivo_id TEXT;
ALTER TABLE historial_cambios ADD COLUMN aplicado INTEGER NOT NULL DEFAULT 1 CHECK (aplicado IN (0, 1));

-- Nunca se borran filas de forma física.
CREATE TRIGGER dispositivo_sin_borrado_fisico BEFORE DELETE ON dispositivo
BEGIN SELECT RAISE(ABORT, 'No se permite borrar filas: use eliminado_en (borrado lógico).'); END;

CREATE TRIGGER sincronizacion_estado_sin_borrado_fisico BEFORE DELETE ON sincronizacion_estado
BEGIN SELECT RAISE(ABORT, 'No se permite borrar filas: deje el valor vacío.'); END;

CREATE TRIGGER cola_cambios_sin_borrado_fisico BEFORE DELETE ON cola_cambios
BEGIN SELECT RAISE(ABORT, 'No se permite borrar filas: la cola conserva cada cambio.'); END;

CREATE TRIGGER marca_registro_sin_borrado_fisico BEFORE DELETE ON marca_registro
BEGIN SELECT RAISE(ABORT, 'No se permite borrar filas.'); END;

CREATE TRIGGER aviso_sincronizacion_sin_borrado_fisico BEFORE DELETE ON aviso_sincronizacion
BEGIN SELECT RAISE(ABORT, 'No se permite borrar filas: use eliminado_en (borrado lógico).'); END;
