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
pub const EXTENSIONES_COPIA: [&str; 3] = ["pdf", "csv", "zip"];
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

/// Escribe una copia donde eligió el usuario en el diálogo «Guardar». Solo PDF, CSV o ZIP.
pub fn guardar_copia(destino: &Path, contenido: &[u8]) -> Result<(), String> {
    match extension(destino) {
        Some(e) if EXTENSIONES_COPIA.contains(&e.as_str()) => {
            escribir_completo(destino, |f| f.write_all(contenido).map_err(|e| e.to_string()))
        }
        _ => Err("solo se guardan archivos PDF, CSV o ZIP".into()),
    }
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
    fn rechaza_extensiones_y_archivos_ajenos() {
        let carpeta = carpeta_temporal("ajenos");
        assert!(guardar_copia(&carpeta.join("x.exe"), b"no").is_err());
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
}
