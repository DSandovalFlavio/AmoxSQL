# Auditoría de UX/UI — el Assistant de los archivos

**Fecha:** 2026-11-07 · **Rama:** `claude/plan-5-19-interaccion` (con las tres entregas de Deep Dive)
**Plan:** [plan_ux_assistant.md](plan_ux_assistant.md) · **Mockups:** el artifact «El Assistant donde está el trabajo»

## Cómo se revisó

- Una conversación sembrada sobre `queries/01_panorama_mensual.sql` de la tienda de ejemplo, con datos reales: una
  explicación con su consulta y su gráfico, una propuesta de cambio al archivo (`write_file`) y una consulta nueva
  en un bloque de código.
- La app de pruebas a 1440×900 (panel de 380 px, el ancho por defecto) y tu captura del inicio sobre
  `export.parquet.sql`.
- El código: `AiAssistantPanel.jsx`, `ChatMessage.jsx`, `EditProposalBlock.jsx`, `useAiChat.js`, el lado de
  `LayoutManager` que aplica los cambios (`updateActiveContent`, `appendToActiveContent`) y los atajos.

## Para quién y para qué

El Assistant es el modo cercano: quien escribe SQL quiere **entender, arreglar o mejorar lo que tiene delante**, sin
salir del archivo. A diferencia de Deep Dive, aquí no se delega un análisis: se trabaja con el código. Lo que
importa es que el Assistant esté **donde ya está la mirada** (el editor, el error, el resultado) y que lo que propone
caiga **en el archivo**, revisable, sin romper nada.

## Veredicto

Sabe mucho del archivo: la consulta, los objetos que lee (los chips de columnas son buenos), el último resultado y el
gráfico. Pero todo pasa **en una conversación al costado**. Para pedir algo hay que ir al panel y escribir; para
aplicar lo que propone, hay que leer un diff aproximado de 380 px de ancho y pulsar un botón que reemplaza el archivo
entero. El error de una consulta, una selección en el editor o un resultado no tienen ninguna puerta al Assistant.

La forma correcta es la inversa: **acciones donde ocurre el trabajo, cambios en el propio editor, y el chat para lo
que de verdad es una conversación.**

## Hallazgos

**Alta** impide trabajar o puede hacer perder trabajo; **Media** confunde o estorba; **Baja** es pulido.

### Alta

**A1. Una propuesta sin aplicar aparece como hecha.**
La propuesta de cambio (`write_file`) solo tiene **Accept / Reject** mientras la sesión está viva (`pendingEdits`, en
memoria). Al reabrir el archivo, el mismo bloque se ve como «Write file» con una palomita verde
(`ChatMessage.jsx:596`), como si el archivo ya hubiera cambiado. No cambió. Confirmado en la sesión de prueba.

**A2. «Apply to editor» reemplaza el archivo entero.**
El botón de un bloque de SQL del chat llama a `updateActiveContent` (`LayoutManager.jsx:1710`), que sustituye todo el
contenido por ese fragmento, sin diff ni confirmación. En un `.sql` con varias consultas se pierde todo lo demás (se
puede deshacer, pero nada avisa de qué pasó).

**A3. No hay puertas donde ocurre el trabajo.**
- **La selección del editor no se envía.** `getActiveTabInfo` no la incluye (`LayoutManager.jsx:1746`). La guía dice
  «Selección = alcance: si tienes texto seleccionado, el Asistente trabaja sobre esa selección»: es falso.
- **Un error de consulta** no ofrece «Fix». **Un resultado** no ofrece «Explain» ni «Chart it». Solo el perfil de
  datos y el plan de ejecución mandan un prompt al Assistant (`amox_ai_prompt`).
- Ctrl+L abre o cierra el panel, nada más.

**A4. El diff no es un diff.**
`EditProposalBlock` marca como añadida cualquier línea que no exista *en algún lugar* del archivo original (un
`Set` de líneas). No muestra lo que se quita, marca mal las líneas movidas o repetidas, y lo hace en el panel, lejos
del código que cambia.

### Media

**A5. La respuesta queda debajo del trabajo.** Primero se pintan los bloques de herramientas («Write file», la
consulta del archivo **repetida entera**, 20 líneas), y después la respuesta. En 380 px hay que desplazarse para
leer qué dijo.

**A6. El inicio no usa lo que sabe.** Sobre `export.parquet.sql` ofrece «Show all tables · Describe schema · Sample
data». Sabe que hay una consulta, si falló, si hay resultado: podría ofrecer «Explain this query», «Fix the error»,
«Chart the result».

**A7. «Run» abre una pestaña nueva** por cada consulta del chat (`createNew('sql', sql)`). Tres pruebas, tres
pestañas «Untitled».

**A8. La cabecera son siete iconos sin texto** (historial, nuevo, exportar, Deep Dive, papelera, ayuda, cerrar sin
título), y la barra del editor repite **Close Assist**. La papelera es «Clear chat», que no borra nada (igual que en
Deep Dive).

**A9. La conversación cambia sola al cambiar de pestaña**, sin decirlo: es una por archivo, lo cual es bueno, pero
el historial está detrás de un icono y no se ve de qué archivo es la conversación.

**A10. Idioma mezclado:** «Pensando…», «Encendiendo modelo…» y el título del chip de objetos están en español en una
interfaz en inglés.

### Baja

**A11.** La etiqueta «CLOUD» solo con Gemini. **A12.** El gráfico del chat queda apretado: sus botones se parten en
dos líneas y «Apply to chart» no dice a qué gráfico se aplica. **A13.** Los chips de objetos detectados no se pueden
quitar ni ampliar el contexto desde ahí.

## Lo que funciona y se conserva

- **Una conversación por archivo**, que vuelve al reabrirlo.
- **Los chips de objetos** que lee la consulta, con sus columnas: el usuario ve qué sabe el Assistant.
- **Aceptar no guarda en disco**: el cambio entra al editor y se revisa antes de Ctrl+S.
- **Continuar en Deep Dive** cuando la pregunta crece.

## La propuesta en una línea

**El Assistant donde está el trabajo:** una barra pequeña sobre la selección (Explain · Fix · Optimize · Ask), «Fix»
en el error y «Explain / Chart it» en el resultado; los cambios se proponen **como diff dentro del editor**, con
Accept / Reject por bloque; y el chat, más corto: la respuesta primero, el trabajo plegado y un inicio que sabe en qué
archivo estás.
