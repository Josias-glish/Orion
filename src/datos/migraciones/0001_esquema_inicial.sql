-- Migración 0001: esquema inicial (Etapa 1).
--
-- NO EDITAR una vez aplicada. Cualquier cambio va en una migración nueva con el número siguiente.
-- La prueba de huellas (src/datos/migraciones.test.ts) falla si este archivo cambia.
--
-- Convenciones de todas las tablas:
--   * id: UUID v4 en texto (36 caracteres), generado por el programa.
--   * creado_en, modificado_en, eliminado_en: fecha y hora UTC en ISO 8601, 'AAAA-MM-DDTHH:MM:SS.sssZ'.
--   * eliminado_en NULL = registro activo. Nunca se borran filas (borrado lógico); un disparador lo impide.
--   * Fechas sin hora: 'AAAA-MM-DD'.
--   * Sí/no: INTEGER 0 o 1.
--   * Tablas STRICT: SQLite rechaza valores de un tipo distinto al de la columna.
-- En los CHECK se usa "IS" y no "=" porque "=" con NULL da NULL y SQLite dejaría pasar el valor inválido.

CREATE TABLE finca (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  nombre TEXT NOT NULL CHECK (trim(nombre) <> ''),
  criadero TEXT,
  municipio TEXT,
  registro_sanitario_predio TEXT,
  -- SUPOSICION: 150 días de gestación y 305 de lactancia por defecto (ver docs/SUPOSICIONES.md).
  dias_gestacion INTEGER NOT NULL DEFAULT 150 CHECK (dias_gestacion > 0),
  dias_lactancia INTEGER NOT NULL DEFAULT 305 CHECK (dias_lactancia > 0),
  creado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', creado_en) IS creado_en),
  modificado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', modificado_en) IS modificado_en),
  eliminado_en TEXT CHECK (eliminado_en IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', eliminado_en) IS eliminado_en)
) STRICT;

CREATE TABLE raza (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  nombre TEXT NOT NULL CHECK (trim(nombre) <> ''),
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  creado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', creado_en) IS creado_en),
  modificado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', modificado_en) IS modificado_en),
  eliminado_en TEXT CHECK (eliminado_en IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', eliminado_en) IS eliminado_en)
) STRICT;

CREATE UNIQUE INDEX raza_nombre_unico ON raza (nombre COLLATE NOCASE) WHERE eliminado_en IS NULL;

CREATE TABLE libro (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  nombre TEXT NOT NULL CHECK (trim(nombre) <> ''),
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  creado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', creado_en) IS creado_en),
  modificado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', modificado_en) IS modificado_en),
  eliminado_en TEXT CHECK (eliminado_en IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', eliminado_en) IS eliminado_en)
) STRICT;

CREATE UNIQUE INDEX libro_nombre_unico ON libro (nombre COLLATE NOCASE) WHERE eliminado_en IS NULL;

-- El campo lote_id de la especificación se agrega en la etapa que crea la tabla lote,
-- con ALTER TABLE ... ADD COLUMN ... REFERENCES lote (id).
CREATE TABLE animal (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  -- SUPOSICION: nombre y fecha de nacimiento admiten vacío en la base (ancestros o compras sin esos datos);
  -- el programa decide cuándo exigirlos.
  nombre TEXT CHECK (nombre IS NULL OR trim(nombre) <> ''),
  sexo TEXT NOT NULL CHECK (sexo IN ('hembra', 'macho')),
  fecha_nacimiento TEXT CHECK (fecha_nacimiento IS NULL OR date(fecha_nacimiento) IS fecha_nacimiento),
  color_senas TEXT,
  libro_id TEXT REFERENCES libro (id),
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'vendido', 'muerto')),
  -- Ruta de un archivo copiado a la carpeta de datos del programa.
  foto TEXT,
  padre_id TEXT REFERENCES animal (id),
  madre_id TEXT REFERENCES animal (id),
  padre_sin_verificar INTEGER NOT NULL DEFAULT 0 CHECK (padre_sin_verificar IN (0, 1)),
  madre_sin_verificar INTEGER NOT NULL DEFAULT 0 CHECK (madre_sin_verificar IN (0, 1)),
  -- SUPOSICION: los valores posibles aún no están definidos; por ahora es texto libre.
  forma_concepcion TEXT,
  observaciones TEXT,
  creado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', creado_en) IS creado_en),
  modificado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', modificado_en) IS modificado_en),
  eliminado_en TEXT CHECK (eliminado_en IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', eliminado_en) IS eliminado_en),
  -- Parte de R1 que la base puede vigilar sola. El sexo de los padres, el orden de nacimiento
  -- y los ciclos de cualquier profundidad los valida el dominio (src/dominio).
  CHECK (padre_id IS NULL OR padre_id <> id),
  CHECK (madre_id IS NULL OR madre_id <> id),
  CHECK (padre_id IS NULL OR madre_id IS NULL OR padre_id <> madre_id)
) STRICT;

CREATE INDEX animal_padre ON animal (padre_id);
CREATE INDEX animal_madre ON animal (madre_id);

CREATE TABLE identificador (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  animal_id TEXT NOT NULL REFERENCES animal (id),
  tipo TEXT NOT NULL CHECK (tipo IN ('tatuaje', 'microchip', 'arete', 'registro_asociacion')),
  valor TEXT NOT NULL CHECK (trim(valor) <> ''),
  fecha TEXT CHECK (fecha IS NULL OR date(fecha) IS fecha),
  vigente INTEGER NOT NULL DEFAULT 1 CHECK (vigente IN (0, 1)),
  principal INTEGER NOT NULL DEFAULT 0 CHECK (principal IN (0, 1)),
  creado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', creado_en) IS creado_en),
  modificado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', modificado_en) IS modificado_en),
  eliminado_en TEXT CHECK (eliminado_en IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', eliminado_en) IS eliminado_en),
  -- SUPOSICION: un identificador que ya no está vigente no puede ser el principal.
  CHECK (principal = 0 OR vigente = 1)
) STRICT;

CREATE INDEX identificador_animal ON identificador (animal_id);

-- R2: el valor es único por tipo entre los identificadores vigentes. En el MVP hay una sola finca,
-- así que «único por finca» equivale a único en la base.
-- SUPOSICION: no distingue mayúsculas de minúsculas («ar-7» y «AR-7» son el mismo identificador).
CREATE UNIQUE INDEX identificador_valor_vigente_unico
  ON identificador (tipo, valor COLLATE NOCASE)
  WHERE vigente = 1 AND eliminado_en IS NULL;

-- R2: a lo sumo un identificador principal por animal. Que exista al menos uno lo valida el dominio.
CREATE UNIQUE INDEX identificador_un_principal_por_animal
  ON identificador (animal_id)
  WHERE principal = 1 AND eliminado_en IS NULL;

CREATE TABLE historial_cambios (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  entidad TEXT NOT NULL,
  registro_id TEXT NOT NULL,
  campo TEXT NOT NULL,
  valor_anterior TEXT,
  valor_nuevo TEXT,
  marca_tiempo TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', marca_tiempo) IS marca_tiempo),
  -- Sin clave foránea: el historial es un registro de auditoría y la tabla usuario llega en la Etapa 2.
  usuario_id TEXT,
  creado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', creado_en) IS creado_en),
  modificado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', modificado_en) IS modificado_en),
  eliminado_en TEXT CHECK (eliminado_en IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', eliminado_en) IS eliminado_en)
) STRICT;

CREATE INDEX historial_por_registro ON historial_cambios (entidad, registro_id);

-- Nunca se borran filas de forma física (sección 6 y 13 de la especificación).
CREATE TRIGGER finca_sin_borrado_fisico BEFORE DELETE ON finca
BEGIN SELECT RAISE(ABORT, 'No se permite borrar filas: use eliminado_en (borrado lógico).'); END;

CREATE TRIGGER raza_sin_borrado_fisico BEFORE DELETE ON raza
BEGIN SELECT RAISE(ABORT, 'No se permite borrar filas: use eliminado_en (borrado lógico).'); END;

CREATE TRIGGER libro_sin_borrado_fisico BEFORE DELETE ON libro
BEGIN SELECT RAISE(ABORT, 'No se permite borrar filas: use eliminado_en (borrado lógico).'); END;

CREATE TRIGGER animal_sin_borrado_fisico BEFORE DELETE ON animal
BEGIN SELECT RAISE(ABORT, 'No se permite borrar filas: use eliminado_en (borrado lógico).'); END;

CREATE TRIGGER identificador_sin_borrado_fisico BEFORE DELETE ON identificador
BEGIN SELECT RAISE(ABORT, 'No se permite borrar filas: use eliminado_en (borrado lógico).'); END;

-- El historial no se borra ni se modifica.
CREATE TRIGGER historial_sin_borrado_fisico BEFORE DELETE ON historial_cambios
BEGIN SELECT RAISE(ABORT, 'El historial de cambios no se puede borrar.'); END;

CREATE TRIGGER historial_sin_modificacion BEFORE UPDATE ON historial_cambios
BEGIN SELECT RAISE(ABORT, 'El historial de cambios no se puede modificar.'); END;

-- Catálogos precargados (sección 6). Los id son fijos para que sean iguales en todas las instalaciones.
INSERT INTO raza (id, nombre, creado_en, modificado_en) VALUES
  ('c4693b7b-d8ee-4c5c-b7ed-defcba72e06d', 'Saanen', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('0cbad926-66e9-4019-84ce-d8a57f8aa004', 'Alpina', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('08789c5e-ea14-4dc1-886c-9877e88ac9e0', 'Boer', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('0bec15ad-fa1a-42e1-92ea-fb7bf6334441', 'Lamancha', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('b93642eb-9aad-4a10-bf85-2bd59077bacc', 'Anglonubiana', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('148db183-eb40-4827-a4b4-9181965851bb', 'Toggenburg', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('0cd33f25-f161-49de-86cb-68971efc6b85', 'Santandereana', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT INTO libro (id, nombre, creado_en, modificado_en) VALUES
  ('0f42cb9a-2ddf-4c82-840b-547defbf17cd', 'Pureza por pedigrí', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('cd9b158e-5fd9-40fe-9010-408b7cd38b87', 'Pureza por cruzamiento', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('057da2b3-6aa1-484a-94ae-88de113e8aff', 'Mestizo', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('7d8ee281-d5b1-4bc8-aedd-be7024708a63', 'Fundadores', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('53f08476-7ebb-47a7-b8c9-3cc9095ffc54', 'Pureza de origen', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
