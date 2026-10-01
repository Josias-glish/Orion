# Prueba con un operario (usabilidad)

Diez tareas para comprobar que un operario del aprisco puede usar Registro Caprino **sin ayuda**. La sección 9 de la
especificación pide pocos pasos, letra grande, buen contraste y mensajes en español sencillo; esta prueba mide si se
cumple con una persona real.

## Preparación (la hace el propietario, antes, sin el operario)

1. Instale la versión 0.1.0 y cree la finca y su usuario propietario.
2. En **Ajustes → Usuarios**, cree el usuario **operario** que hará la prueba, con un PIN que él conozca.
3. Registre al menos: 6 hembras y 2 machos con arete, un lote «Ordeño» con las hembras y un lote «Levante».
4. Registre un servicio con diagnóstico «preñada» a una hembra (será la del parto de la tarea 5) y el parto de otras
   dos hembras, para que haya cabras en lactancia.
5. En **Pesos → Metas por edad**, anote al menos las metas de 0 y 2 meses para hembras y machos.
6. Tenga a mano, en papel, los datos de la prueba: arete de la cabra de la tarea 2, kilos del ordeño de la tarea 3,
   datos del parto de la tarea 5 y del tratamiento de la tarea 6.

## Cómo hacerla

- Una persona observa en silencio, con reloj y esta hoja. **No ayuda**: si el operario pregunta, responde «haga lo que
  le parezca». Si en 5 minutos no avanza, se anota «no la completó» y se pasa a la siguiente.
- Pida al operario que **piense en voz alta** («estoy buscando…», «no sé qué es esto…») y anote las palabras que no
  entendió y dónde dudó.
- Lea cada tarea tal como está escrita, sin nombrar los botones.

## Las diez tareas

| N.º | Tarea (léala tal cual) | Se cumple si… |
| --- | --- | --- |
| 1 | «Entre al programa con su usuario.» | Elige su nombre y escribe su PIN. |
| 2 | «Busque la cabra con arete ___ y dígame quién es su madre.» | Encuentra la ficha y lee la madre correcta. |
| 3 | «Anote el ordeño de esta mañana de todas las cabras con estos kilos.» (Entréguele la hoja.) | Todas las cabras quedan «Guardado» con los kilos correctos. |
| 4 | «Me equivoqué con la cabra ___: no eran ___ kilos sino ___. Corríjalo.» | El valor queda corregido. |
| 5 | «La cabra ___ parió hoy dos crías: una hembra (arete ___, ___ kg) y un macho (arete ___, ___ kg). Regístrelo.» | Se crean las dos fichas con la madre correcta. |
| 6 | «Hoy el veterinario trató a la cabra ___ con ___, ___ ml, por vía ___, con 3 días de retiro de leche. Anótelo.» | El tratamiento queda guardado con dosis, vía, retiro y veterinario. |
| 7 | «¿Qué cabras no pueden vender leche hoy, y hasta cuándo?» | Responde con la alerta del Inicio, de Salud o del ordeño. |
| 8 | «Hoy se desparasitó todo el lote Levante con ___. Anótelo.» | Queda anotado en todos los animales del lote, en un solo registro. |
| 9 | «Pese al cabrito ___: pesa ___ kg. ¿Está por encima o por debajo de lo esperado para su edad?» | Guarda el pesaje y responde según «Frente a la meta». |
| 10 | «¿Qué vacunas o desparasitaciones hay que aplicar este mes? Cuando termine, salga para que entre otra persona.» | Las encuentra (Inicio o Salud → Próximas fechas) y pulsa «Cambiar de usuario». |

## Hoja de resultados

| N.º | ¿La completó sin ayuda? (sí / con dudas / no) | Tiempo | Dónde dudó o se equivocó | Palabras que no entendió |
| --- | --- | --- | --- | --- |
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
| 6 | | | | |
| 7 | | | | |
| 8 | | | | |
| 9 | | | | |
| 10 | | | | |

**Meta para esta versión**: al menos 8 de las 10 tareas completas sin ayuda, y el ordeño de la tarea 3 en menos de 15
segundos por cabra. Cada palabra que el operario no entendió se cambia en `src/textos/es.ts` para la versión
siguiente.

## Lo que ya se revisó en la Etapa 5

- **Letra**: 18 px como base, títulos de unos 32 px; casillas y botones de al menos 48 px de alto (fáciles de tocar).
- **Contraste**: 17 combinaciones de texto y fondo cumplen WCAG AA (4,5 a 1 o más); lo comprueba
  `src/aceptacion.test.ts`. El aviso de leche retenida no depende solo del color: lleva «⚠» y texto.
- **Mensajes**: todos están en `src/textos/es.ts`. Se quitaron de la pantalla los códigos de reglas («R7», «R14»), las
  rutas de archivos del proyecto y palabras como «hash»; una prueba impide que vuelvan. Los errores dicen qué pasó y
  qué hacer; el detalle técnico queda escondido en «Detalle técnico».
- **Teclado**: el ordeño se hace solo con el teclado numérico y Enter; el foco del teclado se ve con un borde amarillo.
