-- Migración 0007: calidad de leche y finanzas (Etapa 8, especificación 2: RF-32, RF-33, RF-34, R18 y R19).
--
-- NO EDITAR una vez aplicada. Cualquier cambio va en una migración nueva con el número siguiente.
-- Mismas convenciones que la 0001 (UUID, marcas de tiempo UTC, borrado lógico, tablas STRICT).
-- CA-33: no cambia ninguna fila existente. Agrega tres columnas opcionales (vacías en los pesajes que ya existen),
-- dos tablas nuevas y las categorías iniciales.

-- Calidad de la leche (RF-32, R18): una muestra por pesaje, todo opcional.
-- SUPOSICION (S-67): células somáticas = células por mililitro, como número entero (por ejemplo 450000); grasa y
-- proteína = porcentaje de la leche (de 0 a 100, con decimales).
ALTER TABLE pesaje_leche ADD COLUMN grasa_pct REAL
  CHECK (grasa_pct IS NULL OR (grasa_pct >= 0 AND grasa_pct <= 100));
ALTER TABLE pesaje_leche ADD COLUMN proteina_pct REAL
  CHECK (proteina_pct IS NULL OR (proteina_pct >= 0 AND proteina_pct <= 100));
ALTER TABLE pesaje_leche ADD COLUMN celulas_somaticas INTEGER
  CHECK (celulas_somaticas IS NULL OR celulas_somaticas >= 0);

-- Categorías de ingresos y gastos (RF-33): catálogo editable, como razas y libros (se desactivan, no se borran).
CREATE TABLE categoria_economica (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  nombre TEXT NOT NULL CHECK (trim(nombre) <> ''),
  tipo TEXT NOT NULL CHECK (tipo IN ('ingreso', 'gasto')),
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  creado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', creado_en) IS creado_en),
  modificado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', modificado_en) IS modificado_en),
  eliminado_en TEXT CHECK (eliminado_en IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', eliminado_en) IS eliminado_en)
) STRICT;

-- Un nombre por tipo: «Otros» puede existir como ingreso y como gasto, pero no dos veces como gasto.
CREATE UNIQUE INDEX categoria_economica_nombre_unico ON categoria_economica (tipo, nombre COLLATE NOCASE)
  WHERE eliminado_en IS NULL;

-- SUPOSICION (S-69): categorías iniciales las cinco que pidió el propietario, más «Montas y pajillas» para ofrecer el
-- gasto de una monta con macho de otra finca (R30). Todas se pueden renombrar o desactivar.
INSERT INTO categoria_economica (id, nombre, tipo, creado_en, modificado_en) VALUES
  ('cc5e2353-d7bc-4c1a-bf4d-446ae292c429', 'Alimento', 'gasto', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('4f4d5945-444e-4dde-abcd-194f043a38a8', 'Medicamentos', 'gasto', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('94962c0b-888b-478d-9e93-ca4f7323e84b', 'Mano de obra', 'gasto', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('8ae803cf-8cd7-4181-a23a-b79f76264e9d', 'Montas y pajillas', 'gasto', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('52d2187c-5628-4b83-8681-1062313fb4eb', 'Venta de leche', 'ingreso', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('7dea0a40-e3d0-439d-b74a-55f88a6e7a76', 'Venta de animales', 'ingreso', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

-- Movimientos económicos (RF-33, R19): un ingreso o un gasto, con su categoría.
--  - sin animal ni lote: «gasto general» (o ingreso de la finca);
--  - con lote: asignado a ese lote; con animal: asignado a ese animal (nunca los dos a la vez).
-- SUPOSICION (S-70): el valor es un número entero de pesos colombianos, sin centavos, como el costo de una monta (S-56).
-- `evento_reproductivo_id` enlaza el gasto que se creó a partir de una monta con costo (R30): así no se ofrece dos veces.
CREATE TABLE movimiento_economico (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  fecha TEXT NOT NULL CHECK (date(fecha) IS fecha),
  tipo TEXT NOT NULL CHECK (tipo IN ('ingreso', 'gasto')),
  categoria_id TEXT NOT NULL REFERENCES categoria_economica (id),
  valor INTEGER NOT NULL CHECK (valor > 0),
  animal_id TEXT REFERENCES animal (id),
  lote_id TEXT REFERENCES lote (id),
  descripcion TEXT,
  evento_reproductivo_id TEXT REFERENCES evento_reproductivo (id),
  creado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', creado_en) IS creado_en),
  modificado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', modificado_en) IS modificado_en),
  eliminado_en TEXT CHECK (eliminado_en IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', eliminado_en) IS eliminado_en),
  CHECK (animal_id IS NULL OR lote_id IS NULL)
) STRICT;

CREATE INDEX movimiento_economico_por_fecha ON movimiento_economico (fecha);
CREATE INDEX movimiento_economico_por_animal ON movimiento_economico (animal_id) WHERE animal_id IS NOT NULL;
CREATE INDEX movimiento_economico_por_lote ON movimiento_economico (lote_id) WHERE lote_id IS NOT NULL;
-- Una monta tiene a lo sumo un gasto vigente.
CREATE UNIQUE INDEX movimiento_economico_un_gasto_por_servicio ON movimiento_economico (evento_reproductivo_id)
  WHERE evento_reproductivo_id IS NOT NULL AND eliminado_en IS NULL;

-- Red de seguridad (el programa valida antes con mensajes claros): el tipo del movimiento es el de su categoría, y la
-- categoría no cambia de tipo si ya tiene movimientos.
CREATE TRIGGER movimiento_economico_tipo_al_insertar BEFORE INSERT ON movimiento_economico
WHEN (SELECT tipo FROM categoria_economica WHERE id = NEW.categoria_id) IS NOT NEW.tipo
BEGIN SELECT RAISE(ABORT, 'El tipo del movimiento debe ser el de su categoría.'); END;

CREATE TRIGGER movimiento_economico_tipo_al_actualizar BEFORE UPDATE OF tipo, categoria_id ON movimiento_economico
WHEN (SELECT tipo FROM categoria_economica WHERE id = NEW.categoria_id) IS NOT NEW.tipo
BEGIN SELECT RAISE(ABORT, 'El tipo del movimiento debe ser el de su categoría.'); END;

CREATE TRIGGER categoria_economica_tipo_fijo BEFORE UPDATE OF tipo ON categoria_economica
WHEN NEW.tipo IS NOT OLD.tipo AND EXISTS (SELECT 1 FROM movimiento_economico WHERE categoria_id = NEW.id)
BEGIN SELECT RAISE(ABORT, 'Una categoría con movimientos no cambia de tipo.'); END;

-- Nunca se borran filas de forma física.
CREATE TRIGGER categoria_economica_sin_borrado_fisico BEFORE DELETE ON categoria_economica
BEGIN SELECT RAISE(ABORT, 'No se permite borrar filas: use eliminado_en (borrado lógico).'); END;

CREATE TRIGGER movimiento_economico_sin_borrado_fisico BEFORE DELETE ON movimiento_economico
BEGIN SELECT RAISE(ABORT, 'No se permite borrar filas: use eliminado_en (borrado lógico).'); END;
