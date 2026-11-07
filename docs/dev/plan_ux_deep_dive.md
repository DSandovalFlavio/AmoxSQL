# Plan — Deep Dive como informe vivo

**Sale de:** [auditoria_ux_deep_dive.md](auditoria_ux_deep_dive.md) (hallazgos H1–H17)
**Estado:** entrega 1 (F0 + F1) implementada el 2026-11-07, sin publicar; resto pendiente. Mockups en el artifact
«Informe vivo de Deep Dive». Las cuatro decisiones del final se tomaron como se proponen.

**Entrega 1, lo que quedó y lo que no:**
- Hecho: H6, H7 (estado `not_done`; el razonamiento va una vez por respuesta), H8, H10, H11, H14, H17, F1 completa.
  Además, al reabrir una sesión vuelve la pregunta del analista (antes se perdía al recargar), y elegir una opción
  sin modelo ya no borra la pregunta.
- Un paso que quedó «in progress» en una respuesta que ya no corre se muestra como hecho si el análisis concluyó, o
  como interrumpido si no.
- Sigue igual, a propósito, para F6: contestar una pregunta del analista arranca un turno nuevo y el plan se reinicia
  (no se trata como continuación).
- `scripts/probarDeepDive.mjs` cubre la parte pura (nombres de paso, `final_answer`). Lo visual se revisó en la app
  con sesiones sembradas: pregunta, pausa, cierre con un paso sin hacer y la sesión de la meta de ventas.

**Entrega 2 (F2 + F3 + F4), hecha el 2026-11-07, sin publicar:**
- **Corrección a la auditoría.** Una ejecución real se guarda como **un solo mensaje** (toda la prosa en `content`,
  todas las herramientas en `toolCalls`). Las sesiones sembradas tenían un mensaje por paso. En la práctica el hilo
  de antes mostraba una sola respuesta larga, y el inspector todos sus pasos a la vez: H2 era menos grave de lo que
  dice la auditoría (no había que ir turno por turno), pero los gráficos seguían fuera de la historia.
- **`textOffset`.** Para meter la narración dentro de cada paso, `useAiChat` anota en cada llamada a herramienta en
  qué punto de la prosa ocurrió, y se guarda con el mensaje. Así `informeDeepDive.js` parte el texto exactamente:
  la apertura es la introducción, lo escrito durante un paso es de ese paso (también su razonamiento: la mitad de
  H7 que quedaba pendiente se resuelve sin tocar el servidor), y lo escrito justo antes de `final_answer` es la
  respuesta. Las sesiones anteriores no lo tienen: su prosa va entera antes de los pasos, que siguen llevando sus
  gráficos y conclusiones.
- Layout: índice (236 px, 200 en estrecho) · informe (máx. 760 px de lectura) · «How I got this» (320–400 px, se
  superpone bajo 1080 px de ancho del panel, con container query). A 1280×800 con la barra lateral abierta la
  columna de lectura mide 673 px (antes 331). La barra lateral se pliega sola si el panel mide menos de 860 px.
- «Continue…», la respuesta a una pregunta del analista o un mensaje tras el que sigue los pasos del plan anterior
  se unen al mismo análisis; una pregunta nueva abre otro.
- Al reabrir un análisis terminado se llega a su respuesta; al terminar uno, también.
- Sin hacer de F2: el resaltado en el índice de la sección que estás leyendo. Sin hacer de F4: los valores de la
  respuesta no son enlaces en sí (la lupa junto a cada uno sí abre su consulta).
- Quedó CSS de los componentes retirados (`.ddt-*`, `.ddi-*`, `.ai-ctx*`, `.ai-plan-*`) sin podar.
- `scripts/probarDeepDive.mjs`: 23 comprobaciones, incluida una ejecución con la forma real (un mensaje con
  `textOffset`), una sin posiciones, una en curso, una detenida y una continuación.

## La idea

Hoy Deep Dive se organiza como trabaja el agente: turnos, herramientas, plan, iteraciones. La propuesta lo organiza
como lo lee una persona: **pregunta → respuesta → evidencia → qué hago ahora.**

```
┌ Índice ─────┬ Informe (una sola columna de lectura, máx. ~760 px) ──────────┬ Cómo lo obtuve ┐
│ Pregunta    │  Pregunta                                                     │ (bajo demanda) │
│ ● Respuesta │  RESPUESTA  (aparece arriba en cuanto existe)                 │  SQL           │
│ ✓ 1 Cat.    │    TL;DR · 3 hallazgos con valor · confianza · acciones       │  filas         │
│ ✓ 2 Meses   │  1  Medir venta contra meta por categoría                     │  razonamiento  │
│ ● 3 Datos   │     explicación · GRÁFICO · hallazgo · [Cómo lo obtuve]       │  Abrir en      │
│ ○ 4 Ciudad  │  2  ...                                                       │  editor        │
│             │  ── decisión del agente (si la hay) ──                         │                │
│ Entregables │  [ caja de pregunta / indicación ]                             │                │
└─────────────┴───────────────────────────────────────────────────────────────┴────────────────┘
```

- **Índice (izquierda, ~220 px):** el plan, que ahora sí lleva a cada sección y marca dónde va el análisis. Debajo,
  los entregables (gráficos, notebook) y la salida a Report Flow / Word.
- **Informe (centro):** una columna con ancho de lectura. Cada paso del plan es una sección con su explicación, su
  gráfico y su conclusión. La respuesta sube arriba al terminar (pirámide invertida).
- **Cómo lo obtuve (derecha):** el inspector de hoy, pero bajo demanda: se abre al pulsar «Cómo lo obtuve» en una
  sección, en un número de la respuesta o en un gráfico. Se cierra con Escape.
- **Decisiones:** cuando el agente pregunta o se queda sin ciclos, la tarjeta aparece **en el informe, justo encima
  de la caja de texto**, y la caja se convierte en la respuesta.
- **Modo detalle técnico:** un interruptor en el encabezado para el analista; muestra el SQL dentro de cada sección
  sin abrir el panel.

Se conserva: la NarrativeCard, «Ask about this», las menciones con @, la persistencia, el streaming.

## Fases

Cada fase se puede publicar sola y deja la app mejor que antes. Las dos primeras no cambian el layout.

### F0 — Que diga la verdad y hable claro (sin cambiar el layout)
Arregla lo que resta confianza hoy. Pequeño y de bajo riesgo.
- **H8** nombre del paso en todos los turnos: `buildStepGroups` recibe el mapa de pasos de **toda** la conversación.
- **H7** `final_answer` deja de marcar como hechos los pasos pendientes: pasan a «no realizado», con su motivo si lo hay.
- **H7** el razonamiento deja de repartirse entre pasos: se muestra una vez por turno, hasta que el servidor lo
  etiquete con su paso (F3).
- **H6** «steps» solo para los pasos del plan; el hilo cuenta «consultas» y «gráficos». Fuera `s2`, `Iteration 12/50`,
  `Building chart` del texto visible (el id queda en el título emergente).
- **H11** textos en un solo idioma.
- **H10** la pestaña toma el nombre de la sesión.
- **H14** la papelera del encabezado pasa a «Nueva sesión»; borrar queda en el menú de la lista, con confirmación.
- **H17** «Where you left off» se cierra al abrir cualquier pestaña y con Escape (fuera de Deep Dive, pero lo tapa).

*Archivos:* `deepDiveTurns.js`, `DeepDiveInspector.jsx`, `DeepDiveTranscript.jsx`, `AiDivingPanel.jsx`,
`AgentPlanPanel.jsx`, `server/ai/tools.js`, `LayoutManager.jsx`, `Retomar.jsx`.
*Hecho cuando:* en la sesión de prueba no aparece ningún `sN` suelto, un paso no ejecutado nunca lleva palomita y la
interfaz no mezcla idiomas.

### F1 — Las decisiones donde está la mirada
- **H3** `ask_user` y «sin ciclos» se pintan como una tarjeta en el informe, encima de la caja de texto. La caja
  cambia su ayuda («Responde al analista…»). Las opciones son botones; escribir también responde.
- La pestaña y la lista de conversaciones marcan una sesión que **espera tu respuesta**.
- Al reabrir una sesión en pausa, la tarjeta aparece en el mismo sitio.

*Archivos:* `AiDivingPanel.jsx` (sacar los avisos de `SessionInventory`), nueva `DecisionDelAnalista.jsx`.
*Hecho cuando:* con la sesión en pausa, la decisión se ve sin desplazar ni mirar a la derecha, a 1280×800.

### F2 — El informe: una columna de lectura e índice a la izquierda
- **H1, H4, H5** nuevo layout de tres zonas: índice · informe · panel bajo demanda. Desaparecen el panel derecho fijo y
  el inspector fijo.
- El índice es el plan: cada paso lleva a su sección, marca el que corre y el que estás leyendo.
- Las secciones se arman **por paso del plan**, no por turno (un paso que cruza dos turnos es una sola sección). Lo
  que no pertenece a un paso (un seguimiento corto) es una sección «Pregunta de seguimiento».
- Encabezado: nombre de la sesión editable, modelo y política, «Detalle técnico», «Entregables».
- Al entrar en Deep Dive la lista de conversaciones se pliega si no cabe (se abre con su botón de siempre).

*Archivos:* `AiDivingPanel.jsx` (rehecho como contenedor), nuevos `deepDive/Informe.jsx`, `deepDive/Indice.jsx`,
`deepDive/SeccionDePaso.jsx`; `deepDiveTurns.js` gana `seccionesPorPaso(messages)` (puro, probado aparte);
`SessionInventory.jsx` y `AgentPlanPanel.jsx` se absorben en el índice.
*Hecho cuando:* a 1280×800 la columna de lectura mide al menos 600 px y no hay ninguna columna vacía.

### F3 — La evidencia en línea y «Cómo lo obtuve» bajo demanda
- **H2** cada sección muestra su gráfico a todo el ancho de lectura y su conclusión. Una consulta sin gráfico muestra
  una tabla breve (5 filas) con «Ver todo».
- **H15** el título del gráfico se ajusta en varias líneas.
- «Cómo lo obtuve» abre el panel con el inspector de hoy para esa sección: consulta, filas, razonamiento,
  «Abrir en el editor», CSV.
- Servidor: el razonamiento y cada llamada se etiquetan con el paso activo (`step_id`) al guardarse, para que el
  panel muestre el razonamiento de **ese** paso (cierra la mitad pendiente de H7).

*Archivos:* `SeccionDePaso.jsx`, `DeepDiveInspector.jsx` (pasa a panel), `ChatResultsBlock.jsx`,
`server/ai/agenticLoop.js` (etiqueta de paso), `useAiChat.js`.
*Hecho cuando:* leyendo el informe de arriba abajo, sin un solo clic, se ven todos los gráficos de la sesión.

### F4 — La respuesta primero
- Al terminar, la NarrativeCard sube al inicio del informe como «Respuesta», con el ancho completo de lectura. El
  recorrido queda debajo como «Cómo llegué».
- Cada valor de un hallazgo abre «Cómo lo obtuve» de la consulta que lo produjo (hoy abre un modal aparte).
- Una línea de **confianza** en lenguaje llano a partir de las salvedades y los pasos no realizados
  («Basado en 9,5 meses de datos · 1 paso no realizado»).

*Archivos:* `Informe.jsx`, `ChatMessage.jsx` (NarrativeCard), `deepDive/Confianza.jsx`.

### F5 — Un inicio que propone preguntas
- **H9** el estado vacío es una caja de pregunta grande al centro, con **preguntas sugeridas a partir del proyecto**:
  las métricas de `metrics.yml`, el glosario y las tablas (por ejemplo «¿Cómo va la venta contra la meta 2024?»).
  Se generan sin modelo, con plantillas; si hay modelo, se pueden refinar después.
- Debajo, en una línea: qué datos puede mirar («5 tablas · 1 vista · metas, ventas, productos… cambiar») y con qué
  política de IA.
- Las acciones técnicas («Ver tablas», «Perfilar datos») quedan como enlaces pequeños para el analista.

*Archivos:* `deepDive/Inicio.jsx`, `server/ai/contextLoader.js` (lectura de métricas y glosario), un endpoint
`GET /api/ai/preguntas-sugeridas` antes del atrapa-todo.

### F6 — Control mientras corre
- **H12** saltar un paso **también mientras corre** (se aplica en la siguiente iteración).
- **Pausar** y **Detener** como botones con nombre en el encabezado del informe mientras corre.
- La caja de texto acepta una **indicación en vuelo** («enfócate en Teléfonos»); entra en la siguiente iteración.
  Es la F5.4 de [plan_deep_dive_ciclo_vida.md](plan_deep_dive_ciclo_vida.md).
- El estado en vivo, en lenguaje llano: «Consultando ventas por mes… 2 s».

*Archivos:* `useAiChat.js`, `server/ai/agenticLoop.js`, `Indice.jsx`.

### F7 — Detalle técnico y anchos pequeños
- Interruptor «Detalle técnico»: SQL y filas dentro de cada sección, sin abrir el panel. Se recuerda por persona.
- Bajo ~1100 px el índice se pliega a una tira de puntos y «Cómo lo obtuve» se superpone al informe.

### F8 — Salidas
- «Entregables» en el encabezado: guardar como notebook (existe), **enviar a Report Flow** (cada sección como
  diapositiva, la respuesta como portada) y Word.
- Los gráficos de la sesión se abren en Story Flow desde el índice (hoy no se abren: **H13**).

### F9 — No perder el avance cuando falla la API (pedido 2026-11-07)
**Caso real:** Gemini 3.6 Flash en la capa gratuita (5 solicitudes por minuto). A mitad de un EDA sobre
`export.parquet`, la cuota se acabó: «Failed after 3 attempts… Please retry in 31.29s». El informe quedó con dos
preguntas vacías y una barra roja con el error crudo. Se perdió todo lo hecho en esa ejecución.

**Por qué se pierde (verificado en el código):**
- Una ejecución se guarda como un solo mensaje **al terminar** (`useAiChat.handleSend`). Si el servidor manda
  `error`, el `catch` solo pone el texto del error y vacía `activeToolCalls`: la prosa, las consultas y los
  gráficos de esa ejecución nunca se añaden a `messages` ni se guardan.
- El servidor no reintenta lo suficiente: el SDK reintenta 2 veces con 2 s y 4 s de espera, y Gemini pide esperar
  31 s. El aviso viene en el cuerpo del error, no en una cabecera `retry-after`, así que el SDK no lo respeta.
- Lo que sí sobrevive en el servidor: el plan y el estado de sus pasos (`amoxsql_ai.plans`, vía `update_plan`) y
  los resultados de las consultas (`query_cache`). Con «Continue», el agente retoma el plan, pero la pantalla no
  muestra nada de lo que ya hizo.

**El mecanismo, en tres capas:**
1. **Esperar la cuota en vez de fallar (servidor).** Si una iteración falla por límite de frecuencia (429,
   `RESOURCE_EXHAUSTED`, «quota», «rate limit») y el proveedor dice cuánto esperar (`retry in Ns`, `retryDelay`,
   `retry-after`), y son 90 s o menos, el bucle emite `{ type: 'esperando-cuota', segundos, proveedor }`, espera
   (se puede cancelar con Stop) y **repite la misma iteración**. Como máximo 3 esperas por ejecución. Una cuota
   **diaria** no se espera: pasa a la capa 2.
2. **Guardar lo hecho aunque falle (cliente).** En el `catch` de `handleSend` (error o Stop), si la ejecución ya
   produjo prosa o herramientas, se añade igualmente el mensaje del analista con `fullText` + las llamadas con
   resultado (con su `textOffset`), marcado `interrumpido: { motivo: 'cuota' | 'error' | 'detenido', detalle,
   reintentarEn }`, y se **persiste**. El informe muestra los pasos hechos con sus gráficos, y el plan queda en
   pausa con sus pasos reales (`interrupted` el que estaba a medias, como ya hace la reconstrucción).
3. **Decidir cómo seguir, en lenguaje claro.** La tarjeta de decisión (F1) gana un caso de error:
   «La cuota gratuita de Gemini se agotó (5 solicitudes por minuto). Lo hecho está guardado: 4 de 7 pasos.»
   - **Continue in 31 s**, con cuenta atrás; continúa solo al llegar a cero si lo eliges.
   - **Continue with another model**, que abre el selector de modelo y continúa con el elegido.
   - **Finish with what it has**, que escribe las conclusiones con lo que hay (usa una sola solicitud).
   - **Leave it here.**

   El error crudo queda plegado en «Details». La pestaña y la lista marcan la sesión como «Waiting for you».
   Mientras espera la capa 1, el encabezado dice «Waiting for the quota · resumes in 31 s», con Stop.

**También, visto en la misma captura:**
- Una pregunta sin respuesta por un fallo se ve como un título suelto. Debe decir qué pasó («No answer: the model's
  quota ran out»), con la misma salida de la tarjeta.
- **Fallo:** el botón flotante «Ask about this» se queda fijo en pantalla tras seleccionar texto y desplazarse. Se
  debe cerrar al desplazar el informe, al cambiar la selección y con Escape.

**Ventana que se cierra a mitad:** resuelto en el cliente, no en el servidor (cerrar la ventana cierra la petición
y el servidor para; no hay ejecución que recuperar allí). `utils/borradorDeAnalisis.js` copia lo hecho a
localStorage al final de cada iteración (filas recortadas a 200) y lo borra al guardar la ejecución. Al abrir la
sesión, si el último mensaje guardado es tuyo y hay copia, vuelve como ejecución cortada (`motivo: 'ventana'`).

**F9 hecha el 2026-11-07, sin publicar.** `scripts/probarCuotaDeepDive.mjs` (bucle real del servidor con un modelo
falso: 429 por minuto → espera y sigue; cuota diaria → no espera; Stop corta la espera; un 401 sigue siendo error)
y 10 comprobaciones nuevas en `probarDeepDive.mjs`. Revisado en la app con una sesión cortada por la cuota a mitad
del plan, una pregunta sin respuesta por cuota diaria y una ventana cerrada a mitad. **No probado con Gemini de
verdad**: la espera se probó con el modelo falso.

*Archivos:* `server/ai/agenticLoop.js` (espera de cuota y reintento de la iteración), `server/ai/errores.js` (nuevo,
puro: reconocer un límite de frecuencia y extraer la espera, por proveedor), `client/src/components/ai/useAiChat.js`
(guardar lo parcial), `DecisionDelAnalista.jsx` (caso de error), `informeDeepDive.js` y `InformeDeepDive.jsx`
(episodio interrumpido), `scripts/probarDeepDive.mjs` (errores reales de Gemini, OpenAI y Anthropic como datos).
*Hecho cuando:* con un límite de 5 por minuto, un análisis de 7 pasos termina solo, esperando lo necesario; con una
cuota diaria agotada, lo hecho sigue en el informe al recargar y «Continue» con otro modelo termina el análisis.

## Orden sugerido

**F0 → F1** primero: resuelven lo más grave sin tocar el layout, en una entrega 5.18.x.
**F2 + F3 + F4** juntas: son el cambio de layout y no tienen sentido por separado. Es la parte grande.
**Entrega 3:** **F9 primero** (perder un análisis a medias es lo más caro para quien usa una cuota gratuita), luego
F6 (control en vuelo, que comparte la tarjeta de decisión y la cancelación), F5, F7 y F8.

## Cómo se verifica

- `scripts/probarDeepDive.mjs`: siembra las sesiones de la auditoría (terminada, en pausa, vacía; datos reales de la
  tienda de ejemplo) en una casa temporal, abre Electron y comprueba: nombres de paso, ningún paso no ejecutado
  con palomita, la decisión visible a 1280×800 sin desplazar, ancho de lectura ≥ 600 px, todos los gráficos visibles
  leyendo de arriba abajo, «Cómo lo obtuve» abre la consulta correcta.
- El estado en vivo solo se prueba con un modelo real: queda para tu prueba con el instalador.

## Decisiones que te tocan a ti

1. **¿Se va la lista de conversaciones de la barra lateral cuando estás en Deep Dive?** Propuesta: se pliega sola
   cuando no cabe y vuelve con su botón.
2. **¿La respuesta sube arriba al terminar (F4)?** Cambia la lectura habitual de un chat (lo nuevo abajo). Propuesta:
   sí, porque Deep Dive produce un informe, no una charla; los seguimientos sí van abajo.
3. **Preguntas sugeridas (F5):** ¿solo con plantillas, o pedirle al modelo que las refine al abrir? Propuesta: plantillas
   siempre, modelo opcional (gasta cuota en la nube).
4. **Idioma de la interfaz:** la app está en inglés; los mockups están en español para que los revises. Se
   implementa en inglés salvo que digas otra cosa.
