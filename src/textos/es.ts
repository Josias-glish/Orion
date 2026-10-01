// Todos los textos que ve el usuario. Los componentes no escriben textos propios: los toman de aquí.
import type { Motivo } from "../datos/errores";
import { generacion, linea, sexoEsperado, type Camino } from "../dominio/genealogia";
import type { Jornada } from "../dominio/leche";
import type { CampoExpediente } from "../dominio/expediente";
import type { TipoPesaje } from "../dominio/pesos";
import type { TipoRetiro, TipoSalud } from "../dominio/salud";
import type { ResultadoServicio, TipoServicio } from "../dominio/reproduccion";
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

const dias = (n: number) => (n === 1 ? "1 día" : `${n.toLocaleString("es-CO")} días`);

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
    intervalosAyuda: "Días entre partos consecutivos de cada hembra (R9). Solo aparecen las hembras con dos o más partos.",
    intervalosVacio: "Ninguna hembra tiene todavía dos partos registrados.",
    intervalosColumnas: { hembra: "Hembra", partos: "Partos", ultimo: "Último intervalo", promedio: "Promedio" },
    sinMacho: "Sin macho registrado",
    machoSoloGenealogia: "solo genealogía",
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
  },

  leche: {
    titulo: "Leche",
    secciones: { ordeno: "Ordeño", lactancias: "Lactancias" },
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
    },
    formula: (diasLactancia: number) =>
      `Proyección = acumulado + promedio diario de los últimos 7 días con registro × días que faltan hasta el día ${diasLactancia} (R8; ver docs/SUPOSICIONES.md).`,
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
    gananciaAyuda: "Ganancia diaria = diferencia de peso ÷ días entre pesajes (R10).",
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
    retirosAyuda: "Animales tratados cuya leche o carne no se puede vender todavía (R7: hasta la fecha de fin inclusive).",
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
    tipoDocumento: { propio: "Certificado interno", asociacion: "Expediente para ANCO" } as Record<"propio" | "asociacion", string>,
    soloPropietario: "Solo el propietario puede emitir documentos.",
    guardarCopia: (formato: string) => `Guardar una copia del ${formato}…`,
    filtroPdf: "Documento PDF",
    filtroCsv: "Hoja de cálculo CSV",
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
      "Para no borrar ni mezclar datos, una copia solo se restaura en un programa recién instalado, antes de crear la finca (en la primera pantalla). Si necesita volver a una copia en este computador, siga los pasos de la guía de instalación (docs/INSTALACION.md), apartado «Restaurar una copia en este mismo computador».",
    restaurarAsistente: "¿Ya usaba Registro Caprino en otro computador? Restaure su copia de respaldo",
    restaurarBoton: "Elegir copia de respaldo…",
    restaurando: "Restaurando… no cierre el programa.",
    restaurado: (finca: string, fecha: string) => `Se restauró la copia de «${finca}» hecha el ${fecha}.`,
    soloPropietario: "Solo el propietario puede crear la copia completa (R14).",
  },

  ficha: {
    pestanas: {
      ficha: "Ficha",
      genealogia: "Genealogía",
      reproduccion: "Reproducción y leche",
      pesos: "Pesos",
      salud: "Salud",
      documentos: "Documentos",
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
