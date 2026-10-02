-- Migración 0008: compra y venta de animales (Etapa 9, especificación 2: RF-50, RF-16, RF-36, R32, R20 y R21).
--
-- NO EDITAR una vez aplicada. Cualquier cambio va en una migración nueva con el número siguiente.
-- Mismas convenciones que la 0001 (UUID, marcas de tiempo UTC, borrado lógico, tablas STRICT).
-- CA-33: no cambia ninguna fila existente. Agrega una tabla, sus índices y disparadores, y una categoría de gasto.

-- Traspasos (R32 y R20): una compra o una venta de un animal, con el contacto (vendedor o comprador), la fecha, el precio
-- y los documentos de origen. Los datos de la persona viven en `contacto` (R28): aquí solo va su id.
--  - `precio`: pesos enteros, sin centavos (S-70); vacío si no se anotó.
--  - `adjuntos`: lista JSON de rutas relativas a la carpeta de datos (por ejemplo «documentos/adjunto-….pdf»). Los archivos
--    se copian allí con un comando de Rust, así que viajan en la copia de respaldo con los demás documentos.
--  - `movimiento_id`: el ingreso o gasto de Finanzas que se creó a partir de este traspaso (R19); evita ofrecerlo dos veces.
CREATE TABLE traspaso (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  animal_id TEXT NOT NULL REFERENCES animal (id),
  tipo TEXT NOT NULL CHECK (tipo IN ('compra', 'venta')),
  contacto_id TEXT NOT NULL REFERENCES contacto (id),
  fecha TEXT NOT NULL CHECK (date(fecha) IS fecha),
  precio INTEGER CHECK (precio IS NULL OR precio > 0),
  observaciones TEXT,
  adjuntos TEXT CHECK (adjuntos IS NULL OR json_valid(adjuntos)),
  movimiento_id TEXT REFERENCES movimiento_economico (id),
  creado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', creado_en) IS creado_en),
  modificado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', modificado_en) IS modificado_en),
  eliminado_en TEXT CHECK (eliminado_en IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', eliminado_en) IS eliminado_en)
) STRICT;

CREATE INDEX traspaso_por_animal ON traspaso (animal_id);
CREATE INDEX traspaso_por_fecha ON traspaso (fecha);
CREATE INDEX traspaso_por_contacto ON traspaso (contacto_id);
-- Un movimiento de Finanzas nace de a lo sumo un traspaso vigente.
CREATE UNIQUE INDEX traspaso_un_movimiento ON traspaso (movimiento_id)
  WHERE movimiento_id IS NOT NULL AND eliminado_en IS NULL;

-- Nunca se borran filas de forma física.
CREATE TRIGGER traspaso_sin_borrado_fisico BEFORE DELETE ON traspaso
BEGIN SELECT RAISE(ABORT, 'No se permite borrar filas: use eliminado_en (borrado lógico).'); END;

-- Red de seguridad (el programa valida antes con mensajes claros): el animal, el tipo y el contacto de un traspaso
-- no cambian una vez guardado; para corregir un error se retira el traspaso y se registra otro.
CREATE TRIGGER traspaso_no_cambia_de_animal BEFORE UPDATE OF animal_id, tipo, contacto_id ON traspaso
WHEN NEW.animal_id IS NOT OLD.animal_id OR NEW.tipo IS NOT OLD.tipo OR NEW.contacto_id IS NOT OLD.contacto_id
BEGIN SELECT RAISE(ABORT, 'Un traspaso no cambia de animal, de tipo ni de contacto.'); END;

-- SUPOSICION (S-76): categoría de gasto «Compra de animales», la pareja de «Venta de animales» (migración 0007).
-- Se puede renombrar o desactivar como las demás.
INSERT INTO categoria_economica (id, nombre, tipo, creado_en, modificado_en) VALUES
  ('f9cb4789-f088-469e-af6e-7ffb94db497b', 'Compra de animales', 'gasto', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
