// Todos los textos que ve el usuario. Los componentes no escriben textos propios: los toman de aquí.
import { generacion, linea, sexoEsperado, type Camino } from "../dominio/genealogia";

const NOMBRES_GENERACION: Record<number, { macho: string; hembra: string }> = {
  1: { macho: "Padre", hembra: "Madre" },
  2: { macho: "Abuelo", hembra: "Abuela" },
  3: { macho: "Bisabuelo", hembra: "Bisabuela" },
  4: { macho: "Tatarabuelo", hembra: "Tatarabuela" },
};

export const textos = {
  app: {
    nombre: "Registro Caprino",
    version: (version: string) => `Versión ${version}`,
  },

  menu: {
    titulo: "Menú principal",
    inicio: "Inicio",
    animales: "Animales",
    ajustes: "Ajustes",
    diagnostico: "Diagnóstico",
    temporal: "temporal",
  },

  comun: {
    cargando: "Cargando…",
    sinDato: "—",
    sexo: { hembra: "Hembra", macho: "Macho" },
    estado: { activo: "Activo", vendido: "Vendido", muerto: "Muerto" },
    tipoIdentificador: {
      tatuaje: "Tatuaje",
      microchip: "Microchip",
      arete: "Arete",
      registro_asociacion: "Registro de asociación",
    },
    si: "Sí",
    no: "No",
  },

  errores: {
    abrirBase: "No se pudo abrir la base de datos del programa.",
    detalleTecnico: "Detalle técnico (para quien da soporte):",
    operacion: "No se pudo completar la operación.",
    identificador_duplicado: "Ya existe otro animal con ese identificador vigente.",
    animal_no_existe: "El animal no existe o fue retirado.",
  },

  inicio: {
    titulo: "Inicio",
    bienvenida: "Le damos la bienvenida a Registro Caprino.",
    descripcion:
      "Aquí llevará la genealogía, la reproducción, la leche, los pesos y la salud de sus cabras, sin necesidad de internet.",
    etapa:
      "Esta es una versión de prueba (Etapa 1). Por ahora solo sirve para comprobar que el programa se instala, guarda datos y los conserva al cerrarlo.",
    resumenTitulo: "Datos guardados",
    razas: "Razas en el catálogo",
    libros: "Libros genealógicos",
    animales: "Animales registrados",
    proximamente: "Próximamente verá aquí las alertas de retiro, los partos próximos, las vacunas por vencer y las hembras en lactancia.",
  },

  animales: {
    titulo: "Animales",
    descripcion: "Lista de animales registrados. El registro completo de fichas llega en la Etapa 2.",
    vacio: "Todavía no hay animales registrados.",
    columnas: {
      nombre: "Nombre",
      sexo: "Sexo",
      nacimiento: "Nacimiento",
      identificador: "Identificador principal",
      estado: "Estado",
    },
    sinNombre: "(sin nombre)",
  },

  ajustes: {
    titulo: "Ajustes",
    descripcion: "Los datos de la finca, los usuarios y los catálogos se configuran aquí a partir de la Etapa 2.",
    baseDatos: "Archivo de la base de datos",
    modoDesarrollo: "Está usando la base de datos de desarrollo, separada de la del programa instalado.",
  },

  diagnostico: {
    titulo: "Diagnóstico técnico",
    aviso:
      "Pantalla temporal de la Etapa 1. Sirve para comprobar que la base de datos funciona en este computador. Los animales que cree aquí quedan marcados como prueba.",
    estadoTitulo: "Estado de la base de datos",
    archivo: "Archivo",
    versionSqlite: "Versión de SQLite",
    clavesForaneas: "Claves foráneas activas",
    migraciones: "Migraciones aplicadas",
    ningunaMigracion: "Ninguna registrada",
    catalogosTitulo: "Catálogos",
    catalogos: (razas: number, libros: number) => `${razas} razas y ${libros} libros precargados`,
    totalAnimales: "Animales en la base",

    pruebaA: "a) Crear un animal con su identificador",
    pruebaAExplicacion: "Crea una hembra de prueba con un arete principal.",
    botonA: "Crear animal de prueba",
    resultadoA: (nombre: string, identificador: string) => `Se creó «${nombre}» con el arete ${identificador}.`,

    pruebaB: "b) Crear tres generaciones",
    pruebaBExplicacion: "Crea cuatro abuelos, un padre, una madre y una cría, cada uno con su arete.",
    botonB: "Crear tres generaciones",
    resultadoB: (nombre: string) => `Se crearon 7 animales. La cría es «${nombre}» y quedó elegida en la prueba c.`,

    pruebaC: "c) Consultar ancestros con una consulta recursiva",
    pruebaCExplicacion: "Elija un animal y el programa recorre su genealogía hacia atrás.",
    elegirAnimal: "Animal",
    opcionElegir: "Elija un animal…",
    botonC: "Ver ancestros",
    sinAncestros: "Este animal no tiene padres registrados.",
    columnas: {
      parentesco: "Parentesco",
      nombre: "Nombre",
      identificador: "Identificador",
      nacimiento: "Nacimiento",
      generacion: "Generación",
    },
    cantidadAncestros: (n: number) => (n === 1 ? "1 ancestro encontrado." : `${n} ancestros encontrados.`),

    pruebaD: "d) Comprobar que los datos se conservan",
    pruebaDPasos: [
      "Anote cuántos animales de prueba hay en la lista de abajo.",
      "Cierre el programa por completo.",
      "Ábralo de nuevo y vuelva a esta pantalla.",
      "La lista debe mostrar los mismos animales, con la misma fecha y hora de creación.",
    ],
    animalesDePrueba: (n: number) => (n === 1 ? "1 animal de prueba guardado" : `${n} animales de prueba guardados`),
    creadoEn: "Creado",

    retirarTitulo: "Retirar los datos de prueba",
    retirarExplicacion:
      "Marca como eliminados los animales de prueba (borrado lógico: no se borran del archivo y quedan en el historial).",
    botonRetirar: "Retirar datos de prueba",
    confirmarRetirar: (n: number) => `¿Retirar ${n} animales de prueba? Dejarán de aparecer en las listas.`,
    resultadoRetirar: (n: number) => `Se retiraron ${n} animales de prueba.`,
  },

  /** Nombre del parentesco a partir del camino (P = padre, M = madre). */
  parentesco(camino: Camino): string {
    const n = generacion(camino);
    const sexo = sexoEsperado(camino);
    const lado = linea(camino);
    if (n === 1) return NOMBRES_GENERACION[1][sexo];
    const nombre = NOMBRES_GENERACION[n]?.[sexo];
    const adjetivo =
      sexo === "macho" ? (lado === "paterna" ? "paterno" : "materno") : lado === "paterna" ? "paterna" : "materna";
    if (nombre) return `${nombre} ${adjetivo}`;
    return `Ancestro de la ${n}.ª generación, línea ${lado}`;
  },
} as const;
