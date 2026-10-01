// Todos los textos que ve el usuario. Los componentes no escriben textos propios: los toman de aquí.
import type { Motivo } from "../datos/errores";
import { generacion, linea, sexoEsperado, type Camino } from "../dominio/genealogia";
import type { EstadoAnimal, FormaConcepcion, Rol, Sexo, TipoIdentificador } from "../dominio/tipos";

const NOMBRES_GENERACION: Record<number, { macho: string; hembra: string }> = {
  1: { macho: "Padre", hembra: "Madre" },
  2: { macho: "Abuelo", hembra: "Abuela" },
  3: { macho: "Bisabuelo", hembra: "Bisabuela" },
  4: { macho: "Tatarabuelo", hembra: "Tatarabuela" },
};

const sexo: Record<Sexo, string> = { hembra: "Hembra", macho: "Macho" };
const estado: Record<EstadoAnimal, string> = { activo: "Activo", vendido: "Vendido", muerto: "Muerto" };
const tipoIdentificador: Record<TipoIdentificador, string> = {
  arete: "Arete",
  tatuaje: "Tatuaje",
  microchip: "Microchip",
  registro_asociacion: "Registro de asociación (CRG)",
};
const formaConcepcion: Record<FormaConcepcion, string> = {
  monta_natural: "Monta natural",
  inseminacion_artificial: "Inseminación artificial",
  transferencia_embriones: "Transferencia de embriones",
  desconocida: "Desconocida",
};
const rol: Record<Rol, string> = { propietario: "Propietario", operario: "Operario" };

/** Nombres de los campos, para mensajes y para el historial. */
const campos: Record<string, string> = {
  nombre: "nombre",
  fechaNacimiento: "fecha de nacimiento",
  fecha_nacimiento: "fecha de nacimiento",
  identificador: "fecha de un identificador",
  diasGestacion: "días de gestación",
  diasLactancia: "días de lactancia",
  sexo: "sexo",
  color_senas: "color y señas",
  estado: "estado",
  en_hato: "pertenece al hato",
  foto: "foto",
  libro_id: "libro",
  lote_id: "lote",
  forma_concepcion: "forma de concepción",
  padre_id: "padre",
  madre_id: "madre",
  padre_sin_verificar: "padre sin verificar",
  madre_sin_verificar: "madre sin verificar",
  observaciones: "observaciones",
  eliminado_en: "retirado",
  tipo: "tipo",
  valor: "valor",
  fecha: "fecha",
  vigente: "vigente",
  principal: "principal",
  animal_id: "animal",
  raza_id: "raza",
  fraccion: "fracción",
};

const nombreDe = (otro: string) => `«${otro}»`;

/** 25 → «25 %»; 12,5 → «12,5 %». Recibe el porcentaje (0 a 100). */
export function formatearPorcentaje(porcentaje: number, decimales = 2): string {
  const redondeado = Number(porcentaje.toFixed(decimales));
  return `${redondeado.toLocaleString("es-CO", { maximumFractionDigits: decimales })} %`;
}

/** Texto claro para cada motivo de rechazo (R1, R2, R3 y demás). */
function motivo(m: Motivo): string {
  switch (m.codigo) {
    case "padre_es_el_mismo_animal":
      return "Un animal no puede ser su propio padre.";
    case "madre_es_el_mismo_animal":
      return "Un animal no puede ser su propia madre.";
    case "padre_es_descendiente":
      return `${nombreDe(m.otro)} no puede ser el padre: es descendiente de este animal, y un animal no puede ser su propio ancestro.`;
    case "madre_es_descendiente":
      return `${nombreDe(m.otro)} no puede ser la madre: es descendiente de este animal, y un animal no puede ser su propio ancestro.`;
    case "padre_no_es_macho":
      return `${nombreDe(m.otro)} no puede ser el padre: es una hembra.`;
    case "madre_no_es_hembra":
      return `${nombreDe(m.otro)} no puede ser la madre: es un macho.`;
    case "padre_nacio_despues":
      return `${nombreDe(m.otro)} no puede ser el padre: nació el mismo día o después que este animal.`;
    case "madre_nacio_despues":
      return `${nombreDe(m.otro)} no puede ser la madre: nació el mismo día o después que este animal.`;
    case "sexo_no_coincide_con_hijos":
      return `No se puede cambiar el sexo: este animal figura como padre o madre de ${nombreDe(m.otro)}.`;
    case "hijo_nacio_antes":
      return `La fecha de nacimiento no puede ser igual o posterior a la de su cría ${nombreDe(m.otro)}.`;
    case "identificador_vacio":
      return "Hay un identificador sin valor. Escríbalo o quite esa fila.";
    case "sin_principal":
      return "Marque cuál identificador es el principal.";
    case "varios_principales":
      return "Solo un identificador puede ser el principal.";
    case "principal_no_vigente":
      return "El identificador principal debe estar vigente.";
    case "identificador_repetido_en_animal":
      return `El ${tipoIdentificador[m.tipo].toLowerCase()} ${m.valor} está repetido en este animal.`;
    case "identificador_duplicado":
      return `El ${tipoIdentificador[m.tipo].toLowerCase()} ${m.valor} ya lo tiene ${nombreDe(m.otro)}. Dos animales no pueden tener el mismo identificador vigente.`;
    case "fraccion_invalida":
      return "Cada porcentaje de raza debe ser mayor que 0 y como máximo 100.";
    case "raza_repetida":
      return "La misma raza aparece dos veces en la composición.";
    case "suma_distinta_de_100":
      return `Los porcentajes de raza deben sumar 100 %. Ahora suman ${formatearPorcentaje(m.sumaPorcentaje)}.`;
    case "sin_permiso":
      return "Su usuario no tiene permiso para hacer este cambio.";
    case "no_encontrado":
      return "No se encontró el registro: puede que otra persona lo haya retirado.";
    case "dato_obligatorio":
      return `Falta el dato: ${campos[m.campo] ?? m.campo}.`;
    case "fecha_invalida":
      return `La ${campos[m.campo] ?? m.campo} no es una fecha válida.`;
    case "fecha_futura":
      return `La ${campos[m.campo] ?? m.campo} no puede ser posterior a hoy.`;
    case "numero_invalido":
      return `Los ${campos[m.campo] ?? m.campo} deben ser un número entero mayor que cero.`;
    case "sin_nombre_ni_identificador":
      return "Escriba un nombre o agregue al menos un identificador para reconocer al animal.";
    case "nombre_duplicado":
      return `Ya existe «${m.nombre}». Elija otro nombre.`;
    case "pin_invalido":
      return "El PIN debe tener de 4 a 6 números.";
    case "ultimo_propietario":
      return "Debe quedar al menos un usuario propietario.";
    case "no_puede_retirarse_a_si_mismo":
      return "No puede retirar su propio usuario mientras lo está usando.";
    case "lote_con_animales":
      return `El lote tiene ${m.cantidad} animales. Páselos a otro lote antes de retirarlo.`;
  }
}

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
    cambiarUsuario: "Cambiar de usuario",
  },

  comun: {
    cargando: "Cargando…",
    guardando: "Guardando…",
    sinDato: "—",
    sexo,
    estado,
    tipoIdentificador,
    formaConcepcion,
    rol,
    si: "Sí",
    no: "No",
    guardar: "Guardar",
    cancelar: "Cancelar",
    editar: "Editar",
    agregar: "Agregar",
    quitar: "Quitar",
    retirar: "Retirar",
    siguiente: "Siguiente",
    atras: "Atrás",
    todos: "Todos",
    confirmar: "Sí, continuar",
    guardado: "Cambios guardados.",
    edad: (meses: number) =>
      meses < 12
        ? `${meses} ${meses === 1 ? "mes" : "meses"}`
        : `${Math.floor(meses / 12)} ${Math.floor(meses / 12) === 1 ? "año" : "años"}${meses % 12 ? ` y ${meses % 12} m.` : ""}`,
    porcentaje: formatearPorcentaje,
  },

  errores: {
    abrirBase: "No se pudo abrir la base de datos del programa.",
    detalleTecnico: "Detalle técnico (para quien da soporte):",
    operacion: "No se pudo completar la operación.",
    titulo: "No se pudo guardar:",
    motivo,
  },

  asistente: {
    titulo: "Bienvenida a Registro Caprino",
    introduccion:
      "Antes de empezar, registre los datos de su finca y el usuario propietario. Solo se hace una vez y puede cambiarse después en Ajustes.",
    paso: (n: number, total: number) => `Paso ${n} de ${total}`,
    fincaTitulo: "Datos de la finca",
    propietarioTitulo: "Usuario propietario",
    propietarioAyuda:
      "El propietario puede hacer todo: cargar animales, editar la genealogía y cambiar los ajustes. Después podrá crear usuarios operarios.",
    terminar: "Crear y empezar",
  },

  finca: {
    nombre: "Nombre de la finca",
    criadero: "Criadero (nombre del hato)",
    municipio: "Municipio",
    registroSanitario: "Registro sanitario del predio",
    diasGestacion: "Días de gestación",
    diasLactancia: "Días de lactancia",
    ayudaDias: "Valores por defecto: 150 días de gestación y 305 de lactancia. Cámbielos si en su finca son otros.",
  },

  usuario: {
    nombre: "Nombre",
    rol: "Rol",
    contacto: "Contacto (teléfono o correo, opcional)",
    usarPin: "Proteger con un PIN",
    pin: "PIN (de 4 a 6 números)",
    confirmarPin: "Repita el PIN",
    pinesDistintos: "Los dos PIN no coinciden.",
    ayudaPin: "El PIN es opcional. Se guarda cifrado con un hash: no se puede leer en el archivo de datos.",
    ayudaRol: {
      propietario: "Puede hacer todo.",
      operario: "Ve las fichas y registra leche, partos, pesos y tratamientos. No edita la genealogía ni los ajustes.",
    } as Record<Rol, string>,
  },

  sesion: {
    titulo: "¿Quién va a usar el programa?",
    escribaPin: (nombre: string) => `Escriba el PIN de ${nombre}`,
    entrar: "Entrar",
    comprobando: "Comprobando…",
    pinIncorrecto: "El PIN no es correcto. Inténtelo de nuevo.",
    conPin: "Con PIN",
    elegirOtro: "Elegir otro usuario",
    usuarioActual: (nombre: string, rolUsuario: Rol) => `${nombre} · ${rol[rolUsuario]}`,
  },

  inicio: {
    titulo: "Inicio",
    saludo: (nombre: string) => `Hola, ${nombre}.`,
    resumenTitulo: "Su hato hoy",
    activos: "Animales activos",
    hembras: "Hembras",
    machos: "Machos",
    verAnimales: "Ver animales",
    registrarAnimal: "Registrar animal",
    primerosPasosTitulo: "Cómo cargar su hato",
    primerosPasos: [
      "Registre primero los fundadores: los animales cuyos padres no conoce.",
      "Después registre sus crías, eligiendo el padre y la madre. El programa revisa que la genealogía sea posible.",
      "Si un padre o una madre no está confirmado, márquelo como «sin verificar».",
      "Para ver el pedigrí y la consanguinidad, abra la ficha del animal y entre a «Genealogía».",
    ],
    proximamente:
      "En próximas etapas verá aquí las alertas de retiro, los partos próximos, las vacunas por vencer y las hembras en lactancia.",
  },

  animales: {
    titulo: "Animales",
    registrar: "Registrar animal",
    buscar: "Buscar por nombre o identificador",
    filtroSexo: "Sexo",
    filtroEstado: "Estado",
    filtroLote: "Lote",
    incluirGenealogia: "Mostrar también los registrados solo para la genealogía",
    cantidad: (n: number) => (n === 1 ? "1 animal" : `${n} animales`),
    vacio: "No hay animales que coincidan con la búsqueda.",
    vacioSinFiltro: "Todavía no hay animales registrados.",
    sinNombre: "(sin nombre)",
    soloGenealogia: "Solo genealogía",
    columnas: {
      identificador: "Identificador",
      nombre: "Nombre",
      sexo: "Sexo",
      nacimiento: "Nacimiento",
      lote: "Lote",
      estado: "Estado",
    },
  },

  ficha: {
    pestanas: { ficha: "Ficha", genealogia: "Genealogía", historial: "Historial" },
    volver: "← Volver a la lista",
    noExiste: "Este animal no existe o fue retirado.",
    datosTitulo: "Datos",
    identificadoresTitulo: "Identificadores",
    razaTitulo: "Raza",
    sinComposicion: "Composición racial no registrada.",
    sinIdentificadores: "Sin identificadores.",
    campos: {
      sexo: "Sexo",
      nacimiento: "Nacimiento",
      colorSenas: "Color y señas",
      estado: "Estado",
      enHato: "Pertenece al hato",
      libro: "Libro genealógico",
      lote: "Lote",
      formaConcepcion: "Forma de concepción",
      padre: "Padre",
      madre: "Madre",
      observaciones: "Observaciones",
    },
    sinVerificar: "sin verificar",
    columnasIdentificador: { tipo: "Tipo", valor: "Valor", fecha: "Fecha", vigente: "Vigente", principal: "Principal" },
    retirarTitulo: "Retirar la ficha",
    retirarExplicacion:
      "Úselo solo si el animal se registró por error. Si se vendió o murió, edite su estado: así su ficha sigue a la vista. La ficha retirada deja de aparecer en las listas, pero queda guardada en el historial.",
    retirarConHijos: (n: number) =>
      `Atención: este animal es padre o madre de ${n} ${n === 1 ? "animal" : "animales"}; su genealogía quedará incompleta.`,
    retirarConfirmar: "¿Seguro que quiere retirar esta ficha?",
  },

  formulario: {
    tituloNuevo: "Registrar animal",
    tituloEditar: (nombre: string) => `Editar: ${nombre}`,
    datosTitulo: "Datos básicos",
    nombre: "Nombre",
    sexo: "Sexo",
    fechaNacimiento: "Fecha de nacimiento",
    colorSenas: "Color y señas",
    estado: "Estado",
    enHato: "Pertenece al hato",
    enHatoAyuda:
      "Quite la marca si el animal nunca estuvo en la finca y solo lo registra para la genealogía (por ejemplo, los abuelos de una cabra comprada o el macho de una pajilla).",
    fotoTitulo: "Foto",
    elegirFoto: "Elegir foto…",
    quitarFoto: "Quitar foto",
    filtroImagenes: "Imágenes",
    sinFoto: "Sin foto",
    identificadoresTitulo: "Identificadores",
    identificadoresAyuda:
      "Arete, tatuaje, microchip o número de registro de la asociación. Si tiene alguno vigente, marque cuál es el principal.",
    agregarIdentificador: "Agregar identificador",
    tipo: "Tipo",
    valor: "Valor",
    fecha: "Fecha",
    vigente: "Vigente",
    principal: "Principal",
    razaTitulo: "Raza y composición racial",
    razaAyuda: "Escriba el porcentaje de cada raza. Deben sumar 100 %. Puede dejarlo vacío si todavía no lo conoce.",
    agregarRaza: "Agregar raza",
    raza: "Raza",
    porcentaje: "Porcentaje",
    elegirRaza: "Elija una raza…",
    suma: (texto: string) => `Total: ${texto}`,
    registroTitulo: "Registro",
    libro: "Libro genealógico",
    sinLibro: "Sin libro asignado",
    formaConcepcion: "Forma de concepción",
    sinFormaConcepcion: "Sin dato",
    lote: "Lote",
    sinLote: "Sin lote",
    genealogiaTitulo: "Padres",
    genealogiaAyuda: "Déjelos vacíos si no los conoce (por ejemplo, en los fundadores).",
    padre: "Padre",
    madre: "Madre",
    sinVerificar: "Sin verificar",
    buscarAnimal: "Escriba nombre o identificador…",
    ningunResultado: "Ningún animal coincide.",
    observaciones: "Observaciones",
  },

  genealogia: {
    consanguinidadTitulo: "Consanguinidad",
    consanguinidadExplicacion: (generaciones: number) =>
      `Coeficiente de Wright sobre el pedigrí registrado, hasta ${generaciones} generaciones. Los ancestros desconocidos se tratan como no emparentados.`,
    sinConsanguinidad: "No se detecta consanguinidad en el pedigrí registrado.",
    avisoSinVerificar: "El cálculo incluye padres o madres marcados «sin verificar».",
    arbolTitulo: "Árbol genealógico",
    columnas: ["Animal", "Padres", "Abuelos", "Bisabuelos"],
    desconocido: "Desconocido",
    sinVerificar: "Sin verificar",
    ayudaArbol: "Haga clic en un ancestro para ver su propia genealogía.",
    hijosTitulo: "Crías registradas",
    sinHijos: "No tiene crías registradas.",
  },

  historial: {
    vacio: "Sin cambios registrados.",
    columnas: { fecha: "Fecha y hora", cambio: "Qué cambió", antes: "Antes", despues: "Después", usuario: "Usuario" },
    entidades: { animal: "Ficha", identificador: "Identificador", composicion_racial: "Raza" } as Record<string, string>,
    campo: (c: string) => campos[c] ?? c,
  },

  ajustes: {
    titulo: "Ajustes",
    secciones: {
      finca: "Finca",
      usuarios: "Usuarios",
      razas: "Razas",
      libros: "Libros",
      lotes: "Lotes",
      datos: "Base de datos",
    },
    usuariosAgregar: "Agregar usuario",
    usuariosColumnas: { nombre: "Nombre", rol: "Rol", contacto: "Contacto", pin: "PIN", acciones: "Acciones" },
    cambiarPin: "Cambiar PIN",
    quitarPin: "Quitar PIN",
    ponerPin: "Poner PIN",
    retirarUsuarioConfirmar: (nombre: string) => `¿Retirar a ${nombre}? Ya no podrá entrar al programa.`,
    catalogoNuevo: { raza: "Nueva raza", libro: "Nuevo libro" },
    catalogoAyuda: {
      raza: "Las razas no se borran: se desactivan para que no aparezcan al registrar animales.",
      libro: "Los libros no se borran: se desactivan para que no aparezcan al registrar animales.",
    },
    activo: "Activo",
    inactivo: "Inactivo",
    activar: "Activar",
    desactivar: "Desactivar",
    loteNuevo: "Nuevo lote",
    loteDescripcion: "Descripción (opcional)",
    loteAnimales: (n: number) => (n === 1 ? "1 animal" : `${n} animales`),
    datosArchivo: "Archivo de la base de datos",
    datosModoDesarrollo: "Está usando la base de datos de desarrollo, separada de la del programa instalado.",
    datosVersion: "Versión de SQLite",
    datosMigraciones: "Migraciones aplicadas",
    datosPruebaTitulo: "Datos de la prueba técnica (Etapa 1)",
    datosPruebaExplicacion: (n: number) =>
      `Hay ${n} animales creados por la prueba técnica de la Etapa 1. Puede retirarlos (borrado lógico).`,
    datosPruebaRetirar: "Retirar datos de la prueba",
    datosPruebaRetirados: (n: number) => `Se retiraron ${n} animales de prueba.`,
  },

  /** Nombre del parentesco a partir del camino (P = padre, M = madre). */
  parentesco(camino: Camino): string {
    const n = generacion(camino);
    const s = sexoEsperado(camino);
    const lado = linea(camino);
    if (n === 1) return NOMBRES_GENERACION[1][s];
    const nombre = NOMBRES_GENERACION[n]?.[s];
    const adjetivo = s === "macho" ? (lado === "paterna" ? "paterno" : "materno") : lado;
    if (nombre) return `${nombre} ${adjetivo}`;
    return `Ancestro de la ${n}.ª generación, línea ${lado}`;
  },
} as const;
