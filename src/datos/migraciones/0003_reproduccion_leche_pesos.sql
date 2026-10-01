-- Migración 0003: reproducción, leche y pesajes (Etapa 3).
--
-- NO EDITAR una vez aplicada. Cualquier cambio va en una migración nueva con el número siguiente.
-- Mismas convenciones que la 0001 (UUID, marcas de tiempo UTC, borrado lógico, tablas STRICT).

-- Servicios (monta o inseminación) y su diagnóstico de preñez (RF-18, RF-19, RF-21).
CREATE TABLE evento_reproductivo (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  hembra_id TEXT NOT NULL REFERENCES animal (id),
  macho_id TEXT REFERENCES animal (id),
  pajilla TEXT,
  tipo TEXT NOT NULL CHECK (tipo IN ('monta', 'inseminacion')),
  fecha TEXT NOT NULL CHECK (date(fecha) IS fecha),
  resultado TEXT NOT NULL DEFAULT 'pendiente' CHECK (resultado IN ('pendiente', 'prenada', 'vacia', 'aborto')),
  fecha_diagnostico TEXT CHECK (fecha_diagnostico IS NULL OR date(fecha_diagnostico) IS fecha_diagnostico),
  -- R4: fecha del servicio + días de gestación de la finca. La calcula el programa (src/dominio/reproduccion.ts).
  fecha_probable_parto TEXT CHECK (fecha_probable_parto IS NULL OR date(fecha_probable_parto) IS fecha_probable_parto),
  observaciones TEXT,
  creado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', creado_en) IS creado_en),
  modificado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', modificado_en) IS modificado_en),
  eliminado_en TEXT CHECK (eliminado_en IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', eliminado_en) IS eliminado_en),
  CHECK (macho_id IS NULL OR macho_id <> hembra_id),
  -- SUPOSICION: el diagnóstico no puede ser anterior al servicio, y todo resultado distinto de «pendiente» lleva fecha.
  CHECK (fecha_diagnostico IS NULL OR fecha_diagnostico >= fecha),
  CHECK (resultado = 'pendiente' OR fecha_diagnostico IS NOT NULL)
) STRICT;

CREATE INDEX evento_reproductivo_por_hembra ON evento_reproductivo (hembra_id, fecha);

CREATE TABLE parto (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  hembra_id TEXT NOT NULL REFERENCES animal (id),
  evento_reproductivo_id TEXT REFERENCES evento_reproductivo (id),
  fecha TEXT NOT NULL CHECK (date(fecha) IS fecha),
  numero_crias INTEGER NOT NULL CHECK (numero_crias > 0),
  observaciones TEXT,
  creado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', creado_en) IS creado_en),
  modificado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', modificado_en) IS modificado_en),
  eliminado_en TEXT CHECK (eliminado_en IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', eliminado_en) IS eliminado_en)
) STRICT;

CREATE INDEX parto_por_hembra ON parto (hembra_id, fecha);

CREATE TABLE lactancia (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  hembra_id TEXT NOT NULL REFERENCES animal (id),
  parto_id TEXT NOT NULL REFERENCES parto (id),
  fecha_inicio TEXT NOT NULL CHECK (date(fecha_inicio) IS fecha_inicio),
  fecha_secado TEXT CHECK (fecha_secado IS NULL OR date(fecha_secado) IS fecha_secado),
  creado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', creado_en) IS creado_en),
  modificado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', modificado_en) IS modificado_en),
  eliminado_en TEXT CHECK (eliminado_en IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', eliminado_en) IS eliminado_en),
  CHECK (fecha_secado IS NULL OR fecha_secado >= fecha_inicio)
) STRICT;

CREATE INDEX lactancia_por_hembra ON lactancia (hembra_id);
-- Una hembra tiene a lo sumo una lactancia abierta (sin secar).
CREATE UNIQUE INDEX lactancia_una_abierta_por_hembra
  ON lactancia (hembra_id)
  WHERE fecha_secado IS NULL AND eliminado_en IS NULL;

-- SUPOSICION: dos jornadas de ordeño (mañana y tarde), como dice la especificación.
CREATE TABLE pesaje_leche (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  lactancia_id TEXT NOT NULL REFERENCES lactancia (id),
  fecha TEXT NOT NULL CHECK (date(fecha) IS fecha),
  jornada TEXT NOT NULL CHECK (jornada IN ('manana', 'tarde')),
  kilos REAL NOT NULL CHECK (kilos >= 0),
  creado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', creado_en) IS creado_en),
  modificado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', modificado_en) IS modificado_en),
  eliminado_en TEXT CHECK (eliminado_en IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', eliminado_en) IS eliminado_en)
) STRICT;

-- Un solo pesaje por lactancia, fecha y jornada: al volver a anotarlo se corrige el existente.
CREATE UNIQUE INDEX pesaje_leche_unico
  ON pesaje_leche (lactancia_id, fecha, jornada)
  WHERE eliminado_en IS NULL;
CREATE INDEX pesaje_leche_por_fecha ON pesaje_leche (fecha, jornada);

CREATE TABLE pesaje_corporal (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  animal_id TEXT NOT NULL REFERENCES animal (id),
  fecha TEXT NOT NULL CHECK (date(fecha) IS fecha),
  kilos REAL NOT NULL CHECK (kilos > 0),
  tipo TEXT NOT NULL CHECK (tipo IN ('nacimiento', 'destete', 'control')),
  creado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', creado_en) IS creado_en),
  modificado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', modificado_en) IS modificado_en),
  eliminado_en TEXT CHECK (eliminado_en IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', eliminado_en) IS eliminado_en)
) STRICT;

CREATE INDEX pesaje_corporal_por_animal ON pesaje_corporal (animal_id, fecha);

-- RF-31. SUPOSICION: la especificación no define las metas; el usuario las anota por sexo y edad en meses.
CREATE TABLE meta_peso (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  sexo TEXT NOT NULL CHECK (sexo IN ('hembra', 'macho')),
  edad_meses INTEGER NOT NULL CHECK (edad_meses >= 0),
  kilos REAL NOT NULL CHECK (kilos > 0),
  creado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', creado_en) IS creado_en),
  modificado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', modificado_en) IS modificado_en),
  eliminado_en TEXT CHECK (eliminado_en IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', eliminado_en) IS eliminado_en)
) STRICT;

CREATE UNIQUE INDEX meta_peso_unica ON meta_peso (sexo, edad_meses) WHERE eliminado_en IS NULL;

-- Red de seguridad para el sexo en servicios y partos (el programa valida antes con mensajes claros).
CREATE TRIGGER evento_reproductivo_sexos BEFORE INSERT ON evento_reproductivo
BEGIN
  SELECT RAISE(ABORT, 'El servicio debe ser de una hembra.')
  WHERE (SELECT sexo FROM animal WHERE id = NEW.hembra_id) IS NOT 'hembra';
  SELECT RAISE(ABORT, 'El macho del servicio debe ser macho.')
  WHERE NEW.macho_id IS NOT NULL AND (SELECT sexo FROM animal WHERE id = NEW.macho_id) IS NOT 'macho';
END;

CREATE TRIGGER parto_de_hembra BEFORE INSERT ON parto
BEGIN
  SELECT RAISE(ABORT, 'El parto debe ser de una hembra.')
  WHERE (SELECT sexo FROM animal WHERE id = NEW.hembra_id) IS NOT 'hembra';
END;

-- Nunca se borran filas de forma física.
CREATE TRIGGER evento_reproductivo_sin_borrado_fisico BEFORE DELETE ON evento_reproductivo
BEGIN SELECT RAISE(ABORT, 'No se permite borrar filas: use eliminado_en (borrado lógico).'); END;

CREATE TRIGGER parto_sin_borrado_fisico BEFORE DELETE ON parto
BEGIN SELECT RAISE(ABORT, 'No se permite borrar filas: use eliminado_en (borrado lógico).'); END;

CREATE TRIGGER lactancia_sin_borrado_fisico BEFORE DELETE ON lactancia
BEGIN SELECT RAISE(ABORT, 'No se permite borrar filas: use eliminado_en (borrado lógico).'); END;

CREATE TRIGGER pesaje_leche_sin_borrado_fisico BEFORE DELETE ON pesaje_leche
BEGIN SELECT RAISE(ABORT, 'No se permite borrar filas: use eliminado_en (borrado lógico).'); END;

CREATE TRIGGER pesaje_corporal_sin_borrado_fisico BEFORE DELETE ON pesaje_corporal
BEGIN SELECT RAISE(ABORT, 'No se permite borrar filas: use eliminado_en (borrado lógico).'); END;

CREATE TRIGGER meta_peso_sin_borrado_fisico BEFORE DELETE ON meta_peso
BEGIN SELECT RAISE(ABORT, 'No se permite borrar filas: use eliminado_en (borrado lógico).'); END;
