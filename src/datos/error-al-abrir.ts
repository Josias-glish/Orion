// Qué hacer cuando no se puede abrir la base. El plugin SQL aplica las migraciones al abrirla y, antes de tocar nada,
// rechaza la base si ya tiene aplicada una migración que este programa no trae: los datos los guardó una versión más
// nueva (por ejemplo, la 0.1.0 —migraciones 1 a 4— abriendo datos de la 0.5.0). No se pierde nada: el rechazo es previo a
// cualquier cambio. El texto es el de sqlx; la prueba de Rust `el_texto_de_sqlx_para_una_base_de_version_mas_nueva_no_cambio`
// avisa si una versión nueva de sqlx lo cambia.

export type CausaAlAbrir = "version_mas_nueva" | "desconocida";

const BASE_DE_VERSION_MAS_NUEVA = /migration \d+ was previously applied but is missing in the resolved migrations/;

export function causaDelErrorAlAbrir(error: string): CausaAlAbrir {
  return BASE_DE_VERSION_MAS_NUEVA.test(error) ? "version_mas_nueva" : "desconocida";
}
