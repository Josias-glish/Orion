-- Migración 0005: sementales y montas de otras fincas (Etapa 6, especificación 2: R29 y R30).
--
-- NO EDITAR una vez aplicada. Cualquier cambio va en una migración nueva con el número siguiente.
-- Mismas convenciones que la 0001 (UUID, marcas de tiempo UTC, borrado lógico, tablas STRICT).
-- CA-33: solo agrega una tabla, columnas con valor por defecto y disparadores; no cambia ninguna fila existente.

-- Propietarios de animales de otras fincas (y, desde la Etapa 9, vendedores y compradores).
-- R28: datos personales de terceros. Solo el nombre es obligatorio; nunca se publican.
CREATE TABLE contacto (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  nombre TEXT NOT NULL CHECK (trim(nombre) <> ''),
  criadero TEXT,
  municipio TEXT,
  telefono TEXT,
  correo TEXT,
  notas TEXT,
  creado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', creado_en) IS creado_en),
  modificado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', modificado_en) IS modificado_en),
  eliminado_en TEXT CHECK (eliminado_en IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', eliminado_en) IS eliminado_en)
) STRICT;

CREATE TRIGGER contacto_sin_borrado_fisico BEFORE DELETE ON contacto
BEGIN SELECT RAISE(ABORT, 'No se permite borrar filas: use eliminado_en (borrado lógico).'); END;

-- R29. Origen del animal. Los animales existentes quedan como «nacido_aqui» (especificación 2, sección 6).
ALTER TABLE animal ADD COLUMN origen TEXT NOT NULL DEFAULT 'nacido_aqui'
  CHECK (origen IN ('nacido_aqui', 'comprado', 'externo'));
-- Propietario de un animal externo o vendedor de uno comprado.
ALTER TABLE animal ADD COLUMN contacto_id TEXT REFERENCES contacto (id);
ALTER TABLE animal ADD COLUMN fecha_ingreso TEXT CHECK (fecha_ingreso IS NULL OR date(fecha_ingreso) IS fecha_ingreso);

CREATE INDEX animal_contacto ON animal (contacto_id);

-- R29 en la base, como red de seguridad (el programa valida antes con mensajes claros):
-- un animal de otra finca no pertenece al hato ni a un lote, y no recibe servicios ni abre lactancias.
CREATE TRIGGER animal_externo_al_insertar BEFORE INSERT ON animal
WHEN NEW.origen = 'externo' AND (NEW.en_hato <> 0 OR NEW.lote_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'R29: un animal de otra finca no pertenece al hato ni a un lote.'); END;

CREATE TRIGGER animal_externo_al_modificar BEFORE UPDATE OF origen, en_hato, lote_id ON animal
WHEN NEW.origen = 'externo' AND (NEW.en_hato <> 0 OR NEW.lote_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'R29: un animal de otra finca no pertenece al hato ni a un lote.'); END;

CREATE TRIGGER servicio_sin_hembra_externa BEFORE INSERT ON evento_reproductivo
WHEN (SELECT origen FROM animal WHERE id = NEW.hembra_id) = 'externo'
BEGIN SELECT RAISE(ABORT, 'R29: una hembra de otra finca no recibe servicios en este programa.'); END;

CREATE TRIGGER lactancia_sin_hembra_externa BEFORE INSERT ON lactancia
WHEN (SELECT origen FROM animal WHERE id = NEW.hembra_id) = 'externo'
BEGIN SELECT RAISE(ABORT, 'R29: una hembra de otra finca no tiene lactancias en este programa.'); END;

-- R30. Monta con un macho de otra finca: costo acordado (opcional, en pesos) y condiciones con su dueño.
-- SUPOSICION: el costo es un número entero de pesos colombianos, sin centavos.
ALTER TABLE evento_reproductivo ADD COLUMN costo INTEGER CHECK (costo IS NULL OR costo >= 0);
ALTER TABLE evento_reproductivo ADD COLUMN condiciones TEXT;

CREATE INDEX evento_reproductivo_por_macho ON evento_reproductivo (macho_id, fecha);

-- R30. Margen de la ventana de gestación, en días, para avisar la paternidad incierta (configurable en Ajustes).
-- SUPOSICION: 10 días antes y después de los días de gestación de la finca; lo confirma el aprisco.
ALTER TABLE finca ADD COLUMN margen_gestacion INTEGER NOT NULL DEFAULT 10
  CHECK (margen_gestacion >= 0 AND margen_gestacion <= 60);
