//! Llavero del sistema para la sesión de la cuenta (Etapa 10, sección 10 del diseño).
//!
//! La sesión (el token de renovación) nunca se guarda en la base ni en un archivo: va al Administrador de
//! credenciales de Windows o al llavero de macOS, con el núcleo de `keyring` (`keyring-core`) y el almacén
//! nativo de cada sistema. En Linux (solo desarrollo) no hay almacén: el programa compila igual y estos
//! comandos responden con un error claro, para que la interfaz pida iniciar sesión otra vez al abrir.
//!
//! Los valores se guardan como bytes UTF-8 (`set_secret`), no como «contraseña»: en Windows una contraseña se
//! convertiría a UTF-16 y el límite del sistema (2560 bytes) se alcanzaría con la mitad de los caracteres.
//!
//! Ningún mensaje de error lleva el valor del secreto, y ningún comando lo escribe en un registro.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

use keyring_core::{CredentialStore, Entry, Error};

/// Servicio con el que se guardan todas las entradas: el identificador del programa (S-10).
pub const SERVICIO: &str = "co.registrocaprino.escritorio";
/// Largo máximo de la clave (el nombre de la entrada).
const MAXIMO_CLAVE: usize = 64;
/// Tamaño máximo del valor, en bytes.
const MAXIMO_VALOR: usize = 8 * 1024;

const SIN_LLAVERO: &str = "Este sistema no tiene un llavero compatible (solo Windows y macOS): la sesión no se puede guardar y habrá que iniciar sesión otra vez.";

/// Un solo acceso al llavero a la vez: el Administrador de credenciales de Windows no garantiza el orden
/// de llamadas que llegan desde varios hilos.
static CERROJO: Mutex<()> = Mutex::new(());

/// La clave solo admite `[a-z0-9_-]{1,64}`.
fn validar_clave(clave: &str) -> Result<(), String> {
    let valida = !clave.is_empty()
        && clave.len() <= MAXIMO_CLAVE
        && clave
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_' || b == b'-');
    if valida {
        Ok(())
    } else {
        Err(format!(
            "El nombre del secreto no es válido: solo letras minúsculas sin tilde, números, guion y guion bajo (de 1 a {MAXIMO_CLAVE} caracteres)."
        ))
    }
}

/// El valor no puede estar vacío (para quitarlo existe `borrar_secreto`) ni pasar de 8 kB.
fn validar_valor(valor: &str) -> Result<(), String> {
    if valor.is_empty() {
        return Err("El secreto no puede estar vacío; para quitarlo se usa borrar.".to_string());
    }
    if valor.len() > MAXIMO_VALOR {
        return Err(format!("El secreto es demasiado largo: el máximo es de {} kB.", MAXIMO_VALOR / 1024));
    }
    Ok(())
}

/// Traduce el error del llavero a un mensaje en español. Nunca incluye el contenido del secreto:
/// solo se copian el nombre del campo, el límite del sistema y, cuando el sistema lo da, su detalle técnico.
fn error_a_texto(error: Error) -> String {
    match error {
        Error::NoDefaultStore => SIN_LLAVERO.to_string(),
        Error::NoStorageAccess(detalle) => {
            format!("El sistema no permitió usar el llavero (puede estar bloqueado o sin permiso). Detalle técnico: {detalle}")
        }
        Error::PlatformFailure(detalle) => {
            format!("El llavero del sistema devolvió un error. Detalle técnico: {detalle}")
        }
        Error::TooLong(_, limite) => {
            format!("El llavero del sistema no admite un valor tan largo (límite del sistema: {limite}).")
        }
        Error::Invalid(campo, _) => format!("El llavero del sistema rechazó el campo «{campo}»."),
        Error::BadEncoding(_) | Error::BadDataFormat(..) | Error::BadStoreFormat(_) => {
            "El dato guardado en el llavero está dañado.".to_string()
        }
        Error::Ambiguous(_) => "Hay más de una entrada con ese nombre en el llavero.".to_string(),
        Error::NotSupportedByStore(_) => "El llavero del sistema no admite esa operación.".to_string(),
        Error::NoEntry => "No existe esa entrada en el llavero.".to_string(),
        _ => "El llavero del sistema devolvió un error desconocido.".to_string(),
    }
}

/// Crea el almacén nativo: Administrador de credenciales (Windows) o llavero (macOS).
#[cfg(any(windows, target_os = "macos"))]
fn crear_almacen() -> Result<Arc<CredentialStore>, String> {
    #[cfg(windows)]
    let almacen = windows_native_keyring_store::Store::new();
    #[cfg(target_os = "macos")]
    let almacen = apple_native_keyring_store::keychain::Store::new();
    let almacen: Arc<CredentialStore> = almacen.map_err(error_a_texto)?;
    Ok(almacen)
}

/// En Linux (y cualquier otro sistema) no hay almacén: compila, y falla al usarlo.
#[cfg(not(any(windows, target_os = "macos")))]
fn crear_almacen() -> Result<Arc<CredentialStore>, String> {
    Err(SIN_LLAVERO.to_string())
}

/// El almacén del sistema, creado una sola vez.
fn almacen_del_sistema() -> Result<&'static CredentialStore, String> {
    static ALMACEN: OnceLock<Result<Arc<CredentialStore>, String>> = OnceLock::new();
    match ALMACEN.get_or_init(crear_almacen) {
        Ok(almacen) => Ok(&**almacen),
        Err(mensaje) => Err(mensaje.clone()),
    }
}

/// La entrada de `clave` en el almacén del sistema, bajo el servicio del programa.
fn entrada_del_sistema(clave: &str) -> Result<Entry, String> {
    validar_clave(clave)?;
    let almacen = almacen_del_sistema()?;
    // En Windows, «Local»: la credencial se queda en este equipo y no viaja a otros equipos del dominio
    // (el valor por defecto del almacén es «Enterprise»).
    #[cfg(windows)]
    let modificadores: Option<HashMap<&str, &str>> = Some(HashMap::from([("persistence", "Local")]));
    #[cfg(not(windows))]
    let modificadores: Option<HashMap<&str, &str>> = None;
    almacen
        .build(SERVICIO, clave, modificadores.as_ref())
        .map_err(error_a_texto)
}

fn guardar_en(entrada: &Entry, valor: &str) -> Result<(), String> {
    entrada.set_secret(valor.as_bytes()).map_err(error_a_texto)
}

/// `None` si la entrada no existe.
fn leer_de(entrada: &Entry) -> Result<Option<String>, String> {
    match entrada.get_secret() {
        Ok(bytes) => String::from_utf8(bytes)
            .map(Some)
            // El error de `from_utf8` trae los bytes del secreto: no se copia.
            .map_err(|_| "El dato guardado en el llavero está dañado.".to_string()),
        Err(Error::NoEntry) => Ok(None),
        Err(otro) => Err(error_a_texto(otro)),
    }
}

/// No falla si la entrada no existe.
fn borrar_de(entrada: &Entry) -> Result<(), String> {
    match entrada.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(otro) => Err(error_a_texto(otro)),
    }
}

/// Corre `trabajo` en un hilo aparte (el llavero puede bloquear mientras el sistema pide permiso al usuario)
/// y con el cerrojo tomado.
async fn en_hilo<T, F>(trabajo: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || {
        let _turno = CERROJO.lock().unwrap_or_else(|envenenado| envenenado.into_inner());
        trabajo()
    })
    .await
    .map_err(|_| "La operación con el llavero se interrumpió.".to_string())?
}

/// Guarda `valor` bajo `clave` en el llavero del sistema (reemplaza el que hubiera).
#[tauri::command]
pub async fn guardar_secreto(clave: String, valor: String) -> Result<(), String> {
    validar_clave(&clave)?;
    validar_valor(&valor)?;
    en_hilo(move || guardar_en(&entrada_del_sistema(&clave)?, &valor)).await
}

/// Lee el valor guardado bajo `clave`; `None` si no existe.
#[tauri::command]
pub async fn leer_secreto(clave: String) -> Result<Option<String>, String> {
    validar_clave(&clave)?;
    en_hilo(move || leer_de(&entrada_del_sistema(&clave)?)).await
}

/// Borra el valor guardado bajo `clave`; no falla si no existe.
#[tauri::command]
pub async fn borrar_secreto(clave: String) -> Result<(), String> {
    validar_clave(&clave)?;
    en_hilo(move || borrar_de(&entrada_del_sistema(&clave)?)).await
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use keyring_core::api::CredentialStoreApi;
    use keyring_core::mock;

    // El llavero real (Windows y macOS) no se prueba aquí: en CI no hay sesión de escritorio con
    // llavero desbloqueado. Estas pruebas usan el almacén simulado de keyring-core.

    fn entrada_simulada(clave: &str) -> Entry {
        mock::Store::new().unwrap().build(SERVICIO, clave, None).unwrap()
    }

    #[test]
    fn la_clave_admite_solo_minusculas_numeros_guion_y_guion_bajo() {
        for buena in ["sesion", "a", "refresco-1", "token_de_acceso", "0-9_a-z", &"a".repeat(64)] {
            assert!(validar_clave(buena).is_ok(), "{buena}");
        }
        for mala in [
            "",
            &"a".repeat(65),
            "Sesion",
            "con espacio",
            "ñandú",
            "a.b",
            "a/b",
            "../x",
            "a\nb",
            "a\0b",
            "sesión",
        ] {
            assert!(validar_clave(mala).is_err(), "{mala:?}");
        }
    }

    #[test]
    fn el_valor_no_puede_estar_vacio_ni_pasar_de_8_kb() {
        assert!(validar_valor("x").is_ok());
        assert!(validar_valor(&"x".repeat(8 * 1024)).is_ok());
        assert!(validar_valor("").is_err());
        assert!(validar_valor(&"x".repeat(8 * 1024 + 1)).is_err());
        // El límite es en bytes, no en caracteres: 4097 «ñ» son 8194 bytes.
        assert!(validar_valor(&"ñ".repeat(4096)).is_ok());
        assert!(validar_valor(&"ñ".repeat(4097)).is_err());
    }

    #[test]
    fn leer_algo_que_no_existe_da_none_y_borrarlo_no_falla() {
        let entrada = entrada_simulada("sesion");
        assert_eq!(leer_de(&entrada), Ok(None));
        assert_eq!(borrar_de(&entrada), Ok(()));
    }

    #[test]
    fn guardar_leer_reemplazar_y_borrar() {
        let entrada = entrada_simulada("sesion");
        guardar_en(&entrada, "token-uno").unwrap();
        assert_eq!(leer_de(&entrada), Ok(Some("token-uno".to_string())));
        guardar_en(&entrada, "token-dos con ñ y «tildes»").unwrap();
        assert_eq!(leer_de(&entrada), Ok(Some("token-dos con ñ y «tildes»".to_string())));
        borrar_de(&entrada).unwrap();
        assert_eq!(leer_de(&entrada), Ok(None));
        // Borrar otra vez tampoco falla.
        assert_eq!(borrar_de(&entrada), Ok(()));
    }

    #[test]
    fn dos_claves_no_se_mezclan() {
        let almacen = mock::Store::new().unwrap();
        let a = almacen.build(SERVICIO, "uno", None).unwrap();
        let b = almacen.build(SERVICIO, "dos", None).unwrap();
        guardar_en(&a, "valor-a").unwrap();
        assert_eq!(leer_de(&b), Ok(None));
        guardar_en(&b, "valor-b").unwrap();
        borrar_de(&a).unwrap();
        assert_eq!(leer_de(&a), Ok(None));
        assert_eq!(leer_de(&b), Ok(Some("valor-b".to_string())));
    }

    #[test]
    fn un_valor_que_no_es_texto_se_informa_sin_copiar_los_bytes() {
        let entrada = entrada_simulada("sesion");
        let mut bytes = vec![0xff, 0xfe];
        bytes.extend_from_slice(b"SECRETO");
        entrada.set_secret(&bytes).unwrap();
        let error = leer_de(&entrada).unwrap_err();
        assert!(error.contains("dañado"), "{error}");
        assert!(!error.contains("SECRETO"), "{error}");
    }

    #[test]
    fn los_errores_del_llavero_salen_en_espanol_y_sin_el_secreto() {
        const SECRETO: &str = "secreto-que-no-debe-salir";
        let con_secreto: Vec<Error> = vec![
            Error::BadEncoding(SECRETO.as_bytes().to_vec()),
            Error::BadDataFormat(SECRETO.as_bytes().to_vec(), SECRETO.into()),
            Error::BadStoreFormat(SECRETO.to_string()),
            Error::TooLong(SECRETO.to_string(), 2560),
            Error::Invalid("service".to_string(), SECRETO.to_string()),
            Error::NotSupportedByStore(SECRETO.to_string()),
        ];
        for error in con_secreto {
            let texto = error_a_texto(error);
            assert!(!texto.contains(SECRETO), "{texto}");
            assert!(!texto.contains("Platform failure") && !texto.contains("Value of"), "{texto}");
        }
        assert!(error_a_texto(Error::TooLong("blob".into(), 2560)).contains("2560"));
        assert!(error_a_texto(Error::NoDefaultStore).contains("llavero"));
        assert!(error_a_texto(Error::NoStorageAccess("bloqueado".into())).contains("bloqueado"));
        assert!(error_a_texto(Error::PlatformFailure("OSStatus -25308".into())).contains("-25308"));
    }

    #[test]
    fn un_fallo_del_llavero_llega_como_error_y_el_valor_guardado_sigue_ahi() {
        let entrada = entrada_simulada("sesion");
        guardar_en(&entrada, "token").unwrap();
        let simulada: &mock::Cred = entrada.as_any().downcast_ref().unwrap();
        simulada.set_error(Error::NoStorageAccess("llavero bloqueado".into()));
        let error = leer_de(&entrada).unwrap_err();
        assert!(error.contains("no permitió usar el llavero"), "{error}");
        assert!(!error.contains("token"), "{error}");
        // El error se consumió: la siguiente lectura funciona y el valor no cambió.
        assert_eq!(leer_de(&entrada), Ok(Some("token".to_string())));
        // Lo mismo al guardar y al borrar.
        simulada.set_error(Error::PlatformFailure("falla".into()));
        assert!(guardar_en(&entrada, "otro").is_err());
        simulada.set_error(Error::PlatformFailure("falla".into()));
        assert!(borrar_de(&entrada).is_err());
        assert_eq!(leer_de(&entrada), Ok(Some("token".to_string())));
    }

    #[test]
    fn los_comandos_rechazan_una_clave_o_un_valor_no_validos_sin_tocar_el_llavero() {
        let error = tauri::async_runtime::block_on(guardar_secreto("Mala Clave".into(), "x".into())).unwrap_err();
        assert!(error.contains("nombre del secreto"), "{error}");
        let error = tauri::async_runtime::block_on(guardar_secreto("sesion".into(), String::new())).unwrap_err();
        assert!(error.contains("vacío"), "{error}");
        let error = tauri::async_runtime::block_on(guardar_secreto("sesion".into(), "x".repeat(9000))).unwrap_err();
        assert!(error.contains("demasiado largo"), "{error}");
        assert!(tauri::async_runtime::block_on(leer_secreto("../x".into())).is_err());
        assert!(tauri::async_runtime::block_on(borrar_secreto("".into())).is_err());
    }

    /// En Linux no hay almacén: el programa compila y el error es claro al usarlo, no al compilar.
    #[cfg(not(any(windows, target_os = "macos")))]
    #[test]
    fn sin_llavero_en_este_sistema_los_comandos_fallan_con_un_mensaje_claro() {
        let error = almacen_del_sistema().err().unwrap();
        assert!(error.contains("llavero") && error.contains("iniciar sesión otra vez"), "{error}");
        let error = tauri::async_runtime::block_on(guardar_secreto("sesion".into(), "token".into())).unwrap_err();
        assert!(error.contains("llavero"), "{error}");
        assert!(!error.contains("token"), "{error}");
        let error = tauri::async_runtime::block_on(leer_secreto("sesion".into())).unwrap_err();
        assert!(error.contains("llavero"), "{error}");
        let error = tauri::async_runtime::block_on(borrar_secreto("sesion".into())).unwrap_err();
        assert!(error.contains("llavero"), "{error}");
    }
}
