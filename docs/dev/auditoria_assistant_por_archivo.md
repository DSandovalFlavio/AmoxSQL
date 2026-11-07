# Auditoría — el Assistant en cada tipo de archivo

**Fecha:** 2026-11-07 · **Rama:** `claude/plan-5-19-interaccion`
**Completa a:** [auditoria_ux_assistant.md](auditoria_ux_assistant.md) (A1–A13, el `.sql`)
**Plan:** [plan_ux_assistant.md](plan_ux_assistant.md) · **Mockups:** el artifact «El Assistant donde está el trabajo»

## Alcance

Los nueve tipos de archivo que AmoxSQL crea (menú de archivos, paleta de comandos, «+» de la pestaña):

| Tipo | Editor | Se crea desde |
|---|---|---|
| `.sql` (también un modelo dbt) | `EditorPane` + `SqlEditor` | Files, Ctrl+N, paleta |
| `.sqlnb` notebook | `cuaderno/CuadernoEditor` | Files, Ctrl+Shift+N, paleta |
| `.md` | `MarkdownEditor` | Files |
| `.amoxdeck` Report Flow | `deck/DeckEditor` | Files, paleta, Story Flow «presentation» |
| `.amoxvis` gráfico (Story Flow) | `AmoxvisPane` + `DataVisualizer` | paleta («New Chart»), «Save as chart…» |
| `.sqlchain` Data Flow | `chains/ChainEditor` | paleta, botón de la barra |
| `.amoxcanvas` Canvas | `lienzo/LienzoEditor` | Files, paleta |
| `.amoxdiagram` (y el mermaid dentro de un `.md`) | `diagram/DiagramEditor` | Files, paleta |
| texto (`.yml`, `.json`, `.py`, `.txt`, sin extensión…) | `TextEditor` | paleta («New Text File»), abrir cualquiera |

**Fuera:** Deep Dive (ya tiene su plan), las pestañas que no son archivo (diagrama ER, linaje dbt) y el nodo
**AI Enrich** de Data Flow (procesa datos fila a fila; no es una conversación).

## Cómo se revisó

Leyendo el camino completo en el código, de punta a punta, para cada tipo:

1. **Qué puertas hay:** el botón Assist (`onToggleAi`) de cada editor, Ctrl+L, y las IA propias de cada editor.
2. **Qué ve:** `LayoutManager.getActiveTabInfo` → `useAiChat` (`requestBody`) → `server/index.js /api/ai/chat/stream`
   → `server/ai/prompt/modes.js` (`buildAssistantModeSection`, `buildLiveEditorState`) → `politica.sanearOpciones`.
3. **Qué puede cambiar:** `write_file` (`server/ai/tools.js:1105`), «Apply to editor», «Apply to chart»
   (`LayoutManager.updateActiveContent`, `updateActiveChartConfig`).
4. **Si el editor se entera del cambio:** cómo cada editor vuelve a leer su `content` cuando llega de fuera.

Lo que depende del modelo (si sigue las instrucciones) no se probó con un modelo; lo demás es comportamiento del código.

## Lo que pasa hoy, en una frase

Hay **un solo camino** para todos los tipos: el texto entero de la pestaña viaja al modelo con la etiqueta
«Current query (editor)» dentro de un bloque ` ```sql `, y la única forma de cambiar algo es reescribir ese texto
completo. Para un `.sql` eso es tosco; para un notebook, un deck o un JSON es peligroso.

## Hallazgos transversales (todos los tipos)

**Alta** puede hacer perder trabajo, romper un archivo o saltarse una regla; **Media** confunde o da respuestas
peores; **Baja** es pulido.

### X1 · Alta — Crear y añadir escriben en disco sin revisión
`write_file` en modo `create` o `append` escribe directamente (`fs.writeFile` / `fs.appendFile`). No hay Accept ni
aviso, y `create` **pisa** un archivo que ya exista con ese nombre. Todo lo demás del Assistant entra al editor y se
guarda a mano; esto no.

### X2 · Alta — La política de IA no filtra el contenido del archivo
`politica.sanearOpciones` filtra el resultado en pantalla, las referencias y los archivos de contexto, pero **no
`currentQuery`**, que es el texto entero de la pestaña. Con la política «solo esquema» o «muestras»:
- un **Canvas** manda la `foto` de cada tarjeta: hasta 50 filas reales por tabla y 2.000 puntos por gráfico;
- un **`.amoxvis`** en modo código puede llevar `data.values` con filas;
- un `.json` o `.csv` abierto como **texto** son los datos mismos.

Todo eso llega a un proveedor en la nube aunque la política diga que no.

### X3 · Alta — En Data Flow y en un gráfico, «Accept» no se ve y luego se pierde
`updateActiveContent` cambia `tab.content`. Los editores que vuelven a leer su contenido cuando cambia por fuera lo
muestran: notebook (`ultimoTexto`), Canvas (`emitido`), Report Flow y diagrama (lo derivan con `useMemo`), Markdown,
texto y SQL (Monaco con `value`). **Dos no lo hacen:**
- `ChainEditor` lee el JSON una vez (`useMemo(..., [])`);
- `AmoxvisPane` / `DataVisualizer` toman la configuración al montar (`useChartState(initialChartConfig)`).

La pestaña queda con el texto nuevo y la pantalla con el viejo. El siguiente cambio en el lienzo vuelve a
serializar lo viejo y borra lo aceptado; guardar sin tocar nada escribe algo que nunca se vio.

### X4 · Alta — «Apply to chart» cambia todos los gráficos montados
El botón de un gráfico del chat lanza `amox_update_chart_config` en `window`. Cada `DataVisualizer` montado lo
escucha y se lo aplica sin mirar de quién es: en un notebook con tres celdas en modo gráfico, cambian las tres.

### X5 · Media — El Assistant no sabe qué archivo tiene delante
- El prompt dice «while they work in the SQL editor or notebook» y presenta cualquier contenido como **«Current
  query (editor)»** en un bloque SQL: un deck, un JSON de Data Flow o un YAML se le describen como una consulta.
- `buildAssistantQueryContext` intenta resolver tablas sobre ese texto. En un deck o un JSON no encuentra nada útil y
  el chip de objetos sale vacío o con ruido.
- No hay instrucciones para ningún formato: no sabe qué es una celda, una lámina, un nodo, una tarjeta, el subconjunto
  de mermaid que el editor visual lee, ni qué claves de un `.amoxvis` son de Story Flow.

### X6 · Media — No ve dónde estás
`getActiveTabInfo` no lleva **ningún foco**: ni la selección (A3), ni la celda, ni la lámina, ni el nodo, ni la
tarjeta seleccionada. Los editores sí lo saben (`activeSlideIndex`, `seleccion` en el Canvas y el diagrama,
`selectedNode` en Data Flow, la celda enfocada en el notebook); solo que no se lo cuentan.

### X7 · Media — No hay tope de tamaño
El texto completo viaja **en cada mensaje**, sin recortar: un notebook largo o un Canvas con sus fotos. Con un modelo
local llena la ventana de contexto antes de empezar; con uno en la nube cuesta más y responde peor.

### X8 · Media — Tres asistentes que no se conocen
| Dónde | Qué hace | Cómo se revisa |
|---|---|---|
| Panel Assistant | chat por archivo | Accept / Reject en el chat |
| Barra de IA de Data Flow (`ChainBottomBar`) | genera o amplía el flujo (`/api/chains/ai/generate`) | un diálogo de texto con los nombres de los nodos, y **reemplaza el flujo entero** |
| «Suggest story» de Story Flow (`/api/ai/chart-story`) | escribe título y takeaway | se aplica al instante |

Cada uno tiene su aspecto, su forma de revisar y nada de historial compartido. Quien usa la barra de Data Flow no
puede preguntar «¿por qué pusiste un dedup ahí?».

### X9 · Baja — Las puertas no son las mismas en todos los editores
El botón Assist está en cuatro editores (SQL, notebook, Markdown, Report Flow), con tres textos distintos («Assist»,
«Close Assist», «Close»). En gráfico, Data Flow, Canvas, diagrama y texto solo existe Ctrl+L, que nadie descubre.

### X10 · Baja — El inicio es el mismo en todos
«Show all tables · Describe schema · Sample data» sale igual sobre un deck que sobre un diagrama.

## Archivo por archivo

Para cada uno: **hoy** (puertas · qué ve · qué cambia · cómo se revisa), **hallazgos** y **la interacción
correcta**. La interacción correcta sigue siempre las mismas cinco preguntas, para que el Assistant se sienta igual en
todas partes:

1. **Puertas** — dónde se le pide algo sin ir al chat.
2. **Foco** — qué parte del archivo es «esto».
3. **Contexto** — qué más necesita saber, con tope.
4. **Propuesta** — en qué unidad propone (nunca el archivo entero si el archivo tiene partes).
5. **Revisión** — dónde se ve el cambio antes de aceptarlo, y cómo se valida.

---

### 1. `.sql` — consulta (y modelo dbt)

**Hoy.** Botón Assist y Ctrl+L. Ve la consulta, los objetos que lee con sus columnas, el resultado (id, columnas,
5 filas) y el gráfico. Cambia el archivo entero (`write_file`) o el gráfico de sus resultados. Se revisa en el chat
con un pseudo-diff.

**Hallazgos.** A1–A4 de la auditoría anterior siguen. Además:
- **S1 · Alta — No ve el error.** `getActiveTabInfo` no lleva `resultsError`. Si la consulta falló, el Assistant no
  lo sabe: «arréglalo» obliga a pegar el mensaje a mano.
- **S2 · Media — En un archivo con varias sentencias no sabe cuál es «esta».** El editor ya calcula la sentencia bajo
  el cursor (Ctrl+Enter la ejecuta); el Assistant recibe todas por igual.
- **S3 · Media — Un modelo dbt se lee como SQL roto.** `ref('x')` y `source('a','b')` no se resuelven, así que el chip
  de objetos sale vacío y el modelo no ve columnas. AmoxSQL ya tiene el SQL compilado y el Preview
  (`server/dbt/modelo.js`); no se le pasan.

**La interacción correcta.**
- **Puertas:** barra sobre la selección (Explain · Fix · Optimize · Ask…), **Fix with Assist** en el error, **Explain
  this result · Chart it** en la barra de resultados.
- **Foco:** la selección; si no hay, la sentencia bajo el cursor.
- **Contexto:** el resto del archivo resumido (otras sentencias, una línea cada una), los objetos que lee, el error o
  el resultado; en dbt, el SQL compilado y lo que dice el YAML del modelo.
- **Propuesta:** un **rango** del archivo (las líneas de esa sentencia), no el archivo.
- **Revisión:** diff dentro del editor, Accept / Reject por bloque; en dbt la propuesta es en Jinja, nunca en SQL
  compilado.

### 2. `.sqlnb` — notebook

**Hoy.** Botón Assist y Ctrl+L. Ve el markdown entero del cuaderno. **No ve** la celda activa, sus resultados ni sus
errores (el cuaderno ejecuta por su cuenta y `tab.results` está vacío), ni las vistas vivas que deja cada celda, ni
los parámetros como tales. Cambia el cuaderno entero; el editor lo vuelve a leer al aceptar.

**Hallazgos.**
- **N1 · Alta — Una propuesta reescribe todas las celdas.** Para cambiar una celda, el modelo tiene que devolver el
  documento completo: marcas (`materializada`, `borrador`), parámetros del encabezado y texto incluidos. Si renombra
  una celda, pierde su estado visual (el `.sqlnb.state.json` va por nombre) y rompe las celdas que la leen.
- **N2 · Alta — No ve lo que el usuario ve.** Ni la celda en la que está, ni su tabla o su error. «¿Por qué sale
  vacío?» no tiene respuesta.
- **N3 · Media — No sabe que cada celda es una vista.** Las celdas leen a otras por su nombre (`FROM ventas_mes`);
  sin el grafo (`cuaderno/grafo.js`) el modelo propone SQL que vuelve a calcular lo que otra celda ya tiene, o lee
  una tabla que no existe.
- **N4 · Media — `{{parametro}}`** aparece como texto raro dentro del SQL; el modelo no sabe sus valores.

**La interacción correcta.**
- **Puertas:** en la barra de cada celda, un menú **Assist** (Explain · Fix · Chart · Write the text for this
  result); **Fix with Assist** en el error de la celda; en una celda de texto vacía debajo de un resultado,
  **Write from the result above**.
- **Foco:** la celda activa (nombre, SQL o texto, su resultado o su error).
- **Contexto:** la lista de celdas (nombre, una línea, qué lee), las vistas vivas con sus columnas y los parámetros
  con su valor.
- **Propuesta:** **por celda**: cambiar el SQL o el texto de una celda, o **añadir una celda después** de otra.
  Nunca el cuaderno entero.
- **Revisión:** el diff dentro de la celda; una celda nueva aparece como **fantasma** (borde discontinuo) en su
  sitio, con Accept / Reject. Se valida que el nombre no choque y que lo que lee exista.

### 3. `.md` — Markdown

**Hoy.** Botón Assist y Ctrl+L. Ve el documento. Cambia el documento entero. El editor tiene tres vistas (editar,
dividido, leer); en «leer» no hay dónde ver un diff.

**Hallazgos.**
- **M1 · Media — Reescribe todo para cambiar un párrafo.** En un documento largo, el diff de 380 px es ilegible y el
  riesgo de que el modelo «mejore» lo que no se pidió es alto.
- **M2 · Media — No ve la selección** ni la sección en la que estás.
- **M3 · Baja — No sabe que hay archivos especiales.** `RULES.md` y `context/glossary.md` son **sus propias reglas
  y glosario**: «añade una regla para que…» debería saber que está escribiendo ahí.

**La interacción correcta.**
- **Puertas:** barra sobre la selección (Rewrite · Shorter · Explain · Continue); en la vista de lectura, la misma
  barra sobre el texto seleccionado.
- **Foco:** la selección; si no hay, la sección (del encabezado al siguiente del mismo nivel).
- **Contexto:** el índice de encabezados y la sección; el documento entero solo si es corto.
- **Propuesta:** la selección o la sección.
- **Revisión:** diff en la vista de código; en la vista de lectura, el texto propuesto subrayado en su sitio con
  Accept / Reject. Un bloque mermaid se trata como diagrama (apartado 8).

### 4. `.amoxdeck` — Report Flow

**Hoy.** Botón Assist y Ctrl+L. Ve el markdown del deck (encabezado, láminas separadas por `---`, directivas de
diseño, bloques ` ```amoxchart `). Cambia el deck entero; el Studio lo vuelve a leer.

**Hallazgos.**
- **R1 · Alta — Reescribe todo el deck** para tocar una lámina: directivas `<!-- layout: X -->` y rutas de gráficos
  incluidas. Un error en una ruta deja una lámina sin gráfico.
- **R2 · Media — No sabe en qué lámina estás** (`activeSlideIndex` no sale del Studio) ni qué diseños existen.
- **R3 · Media — No ve los gráficos de las láminas.** Una lámina con ` ```amoxchart src: x.amoxvis ` es una ruta;
  para escribir su titular el modelo necesita el tipo de gráfico, la consulta y sus cifras.

**La interacción correcta.**
- **Puertas:** en la barra de la lámina, **Assist** (Tighten the text · Write the headline from the chart · Speaker
  notes · Add a slide after); en la tira de miniaturas, «Add a slide with Assist…».
- **Foco:** la lámina activa (su diseño, texto y gráfico).
- **Contexto:** el índice de láminas (número, diseño, título), los diseños disponibles y, de la lámina activa, su
  `.amoxvis` resumido (tipo, consulta, columnas, muestra).
- **Propuesta:** **por lámina**: cambiar una o añadir una después, con su diseño.
- **Revisión:** la miniatura de la lámina marcada como propuesta; en la vista grande, **Antes / Propuesta** sobre el
  mismo lienzo de la lámina. Se valida con `parseDeck` ida y vuelta, que el diseño exista y que el gráfico exista.

### 5. `.amoxvis` — gráfico (Story Flow)

**Hoy.** **Sin botón**; solo Ctrl+L. Ve el JSON de Vega-Lite crudo, presentado como «query». **No ve** los datos
del gráfico, ni sus paneles, ni en qué etapa de Story Flow estás. Su consulta está dentro del archivo
(`usermeta.amoxsql.consulta`) pero nadie la ejecuta para el modelo. Al aceptar, la pantalla no cambia (X3).
Aparte, la etapa Story tiene su propio **Suggest story** (X8).

**Hallazgos.**
- **V1 · Alta — Reescribir el JSON entero es la operación equivocada.** El archivo lo regenera Story Flow desde los
  paneles (en modo `interfaz` el spec se rehace al abrir): lo que el modelo cambie a mano en el spec se pierde al
  reabrir, salvo en modo código.
- **V2 · Media — No tiene datos para opinar.** Para «¿qué gráfico cuenta mejor esto?» necesita columnas, tipos y una
  muestra del resultado de su consulta.
- **V3 · Media — Dos asistentes en la misma pantalla**: Suggest story y el panel no comparten nada.

**La interacción correcta.**
- **Puertas:** **Assist** en la cabecera de Story Flow; en cada etapa, su pregunta (Type: «Which chart tells this
  best?» · Story: «Write the takeaway» · Style: «Make it readable in a slide»). Suggest story se queda, pero su
  resultado llega como propuesta.
- **Foco:** la etapa abierta y, en la vista Code, la selección del spec.
- **Contexto:** el tipo y los paneles que difieren de los de por defecto, la consulta, sus columnas y 5 filas (con la
  política aplicada).
- **Propuesta:** **cambios de paneles** (las mismas claves que guarda Story Flow: tipo, ejes, resaltados, notas,
  título, takeaway). En la vista Code, un parche del spec, compilado en el servidor como ya hace `display_chart`.
- **Revisión:** la figura con **Antes / Propuesta** y la lista de paneles que cambian («Type: bar → line ·
  Highlight: Sur»). Al aceptar, la figura se actualiza en el momento (arregla X3 para este tipo).

### 6. `.sqlchain` — Data Flow

**Hoy.** Dos caminos. La **barra de IA propia** abajo (genera o amplía; confirma con un diálogo de texto y
**reemplaza el flujo entero**). Y Ctrl+L, que ve el JSON crudo y cuya aceptación no se ve (X3).

**Hallazgos.**
- **F1 · Alta — La confirmación no deja revisar.** «7 nodes: Import → Filter → …» no dice qué pasos cambian, cuáles
  se van ni qué configuración llevan. Aceptar reemplaza el lienzo entero, posiciones incluidas.
- **F2 · Media — No ve el paso seleccionado ni su error.** Un paso que falló tiene su mensaje en el registro; la
  barra de IA no lo recibe.
- **F3 · Media — Ya existe la pieza que haría falta y no se usa.** `diffDeProcesos.js` describe un cambio en pasos,
  campos, conexiones y parámetros (lo usa «What changed»). Es exactamente lo que una propuesta necesita mostrar.

**La interacción correcta.**
- **Puertas:** la barra de abajo se queda donde está, pero es **el Assistant de este archivo** (la misma
  conversación del panel); en un paso con error, **Fix with Assist**; en el menú de un paso, **Explain this step ·
  Write the SQL for this step**.
- **Foco:** el paso seleccionado (tipo, configuración, SQL, último estado y error).
- **Contexto:** el flujo resumido (pasos en orden de ejecución, conexiones, parámetros), sin posiciones.
- **Propuesta:** **pasos**: añadir, cambiar la configuración de uno, conectar o quitar.
- **Revisión:** **sobre el lienzo**: los pasos nuevos como fantasmas, los cambiados resaltados, los que se quitan
  tachados, y al lado la lista de `diffDeProcesos`. Se valida con `computeLayers` antes de mostrarla.

### 7. `.amoxcanvas` — Canvas

**Hoy.** Sin botón; Ctrl+L. Ve el JSON entero **con las fotos** (X2, X7). Al aceptar, el Canvas lo vuelve a leer.

**Hallazgos.**
- **C1 · Alta — Manda datos reales y mucho texto.** Las fotos son filas; con la política de IA, no deberían salir.
  Además, casi todo el texto que viaja son esas fotos.
- **C2 · Media — No sabe qué tarjeta está seleccionada** ni cómo se conectan (las flechas se deducen de lo que lee
  cada consulta, `grafoLienzo.js`).

**La interacción correcta.**
- **Puertas:** en el menú de una tarjeta, **Ask about this card · Explain this number**; en el Canvas vacío o al
  lado de una tarjeta, **Ask a question → cards** (la respuesta llega como tarjetas nuevas).
- **Foco:** la tarjeta seleccionada (tipo, SQL, 5 filas de su foto con la política aplicada).
- **Contexto:** la lista de tarjetas (nombre, tipo, qué lee) y las flechas; **nunca** las fotos.
- **Propuesta:** **tarjetas**: añadir una (conectada a la seleccionada), cambiar el SQL o el texto de una.
- **Revisión:** la tarjeta nueva como fantasma junto a la seleccionada; el SQL cambiado con diff dentro de la
  tarjeta. Se valida con `leerLienzo` ida y vuelta.

### 8. `.amoxdiagram` — diagrama (y mermaid dentro de un `.md`)

**Hoy.** Sin botón y sin IA propia; Ctrl+L ve el mermaid crudo.

**Hallazgos.**
- **D1 · Media — Si el modelo escribe mermaid fuera del subconjunto que el editor lee**, el diagrama se dibuja pero
  el editor visual no puede volver a editarlo (`mermaidFlow.js` lee y escribe un subconjunto). Hoy nada lo comprueba.
- **D2 · Baja — Falta la puerta que más valor tiene:** dibujar un diagrama a partir de una descripción, de un Data
  Flow o de las CTE de una consulta.

**La interacción correcta.**
- **Puertas:** **Draw with Assist…** en la barra del diagrama (descripción libre, o «from a file»: un `.sql` o un
  `.sqlchain`); en un nodo seleccionado, **Expand this step**.
- **Foco:** el nodo o la flecha seleccionados.
- **Contexto:** el mermaid y el subconjunto permitido.
- **Propuesta:** el mermaid nuevo (los diagramas son pequeños; aquí el documento entero sí es la unidad).
- **Revisión:** el diagrama propuesto dibujado con los nodos nuevos resaltados y los quitados en gris, **Antes /
  Propuesta**. Se valida con `mermaidFlow` ida y vuelta.

### 9. Texto — `.yml`, `.json`, `.py`, `.txt`…

**Hoy.** Sin botón; Ctrl+L. Ve el texto como si fuera SQL. Cambia el archivo entero.

**Hallazgos.**
- **T1 · Alta — Puede mandar secretos y datos.** Un `profiles.yml` de dbt o un `.env` pueden llevar contraseñas; un
  `.json` puede ser un archivo de datos. Hoy salen enteros, sin política (X2).
- **T2 · Media — No sabe el idioma del archivo** aunque `tiposDeArchivo` ya lo decide (`yaml`, `json`, `python`…).
- **T3 · Baja — No reconoce los archivos del proyecto** que sí entiende en otro sitio: `context/metrics.yml`,
  `joins.yml`, el `schema.yml` de dbt.

**La interacción correcta.**
- Igual que el `.sql`, sin ejecutar: barra sobre la selección, diff en el editor, propuesta por rango.
- **Contexto:** el idioma; si es un archivo del proyecto conocido, qué es («the workspace measures: each one becomes a
  SQL function»).
- **Nunca** manda un archivo que parezca de credenciales (`profiles.yml`, `.env*`, claves) a un proveedor en la nube:
  el Assistant dice por qué y ofrece trabajar con un modelo local.

## Resumen

| Tipo | Riesgo hoy | Lo que más falla | Unidad de propuesta correcta | Dónde se revisa |
|---|---|---|---|---|
| `.sql` | medio | no ve el error ni la sentencia (S1, S2) | rango | diff en el editor |
| notebook | **alto** | reescribe todas las celdas, no ve la celda (N1, N2) | celda / celda nueva | dentro de la celda, celda fantasma |
| `.md` | medio | reescribe todo (M1) | selección / sección | vista de código o subrayado en lectura |
| Report Flow | **alto** | reescribe el deck, no sabe la lámina (R1, R2) | lámina / lámina nueva | Antes / Propuesta sobre la lámina |
| gráfico | **alto** | aceptar no se ve; JSON equivocado (X3, V1) | cambios de paneles | Antes / Propuesta en la figura |
| Data Flow | **alto** | aceptar no se ve; confirmación ciega (X3, F1) | pasos | fantasmas en el lienzo + lista de cambios |
| Canvas | **alto** | manda las fotos (X2, C1) | tarjeta / tarjeta nueva | tarjeta fantasma |
| diagrama | medio | mermaid que el editor no relee (D1) | el diagrama | Antes / Propuesta dibujado |
| texto | **alto** | secretos y datos a la nube (T1) | rango | diff en el editor |

## Lo que funciona y se conserva

- **Una conversación por archivo**, que vuelve al reabrirlo: vale para todos los tipos.
- **Aceptar no guarda en disco** (salvo X1): el cambio entra al editor y se guarda con Ctrl+S.
- **Los chips de objetos** del `.sql`: el patrón «el usuario ve qué sabe el Assistant» se extiende a cada tipo
  (la celda, la lámina, el paso, la tarjeta).
- **Las piezas que ya existen**: `diffDeProcesos` (Data Flow), `parseDeck`, `leerCuaderno`, `leerLienzo`,
  `mermaidFlow`, la compilación de Vega-Lite del servidor. La propuesta de cada tipo se valida con el mismo lector
  que usa su editor.

## Aparte (no es de este plan)

`build_notebook` en modo `update` (Deep Dive) hace `JSON.parse` sobre el `.sqlnb`, que desde la 5.x es markdown:
añadir celdas a un cuaderno existente falla. Va a `pendientes.md`.
