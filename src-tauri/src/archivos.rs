//! Archivos del programa fuera de la base de datos: documentos emitidos (PDF y CSV) y la copia de respaldo (.zip).
//! Las funciones reciben carpetas y rutas explícitas para poder probarlas sin la ventana.

use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

/// Nombre del archivo con los datos dentro del .zip del respaldo.
pub const DATOS_RESPALDO: &str = "datos.json";
/// Carpetas de la carpeta de datos que viajan en el respaldo.
pub const CARPETAS_RESPALDO: [&str; 2] = ["fotos", "documentos"];
/// Formatos que el programa puede escribir donde elija el usuario.
pub const EXTENSIONES_COPIA: [&str; 4] = ["pdf", "csv", "xlsx", "zip"];
/// Formatos que se aceptan como adjunto de una compra: PDF o imagen (Etapa 9, R32). SUPOSICION (S-79): sin límite de tamaño.
pub const EXTENSIONES_ADJUNTO: [&str; 5] = ["pdf", "jpg", "jpeg", "png", "webp"];
/// Tope para datos.json (evita llenar la memoria con un archivo dañado o ajeno).
const MAXIMO_DATOS: u64 = 1 << 30;

/// Nombre simple y seguro: letras, números, guiones y un solo punto antes de la extensión.
pub fn nombre_seguro(nombre: &str) -> bool {
    let partes: Vec<&str> = nombre.split('.').collect();
    !nombre.is_empty()
        && nombre.len() <= 100
        && partes.len() <= 2
        && partes.iter().all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'))
}

fn extension(ruta: &Path) -> Option<String> {
    ruta.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase())
}

/// Escribe primero en un archivo temporal y luego lo renombra: nunca queda un archivo a medias.
fn escribir_completo(destino: &Path, escribir: impl FnOnce(&mut File) -> Result<(), String>) -> Result<(), String> {
    let temporal = destino.with_extension("parcial");
    let mut archivo = File::create(&temporal).map_err(|e| e.to_string())?;
    let resultado = escribir(&mut archivo).and_then(|_| archivo.sync_all().map_err(|e| e.to_string()));
    drop(archivo);
    match resultado {
        Ok(()) => fs::rename(&temporal, destino).map_err(|e| e.to_string()),
        Err(e) => {
            let _ = fs::remove_file(&temporal);
            Err(e)
        }
    }
}

/// Guarda un documento emitido en `<datos>/documentos/<nombre>` y devuelve la ruta relativa que va a la base.
pub fn guardar_documento(carpeta_datos: &Path, nombre: &str, contenido: &[u8]) -> Result<String, String> {
    let ext = extension(Path::new(nombre));
    if !nombre_seguro(nombre) || !matches!(ext.as_deref(), Some("pdf") | Some("csv")) {
        return Err("nombre de documento no válido".into());
    }
    let carpeta = carpeta_datos.join("documentos");
    fs::create_dir_all(&carpeta).map_err(|e| e.to_string())?;
    escribir_completo(&carpeta.join(nombre), |f| f.write_all(contenido).map_err(|e| e.to_string()))?;
    Ok(format!("documentos/{nombre}"))
}

/// Escribe una copia donde eligió el usuario en el diálogo «Guardar». Solo PDF, CSV, XLSX (Excel) o ZIP.
pub fn guardar_copia(destino: &Path, contenido: &[u8]) -> Result<(), String> {
    match extension(destino) {
        Some(e) if EXTENSIONES_COPIA.contains(&e.as_str()) => {
            escribir_completo(destino, |f| f.write_all(contenido).map_err(|e| e.to_string()))
        }
        _ => Err("solo se guardan archivos PDF, CSV, XLSX o ZIP".into()),
    }
}

/// Extensiones de los archivos que viajan entre equipos (Etapa 10): fotos, PDF y CSV de documentos, adjuntos.
const EXTENSIONES_SINCRONIZADAS: [&str; 7] = ["jpg", "jpeg", "png", "webp", "pdf", "csv", "xlsx"];
/// Tope de un archivo que se sincroniza (el almacenamiento del servidor también tiene el suyo).
const MAXIMO_ARCHIVO_SINCRONIZADO: u64 = 50 << 20;

/// Separa `fotos/<nombre>` o `documentos/<nombre>` y la comprueba: solo esas dos carpetas, un nombre simple y una extensión conocida.
fn ruta_sincronizable(ruta: &str) -> Result<(&str, &str), String> {
    let (carpeta, nombre) = ruta.split_once('/').ok_or("ruta de archivo no válida")?;
    let ext = extension(Path::new(nombre));
    let ext_valida = matches!(&ext, Some(e) if EXTENSIONES_SINCRONIZADAS.contains(&e.as_str()));
    if !matches!(carpeta, "fotos" | "documentos") || !nombre_seguro(nombre) || !ext_valida {
        return Err("ruta de archivo no válida".into());
    }
    Ok((carpeta, nombre))
}

/// Lee un archivo de datos del programa (foto, documento o adjunto). `None` si no existe en este equipo.
pub fn leer_archivo_de_datos(carpeta_datos: &Path, ruta: &str) -> Result<Option<Vec<u8>>, String> {
    let (carpeta, nombre) = ruta_sincronizable(ruta)?;
    let archivo = carpeta_datos.join(carpeta).join(nombre);
    match fs::metadata(&archivo) {
        Ok(m) if m.is_file() && m.len() <= MAXIMO_ARCHIVO_SINCRONIZADO => fs::read(&archivo).map(Some).map_err(|e| e.to_string()),
        Ok(m) if m.is_file() => Err("el archivo es demasiado grande para sincronizarlo".into()),
        _ => Ok(None),
    }
}

/// Guarda un archivo recibido de otro equipo en su lugar. No pisa uno que ya existe (los archivos no cambian).
pub fn escribir_archivo_de_datos(carpeta_datos: &Path, ruta: &str, contenido: &[u8]) -> Result<bool, String> {
    let (carpeta, nombre) = ruta_sincronizable(ruta)?;
    if contenido.len() as u64 > MAXIMO_ARCHIVO_SINCRONIZADO {
        return Err("el archivo es demasiado grande para sincronizarlo".into());
    }
    let carpeta = carpeta_datos.join(carpeta);
    fs::create_dir_all(&carpeta).map_err(|e| e.to_string())?;
    let destino = carpeta.join(nombre);
    if destino.exists() {
        return Ok(false);
    }
    escribir_completo(&destino, |f| f.write_all(contenido).map_err(|e| e.to_string()))?;
    Ok(true)
}

/// ¿Es una ruta relativa de adjunto, `documentos/adjunto-<uuid>.<extensión>`, como las que guarda `copiar_adjunto`?
fn nombre_de_adjunto(ruta: &str) -> Option<&str> {
    let nombre = ruta.strip_prefix("documentos/")?;
    let (base, ext) = nombre.rsplit_once('.')?;
    let uuid = base.strip_prefix("adjunto-")?;
    let formato_uuid = uuid.len() == 36
        && uuid.chars().enumerate().all(|(i, c)| match i {
            8 | 13 | 18 | 23 => c == '-',
            _ => c.is_ascii_hexdigit(),
        });
    (formato_uuid && EXTENSIONES_ADJUNTO.contains(&ext.to_ascii_lowercase().as_str())).then_some(nombre)
}

/// R32: copia un PDF o una imagen elegidos por el usuario a `<datos>/documentos/adjunto-<uuid>.<ext>` y devuelve la
/// ruta relativa que se anota en `traspaso.adjuntos`. Quedan en la carpeta «documentos», así viajan en el respaldo.
pub fn copiar_adjunto(carpeta_datos: &Path, origen: &Path, uuid: &str) -> Result<String, String> {
    let ext = extension(origen)
        .filter(|e| EXTENSIONES_ADJUNTO.contains(&e.as_str()))
        .ok_or("solo se adjuntan archivos PDF o imágenes (JPG, PNG o WEBP)")?;
    let ruta = format!("documentos/adjunto-{uuid}.{ext}");
    if nombre_de_adjunto(&ruta).is_none() {
        return Err("nombre de adjunto no válido".into());
    }
    let contenido = fs::read(origen).map_err(|e| e.to_string())?;
    let carpeta = carpeta_datos.join("documentos");
    fs::create_dir_all(&carpeta).map_err(|e| e.to_string())?;
    escribir_completo(&carpeta_datos.join(&ruta), |f| f.write_all(&contenido).map_err(|e| e.to_string()))?;
    Ok(ruta)
}

/// Guarda una copia de un adjunto donde eligió el usuario. Solo acepta rutas de adjunto como las de `copiar_adjunto`
/// y un destino con la misma extensión del adjunto.
pub fn guardar_copia_de_adjunto(carpeta_datos: &Path, ruta: &str, destino: &Path) -> Result<(), String> {
    let nombre = nombre_de_adjunto(ruta).ok_or("adjunto no válido")?;
    if extension(destino) != extension(Path::new(nombre)) {
        return Err("el archivo de destino debe tener la misma extensión que el adjunto".into());
    }
    let contenido = fs::read(carpeta_datos.join("documentos").join(nombre)).map_err(|_| "no se encontró el adjunto".to_string())?;
    escribir_completo(destino, |f| f.write_all(&contenido).map_err(|e| e.to_string()))
}

/// RF-43: crea el .zip con datos.json y las carpetas de fotos y documentos. Devuelve su tamaño en bytes.
pub fn crear_respaldo(carpeta_datos: &Path, destino: &Path, datos: &str) -> Result<u64, String> {
    if extension(destino).as_deref() != Some("zip") {
        return Err("la copia de respaldo debe ser un archivo .zip".into());
    }
    let opciones = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .large_file(true);
    escribir_completo(destino, |archivo| {
        let mut zip = ZipWriter::new(archivo);
        zip.start_file(DATOS_RESPALDO, opciones).map_err(|e| e.to_string())?;
        zip.write_all(datos.as_bytes()).map_err(|e| e.to_string())?;
        for carpeta in CARPETAS_RESPALDO {
            let ruta = carpeta_datos.join(carpeta);
            let Ok(entradas) = fs::read_dir(&ruta) else { continue };
            let mut nombres: Vec<PathBuf> = entradas.filter_map(|e| e.ok()).map(|e| e.path()).filter(|p| p.is_file()).collect();
            nombres.sort();
            for archivo in nombres {
                let Some(nombre) = archivo.file_name().and_then(|n| n.to_str()) else { continue };
                if !nombre_seguro(nombre) {
                    continue;
                }
                zip.start_file(format!("{carpeta}/{nombre}"), opciones).map_err(|e| e.to_string())?;
                zip.write_all(&fs::read(&archivo).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
            }
        }
        zip.finish().map_err(|e| e.to_string())?;
        Ok(())
    })?;
    fs::metadata(destino).map(|m| m.len()).map_err(|e| e.to_string())
}

/// Lee datos.json de una copia de respaldo, sin escribir nada.
pub fn leer_respaldo(origen: &Path) -> Result<String, String> {
    let mut zip = ZipArchive::new(File::open(origen).map_err(|e| e.to_string())?).map_err(|_| "no es un archivo .zip".to_string())?;
    let entrada = zip
        .by_name(DATOS_RESPALDO)
        .map_err(|_| "el .zip no es una copia de respaldo de Registro Caprino".to_string())?;
    if entrada.size() > MAXIMO_DATOS {
        return Err("datos.json es demasiado grande".into());
    }
    let mut texto = String::new();
    entrada.take(MAXIMO_DATOS).read_to_string(&mut texto).map_err(|e| e.to_string())?;
    Ok(texto)
}

/// Después de restaurar los datos: copia las fotos y los documentos del respaldo a la carpeta de datos.
/// Solo acepta «fotos/<nombre>» y «documentos/<nombre>» con nombres seguros; ignora todo lo demás.
pub fn extraer_archivos(carpeta_datos: &Path, origen: &Path) -> Result<usize, String> {
    let mut zip = ZipArchive::new(File::open(origen).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    let mut copiados = 0;
    for i in 0..zip.len() {
        let mut entrada = zip.by_index(i).map_err(|e| e.to_string())?;
        let nombre = entrada.name().to_string();
        let Some((carpeta, archivo)) = nombre.split_once('/') else { continue };
        if !CARPETAS_RESPALDO.contains(&carpeta) || !nombre_seguro(archivo) || entrada.is_dir() {
            continue;
        }
        let destino = carpeta_datos.join(carpeta);
        fs::create_dir_all(&destino).map_err(|e| e.to_string())?;
        let mut contenido = Vec::new();
        entrada.read_to_end(&mut contenido).map_err(|e| e.to_string())?;
        escribir_completo(&destino.join(archivo), |f| f.write_all(&contenido).map_err(|e| e.to_string()))?;
        copiados += 1;
    }
    Ok(copiados)
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn carpeta_temporal(nombre: &str) -> PathBuf {
        let ruta = std::env::temp_dir().join(format!("registro-caprino-prueba-{nombre}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&ruta);
        fs::create_dir_all(&ruta).unwrap();
        ruta
    }

    #[test]
    fn archivos_de_sincronizacion_solo_en_fotos_y_documentos() {
        let carpeta = carpeta_temporal("sincronizacion");
        assert_eq!(leer_archivo_de_datos(&carpeta, "fotos/a1.jpg").unwrap(), None);
        assert!(escribir_archivo_de_datos(&carpeta, "fotos/a1.jpg", b"abc").unwrap());
        assert_eq!(leer_archivo_de_datos(&carpeta, "fotos/a1.jpg").unwrap(), Some(b"abc".to_vec()));
        // No pisa uno que ya está.
        assert!(!escribir_archivo_de_datos(&carpeta, "fotos/a1.jpg", b"otro").unwrap());
        assert_eq!(leer_archivo_de_datos(&carpeta, "fotos/a1.jpg").unwrap(), Some(b"abc".to_vec()));
        assert!(escribir_archivo_de_datos(&carpeta, "documentos/CP-2026-0001-B.pdf", b"%PDF").unwrap());
        for mala in ["../fuera.pdf", "fotos/../x.jpg", "datos/a.jpg", "fotos/a.exe", "fotos/a/b.jpg", "fotos", "/etc/passwd", "documentos/a b.pdf"] {
            assert!(leer_archivo_de_datos(&carpeta, mala).is_err(), "{mala}");
            assert!(escribir_archivo_de_datos(&carpeta, mala, b"x").is_err(), "{mala}");
        }
        let _ = fs::remove_dir_all(&carpeta);
    }

    #[test]
    fn nombres_seguros() {
        assert!(nombre_seguro("CI-2026-0001.pdf"));
        assert!(nombre_seguro("1b2c3d4e-0000-4000-8000-000000000000.jpg"));
        for malo in ["", "../x.pdf", "a/b.pdf", "x..pdf", "a.b.c", ".pdf", "con espacio.pdf"] {
            assert!(!nombre_seguro(malo), "{malo}");
        }
    }

    #[test]
    fn respaldo_ida_y_vuelta() {
        let origen = carpeta_temporal("origen");
        fs::create_dir_all(origen.join("fotos")).unwrap();
        fs::write(origen.join("fotos").join("abc-1.jpg"), b"foto").unwrap();
        guardar_documento(&origen, "CI-2026-0001.pdf", b"%PDF-ejemplo").unwrap();
        let zip = origen.join("respaldo.zip");
        let datos = r#"{"formato":"registro-caprino-respaldo","tablas":{"animal":[{"nombre":"Señora Ñata"}]}}"#;
        assert!(crear_respaldo(&origen, &zip, datos).unwrap() > 0);
        assert_eq!(leer_respaldo(&zip).unwrap(), datos);

        let destino = carpeta_temporal("destino");
        assert_eq!(extraer_archivos(&destino, &zip).unwrap(), 2);
        assert_eq!(fs::read(destino.join("fotos").join("abc-1.jpg")).unwrap(), b"foto");
        assert_eq!(fs::read(destino.join("documentos").join("CI-2026-0001.pdf")).unwrap(), b"%PDF-ejemplo");
    }

    #[test]
    fn guarda_copias_de_excel_junto_a_las_de_pdf_y_csv() {
        let carpeta = carpeta_temporal("copias");
        for nombre in ["libro.pdf", "libro.csv", "libro.xlsx", "libro.XLSX"] {
            guardar_copia(&carpeta.join(nombre), b"contenido").unwrap();
            assert_eq!(fs::read(carpeta.join(nombre)).unwrap(), b"contenido");
        }
    }

    #[test]
    fn rechaza_extensiones_y_archivos_ajenos() {
        let carpeta = carpeta_temporal("ajenos");
        assert!(guardar_copia(&carpeta.join("x.exe"), b"no").is_err());
        assert!(guardar_copia(&carpeta.join("x.xlsm"), b"no").is_err());
        assert!(guardar_documento(&carpeta, "x.exe", b"no").is_err());
        assert!(crear_respaldo(&carpeta, &carpeta.join("x.json"), "{}").is_err());
        fs::write(carpeta.join("no-es-zip.zip"), b"hola").unwrap();
        assert!(leer_respaldo(&carpeta.join("no-es-zip.zip")).is_err());
        // Un .zip sin datos.json no es un respaldo.
        let mut zip = ZipWriter::new(File::create(carpeta.join("otro.zip")).unwrap());
        zip.start_file("otra-cosa.txt", SimpleFileOptions::default()).unwrap();
        zip.write_all(b"x").unwrap();
        zip.finish().unwrap();
        assert!(leer_respaldo(&carpeta.join("otro.zip")).is_err());
    }

    #[test]
    fn no_extrae_rutas_peligrosas() {
        let carpeta = carpeta_temporal("peligro");
        let ruta = carpeta.join("malo.zip");
        let mut zip = ZipWriter::new(File::create(&ruta).unwrap());
        for nombre in ["datos.json", "fotos/../../fuera.txt", "otra/x.jpg", "fotos/bien.jpg"] {
            zip.start_file(nombre, SimpleFileOptions::default()).unwrap();
            zip.write_all(b"x").unwrap();
        }
        zip.finish().unwrap();
        let destino = carpeta.join("datos");
        assert_eq!(extraer_archivos(&destino, &ruta).unwrap(), 1);
        assert!(destino.join("fotos").join("bien.jpg").exists());
        assert!(!carpeta.join("fuera.txt").exists());
    }

    #[test]
    fn copia_adjuntos_pdf_o_imagen_a_documentos_y_viajan_en_el_respaldo() {
        let origen = carpeta_temporal("adjunto-origen");
        let datos = carpeta_temporal("adjunto-datos");
        let uuid = "1b2c3d4e-0000-4000-8000-123456789abc";
        for (archivo, ext) in [("factura.pdf", "pdf"), ("foto.JPG", "jpg"), ("sello.png", "png"), ("pose.webp", "webp"), ("otra.jpeg", "jpeg")] {
            fs::write(origen.join(archivo), format!("contenido de {archivo}")).unwrap();
            let ruta = copiar_adjunto(&datos, &origen.join(archivo), uuid).unwrap();
            assert_eq!(ruta, format!("documentos/adjunto-{uuid}.{ext}"));
            assert_eq!(fs::read(datos.join(&ruta)).unwrap(), format!("contenido de {archivo}").into_bytes());
        }
        // Un adjunto copiado a la carpeta de datos entra al .zip del respaldo y sale de él.
        let ruta = copiar_adjunto(&datos, &origen.join("factura.pdf"), uuid).unwrap();
        let zip = origen.join("respaldo.zip");
        crear_respaldo(&datos, &zip, "{}").unwrap();
        let otro = carpeta_temporal("adjunto-restaurado");
        extraer_archivos(&otro, &zip).unwrap();
        assert_eq!(fs::read(otro.join(&ruta)).unwrap(), b"contenido de factura.pdf");
    }

    #[test]
    fn rechaza_adjuntos_de_otro_formato_o_con_nombre_raro() {
        let origen = carpeta_temporal("adjunto-malo");
        let datos = carpeta_temporal("adjunto-malo-datos");
        fs::write(origen.join("programa.exe"), b"x").unwrap();
        fs::write(origen.join("bien.pdf"), b"x").unwrap();
        let uuid = "1b2c3d4e-0000-4000-8000-123456789abc";
        assert!(copiar_adjunto(&datos, &origen.join("programa.exe"), uuid).is_err());
        assert!(copiar_adjunto(&datos, &origen.join("no-existe.pdf"), uuid).is_err());
        for malo in ["../x", "a/b", "1b2c3d4e", "", "1b2c3d4e-0000-4000-8000-123456789abc.pdf"] {
            assert!(copiar_adjunto(&datos, &origen.join("bien.pdf"), malo).is_err(), "{malo}");
        }
        assert!(!datos.join("documentos").exists() || fs::read_dir(datos.join("documentos")).unwrap().count() == 0);
    }

    #[test]
    fn guarda_copia_de_un_adjunto_solo_con_rutas_de_adjunto() {
        let origen = carpeta_temporal("adjunto-copia");
        let datos = carpeta_temporal("adjunto-copia-datos");
        let uuid = "1b2c3d4e-0000-4000-8000-123456789abc";
        fs::write(origen.join("scan.png"), b"imagen").unwrap();
        let ruta = copiar_adjunto(&datos, &origen.join("scan.png"), uuid).unwrap();
        guardar_copia_de_adjunto(&datos, &ruta, &origen.join("mi-copia.png")).unwrap();
        assert_eq!(fs::read(origen.join("mi-copia.png")).unwrap(), b"imagen");
        // La extensión de destino debe coincidir, y no se leen archivos que no sean adjuntos.
        assert!(guardar_copia_de_adjunto(&datos, &ruta, &origen.join("mi-copia.exe")).is_err());
        assert!(guardar_copia_de_adjunto(&datos, "../../etc/passwd", &origen.join("x.pdf")).is_err());
        assert!(guardar_copia_de_adjunto(&datos, "documentos/CI-2026-0001.pdf", &origen.join("x.pdf")).is_err());
        assert!(guardar_copia_de_adjunto(&datos, &format!("documentos/adjunto-{uuid}.pdf"), &origen.join("x.pdf")).is_err());
    }
}
