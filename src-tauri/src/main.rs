// Evita que se abra una ventana de consola en Windows en la versión instalada. NO QUITAR.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    registro_caprino_lib::run()
}
