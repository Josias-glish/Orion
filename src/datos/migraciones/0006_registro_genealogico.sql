-- Migración 0006: generador de registros genealógicos (Etapa 7, especificación 2: RF-49 y R31).
--
-- NO EDITAR una vez aplicada. Cualquier cambio va en una migración nueva con el número siguiente.
-- Mismas convenciones que la 0001 (UUID, marcas de tiempo UTC, borrado lógico, tablas STRICT).
-- CA-33: no cambia ninguna fila existente. Agrega una tabla, columnas con valor por defecto y disparadores, y
-- reconstruye `certificado` (SQLite no permite cambiar un CHECK) copiando todas sus filas tal cual.

-- Libros: prefijo del número de registro y el siguiente consecutivo (R31).
-- SUPOSICION (S-59): número = prefijo + separador + consecutivo con ceros a la izquierda (PPE-0001). El prefijo son
-- letras y números sin espacios (sirve de nombre de archivo) y se configura por libro; el formato (separador y
-- cantidad de dígitos) también.
ALTER TABLE libro ADD COLUMN prefijo TEXT
  CHECK (prefijo IS NULL OR (trim(prefijo) <> '' AND length(prefijo) <= 8 AND prefijo NOT GLOB '*[^A-Za-z0-9]*'));
ALTER TABLE libro ADD COLUMN siguiente_numero INTEGER NOT NULL DEFAULT 1 CHECK (siguiente_numero >= 1);
ALTER TABLE libro ADD COLUMN digitos_numero INTEGER NOT NULL DEFAULT 4 CHECK (digitos_numero BETWEEN 1 AND 8);
ALTER TABLE libro ADD COLUMN separador_numero TEXT NOT NULL DEFAULT '-' CHECK (separador_numero IN ('', '-'));

-- Dos libros no pueden compartir prefijo: los números de uno y otro se confundirían.
CREATE UNIQUE INDEX libro_prefijo_unico ON libro (prefijo COLLATE NOCASE)
  WHERE prefijo IS NOT NULL AND eliminado_en IS NULL;

-- Prefijos iniciales de los cinco libros precargados (ids fijos de la 0001). El propietario puede cambiarlos
-- mientras el libro no tenga registros. SUPOSICION (S-59): siglas propias, sin relación con códigos de ANCO.
UPDATE libro SET prefijo = 'PPE' WHERE id = '0f42cb9a-2ddf-4c82-840b-547defbf17cd' AND prefijo IS NULL;
UPDATE libro SET prefijo = 'PCR' WHERE id = 'cd9b158e-5fd9-40fe-9010-408b7cd38b87' AND prefijo IS NULL;
UPDATE libro SET prefijo = 'MES' WHERE id = '057da2b3-6aa1-484a-94ae-88de113e8aff' AND prefijo IS NULL;
UPDATE libro SET prefijo = 'FUN' WHERE id = '7d8ee281-d5b1-4bc8-aedd-be7024708a63' AND prefijo IS NULL;
UPDATE libro SET prefijo = 'POR' WHERE id = '53f08476-7ebb-47a7-b8c9-3cc9095ffc54' AND prefijo IS NULL;

-- Datos del criadero para el certificado de registro propio. Si están vacíos, el criador y el propietario son el
-- propietario de la finca (S-60) y la firma lleva el nombre de quien emite.
ALTER TABLE finca ADD COLUMN criador TEXT;
ALTER TABLE finca ADD COLUMN propietario TEXT;
ALTER TABLE finca ADD COLUMN responsable_registros TEXT;

-- Registro genealógico propio (R31). Un registro es un número del libro del criadero:
--  - borrador: editable, todavía sin número (así descartar un borrador nunca deja un salto);
--  - emitido: tiene número, versión e instantánea (copia fija de los datos y del pedigrí al emitir);
--  - anulado: conserva número e historial y exige un motivo.
-- Reemitir sube `version` y reemplaza la instantánea; la versión anterior queda en historial_cambios.
-- SUPOSICION (S-61): `consecutivo` guarda el número sin prefijo para vigilar en la base que sea consecutivo por libro.
CREATE TABLE registro_genealogico (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  animal_id TEXT NOT NULL REFERENCES animal (id),
  libro_id TEXT REFERENCES libro (id),
  consecutivo INTEGER CHECK (consecutivo IS NULL OR consecutivo >= 1),
  numero TEXT CHECK (numero IS NULL OR trim(numero) <> ''),
  fecha_registro TEXT NOT NULL CHECK (date(fecha_registro) IS fecha_registro),
  estado TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'emitido', 'anulado')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  instantanea TEXT CHECK (instantanea IS NULL OR json_valid(instantanea)),
  responsable TEXT,
  motivo_anulacion TEXT,
  observaciones TEXT,
  creado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', creado_en) IS creado_en),
  modificado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', modificado_en) IS modificado_en),
  eliminado_en TEXT CHECK (eliminado_en IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', eliminado_en) IS eliminado_en),
  CHECK (estado = 'borrador' OR (libro_id IS NOT NULL AND consecutivo IS NOT NULL AND numero IS NOT NULL AND instantanea IS NOT NULL)),
  CHECK (estado <> 'borrador' OR (consecutivo IS NULL AND numero IS NULL AND instantanea IS NULL)),
  CHECK (estado <> 'anulado' OR (motivo_anulacion IS NOT NULL AND trim(motivo_anulacion) <> '')),
  CHECK (estado = 'anulado' OR motivo_anulacion IS NULL)
) STRICT;

-- Un número nunca se reutiliza: ni entre libros (el texto es único) ni dentro de un libro (el consecutivo es único),
-- aunque el registro se anule. No se mira eliminado_en a propósito.
CREATE UNIQUE INDEX registro_numero_unico ON registro_genealogico (numero) WHERE numero IS NOT NULL;
CREATE UNIQUE INDEX registro_consecutivo_por_libro ON registro_genealogico (libro_id, consecutivo) WHERE consecutivo IS NOT NULL;
-- Un animal tiene un solo registro vigente (borrador o emitido). Uno anulado deja de contar.
CREATE UNIQUE INDEX registro_vigente_por_animal ON registro_genealogico (animal_id)
  WHERE estado <> 'anulado' AND eliminado_en IS NULL;
CREATE INDEX registro_por_libro ON registro_genealogico (libro_id, estado, fecha_registro);

-- Nunca se borran filas de forma física.
CREATE TRIGGER registro_sin_borrado_fisico BEFORE DELETE ON registro_genealogico
BEGIN SELECT RAISE(ABORT, 'No se permite borrar filas: use eliminado_en (borrado lógico).'); END;

-- R31 en la base, como red de seguridad (el programa valida antes con mensajes claros).
-- Los consecutivos de un libro no tienen saltos: cada número nuevo es el último más uno.
CREATE TRIGGER registro_consecutivo_al_insertar BEFORE INSERT ON registro_genealogico
WHEN NEW.consecutivo IS NOT NULL
  AND EXISTS (SELECT 1 FROM registro_genealogico WHERE libro_id = NEW.libro_id AND consecutivo IS NOT NULL)
  AND NEW.consecutivo <> (SELECT max(consecutivo) + 1 FROM registro_genealogico WHERE libro_id = NEW.libro_id)
BEGIN SELECT RAISE(ABORT, 'R31: los números de un libro son consecutivos, sin saltos.'); END;

CREATE TRIGGER registro_consecutivo_al_emitir BEFORE UPDATE OF consecutivo ON registro_genealogico
WHEN OLD.consecutivo IS NULL AND NEW.consecutivo IS NOT NULL
  AND EXISTS (SELECT 1 FROM registro_genealogico WHERE libro_id = NEW.libro_id AND consecutivo IS NOT NULL)
  AND NEW.consecutivo <> (SELECT max(consecutivo) + 1 FROM registro_genealogico WHERE libro_id = NEW.libro_id)
BEGIN SELECT RAISE(ABORT, 'R31: los números de un libro son consecutivos, sin saltos.'); END;

-- Un número, su libro y su animal no cambian nunca; un registro anulado no vuelve a emitirse; la versión no baja.
CREATE TRIGGER registro_numero_inmutable BEFORE UPDATE OF numero, consecutivo, libro_id, animal_id ON registro_genealogico
WHEN OLD.numero IS NOT NULL
  AND (NEW.numero IS NOT OLD.numero OR NEW.consecutivo IS NOT OLD.consecutivo OR NEW.libro_id IS NOT OLD.libro_id OR NEW.animal_id IS NOT OLD.animal_id)
BEGIN SELECT RAISE(ABORT, 'R31: un número emitido no se cambia ni se reutiliza.'); END;

CREATE TRIGGER registro_estado_irreversible BEFORE UPDATE OF estado ON registro_genealogico
WHEN (OLD.estado = 'anulado' AND NEW.estado <> 'anulado') OR (OLD.estado = 'emitido' AND NEW.estado = 'borrador')
BEGIN SELECT RAISE(ABORT, 'R31: un registro anulado no se reactiva y uno emitido no vuelve a borrador.'); END;

CREATE TRIGGER registro_version_no_baja BEFORE UPDATE OF version ON registro_genealogico
WHEN NEW.version < OLD.version
BEGIN SELECT RAISE(ABORT, 'R31: la versión de un registro no baja.'); END;

-- Solo un animal del hato puede tener registro: no uno de otra finca (R29).
CREATE TRIGGER registro_sin_animal_externo BEFORE INSERT ON registro_genealogico
WHEN (SELECT origen FROM animal WHERE id = NEW.animal_id) = 'externo'
BEGIN SELECT RAISE(ABORT, 'R31: un animal de otra finca no tiene registro propio.'); END;

-- Certificado: nuevo tipo «registro_propio» (certificado de registro propio, R31). Se reconstruye la tabla porque
-- SQLite no puede cambiar un CHECK; todas las filas se copian sin cambios.
CREATE TABLE certificado_nuevo (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  animal_id TEXT NOT NULL REFERENCES animal (id),
  tipo TEXT NOT NULL CHECK (tipo IN ('propio', 'asociacion', 'registro_propio')),
  numero TEXT NOT NULL CHECK (trim(numero) <> ''),
  fecha TEXT NOT NULL CHECK (date(fecha) IS fecha),
  archivo TEXT,
  creado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', creado_en) IS creado_en),
  modificado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', modificado_en) IS modificado_en),
  eliminado_en TEXT CHECK (eliminado_en IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', eliminado_en) IS eliminado_en)
) STRICT;

INSERT INTO certificado_nuevo (id, animal_id, tipo, numero, fecha, archivo, creado_en, modificado_en, eliminado_en)
SELECT id, animal_id, tipo, numero, fecha, archivo, creado_en, modificado_en, eliminado_en FROM certificado;

DROP TABLE certificado;
ALTER TABLE certificado_nuevo RENAME TO certificado;

CREATE INDEX certificado_por_animal ON certificado (animal_id, fecha);
CREATE UNIQUE INDEX certificado_numero_unico ON certificado (numero);

CREATE TRIGGER certificado_sin_borrado_fisico BEFORE DELETE ON certificado
BEGIN SELECT RAISE(ABORT, 'No se permite borrar filas: use eliminado_en (borrado lógico).'); END;
