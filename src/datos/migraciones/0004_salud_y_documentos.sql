-- Migración 0004: salud y documentos (Etapa 4).
--
-- NO EDITAR una vez aplicada. Cualquier cambio va en una migración nueva con el número siguiente.
-- Mismas convenciones que la 0001 (UUID, marcas de tiempo UTC, borrado lógico, tablas STRICT).

-- Vacunas, desparasitaciones, tratamientos y condición corporal (RF-22 a RF-25), con los campos del Registro de
-- Tratamientos del ICA (Res. 20148 de 2016; su formato oficial queda fuera del alcance).
-- SUPOSICION: un evento aplicado a un lote se guarda como una fila por cada animal que estaba en el lote ese día,
-- con lote_id para saber que vino de un tratamiento al lote. Así el retiro (R7) sigue al animal tratado y no a quien
-- entre al lote después. Por eso animal_id siempre está lleno.
CREATE TABLE evento_salud (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  animal_id TEXT NOT NULL REFERENCES animal (id),
  lote_id TEXT REFERENCES lote (id),
  tipo TEXT NOT NULL CHECK (tipo IN ('vacuna', 'desparasitacion', 'tratamiento', 'condicion_corporal')),
  producto TEXT,
  numero_registro_ica TEXT,
  lote_producto TEXT,
  dosis TEXT,
  via TEXT,
  fecha_inicio TEXT NOT NULL CHECK (date(fecha_inicio) IS fecha_inicio),
  fecha_fin TEXT CHECK (fecha_fin IS NULL OR date(fecha_fin) IS fecha_fin),
  retiro_leche_dias INTEGER CHECK (retiro_leche_dias IS NULL OR retiro_leche_dias >= 0),
  retiro_carne_dias INTEGER CHECK (retiro_carne_dias IS NULL OR retiro_carne_dias >= 0),
  aplicador TEXT,
  veterinario TEXT,
  -- SUPOSICION: escala de 1 a 5 en pasos de medio punto.
  condicion_corporal REAL CHECK (condicion_corporal IS NULL OR (condicion_corporal BETWEEN 1 AND 5 AND condicion_corporal * 2 = CAST(condicion_corporal * 2 AS INTEGER))),
  proxima_fecha TEXT CHECK (proxima_fecha IS NULL OR date(proxima_fecha) IS proxima_fecha),
  observaciones TEXT,
  creado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', creado_en) IS creado_en),
  modificado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', modificado_en) IS modificado_en),
  eliminado_en TEXT CHECK (eliminado_en IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', eliminado_en) IS eliminado_en),
  CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio),
  CHECK (proxima_fecha IS NULL OR proxima_fecha > fecha_inicio),
  -- La condición corporal solo se anota en su propio tipo de evento, y ese tipo siempre la lleva.
  CHECK ((tipo = 'condicion_corporal') = (condicion_corporal IS NOT NULL)),
  -- Las vacunas, desparasitaciones y tratamientos dicen qué producto se usó.
  CHECK (tipo = 'condicion_corporal' OR (producto IS NOT NULL AND trim(producto) <> ''))
) STRICT;

CREATE INDEX evento_salud_por_animal ON evento_salud (animal_id, fecha_inicio);
CREATE INDEX evento_salud_proxima ON evento_salud (proxima_fecha) WHERE proxima_fecha IS NOT NULL;

-- Registro de cada documento emitido (RF-14, RF-15).
-- SUPOSICION: tipo «propio» = certificado interno del criadero (R12); tipo «asociacion» = expediente preparado para
-- ANCO (R13). archivo = ruta del PDF dentro de la carpeta de datos del programa (el CSV va al lado, con el mismo nombre).
CREATE TABLE certificado (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  animal_id TEXT NOT NULL REFERENCES animal (id),
  tipo TEXT NOT NULL CHECK (tipo IN ('propio', 'asociacion')),
  numero TEXT NOT NULL CHECK (trim(numero) <> ''),
  fecha TEXT NOT NULL CHECK (date(fecha) IS fecha),
  archivo TEXT,
  creado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', creado_en) IS creado_en),
  modificado_en TEXT NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', modificado_en) IS modificado_en),
  eliminado_en TEXT CHECK (eliminado_en IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', eliminado_en) IS eliminado_en)
) STRICT;

CREATE INDEX certificado_por_animal ON certificado (animal_id, fecha);
CREATE UNIQUE INDEX certificado_numero_unico ON certificado (numero);

-- Nunca se borran filas de forma física.
CREATE TRIGGER evento_salud_sin_borrado_fisico BEFORE DELETE ON evento_salud
BEGIN SELECT RAISE(ABORT, 'No se permite borrar filas: use eliminado_en (borrado lógico).'); END;

CREATE TRIGGER certificado_sin_borrado_fisico BEFORE DELETE ON certificado
BEGIN SELECT RAISE(ABORT, 'No se permite borrar filas: use eliminado_en (borrado lógico).'); END;
