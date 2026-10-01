-- Migración 0002: núcleo y genealogía (Etapa 2).
--
-- NO EDITAR una vez aplicada. Cualquier cambio va en una migración nueva con el número siguiente.
-- Mismas convenciones que la 0001 (UUID, marcas de tiempo UTC, borrado lógico, tablas STRICT).
-- Las siete razas y los cinco libros de ANCO ya los precargó la migración 0001.

CREATE TABLE usuario (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  nombre TEXT NOT NULL CHECK (trim(nombre) <> ''),
  rol TEXT NOT NULL CHECK (rol IN ('propietario', 'operario')),
  -- Nunca el PIN: solo su hash «pbkdf2-sha256$iteraciones$sal$hash» (src/dominio/pin.ts). Vacío = sin PIN.
  pin_hash TEXT CHECK (pin_hash IS NULL OR pin_hash LIKE 'pbkdf2-sha256$%'),
  contacto TEXT,
  creado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', creado_en) IS creado_en),
  modificado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', modificado_en) IS modificado_en),
  eliminado_en TEXT CHECK (eliminado_en IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', eliminado_en) IS eliminado_en)
) STRICT;

-- SUPOSICION: no puede haber dos usuarios activos con el mismo nombre (se eligen por nombre al abrir).
CREATE UNIQUE INDEX usuario_nombre_unico ON usuario (nombre COLLATE NOCASE) WHERE eliminado_en IS NULL;

CREATE TABLE lote (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  nombre TEXT NOT NULL CHECK (trim(nombre) <> ''),
  descripcion TEXT,
  creado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', creado_en) IS creado_en),
  modificado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', modificado_en) IS modificado_en),
  eliminado_en TEXT CHECK (eliminado_en IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', eliminado_en) IS eliminado_en)
) STRICT;

CREATE UNIQUE INDEX lote_nombre_unico ON lote (nombre COLLATE NOCASE) WHERE eliminado_en IS NULL;

-- R3: la fracción es una proporción entre 0 y 1 (0,5 = 50 %). Que sumen 1 lo valida el dominio.
CREATE TABLE composicion_racial (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  animal_id TEXT NOT NULL REFERENCES animal (id),
  raza_id TEXT NOT NULL REFERENCES raza (id),
  fraccion REAL NOT NULL CHECK (fraccion > 0 AND fraccion <= 1),
  creado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', creado_en) IS creado_en),
  modificado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', modificado_en) IS modificado_en),
  eliminado_en TEXT CHECK (eliminado_en IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', eliminado_en) IS eliminado_en)
) STRICT;

CREATE INDEX composicion_por_animal ON composicion_racial (animal_id);
CREATE UNIQUE INDEX composicion_una_vez_por_raza
  ON composicion_racial (animal_id, raza_id)
  WHERE eliminado_en IS NULL;

-- Campo lote_id de la especificación (sección 6), anunciado en la 0001.
ALTER TABLE animal ADD COLUMN lote_id TEXT REFERENCES lote (id);
CREATE INDEX animal_lote ON animal (lote_id);

-- SUPOSICION: 1 = el animal es o fue del hato; 0 = solo se registra para la genealogía
-- (por ejemplo, los abuelos de una cabra comprada o el macho de una pajilla).
ALTER TABLE animal ADD COLUMN en_hato INTEGER NOT NULL DEFAULT 1 CHECK (en_hato IN (0, 1));

-- Nunca se borran filas de forma física.
CREATE TRIGGER usuario_sin_borrado_fisico BEFORE DELETE ON usuario
BEGIN SELECT RAISE(ABORT, 'No se permite borrar filas: use eliminado_en (borrado lógico).'); END;

CREATE TRIGGER lote_sin_borrado_fisico BEFORE DELETE ON lote
BEGIN SELECT RAISE(ABORT, 'No se permite borrar filas: use eliminado_en (borrado lógico).'); END;

CREATE TRIGGER composicion_sin_borrado_fisico BEFORE DELETE ON composicion_racial
BEGIN SELECT RAISE(ABORT, 'No se permite borrar filas: use eliminado_en (borrado lógico).'); END;

-- R1 en la base, como red de seguridad: el programa valida antes con mensajes claros (src/dominio/genealogia.ts).
-- Los ciclos de cualquier profundidad solo los valida el dominio: SQLite no admite consultas recursivas en disparadores.
-- Si una fecha es desconocida, la comparación da NULL y no se rechaza (misma SUPOSICION que el dominio).
CREATE TRIGGER animal_r1_al_insertar BEFORE INSERT ON animal
BEGIN
  SELECT RAISE(ABORT, 'R1: el padre debe ser macho.')
  WHERE NEW.padre_id IS NOT NULL AND (SELECT sexo FROM animal WHERE id = NEW.padre_id) IS NOT 'macho';
  SELECT RAISE(ABORT, 'R1: la madre debe ser hembra.')
  WHERE NEW.madre_id IS NOT NULL AND (SELECT sexo FROM animal WHERE id = NEW.madre_id) IS NOT 'hembra';
  SELECT RAISE(ABORT, 'R1: el animal debe nacer después de sus padres.')
  WHERE (SELECT fecha_nacimiento FROM animal WHERE id = NEW.padre_id) >= NEW.fecha_nacimiento
     OR (SELECT fecha_nacimiento FROM animal WHERE id = NEW.madre_id) >= NEW.fecha_nacimiento;
END;

CREATE TRIGGER animal_r1_al_modificar BEFORE UPDATE OF padre_id, madre_id, sexo, fecha_nacimiento ON animal
BEGIN
  SELECT RAISE(ABORT, 'R1: el padre debe ser macho.')
  WHERE NEW.padre_id IS NOT NULL AND (SELECT sexo FROM animal WHERE id = NEW.padre_id) IS NOT 'macho';
  SELECT RAISE(ABORT, 'R1: la madre debe ser hembra.')
  WHERE NEW.madre_id IS NOT NULL AND (SELECT sexo FROM animal WHERE id = NEW.madre_id) IS NOT 'hembra';
  SELECT RAISE(ABORT, 'R1: el animal debe nacer después de sus padres.')
  WHERE (SELECT fecha_nacimiento FROM animal WHERE id = NEW.padre_id) >= NEW.fecha_nacimiento
     OR (SELECT fecha_nacimiento FROM animal WHERE id = NEW.madre_id) >= NEW.fecha_nacimiento;
  SELECT RAISE(ABORT, 'R1: el animal debe nacer antes que sus hijos.')
  WHERE EXISTS (
    SELECT 1 FROM animal AS h
    WHERE (h.padre_id = NEW.id OR h.madre_id = NEW.id) AND h.eliminado_en IS NULL
      AND h.fecha_nacimiento <= NEW.fecha_nacimiento
  );
  SELECT RAISE(ABORT, 'R1: el sexo no coincide con el de padre o madre de sus hijos.')
  WHERE (NEW.sexo IS NOT 'macho' AND EXISTS (SELECT 1 FROM animal WHERE padre_id = NEW.id AND eliminado_en IS NULL))
     OR (NEW.sexo IS NOT 'hembra' AND EXISTS (SELECT 1 FROM animal WHERE madre_id = NEW.id AND eliminado_en IS NULL));
END;
