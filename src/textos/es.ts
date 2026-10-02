// Todos los textos que ve el usuario. Los componentes no escriben textos propios: los toman de aquí.
import type { Motivo } from "../datos/errores";
import { generacion, linea, sexoEsperado, type Camino } from "../dominio/genealogia";
import type { ColumnaCalidad } from "../dominio/calidad-leche";
import type { TipoMovimiento } from "../dominio/finanzas";
import type { Jornada } from "../dominio/leche";
import type { CampoExpediente } from "../dominio/expediente";
import type { TipoPesaje } from "../dominio/pesos";
import type { TipoRetiro, TipoSalud } from "../dominio/salud";
import type { Requisito } from "../dominio/registros";
import type { ResultadoServicio, TipoServicio } from "../dominio/reproduccion";
import type { EstadoAnimal, FormaConcepcion, OrigenAnimal, Rol, Sexo, TipoIdentificador } from "../dominio/tipos";

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
const tipoServicio: Record<TipoServicio, string> = { monta: "Monta", inseminacion: "Inseminación" };
const resultadoServicio: Record<ResultadoServicio, string> = {
  pendiente: "Sin diagnóstico",
  prenada: "Preñada",
  vacia: "Vacía",
  aborto: "Aborto",
};
const jornada: Record<Jornada, string> = { manana: "Mañana", tarde: "Tarde" };
const tipoPesaje: Record<TipoPesaje, string> = { nacimiento: "Nacimiento", destete: "Destete", control: "Control" };
const tipoSalud: Record<TipoSalud, string> = {
  vacuna: "Vacuna",
  desparasitacion: "Desparasitación",
  tratamiento: "Tratamiento",
  condicion_corporal: "Condición corporal",
};
const tipoRetiro: Record<TipoRetiro, string> = { leche: "Leche", carne: "Carne" };

/** 2.5 → «2,5»; con `unidad`, «2,5 kg». */
export function formatearKilos(kilos: number, decimales = 1, unidad = true): string {
  const texto = kilos.toLocaleString("es-CO", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
  return unidad ? `${texto} kg` : texto;
}

/** 3,8 → «3,8»; 3,85 → «3,85»; 450000 → «450.000». Sin ceros de relleno. */
export function formatearNumero(valor: number, maximoDecimales = 2): string {
  return valor.toLocaleString("es-CO", { maximumFractionDigits: maximoDecimales });
}

/**
 * 150000 → «$ 150.000»; −60000 → «−$ 60.000» (el signo se escribe, no depende solo del color). Entre el signo y el número va
 * un espacio que no se parte, para que una columna angosta no deje el «$» solo en una línea.
 */
export function formatearPesos(valor: number): string {
  const redondeado = Math.round(valor);
  const texto = `$\u00a0${Math.abs(redondeado).toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;
  return redondeado < 0 ? `−${texto}` : texto;
}

const dias = (n: number) => (n === 1 ? "1 día" : `${n.toLocaleString("es-CO")} días`);

/** Nombres de los campos, para mensajes y para el historial. */
const campos: Record<string, string> = {
  nombre: "nombre",
  fechaNacimiento: "fecha de nacimiento",
  fecha_nacimiento: "fecha de nacimiento",
  fechaRegistro: "fecha de registro",
  fecha_registro: "fecha de registro",
  consecutivo: "consecutivo",
  version: "versión",
  motivo_anulacion: "motivo de la anulación",
  responsable: "responsable",
  responsable_registros: "responsable que firma",
  criador: "criador",
  propietario: "propietario",
  instantanea: "copia fija de lo emitido",
  prefijo: "prefijo",
  siguiente_numero: "número siguiente",
  digitos_numero: "dígitos del número",
  separador_numero: "separador del número",
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
  hembra_id: "hembra",
  macho_id: "macho",
  pajilla: "pajilla",
  resultado: "resultado",
  fecha_diagnostico: "fecha del diagnóstico",
  fechaDiagnostico: "fecha del diagnóstico",
  fecha_probable_parto: "fecha probable de parto",
  evento_reproductivo_id: "servicio",
  numero_crias: "número de crías",
  parto_id: "parto",
  fecha_inicio: "fecha de inicio",
  fecha_secado: "fecha de secado",
  lactancia_id: "lactancia",
  jornada: "jornada",
  kilos: "kilos",
  edad_meses: "edad en meses",
  producto: "producto",
  numero_registro_ica: "número de registro ICA",
  lote_producto: "lote del producto",
  dosis: "dosis",
  via: "vía",
  fecha_fin: "fecha de fin",
  retiro_leche_dias: "días de retiro de leche",
  retiro_carne_dias: "días de retiro de carne",
  aplicador: "aplicador",
  veterinario: "veterinario",
  condicion_corporal: "condición corporal",
  proxima_fecha: "próxima fecha",
  numero: "número",
  archivo: "archivo",
  origen: "origen",
  contacto_id: "propietario",
  fecha_ingreso: "fecha de ingreso",
  costo: "costo",
  condiciones: "condiciones",
  criadero: "criadero",
  municipio: "municipio",
  telefono: "teléfono",
  correo: "correo",
  notas: "notas",
  margen_gestacion: "margen de la ventana de gestación",
  grasa_pct: "grasa (%)",
  proteina_pct: "proteína (%)",
  celulas_somaticas: "células somáticas",
  categoria_id: "categoría",
  descripcion: "descripción",
  activo: "activo",
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
    case "animal_no_disponible":
      return `${nombreDe(m.otro)} no está disponible: está vendido o muerto, o no pertenece al hato.`;
    case "debe_ser_hembra":
      return `${nombreDe(m.otro)} no es una hembra.`;
    case "debe_ser_macho":
      return `${nombreDe(m.otro)} no es un macho.`;
    case "monta_sin_macho":
      return "Para una monta, elija el macho.";
    case "inseminacion_sin_dato":
      return "Para una inseminación, elija el macho o escriba el código de la pajilla.";
    case "fecha_anterior_al_nacimiento":
      return `La fecha no puede ser anterior al nacimiento de ${nombreDe(m.otro)}.`;
    case "diagnostico_antes_del_servicio":
      return "La fecha del diagnóstico no puede ser anterior a la del servicio.";
    case "resultado_invalido":
      return "Elija el resultado del diagnóstico: preñada, vacía o aborto.";
    case "sin_crias":
      return "Indique al menos una cría.";
    case "kilos_invalidos":
      return "Escriba los kilos con un número mayor que cero (o cero en la leche), por ejemplo 2,5.";
    case "fuera_de_la_lactancia":
      return "La fecha está fuera de esa lactancia.";
    case "lactancia_secada":
      return "Esa lactancia ya está secada.";
    case "pesajes_despues_del_secado":
      return "Hay pesajes de leche después de esa fecha de secado.";
    case "meta_invalida":
      return "La meta necesita una edad en meses (0 o más) y un peso mayor que cero.";
    case "fin_antes_del_inicio":
      return "La fecha de fin no puede ser anterior a la fecha de aplicación.";
    case "proxima_antes_del_inicio":
      return "La próxima fecha debe ser posterior a la fecha de aplicación.";
    case "retiro_invalido":
      return "Los días de retiro deben ser un número entero: 0 o más.";
    case "condicion_invalida":
      return "La condición corporal va de 1 a 5, en pasos de medio punto (por ejemplo 2,5).";
    case "tipo_salud_invalido":
      return "Elija el tipo: vacuna, desparasitación, tratamiento o condición corporal.";
    case "lote_sin_animales":
      return `El lote «${m.lote}» no tiene animales activos.`;
    case "base_no_vacia":
      return "Solo se puede restaurar en un programa recién instalado, sin finca ni animales. Así nunca se borran ni se mezclan datos.";
    case "respaldo_mas_nuevo":
      return "Esta copia la hizo una versión más nueva del programa. Actualice Registro Caprino y vuelva a intentarlo.";
    case "respaldo_danado":
      return "El archivo no es una copia de respaldo de Registro Caprino o está dañado.";
    case "costo_solo_externo":
      return "El costo y las condiciones solo se anotan cuando el macho es de otra finca.";
    case "costo_invalido":
      return "Escriba el costo en pesos, como número entero (por ejemplo 150000), o déjelo vacío.";
    case "padre_no_candidato":
      return "Ese servicio no puede haber dado este parto. Elija uno de la lista o «Padre desconocido».";
    case "elegir_padre":
      return "Hubo servicios con machos distintos cerca de la fecha de la concepción. Elija el padre de las crías o «Padre desconocido».";
    case "externo_sin_propietario":
      return "Elija el propietario del animal o agréguelo como contacto nuevo.";
    case "externo_en_lote":
      return "Un animal de otra finca no puede estar en un lote de esta finca.";
    case "externo_ancestro_de_propio":
      return `No se puede retirar: es ancestro de ${nombreDe(m.otro)}, que es del hato, y su genealogía quedaría incompleta.`;
    case "correo_invalido":
      return "El correo no parece válido. Revíselo (por ejemplo nombre@correo.com) o déjelo vacío.";
    case "contacto_en_uso":
      return `Este contacto es propietario de ${m.cantidad === 1 ? "1 animal" : `${m.cantidad} animales`}. Cámbielos de propietario antes de retirarlo.`;
    case "margen_invalido":
      return "El margen de la ventana de gestación debe ser un número entero de 0 a 60 días.";
    case "registro_incompleto":
      return `No se puede emitir el registro. Falta: ${m.faltantes.map((f) => textos.registros.requisitos[f].toLowerCase()).join(", ")}.`;
    case "animal_no_elegible":
      return "Solo los animales del hato tienen registro propio. Uno de otra finca, o registrado solo para la genealogía, no.";
    case "registro_ya_vigente":
      return "Este animal ya tiene un registro vigente. Para corregirlo, reemítalo; para empezar de nuevo, anúlelo primero.";
    case "registro_no_emitido":
      return "Ese registro todavía no está emitido.";
    case "registro_no_borrador":
      return "Un registro emitido no se edita. Para corregirlo, reemítalo.";
    case "registro_anulado":
      return "Ese registro está anulado y ya no cambia. Su número no se vuelve a usar.";
    case "registro_libro_distinto":
      return "El animal ahora está en otro libro. Anule este registro y emita uno nuevo en ese libro: el número pertenece al libro donde se emitió.";
    case "motivo_anulacion_obligatorio":
      return "Escriba el motivo de la anulación.";
    case "formato_numero_invalido":
      return m.campo === "prefijo"
        ? "El prefijo debe tener de 1 a 8 letras o números, sin espacios ni símbolos."
        : m.campo === "digitos"
          ? "La cantidad de dígitos del número debe ser un entero de 1 a 8."
          : "El separador solo puede ser un guion o ninguno.";
    case "prefijo_repetido":
      return `El prefijo ${m.prefijo} ya lo usa otro libro. Elija uno distinto.`;
    case "libro_con_registros":
      return "Este libro ya tiene registros: su prefijo y su formato no se pueden cambiar. Los números emitidos no se modifican.";
    case "numero_inicial_invalido":
      return "El número inicial debe ser un entero mayor que cero, y solo se puede cambiar mientras el libro no tenga registros.";
    case "grasa_invalida":
      return "La grasa debe ser un porcentaje de 0 a 100, por ejemplo 3,8. Déjela vacía si no la midió.";
    case "proteina_invalida":
      return "La proteína debe ser un porcentaje de 0 a 100, por ejemplo 3,2. Déjela vacía si no la midió.";
    case "celulas_invalidas":
      return "Las células somáticas deben ser un número entero, por ejemplo 450000 (también puede escribir 450.000). Déjelas vacías si no las midió.";
    case "calidad_sin_kilos":
      return "Anote los kilos de esta cabra para guardar también la calidad de su leche.";
    case "valor_invalido":
      return "Escriba el valor en pesos como un número entero mayor que cero, por ejemplo 150000.";
    case "categoria_otro_tipo":
      return "La categoría no corresponde: un ingreso lleva una categoría de ingreso y un gasto, una de gasto.";
    case "categoria_inactiva":
      return "Esa categoría está desactivada. Elija otra o vuelva a activarla en Categorías.";
    case "animal_y_lote":
      return "Un movimiento va a un animal o a un lote, no a los dos. Si es de toda la finca, déjelos vacíos.";
    case "periodo_invalido":
      return "El periodo no es válido. Revise las fechas: la primera no puede ser posterior a la segunda.";
    case "movimiento_animal_no_elegible":
      return `${nombreDe(m.otro)} no es un animal del hato: los movimientos solo se asignan a animales de esta finca.`;
    case "servicio_sin_costo":
      return "Este servicio no tiene un costo anotado.";
    case "gasto_ya_registrado":
      return "El costo de este servicio ya se anotó como gasto.";
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
    reproduccion: "Reproducción",
    leche: "Leche",
    pesos: "Pesos",
    salud: "Salud",
    documentos: "Documentos",
    registros: "Registros",
    finanzas: "Finanzas",
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
    tipoServicio,
    resultadoServicio,
    jornada,
    tipoPesaje,
    tipoSalud,
    tipoRetiro,
    kilos: formatearKilos,
    dias,
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
    /** 150000 → «$ 150.000»; los valores negativos llevan el signo menos. */
    pesos: formatearPesos,
    numero: formatearNumero,
    origen: { nacido_aqui: "Nacido en la finca", comprado: "Comprado", externo: "De otra finca" } as Record<OrigenAnimal, string>,
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
    margenGestacion: "Margen de la gestación (días)",
    ayudaMargen:
      "Al registrar un parto, los servicios hechos entre la gestación menos y más este margen pueden ser el padre. Si hay machos distintos, el programa avisa. Valor provisional: 10.",
  },

  usuario: {
    nombre: "Nombre",
    rol: "Rol",
    contacto: "Contacto (teléfono o correo, opcional)",
    usarPin: "Proteger con un PIN",
    pin: "PIN (de 4 a 6 números)",
    confirmarPin: "Repita el PIN",
    pinesDistintos: "Los dos PIN no coinciden.",
    ayudaPin: "El PIN es opcional. Se guarda cifrado: nadie puede leerlo en el archivo de datos.",
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
    enLactancia: "En lactancia",
    partosProximosTitulo: "Partos próximos",
    partosProximosVacio: "No hay partos esperados en los próximos 30 días.",
    lactanciaTitulo: "Hembras en lactancia",
    lactanciaVacio: "No hay hembras en lactancia.",
    abrirOrdeno: "Abrir el ordeño",
    retirosTitulo: "Alertas de retiro vigentes",
    retirosVacio: "No hay retiros de leche ni de carne vigentes.",
    vacunasTitulo: "Vacunas y desparasitaciones por vencer",
    vacunasVacio: "No hay vacunas ni desparasitaciones pendientes en los próximos 30 días.",
    verSalud: "Ir a Salud",
  },

  reproduccion: {
    titulo: "Reproducción",
    secciones: { servicios: "Servicios", proximos: "Partos próximos", intervalos: "Abortos e intervalos" },
    nuevoServicio: "Registrar servicio",
    hembra: "Hembra",
    tipo: "Tipo de servicio",
    macho: "Macho",
    pajilla: "Código de la pajilla",
    pajillaAyuda: "Si el macho donante no está registrado, escriba solo el código de la pajilla.",
    fecha: "Fecha del servicio",
    observaciones: "Observaciones (opcional)",
    fppAyuda: (dias: number) => `La fecha probable de parto se calcula sumando ${dias} días de gestación (Ajustes → Finca).`,
    servicioGuardado: (fpp: string) => `Servicio guardado. Fecha probable de parto: ${fpp}.`,
    soloPendientes: "Mostrar solo los que esperan diagnóstico",
    vacio: "Todavía no hay servicios registrados.",
    columnas: {
      fecha: "Servicio",
      hembra: "Hembra",
      tipo: "Tipo",
      macho: "Macho o pajilla",
      resultado: "Resultado",
      fpp: "Parto probable",
      acciones: "",
    },
    diagnosticar: "Diagnóstico",
    diagnosticoTitulo: (hembra: string) => `Diagnóstico de ${hembra}`,
    resultado: "Resultado",
    fechaDiagnostico: "Fecha del diagnóstico",
    diagnosticoAyuda: "Use «Aborto» si la hembra estaba preñada y perdió la gestación.",
    proximosAyuda: "Hembras preñadas o sin diagnóstico cuya fecha probable de parto cae entre hace 15 días y dentro de 30.",
    proximosVacio: "No hay partos esperados en este período.",
    faltan: (n: number) => (n === 0 ? "hoy" : n > 0 ? `en ${dias(n)}` : `atrasado ${dias(-n)}`),
    registrarParto: "Registrar parto",
    abortosTitulo: "Abortos registrados",
    abortosVacio: "No hay abortos registrados.",
    intervalosTitulo: "Intervalo entre partos",
    intervalosAyuda: "Días entre un parto y el siguiente de cada hembra. Solo aparecen las hembras con dos o más partos.",
    intervalosVacio: "Ninguna hembra tiene todavía dos partos registrados.",
    intervalosColumnas: { hembra: "Hembra", partos: "Partos", ultimo: "Último intervalo", promedio: "Promedio" },
    sinMacho: "Sin macho registrado",
    machoSoloGenealogia: "solo genealogía",
    procedencia: "¿De dónde es el macho?",
    procedencias: { hato: "Del hato", otra_finca: "De otra finca", pajilla: "Solo pajilla (donante sin registrar)" },
    machoOtraFinca: "Macho de otra finca",
    sinMachosOtraFinca: "No hay machos de otras fincas. Regístrelos en Animales → De otras fincas.",
    costo: "Costo acordado (pesos, opcional)",
    costoAyuda: "Por ejemplo 150000. Al guardar, el programa le ofrecerá anotarlo como gasto.",
    condiciones: "Condiciones con el dueño (opcional)",
    condicionesAyuda: "Lo acordado: forma de pago, repetición si queda vacía, entrega de crías…",
    otraFinca: "Otra finca",
  },

  parto: {
    titulo: "Registrar parto",
    hembra: "Madre",
    fecha: "Fecha del parto",
    numeroCrias: "Número de crías",
    observaciones: "Observaciones (opcional)",
    padreTitulo: "Padre de las crías",
    padreDelServicio: (padre: string, fecha: string) => `${padre}, del servicio del ${fecha} (diagnóstico: preñada).`,
    padrePajilla: (pajilla: string, fecha: string) =>
      `Inseminación del ${fecha} con la pajilla ${pajilla}: el macho no está registrado, así que el padre quedará vacío y «sin verificar».`,
    sinServicio:
      "No hay un servicio con diagnóstico «preñada» antes de esta fecha: el padre quedará vacío y «sin verificar». Podrá completarlo después en la ficha de cada cría.",
    criasTitulo: "Crías",
    criasAyuda:
      "Cada cría tendrá su ficha con la madre asignada. Escriba un nombre o un arete para reconocerla. El libro genealógico queda vacío para que lo asigne el propietario.",
    cria: (n: number) => `Cría ${n}`,
    sexo: "Sexo",
    nombre: "Nombre",
    arete: "Arete",
    peso: "Peso al nacer (kg)",
    nacioMuerta: "Nació muerta",
    lactanciaAviso: "Al guardar se abre la lactancia de la madre. Si tenía otra abierta, se seca el día anterior al parto.",
    guardar: "Guardar parto",
    guardado: (n: number) => `Parto guardado: se ${n === 1 ? "creó 1 ficha" : `crearon ${n} fichas`} y se abrió la lactancia.`,
    verCria: "Ver ficha",
    emitirCertificado: "Emitir certificado interno",
    otraVez: "Registrar otro parto",
    elegirHembra: "Elija la madre…",
    deOtraFinca: (propietario?: string) => (propietario ? `de otra finca: ${propietario}` : "de otra finca"),
    servicioDel: (fecha: string, resultado: string) => `servicio del ${fecha} (${resultado})`,
    incierta: (desde: string, hasta: string) =>
      `Paternidad incierta: entre el ${desde} y el ${hasta} hubo servicios con machos distintos, y cualquiera puede ser el padre. Elija el padre de las crías.`,
    padreDesconocido: "Padre desconocido (dejarlo vacío)",
    marcarSinVerificar: "Marcar el padre «sin verificar»",
  },

  leche: {
    titulo: "Leche",
    secciones: { ordeno: "Ordeño", lactancias: "Lactancias", calidad: "Calidad" },
    fecha: "Fecha",
    jornada: "Jornada",
    ordenoAyuda:
      "Escriba los kilos de cada cabra y presione Enter: se guarda y pasa a la siguiente. Si vuelve a escribir un valor, se corrige el anterior.",
    ordenoVacio: "No hay hembras en lactancia en esta fecha. Las lactancias se abren al registrar un parto.",
    columnas: {
      animal: "Cabra",
      dia: "Día",
      anterior: "Anterior",
      kilos: "Kilos",
      estado: "",
      retiro: "Retiro",
    },
    anteriorAyuda: "Último pesaje de la misma jornada.",
    ordenoCalidad: {
      activar: "Anotar también la calidad de la leche (opcional)",
      ayuda:
        "Grasa y proteína en porcentaje (por ejemplo 3,8) y células somáticas por mililitro (por ejemplo 450000). Todo es opcional: lo que deje vacío no cuenta en los promedios. Enter guarda la fila.",
      columnas: { grasa: "Grasa (%)", proteina: "Proteína (%)", celulas: "Células somáticas (por ml)" },
    },
    calidad: {
      ayuda:
        "Compara las cabras por lactancia. Cada promedio usa solo las muestras donde ese dato se anotó: lo que está vacío no cuenta, ni siquiera como cero. Haga clic en el título de una columna para ordenar.",
      vacio: "No hay lactancias para comparar.",
      sinMuestras: "Todavía no hay muestras de calidad. Anótelas en Ordeño, marcando «Anotar también la calidad de la leche».",
      columnas: {
        hembra: "Hembra",
        inicio: "Parto",
        grasa: "Grasa (%)",
        proteina: "Proteína (%)",
        celulas: "Células somáticas (por ml)",
      },
      muestras: (n: number) => (n === 1 ? "1 muestra" : `${n} muestras`),
      sinDato: "Sin datos",
      ordenarPor: (columna: string) => `Ordenar por ${columna.toLowerCase()}`,
      graficoTitulo: "Gráfico de la comparación",
      graficoElegir: "Dato que se compara",
      graficoDescripcion: (dato: string, n: number) => `${dato}: promedio de cada lactancia, de mayor a menor (${n === 1 ? "1 cabra" : `${n} cabras`}).`,
      graficoLimite: (n: number) => `Se muestran las ${n} con el valor más alto; la tabla de arriba trae todas.`,
      graficoVacio: "Ninguna cabra tiene todavía este dato.",
      datos: { grasa: "Grasa", proteina: "Proteína", celulas: "Células somáticas" } as Record<ColumnaCalidad, string>,
      unidades: { grasa: "%", proteina: "%", celulas: "células por ml" } as Record<ColumnaCalidad, string>,
    },
    guardado: "Guardado",
    guardando: "Guardando…",
    progreso: (anotadas: number, total: number) => `${anotadas} de ${total} anotadas`,
    total: (kilos: string) => `Total de la jornada: ${kilos}`,
    soloAbiertas: "Mostrar solo las lactancias en curso",
    lactanciasVacio: "No hay lactancias registradas.",
    lactanciasColumnas: {
      hembra: "Hembra",
      inicio: "Parto",
      secado: "Secado",
      dias: "Días",
      acumulado: "Acumulado",
      promedio: "Promedio diario",
      proyeccion: "Proyección",
    },
    enCurso: "En curso",
    sinPesajes: "Sin pesajes",
    verDetalle: "Ver",
    detalleTitulo: (hembra: string) => `Lactancia de ${hembra}`,
    volver: "← Volver a las lactancias",
    resumen: {
      inicio: "Inicio (parto)",
      secado: "Secado",
      diaActual: "Día del último registro",
      acumulado: "Acumulado",
      promedio: (n: number) => `Promedio de los últimos ${n === 1 ? "día" : `${n} días`} con registro`,
      restantes: "Días que faltan",
      proyeccion: (diasLactancia: number) => `Proyección a ${diasLactancia} días`,
      calidad: (dato: string, n: number) => `${dato} (promedio de ${n === 1 ? "1 muestra" : `${n} muestras`})`,
    },
    muestrasTitulo: "Muestras de calidad",
    muestrasAyuda: "Los datos que no se anotaron aparecen vacíos y no cuentan en el promedio.",
    formula: (diasLactancia: number) =>
      `Proyección = acumulado + promedio diario de los últimos 7 días con registro × días que faltan hasta el día ${diasLactancia}. Es una estimación: supone que la cabra sigue dando lo mismo que en su última semana.`,
    curvaTitulo: "Curva de lactancia",
    curvaDescripcion: (n: number) => `Kilos por día (mañana más tarde) en ${dias(n)} con registro.`,
    curvaLeyendaLinea: "Producción registrada",
    curvaLeyendaPromedio: "Promedio que usa la proyección, hasta el final de la lactancia",
    curvaEjeX: "Día de lactancia",
    curvaEjeY: "kg por día",
    curvaVacia: "La curva aparecerá cuando haya pesajes.",
    pesajesTitulo: "Pesajes",
    secarTitulo: "Secar la lactancia",
    secarAyuda: "Anote la fecha en que dejó de ordeñarla. Después no se podrán anotar pesajes posteriores a esa fecha.",
    fechaSecado: "Fecha de secado",
    secar: "Secar",
    secada: (fecha: string) => `Lactancia secada el ${fecha}.`,
  },

  pesos: {
    titulo: "Pesos",
    secciones: { registrar: "Registrar pesaje", metas: "Metas por edad" },
    animal: "Animal",
    fecha: "Fecha",
    kilos: "Peso (kg)",
    tipo: "Tipo de pesaje",
    guardar: "Guardar pesaje",
    guardado: (animal: string, kilos: string) => `Pesaje guardado: ${animal}, ${kilos}.`,
    recientesTitulo: "Últimos pesajes",
    recientesVacio: "Todavía no hay pesajes.",
    columnas: {
      fecha: "Fecha",
      animal: "Animal",
      tipo: "Tipo",
      kilos: "Peso",
      edad: "Edad",
      ganancia: "Ganancia diaria",
      meta: "Meta para la edad",
      diferencia: "Frente a la meta",
    },
    gananciaAyuda: "Ganancia diaria = diferencia de peso ÷ días entre un pesaje y el anterior.",
    gananciaPorDia: (gramos: number) => `${Math.round(gramos).toLocaleString("es-CO")} g/día`,
    sobreMeta: (texto: string) => `+${texto} sobre la meta`,
    bajoMeta: (texto: string) => `${texto} bajo la meta`,
    sinMeta: "Sin meta para esa edad",
    metasAyuda:
      "Escriba el peso esperado para cada sexo y edad (en meses). Entre dos metas, el programa calcula la meta de cada día en línea recta. Fuera del rango anotado no compara.",
    metasVacio: "Todavía no hay metas.",
    metasColumnas: { sexo: "Sexo", edad: "Edad (meses)", kilos: "Peso meta" },
    metaNueva: "Agregar o cambiar una meta",
    metaEdad: "Edad (meses)",
    metaKilos: "Peso meta (kg)",
    metasSoloPropietario: "Solo el propietario puede cambiar las metas.",
    fichaVacio: "Sin pesajes registrados.",
    registrarEnFicha: "Registrar pesaje",
  },

  animales: {
    titulo: "Animales",
    registrar: "Registrar animal",
    buscar: "Buscar por nombre o identificador",
    filtroSexo: "Sexo",
    filtroEstado: "Estado",
    filtroLote: "Lote",
    vistas: { hato: "Del hato", externos: "De otras fincas", contactos: "Contactos" },
    registrarExterno: "Registrar animal de otra finca",
    externosAyuda:
      "Machos y hembras que no son de la finca: sementales de otros criaderos y ancestros de sus animales. Aparecen en la genealogía, pero no en el inventario, el ordeño ni las alertas.",
    externosVacio: "Todavía no hay animales de otras fincas registrados.",
    sinPropietario: "Sin propietario registrado",
    deOtraFinca: "De otra finca",
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
      propietario: "Propietario",
    },
  },

  contactos: {
    ayuda:
      "Propietarios de los animales de otras fincas. Son datos personales de otras personas: anote solo lo necesario. Nunca se publican.",
    ayudaDatos: "Solo el nombre es obligatorio.",
    nuevo: "Nuevo contacto",
    nuevoTitulo: "Nuevo contacto",
    editarTitulo: "Editar contacto",
    campos: {
      nombre: "Nombre",
      criadero: "Criadero o finca",
      municipio: "Municipio",
      telefono: "Teléfono",
      correo: "Correo",
      notas: "Notas",
    },
    animales: "Animales",
    vacio: "Todavía no hay contactos.",
    guardado: "Contacto guardado.",
    retirar: "Retirar",
    retirado: (nombre: string) => `Se retiró a ${nombre}.`,
  },

  salud: {
    titulo: "Salud",
    secciones: { registrar: "Registrar", calendario: "Próximas fechas", retiros: "Retiros vigentes", historial: "Historial" },
    destino: "Aplicar a",
    destinoAnimal: "Un animal",
    destinoLote: "Un lote",
    animal: "Animal",
    lote: "Lote",
    elegirLote: "Elija un lote…",
    loteAyuda: (n: number) =>
      `Se anotará en cada uno de los ${n} animales activos del lote. Los que entren después al lote no quedan con este retiro.`,
    tipo: "Tipo",
    producto: "Producto (nombre comercial)",
    numeroRegistroIca: "Número de registro ICA del producto",
    loteProducto: "Lote del producto",
    dosis: "Dosis",
    via: "Vía de aplicación",
    viaAyuda: "Por ejemplo: intramuscular, subcutánea, oral, intramamaria.",
    fechaInicio: "Fecha de aplicación (o de inicio)",
    fechaFin: "Fecha de fin (si dura varios días)",
    retiroLeche: "Retiro de leche (días)",
    retiroCarne: "Retiro de carne (días)",
    retiroAyuda: "Lo indica la etiqueta del producto. Deje vacío o 0 si no tiene retiro.",
    aplicador: "Quién lo aplicó",
    veterinario: "Veterinario que lo formuló",
    proximaFecha: "Próxima aplicación",
    proximaAyuda: "Para el calendario de vacunas y desparasitaciones.",
    condicionCorporal: "Condición corporal (1 a 5)",
    condicionAyuda: "1 = muy flaca, 3 = ideal, 5 = muy gorda. Admite medios puntos (2,5).",
    observaciones: "Observaciones (opcional)",
    camposIca: "Datos del Registro de Tratamientos del ICA",
    camposIcaAyuda:
      "El ICA (Res. 20148 de 2016) pide producto, registro ICA, lote, dosis, vía, animal, fechas, retiro y veterinario. Si aplica a su aprisco está por confirmar; el programa los guarda todos.",
    guardar: "Guardar",
    guardado: (n: number) => (n === 1 ? "Guardado." : `Guardado en ${n} animales.`),
    retiroHasta: (tipo: string, fecha: string) => `${tipo}: retiro hasta el ${fecha}`,
    calendarioAyuda: "Vacunas y desparasitaciones con próxima fecha en los próximos 30 días, y las ya vencidas.",
    calendarioVacio: "No hay vacunas ni desparasitaciones pendientes en los próximos 30 días.",
    vencida: "Vencida",
    retirosAyuda: "Animales tratados cuya leche o carne no se puede vender todavía. La alerta dura hasta el último día del retiro, incluido.",
    retirosVacio: "No hay retiros vigentes.",
    historialVacio: "No hay eventos de salud registrados.",
    columnas: {
      fecha: "Fecha",
      animal: "Animal",
      lote: "Lote",
      tipo: "Tipo",
      producto: "Producto",
      detalle: "Dosis y vía",
      retiro: "Retiro",
      hasta: "Hasta",
      proxima: "Próxima fecha",
      registroIca: "Registro ICA",
      veterinario: "Veterinario",
      condicion: "Condición",
    },
    retirar: "Retirar",
    retirarConfirmar: "¿Retirar este registro? Úselo solo si se anotó por error.",
    lecheRetenida: (fecha: string) => `Leche retenida hasta el ${fecha}`,
    lecheRetenidaAyuda: (productos: string) => `Tratamiento: ${productos}. Pese la leche, pero no la venda.`,
    alertaFicha: "Retiro vigente",
    fichaVacio: "Sin eventos de salud.",
    registrarEnFicha: "Registrar evento de salud",
  },

  documentos: {
    titulo: "Documentos",
    secciones: { certificado: "Certificado interno", expediente: "Expediente para ANCO", emitidos: "Emitidos", respaldo: "Copia de respaldo" },
    animal: "Animal",
    elegirAnimal: "Elija el animal",
    certificadoAyuda:
      "Registro interno del criadero con los datos del animal y su ascendencia hasta abuelos. No reemplaza el certificado de ANCO.",
    expedienteAyuda:
      "Reúne los datos que ANCO suele pedir para registrar un animal, en PDF y CSV (hoja de cálculo). Revise los campos que faltan antes de entregarlo.",
    generarCertificado: "Generar certificado (PDF)",
    generarExpediente: "Generar expediente (PDF y CSV)",
    generando: "Generando…",
    faltanTitulo: "Campos que faltan",
    faltanAyuda: "Puede generar el expediente igual; los campos vacíos quedan en blanco. Complételos en la ficha del animal.",
    nadaFalta: "Están todos los campos de R13.",
    avisoSinVerificar: (campo: string) => `${campo}: el vínculo está marcado «sin verificar».`,
    guardadoEn: (ruta: string) => `Documento guardado en: ${ruta}`,
    guardadoInterno: (numero: string) => `Documento ${numero} generado y registrado.`,
    sinCopia: "No eligió dónde guardar una copia; el documento queda en la carpeta de datos del programa.",
    emitidosVacio: "Todavía no se ha emitido ningún documento.",
    emitidosColumnas: { fecha: "Fecha", numero: "Número", tipo: "Tipo", animal: "Animal", archivo: "Archivo" },
    tipoDocumento: { propio: "Certificado interno", asociacion: "Expediente para ANCO", registro_propio: "Certificado de registro propio" } as Record<"propio" | "asociacion" | "registro_propio", string>,
    soloPropietario: "Solo el propietario puede emitir documentos.",
    guardarCopia: (formato: string) => `Guardar una copia del ${formato}…`,
    filtroPdf: "Documento PDF",
    filtroCsv: "Hoja de cálculo CSV",
  },

  registros: {
    pantalla: {
      titulo: "Registros",
      soloPropietario: "Solo el propietario ve y maneja los registros genealógicos.",
      secciones: { registros: "Registros", verificacion: "Lista de verificación", libro: "Libro genealógico", configuracion: "Configuración" } as Record<
        "registros" | "verificacion" | "libro" | "configuracion",
        string
      >,
      ayuda:
        "El libro propio del criadero. Cada registro emitido recibe un número consecutivo de su libro y una copia fija de los datos del animal y de su pedigrí. El número nunca se vuelve a usar, ni siquiera si el registro se anula.",
      filtros: {
        buscar: "Buscar por nombre, identificador o número",
        libro: "Libro",
        raza: "Raza",
        desde: "Registrados desde",
        hasta: "Hasta",
        estado: "Estado",
      },
      columnas: {
        numero: "Número",
        animal: "Animal",
        libro: "Libro",
        estado: "Estado",
        version: "Versión",
        fecha: "Fecha de registro",
        registro: "Registro",
        requisitos: "Requisitos",
      },
      sinNumero: "Sin número",
      cantidad: (n: number) => (n === 1 ? "1 registro" : `${n} registros`),
      vacio: "Todavía no hay registros. Emita el primero desde la lista de verificación o desde la ficha de un animal.",
      vacioFiltro: "Ningún registro coincide con esos filtros.",
      cumple: "cumple",
      exento: "no se exige",
      falta: "Falta",
      cumpleTodo: "Cumple todo",
      corregir: "Corregir",
      detalle: {
        titulo: (numero?: string) => (numero ? `Registro ${numero}` : "Borrador de registro"),
        animal: "Animal",
        libro: "Libro",
        fechaRegistro: "Fecha de registro",
        responsable: "Responsable que firma",
        observaciones: "Observaciones",
        motivo: "Motivo de la anulación",
        borradorAyuda: "Un borrador todavía no tiene número: lo recibe al emitirse, y descartarlo no deja ningún hueco en la numeración.",
        borradorGuardado: "Borrador guardado.",
        guardarBorrador: "Guardar borrador",
        descartar: "Descartar borrador",
        descartarConfirmar: "¿Descartar este borrador?",
        borradorDescartado: "Borrador descartado.",
        emitir: "Emitir registro",
        trabajando: "Trabajando…",
        editar: "Editar borrador",
        certificadoTitulo: "Certificado de registro propio",
        certificadoAyuda:
          "El certificado se arma con la copia fija de lo emitido, no con los datos de hoy. Para corregirlo, reemita el registro.",
        cuatroGeneraciones: "Pedigrí de cuatro generaciones (en lugar de tres)",
        generarCertificado: "Generar certificado en PDF",
        certificadoGuardado: (numero: string, version: number) => `Certificado ${numero} (versión ${version}) guardado en la carpeta de datos del programa.`,
        emitido: (numero: string) => `Se emitió el registro ${numero} y se guardó su certificado.`,
        reemitir: "Reemitir (versión nueva)",
        reemitido: (numero: string, version: number) => `Se reemitió el registro ${numero}: ahora está en la versión ${version}.`,
        reemitirAyuda:
          "Reemitir crea una versión nueva con el mismo número y los datos de hoy; la versión anterior queda en el historial. Si el animal cambió de libro, se anula y se emite uno nuevo.",
        anular: "Anular registro",
        anularAyuda: "El registro queda anulado con su número y su historial. Ese número no se vuelve a usar.",
        motivoAnulacion: "Motivo de la anulación",
        confirmarAnular: "Confirmar anulación",
        anulado: (numero: string) => `Se anuló el registro ${numero}.`,
        documentosTitulo: "Certificados guardados",
        sinDocumentos: "Todavía no se ha guardado ningún certificado de este registro.",
        historialTitulo: "Historial del registro",
        copiaAnterior: "Versión anterior (conservada)",
        copiaNueva: "Versión nueva",
        valor: (campo: string, valor?: string) => {
          if (!valor) return "—";
          if (campo === "estado") return textos.registros.estados[valor as "borrador" | "emitido" | "anulado"] ?? valor;
          if (campo === "fecha_registro") return valor.split("-").reverse().join("/");
          return valor;
        },
      },
      verificacion: {
        ayuda:
          "Todos los animales del hato y lo que le falta a cada uno para emitir su registro. Los animales de otras fincas no tienen registro propio.",
        buscar: "Buscar por nombre o identificador",
        libro: "Libro",
        mostrar: "Mostrar",
        situaciones: {
          listos: "Listos para registrar",
          faltantes: "Con requisitos pendientes",
          con_registro: "Con registro",
          sin_registro: "Sin registro",
        } as Record<"listos" | "faltantes" | "con_registro" | "sin_registro", string>,
        vacio: "No hay animales con esos filtros.",
        seleccionarListos: (n: number) => `Elegir los que cumplen (${n})`,
        quitarSeleccion: "Quitar la selección",
        emitirSeleccionados: (n: number) => `Emitir los elegidos (${n})`,
        confirmar: (n: number) =>
          `Se emitirán los registros de los ${n} animales elegidos que cumplan, con su número consecutivo. Los que no cumplan se mostrarán con lo que les falta, sin gastar números. Un número emitido no se puede cambiar después. ¿Continuar?`,
        si: "Sí, emitir",
        emitiendo: "Emitiendo…",
        cantidad: (n: number, listos: number) => `${n} animales, ${listos} listos para emitir.`,
        elegir: "Elegir",
        columnas: { animal: "Animal", libro: "Libro", registro: "Registro", requisitos: "Requisitos" },
        sinRegistro: "Sin registro",
        yaEmitido: "Ya tiene registro emitido",
        resultado: {
          emitidos: (n: number, certificados: number) => `Se emitieron ${n} registros y se guardaron ${certificados} certificados.`,
          ninguno: "No se emitió ningún registro: nadie de los elegidos cumple todos los requisitos.",
          rechazados: (n: number) => `${n} sin emitir:`,
          motivos: { ya_registrado: "ya tiene un registro vigente", no_elegible: "no es un animal del hato" } as Record<"ya_registrado" | "no_elegible", string>,
        },
      },
      libro: {
        ayuda:
          "El libro sale de los registros emitidos, con los datos del momento en que se emitieron. Puede filtrarlo y exportarlo a PDF o a Excel.",
        incluirAnulados: "Incluir los registros anulados (marcados como tales)",
        exportarPdf: "Exportar a PDF…",
        exportarExcel: "Exportar a Excel…",
        filtroExcel: "Hoja de cálculo de Excel",
      },
      configuracion: {
        certificadoTitulo: "Datos del certificado",
        certificadoAyuda: "Lo que aparece en el certificado de registro propio. Los cambios valen para los registros que se emitan o reemitan desde ahora.",
        criador: "Criador",
        criadorAyuda: "Por defecto, el propietario de la finca.",
        propietario: "Propietario",
        propietarioAyuda: "Por defecto, el propietario de la finca.",
        responsable: "Responsable que firma",
        responsableAyuda: "Su nombre sale debajo de la línea de firma. Si lo deja vacío, sale el de quien emite.",
        criaderoActual: (finca: string, criadero?: string, municipio?: string) =>
          `Finca: ${finca}. Criadero: ${criadero ?? "sin escribir"}${municipio ? `. Municipio: ${municipio}` : ""}.`,
        cambiarCriadero: "Cambiar en Ajustes → Finca",
        guardado: "Guardado.",
        librosTitulo: "Números de cada libro",
        librosAyuda:
          "Cada libro tiene su prefijo y su numeración. El número es el prefijo, un separador y el consecutivo, por ejemplo PPE-0001. Mientras un libro no tenga registros puede cambiar su prefijo, su formato y el número desde el que empieza; después, los números emitidos no se tocan.",
        bloqueado: (n: number) => `Este libro ya tiene ${n === 1 ? "1 registro" : `${n} registros`} con número: su formato no se puede cambiar.`,
        prefijo: "Prefijo",
        prefijoAyuda: "De 1 a 8 letras o números, sin espacios.",
        separador: "Separador",
        conGuion: "Con guion (PPE-0001)",
        sinSeparador: "Sin separador (PPE0001)",
        digitos: "Dígitos del número",
        digitosAyuda: "Ceros a la izquierda (1 a 8).",
        inicio: "Empieza en el número",
        inicioAyuda: "Útil si ya llevaba un libro en papel.",
        siguienteEs: "Es el siguiente que se asignará.",
        ejemplo: (numero: string) => `Así se verá el próximo número: ${numero}`,
        sinPrefijo: "Escriba un prefijo para poder emitir registros en este libro.",
      },
      animal: {
        noElegible: "Solo los animales del hato tienen registro propio.",
        ayuda: "Registro genealógico propio de este animal. Para emitirlo debe cumplir todos los requisitos de la lista.",
        verificacionTitulo: "Lista de verificación",
        todoListo: "Cumple todos los requisitos: se puede emitir su registro.",
        faltaAlgo: "Todavía no se puede emitir: corrija lo que falta.",
        emitir: "Emitir registro",
        trabajando: "Emitiendo…",
        emitido: (numero: string) => `Se emitió el registro ${numero} y se guardó su certificado.`,
        crearBorrador: "Crear borrador",
        borradorCreado: "Borrador creado. Todavía no tiene número.",
        anuladosTitulo: "Registros anulados de este animal",
      },
    },
    // Certificado de registro propio (R31). No usa el nombre, el logo ni el diseño del certificado de ANCO.
    certificado: "Certificado de registro propio",
    aviso: "Registro propio del criadero. No es el certificado oficial de ANCO.",
    numero: "Número de registro",
    version: (n: number) => `Versión ${n}`,
    reemplaza: (anterior: number) => `Reemplaza a la versión ${anterior}.`,
    fechaRegistro: "Fecha de registro",
    fechaEmision: "Fecha de emisión",
    libro: "Libro",
    datosTitulo: "Datos del animal",
    criador: "Criador",
    propietario: "Propietario",
    criadero: "Criadero",
    finca: "Finca",
    municipio: "Municipio",
    observaciones: "Observaciones",
    pedigriTitulo: (generaciones: number) => `Pedigrí de ${generaciones === 4 ? "cuatro" : "tres"} generaciones`,
    firma: "Firma del responsable",
    responsable: "Responsable",
    emitidoPor: "Emitido por",
    registroAsociacion: "Registro de asociación",
    otraFinca: (propietario: string) => `Otra finca: ${propietario}`,
    sinVerificar: "Sin verificar",
    desconocido: "Desconocido",
    identificadores: "Identificadores",
    consanguinidad: "Consanguinidad (Wright)",
    pagina: (actual: number, total: number) => `Página ${actual} de ${total}`,
    generadoCon: "Generado con Registro Caprino",
    generaciones: { 3: "Tres generaciones", 4: "Cuatro generaciones" },
    animal: "Animal",
    padres: "Padres",
    abuelos: "Abuelos",
    bisabuelos: "Bisabuelos",
    tatarabuelos: "Tatarabuelos",
    estados: { borrador: "Borrador", emitido: "Emitido", anulado: "Anulado" } as Record<"borrador" | "emitido" | "anulado", string>,
    // Pedigrí imprimible de cualquier animal.
    pedigri: {
      titulo: "Pedigrí",
      aviso: "Documento informativo del criadero. No es el certificado oficial de ANCO.",
      sinRegistro: "Sin registro propio",
      registro: (numero: string, estado: string) => `Registro propio: ${numero} (${estado})`,
      fecha: "Fecha",
      imprimirTitulo: "Pedigrí imprimible",
      imprimirAyuda: "Genera el pedigrí de este animal en PDF, tenga o no registro propio. Es un documento informativo del criadero.",
      cuatroGeneraciones: "Cuatro generaciones (en lugar de tres)",
      imprimir: "Pedigrí en PDF…",
      generando: "Generando…",
    },
    // Libro genealógico del criadero.
    libroGenealogico: {
      titulo: "Libro genealógico del criadero",
      generado: (fecha: string) => `Generado el ${fecha}`,
      total: (n: number) => (n === 1 ? "1 registro" : `${n} registros`),
      vacio: "No hay registros emitidos con esos filtros.",
      filtros: "Filtros",
      sinFiltros: "Todos los libros, razas y fechas",
      libro: (nombre: string) => `Libro: ${nombre}`,
      raza: (nombre: string) => `Raza: ${nombre}`,
      periodo: (desde?: string, hasta?: string) =>
        desde && hasta ? `Registrados del ${desde} al ${hasta}` : desde ? `Registrados desde el ${desde}` : `Registrados hasta el ${hasta ?? ""}`,
      incluyeAnulados: "Incluye registros anulados",
      hoja: "Libro genealógico",
      columnas: {
        libro: "Libro",
        numero: "Número",
        nombre: "Nombre",
        identificador: "Identificador principal",
        nacimiento: "Nacimiento",
        raza: "Raza",
        padre: "Padre",
        madre: "Madre",
        fechaRegistro: "Fecha de registro",
        version: "Versión",
        estado: "Estado",
      },
    },
    // Requisitos de la lista de verificación (R31), con el mismo orden con que se muestran.
    requisitos: {
      nombre: "Nombre",
      sexo: "Sexo",
      nacimiento: "Fecha de nacimiento",
      identificador: "Identificador principal vigente",
      composicion: "Raza o composición racial que sume 100 %",
      libro: "Libro",
      prefijo: "Prefijo del libro",
      padre: "Padre",
      madre: "Madre",
      genealogia: "Genealogía sin errores",
      criador: "Criador",
      propietario: "Propietario",
      criadero: "Criadero",
    } satisfies Record<Requisito, string>,
  },

  finanzas: {
    titulo: "Finanzas",
    secciones: { movimientos: "Ingresos y gastos", resumen: "Resumen", categorias: "Categorías" },
    tipo: { ingreso: "Ingreso", gasto: "Gasto" } as Record<TipoMovimiento, string>,
    tipoPlural: { ingreso: "Ingresos", gasto: "Gastos" } as Record<TipoMovimiento, string>,
    nuevo: "Anotar un ingreso o un gasto",
    corregirTitulo: "Corregir el movimiento",
    campos: {
      tipo: "Tipo",
      categoria: "Categoría",
      valor: "Valor (pesos)",
      fecha: "Fecha",
      asignado: "¿A qué se asigna?",
      lote: "Lote",
      animal: "Animal",
      descripcion: "Descripción (opcional)",
    },
    valorAyuda: "Número entero en pesos, por ejemplo 150000 o 150.000.",
    asignacion: {
      finca: "A toda la finca",
      lote: "A un lote",
      animal: "A un animal",
    },
    asignacionAyuda: "Los gastos de toda la finca se muestran aparte, como «gastos generales».",
    sinCategorias: "No hay categorías activas de este tipo. Agregue una en la pestaña Categorías.",
    guardar: "Guardar movimiento",
    guardarCambios: "Guardar los cambios",
    guardado: "Movimiento anotado.",
    corregido: "Movimiento corregido.",
    retirado: "Movimiento retirado.",
    filtros: {
      desde: "Desde",
      hasta: "Hasta",
      tipo: "Tipo",
      categoria: "Categoría",
      todos: "Todos",
      todas: "Todas",
      quitar: "Quitar los filtros",
    },
    vacio: "No hay movimientos con estos filtros.",
    columnas: { fecha: "Fecha", tipo: "Tipo", categoria: "Categoría", asignado: "Asignado a", descripcion: "Descripción", valor: "Valor", acciones: "" },
    gastoGeneral: "Gasto general",
    ingresoGeneral: "Toda la finca",
    deMonta: "Viene de una monta",
    corregir: "Corregir",
    retirar: "Retirar",
    retirarConfirmar: "¿Retirar este movimiento? Deja de contar, pero queda en el historial.",
    totales: (n: number, ingresos: string, gastos: string) =>
      `${n === 1 ? "1 movimiento" : `${n} movimientos`} · Ingresos ${ingresos} · Gastos ${gastos}`,
    resumen: {
      periodo: "Periodo",
      preajustes: { mes: "Este mes", anio: "Este año", todo: "Todo el tiempo" },
      prorrateo: "Repartir los gastos entre los animales (es una suposición)",
      prorrateoAyuda:
        "No es un dato registrado: el gasto de cada lote se reparte en partes iguales entre los animales activos de ese lote, y los gastos generales entre todos los animales activos del hato. Los ingresos no se reparten.",
      fincaTitulo: "Toda la finca",
      ingresos: "Ingresos",
      gastos: "Gastos",
      rentabilidad: "Rentabilidad (ingresos menos gastos)",
      gastosAparte: "Gastos generales (sin animal ni lote)",
      gastosAparteAyuda: "Se muestran aparte. No se reparten entre los animales, salvo que active el reparto.",
      desglose: {
        titulo: "De los gastos",
        generales: "Generales (sin animal ni lote)",
        lotes: "Asignados a lotes",
        animales: "Asignados a animales",
        ingresosGenerales: "Ingresos de toda la finca",
      },
      sinRepartir: (valor: string) => `${valor} no se pudo repartir: no hay animales activos entre quienes repartirlo.`,
      lotesTitulo: "Por lote",
      lotesAyuda: "Costo del lote = gastos asignados al lote. No incluye lo asignado por separado a sus animales.",
      lotesVacio: "Ningún movimiento de este periodo está asignado a un lote.",
      lotesColumnas: { lote: "Lote", ingresos: "Ingresos", gastos: "Gastos (costo del lote)", rentabilidad: "Rentabilidad" },
      animalesTitulo: "Por animal",
      animalesAyuda: "Costo por cabra = gastos asignados a ese animal. Haga clic en el título de una columna para ordenar.",
      animalesAyudaProrrateo: (n: number) =>
        `Con el reparto, el costo suma lo asignado al animal más su parte de los gastos de su lote y de los generales (entre ${n === 1 ? "1 animal activo" : `${n} animales activos`}).`,
      animalesVacio: "Ningún movimiento de este periodo está asignado a un animal.",
      animalesColumnas: {
        animal: "Animal",
        ingresos: "Ingresos",
        directos: "Gastos asignados",
        deLote: "Parte de su lote",
        generales: "Parte de los generales",
        costo: "Costo",
        rentabilidad: "Rentabilidad",
      },
      ordenarPor: (columna: string) => `Ordenar por ${columna.toLowerCase()}`,
    },
    categorias: {
      ayuda: "Puede cambiar el nombre o desactivar una categoría. No se borran: los movimientos que ya la usan la conservan.",
      gastos: "Categorías de gastos",
      ingresos: "Categorías de ingresos",
      vacio: "No hay categorías.",
      nueva: "Agregar una categoría",
      nombre: "Nombre",
      tipo: "Tipo",
      agregar: "Agregar categoría",
      creada: (nombre: string) => `Categoría «${nombre}» agregada.`,
      guardado: "Categoría actualizada.",
      desactivar: "Desactivar",
      activar: "Activar",
      desactivada: "Desactivada",
    },
    ofertaMonta: {
      titulo: "¿Anotar el costo de la monta como gasto?",
      texto: (costo: string, hembra: string) => `Esta monta tiene un costo de ${costo}. Puede anotarlo ahora como gasto de ${hembra}, la hembra servida.`,
      categoria: "Categoría del gasto",
      anotar: "Anotar el gasto",
      ahoraNo: "Ahora no",
      anotado: (valor: string) => `Gasto de ${valor} anotado en Finanzas.`,
      descripcion: (hembra: string, macho: string) => `Monta de ${hembra} con ${macho}`,
    },
  },

  certificado: {
    tituloDocumento: "Certificado interno del criadero",
    aviso: "Registro interno del criadero. No es el certificado oficial de ANCO.",
    numero: "Número",
    fechaEmision: "Fecha de emisión",
    emitidoPor: "Emitido por",
    finca: "Finca",
    criadero: "Criadero",
    municipio: "Municipio",
    datosTitulo: "Datos del animal",
    ascendenciaTitulo: "Ascendencia",
    padres: "Padres",
    abuelos: "Abuelos",
    registro: (valor: string) => `Registro de asociación: ${valor}`,
    sinVerificar: "Sin verificar",
    desconocido: "Desconocido",
    identificadores: "Identificadores",
    registroAsociacion: "Registro de asociación",
    consanguinidad: "Consanguinidad (Wright)",
    pagina: (actual: number, total: number) => `Página ${actual} de ${total}`,
    generadoCon: "Generado con Registro Caprino",
  },

  expediente: {
    tituloDocumento: "Expediente para ANCO",
    provisional:
      "Formato provisional preparado por el programa: no es un formato oficial de ANCO. Revise los datos antes de entregarlo.",
    numero: "Número",
    fechaEmision: "Fecha",
    finca: "Finca",
    campo: "Campo",
    valor: "Valor",
    faltanTitulo: "Campos que faltan",
    avisosTitulo: "Avisos",
    campos: {
      nombre: "Nombre",
      crg: "Número de registro de asociación (CRG)",
      criador: "Criador",
      propietario: "Propietario",
      criadero: "Criadero",
      sexo: "Sexo",
      composicion: "Composición racial",
      libro: "Libro genealógico",
      formaConcepcion: "Forma de concepción",
      marcas: "Marcas",
      color: "Color y señas",
      nacimiento: "Fecha de nacimiento",
      padre: "Padre",
      madre: "Madre",
      abueloPaterno: "Abuelo paterno",
      abuelaPaterna: "Abuela paterna",
      abueloMaterno: "Abuelo materno",
      abuelaMaterna: "Abuela materna",
    } as Record<CampoExpediente, string>,
    registroDe: {
      padre: "Registro del padre",
      madre: "Registro de la madre",
      abueloPaterno: "Registro del abuelo paterno",
      abuelaPaterna: "Registro de la abuela paterna",
      abueloMaterno: "Registro del abuelo materno",
      abuelaMaterna: "Registro de la abuela materna",
    },
    columnaFaltantes: "Campos que faltan",
  },

  respaldo: {
    titulo: "Copia de respaldo",
    explicacion:
      "Guarda en un solo archivo .zip todos los datos de la finca: animales, genealogía, reproducción, leche, pesos, salud, usuarios, historial, fotos y documentos emitidos. Guárdelo fuera del computador (memoria USB o disco externo).",
    exportar: "Crear copia de respaldo…",
    exportando: "Creando la copia…",
    exportado: (ruta: string, tamano: string) => `Copia guardada en ${ruta} (${tamano}).`,
    nombreArchivo: (fecha: string) => `respaldo-registro-caprino-${fecha}.zip`,
    filtro: "Copia de respaldo",
    restaurarTitulo: "Restaurar una copia",
    restaurarExplicacion:
      "Para no borrar ni mezclar datos, una copia solo se restaura en un programa recién instalado, antes de crear la finca (en la primera pantalla). Si necesita volver a una copia en este computador, siga la guía de instalación del programa, sección 5, «Restaurar una copia en este mismo computador».",
    restaurarAsistente: "¿Ya usaba Registro Caprino en otro computador? Restaure su copia de respaldo",
    restaurarBoton: "Elegir copia de respaldo…",
    restaurando: "Restaurando… no cierre el programa.",
    restaurado: (finca: string, fecha: string) => `Se restauró la copia de «${finca}» hecha el ${fecha}.`,
    soloPropietario: "Solo el propietario puede crear la copia completa.",
  },

  ficha: {
    pestanas: {
      ficha: "Ficha",
      genealogia: "Genealogía",
      reproduccion: "Reproducción y leche",
      servicios: "Servicios",
      pesos: "Pesos",
      salud: "Salud",
      documentos: "Documentos",
      registro: "Registro",
      historial: "Historial",
    },
    reproduccionVacio: "Sin servicios ni partos registrados.",
    serviciosTitulo: "Servicios",
    partosTitulo: "Partos",
    partoResumen: (fecha: string, n: number) => `${fecha}: ${n === 1 ? "1 cría" : `${n} crías`}`,
    intervaloPromedio: (texto: string) => `Intervalo promedio entre partos: ${texto}.`,
    lactanciasTitulo: "Lactancias",
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
      origen: "Origen",
      propietario: "Propietario",
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
    volverExternos: "← Volver a «De otras fincas»",
    serviciosMacho: {
      vacio: "Este macho todavía no tiene servicios registrados.",
      resumen: (servicios: number, prenadas: number, vacias: number, abortos: number, pendientes: number, partos: number, crias: number) =>
        `${servicios === 1 ? "1 servicio" : `${servicios} servicios`}: ${prenadas} preñada(s), ${vacias} vacía(s), ${abortos} aborto(s) y ${pendientes} sin diagnóstico. ${partos === 1 ? "1 parto" : `${partos} partos`} con ${crias === 1 ? "1 cría" : `${crias} crías`}.`,
      columnas: {
        fecha: "Servicio",
        hembra: "Hembra",
        tipo: "Tipo",
        resultado: "Resultado",
        crias: "Crías",
        costo: "Costo",
        condiciones: "Condiciones",
        gasto: "Gasto",
      },
      anotarGasto: "Anotar como gasto",
      gastoAnotado: "Gasto anotado",
    },
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
    tituloNuevoExterno: "Registrar animal de otra finca",
    externoAyuda:
      "Un semental de otro criadero, o un ancestro que nunca estuvo en la finca. Solo aparecerá en la genealogía y en los servicios.",
    propietarioTitulo: "Propietario",
    propietario: "Propietario (dueño del animal)",
    propietarioAyuda: "Si no está en la lista, agréguelo como contacto nuevo.",
    elegirPropietario: "Elija el propietario…",
    agregarPropietario: "Agregar propietario nuevo",
    conversionAviso:
      "Este animal se registró solo para la genealogía. Al guardarlo con su propietario quedará en «De otras fincas».",
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
    propietario: (propietario: string) => `Propietario: ${propietario}`,
    hijosTitulo: "Crías registradas",
    sinHijos: "No tiene crías registradas.",
  },

  historial: {
    vacio: "Sin cambios registrados.",
    columnas: { fecha: "Fecha y hora", cambio: "Qué cambió", antes: "Antes", despues: "Después", usuario: "Usuario" },
    entidades: {
      animal: "Ficha",
      identificador: "Identificador",
      composicion_racial: "Raza",
      evento_reproductivo: "Servicio",
      parto: "Parto",
      lactancia: "Lactancia",
      pesaje_leche: "Leche (corrección)",
      pesaje_corporal: "Peso",
      evento_salud: "Salud",
      certificado: "Documento",
      contacto: "Contacto",
      registro_genealogico: "Registro genealógico",
    } as Record<string, string>,
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
    datosVersion: "Versión del motor de datos (SQLite)",
    datosMigraciones: "Actualizaciones de la base aplicadas",
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
