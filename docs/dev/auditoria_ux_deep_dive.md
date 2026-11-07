# Auditoría de UX/UI — Deep Dive

**Fecha:** 2026-11-07 · **Versión revisada:** rama `claude/plan-5-19-interaccion` (5.18.0 + tandas 1 y 2 de la 5.19)
**Plan que sale de aquí:** [plan_ux_deep_dive.md](plan_ux_deep_dive.md) · **Mockups:** el artifact «Deep Dive, informe vivo»

Las auditorías anteriores ([deixis](deep_dive_interaccion.md), [ciclo de vida](deep_dive_ciclo_vida.md),
[narrativa](deep_dive_narrativa.md), [gráficos](deep_dive_graficos.md)) arreglaron lo que el agente hace y dice.
Esta mira otra cosa: **si la pantalla deja leer, confiar y actuar** a quien la usa.

## Cómo se revisó

- Una sesión sembrada con **datos reales** de la tienda de ejemplo (`ventas`, `metas_2024`, `v_venta_mensual`):
  «¿Por qué no estamos llegando a la meta de ventas de 2024?». Cuatro pasos, dos gráficos, una conclusión.
  La respuesta es buena para probar la pantalla: la brecha no es de ventas, **los datos terminan el 15 de
  octubre** (de enero a septiembre se cumple el 90,4 %).
- Una segunda sesión **en pausa** (plan de 5 pasos, 1 hecho) y una **vacía**.
- La app en el navegador de pruebas contra un servidor con casa temporal, a **1440×900** y al tamaño de ventana
  por defecto, **1280×800**. Se midió el ancho de cada columna.
- Lectura del código: `AiDivingPanel.jsx`, `DeepDiveTranscript.jsx`, `DeepDiveInspector.jsx`, `SessionInventory.jsx`,
  `AgentPlanPanel.jsx`, `deepDiveTurns.js`, `ChatMessage.jsx` (NarrativeCard), `server/ai/tools.js`.

Sin un modelo corriendo no se vio el estado **en vivo**; lo que se dice de él sale del código.

## Para quién es

| Perfil | Qué quiere de Deep Dive | Qué necesita ver |
|---|---|---|
| **Analista de datos** (sabe SQL) | Delegar la exploración pesada y quedarse con lo útil | Las consultas, poder auditarlas, llevarlas al editor, corregir el rumbo a mitad del análisis |
| **Usuario de negocio** (no programa) | Una respuesta a su pregunta, en su idioma | La conclusión primero, los gráficos junto a la explicación, saber cuánto confiar, qué hacer después |
| **Quien recibe el resultado** (jefe, cliente) | El informe | Algo que se pueda enviar: notebook, Report Flow, Word |

El segundo perfil es el que más gana con Deep Dive, porque el analista ya tiene el editor. Hoy la pantalla le sirve
mejor al primero.

## Veredicto

La idea es correcta: delegar una pregunta de negocio y recibir un análisis narrado. Lo que no funciona es
**cómo se organiza la pantalla**: está ordenada según cómo trabaja el agente (turnos, llamadas a herramientas,
plan, iteraciones) y no según lo que la persona hace (preguntar, leer la respuesta, ver la evidencia, decidir).

En concreto: **la respuesta va en la columna más angosta, los gráficos están en otra columna que hay que ir
abriendo turno por turno, y las preguntas que el agente le hace al usuario aparecen en una tercera columna, lejos
de donde está escribiendo.** Son cuatro columnas a la vez (la lista de conversaciones, el hilo, el inspector y el
panel derecho). A 1280 px el hilo y el inspector tienen **331 px cada uno**.

## Hallazgos

Ordenados por cuánto afectan a quien usa Deep Dive. La severidad: **Alta** impide leer o decidir, **Media** confunde
o resta confianza, **Baja** es pulido.

### Alta

**H1. La respuesta va en la columna más angosta.**
La tarjeta de conclusiones (`NarrativeCard`) se pinta dentro del hilo (`DeepDiveTranscript.jsx:78`), que mide 331 px
a 1280 y 411 px a 1440. Los hallazgos con su valor y su «por qué importa» se parten en líneas de 3 o 4 palabras. El
inspector, que muestra el proceso, tiene el mismo ancho. Lo más importante del análisis recibe el mismo espacio que el
registro de cómo se hizo.

**H2. La evidencia está separada de la historia.**
Los gráficos y las tablas solo existen en el inspector (`DeepDiveInspector.jsx:125`), que muestra **un turno a la vez**.
Para ver los dos gráficos de la sesión de prueba hay que hacer clic en el turno 1 y luego en el turno 2. Quien lee el
hilo de arriba abajo, como un informe, nunca ve un gráfico. Para el usuario de negocio el gráfico es la prueba; aquí
está escondido detrás de «view steps →».

**H3. Las decisiones aparecen lejos de donde se mira.**
Cuando el agente pregunta algo (`ask_user`) o se queda sin ciclos («Continue / With instructions… / Finish with what
there is / Cancel»), el aviso se pinta en el **panel derecho**, entre el plan y los artefactos
(`AiDivingPanel.jsx:734-820`). La persona está leyendo el hilo o escribiendo abajo a la izquierda. En la sesión en
pausa el aviso ocupa 130 px de una columna de 260, en color de advertencia, sin moverse hacia el centro. El
análisis espera y no es evidente que te está esperando a ti.

**H4. Cuatro columnas a la vez, y lo responsive nunca llegó.**
Lista de conversaciones (280) + hilo + inspector + panel derecho (260). El plan de layout de 2026-07
([plan_deep_dive_layout.md](plan_deep_dive_layout.md), fase 6) preveía que el inspector se volviera superpuesto bajo
~1100 px y que el panel derecho se pudiera plegar; no se hizo. Medido a 1280: hilo 331, inspector 331, el texto de
ayuda de la caja de pregunta no cabe y se corta. En una ventana angosta (~800 px de panel) el inspector baja **debajo**
del hilo: la caja de pregunta queda a media pantalla y el hilo se reduce a una franja.

### Media

**H5. El plan y el inspector no se hablan.**
El plan (derecha) lista los pasos de la sesión; el inspector (centro) se organiza por **turnos** de la conversación.
Un clic en un paso del plan no hace nada (`AgentPlanPanel.jsx:130`). Un paso puede repartirse en dos turnos y un
turno contener tres pasos. Hay dos índices del mismo trabajo y ninguno lleva al otro.

**H6. Vocabulario de máquina.**
Lo que ve el usuario: `s2`, `Iteration 12/50`, `Agent Plan · editable`, `Reasoning`, `Building chart`, `inspecting →`,
`view steps →`. Además «steps» significa dos cosas: el hilo dice «6 steps» (cuenta **llamadas a herramientas**,
`deepDiveTurns.js:229`) mientras el plan tiene 4 pasos. Para el usuario de negocio es ruido; para el analista, una
contradicción.

**H7. El progreso no siempre dice la verdad.**
- Al cerrar, `final_answer` marca como **hechos** todos los pasos que quedaban pendientes (`server/ai/tools.js:1187-1195`).
  Un paso que nunca se ejecutó aparece con la palomita verde.
- El razonamiento no se puede asignar a un paso, así que se **reparte por orden** entre los pasos del turno
  (`DeepDiveInspector.jsx:31`, «front-loaded»). Puede aparecer un razonamiento bajo el paso equivocado.

En un modo cuya promesa es «confía en el análisis», esto pesa más que en cualquier otro lado.

**H8. Fallo: el paso aparece como `s2` en vez de su nombre.**
`buildStepGroups` busca el nombre del paso en el `create_plan` **del mismo turno** (`deepDiveTurns.js:133-137`). Desde
el segundo turno ya no lo encuentra y el encabezado dice `s2`, `s3`, `s4`. Confirmado en la sesión de prueba.

**H9. El inicio habla de tablas, no de preguntas.**
El estado vacío ofrece «Show all tables · Describe schema · Sample data» y el panel derecho repite «List Tables ·
Describe Schema · Profile Data · Sample Data». Son acciones de alguien que ya sabe SQL. El tour de primera vez sí
propone preguntas de negocio («Why did sales drop in Q3?»), pero la pantalla no. Además dos de las tres columnas
están vacías: el inspector dice «Select a step on the left» cuando no hay nada que seleccionar.

**H10. Todas las pestañas se llaman «Deep Dive».**
Con tres sesiones abiertas hay tres pestañas idénticas. El nombre de la sesión solo está arriba del panel derecho.

**H11. Idioma mezclado.**
En una interfaz en inglés aparecen «Continuar», «Continuar con esto», «Cancelar» (`AiDivingPanel.jsx:794, 816`) y
«Ver consulta fuente» (`ChatMessage.jsx:252`).

**H12. Poco control mientras corre.**
- Saltar un paso solo se puede con el análisis **detenido** (`AgentPlanPanel.jsx:59`); la guía dice que basta pasar el ratón.
- No hay pausa. Detener es la X que reemplaza al botón de enviar.
- No se puede dar una indicación a mitad del análisis (F5.4 de ciclo de vida, diferida).

### Baja

**H13. Artefactos que no se abren.** Un gráfico registrado como artefacto no tiene archivo, así que aparece al 60 % de
opacidad y no hace nada al pulsarlo (`SessionInventory.jsx:201-203`). La papelera borra sin confirmar.

**H14. Una papelera que no borra.** El icono de papelera del encabezado (`Clear chat`) no borra la sesión: vacía la
vista y empieza otra (`useAiChat.js:847`). La sesión sigue en la lista. El icono promete otra cosa.

**H15. Títulos de gráfico cortados.** A 331 px, «La venta sigue a la meta hasta septiembre y luego cae a cero» queda en
«La venta sigue a la meta hasta septiembre y…». En Deep Dive el título del gráfico **es** el mensaje.

**H16. Indicadores inconsistentes.** La etiqueta «CLOUD» solo aparece con Gemini (`AiDivingPanel.jsx:593`); el aviso
de «modelo pequeño» solo con Ollama. Tres textos de ayuda repiten «arrastra tablas del explorador».

**H17. Fallo fuera de Deep Dive, pero lo tapa.** La tarjeta «Where you left off» (`LayoutManager.jsx:2459`) queda
flotando encima de cualquier pestaña que se abra después, Deep Dive incluido, y solo se cierra con «Continue».

## Lo que sí funciona y hay que conservar

- **Separar la conversación del proceso.** La idea del plan de 2026-07 es buena: el proceso no debe ensuciar el hilo.
  La propuesta la conserva, solo cambia **dónde vive** el proceso (bajo demanda, no en una columna fija).
- **La NarrativeCard.** TL;DR, hallazgos con valor y «por qué importa», causa, acciones, salvedades, y el botón para ver
  la consulta de cada número. Es la mejor pieza de Deep Dive; le falta espacio y lugar.
- **«Ask about this» y las menciones con @.** Señalar un gráfico, un número o un paso y preguntar sobre él es el modelo
  correcto. Se mantiene tal cual.
- **El plan visible.** Ver los pasos antes de que se ejecuten da confianza. Falta que se pueda usar.

## La propuesta en una línea

**Deep Dive como un informe que se escribe solo.** Una sola columna de lectura, con la respuesta arriba en cuanto
existe y cada paso como una sección con su explicación y su gráfico. El plan a la izquierda como índice que lleva a
cada sección. El proceso técnico («cómo lo obtuve») se abre bajo demanda en un panel lateral. Las decisiones aparecen
justo encima de la caja de texto. Detalles y mockups en el plan y en el artifact.
