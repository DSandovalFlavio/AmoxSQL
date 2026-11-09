# Plan — El Assistant donde está el trabajo, en cada archivo

**Sale de:** [auditoria_ux_assistant.md](auditoria_ux_assistant.md) (A1–A13) y
[auditoria_assistant_por_archivo.md](auditoria_assistant_por_archivo.md) (X1–X10 y los hallazgos por tipo)
**Estado:** **E1, E2 y E3 hechas** (2026-11-07/08, rama `claude/plan-5-19-interaccion`); E4–E6 sin empezar. Las seis decisiones,
tomadas como se proponían. Mockups en el artifact «El Assistant donde está el trabajo».

## La idea

**Un solo Assistant, que en cada archivo trabaja con las partes de ese archivo.** Las mismas cinco piezas en todos:

| | Qué es | Ejemplo en el notebook | Ejemplo en Data Flow |
|---|---|---|---|
| **Puertas** | pedir algo sin ir al chat | «Fix with Assist» en el error de la celda | «Explain this step» en el menú del paso |
| **Foco** | qué es «esto» | la celda activa | el paso seleccionado |
| **Contexto** | qué más sabe, con tope | las demás celdas en una línea, las vistas vivas | el flujo en orden, sin posiciones |
| **Propuesta** | la unidad que cambia | una celda, o una celda nueva | pasos que entran, cambian o salen |
| **Revisión** | dónde se ve antes de aceptar | dentro de la celda; la nueva, como fantasma | fantasmas en el lienzo + lista de cambios |

El chat se queda para conversar: anuncia la propuesta en una línea («Proposed a change to cell `ventas_mes` ·
Review») y lleva al sitio donde se revisa.

## Arquitectura

### Una pieza por tipo de archivo (cliente)

`client/src/components/ai/archivos/` — un módulo por tipo, puro donde se pueda, más `index.js` con
`adaptadorDe(tab)`:

| Módulo | Tipo | Lector que usa para validar |
|---|---|---|
| `sql.js` | `.sql`, modelo dbt | — (sentencias con el mismo partidor que Ctrl+Enter) |
| `cuaderno.js` | `.sqlnb` | `leerCuaderno` / `escribirCuaderno`, `cuaderno/grafo.js` |
| `markdown.js` | `.md` | `markdown/markdownModel.js` (secciones por encabezado) |
| `deck.js` | `.amoxdeck` | `parseDeck` / `serializeDeck` |
| `grafico.js` | `.amoxvis` | `leerAmoxvis` / `escribirAmoxvis`, `capacidades.js` |
| `flujo.js` | `.sqlchain` | `computeLayers`, `diffDeProcesos` |
| `lienzo.js` | `.amoxcanvas` | `leerLienzo` / `escribirLienzo`, `sinFotos` (el contexto), `grafoLienzo.js` |
| `diagrama.js` | `.amoxdiagram`, mermaid en `.md` | `parsearFlujo` / `flujoAMermaid`, `porQueNoSeAbre` (`mermaidFlow.js`) |
| `texto.js` | texto | `tiposDeArchivo` (idioma), lista de archivos sensibles |

Cada uno exporta:

```js
contexto(tab, foco)       // → { tipo, idioma, foco, resumen, adjuntos } — con tope (≈12 000 caracteres)
inicio(tab, foco)         // → las sugerencias del inicio para ESTE archivo y este estado
aplicar(texto, propuesta) // → { texto } | { error } — puro: el texto nuevo del archivo
validar(texto)            // → null | 'por qué no' — ida y vuelta por el lector del propio editor
describir(propuesta)      // → «Change cell ventas_mes» — la línea del chat
```

### El foco viaja con la pestaña

Cada editor cuenta su foco con un `onFoco(foco)` que guarda `memoriaDePestana` (una ref por pestaña, **no** estado:
la selección cambia a cada movimiento y no debe repintar nada). `getActiveTabInfo` gana `foco` y `resultsError`.

| Editor | `foco` |
|---|---|
| `SqlEditor`, `TextEditor` | `{ seleccion: { texto, desde, hasta } \| null, sentencia: { desde, hasta } }` |
| `CuadernoEditor` | `{ celda: nombre, seleccion }` + resultado o error de esa celda |
| `MarkdownEditor` | `{ seleccion, seccion }` |
| `DeckEditor` | `{ lamina: indice }` |
| `AmoxvisPane` | `{ etapa, vista: 'paneles' \| 'codigo', seleccion }` |
| `ChainEditor` | `{ paso: id }` + su último estado y error |
| `LienzoEditor` | `{ tarjeta: id }` |
| `DiagramEditor` | `{ nodo \| flecha }` |

### El prompt dice qué archivo es (servidor)

`server/ai/prompt/archivo.js` sustituye a «Current query (editor)»: una sección por tipo con el nombre real («a
Report Flow deck, slide 3 of 9 is open»), el foco, el resumen y **las reglas del formato** (qué es una celda, una
directiva de diseño, el subconjunto de mermaid…), con el bloque en su idioma (` ```yaml `, ` ```markdown `).
`buildAssistantQueryContext` solo corre sobre SQL (el `.sql`, la celda, el paso, la tarjeta).

El contexto del archivo pasa por `politica.sanearOpciones` como todo lo demás: con «solo esquema» o «muestras» se
quitan las fotos del Canvas, los `data.values` de un spec, las filas de un archivo de datos; y un archivo de
credenciales nunca sale a la nube.

### Una sola herramienta para proponer (servidor)

`write_file` se sustituye en modo assistant por dos herramientas que **no escriben nada**:

- **`propose_change`** — `{ objetivo, contenido | cambios, resumen }`, con `objetivo` como unión discriminada (Zod)
  por tipo:

  | `objetivo.tipo` | Campos | Archivos |
  |---|---|---|
  | `rango` | `desde`, `hasta` (líneas) | `.sql`, texto, `.md` |
  | `seccion` | `encabezado` | `.md` |
  | `celda` | `nombre`, `accion: cambiar \| despues_de` | notebook |
  | `lamina` | `indice`, `accion: cambiar \| despues_de`, `diseno` | Report Flow |
  | `paneles` | `cambios` (claves de Story Flow) | gráfico |
  | `spec` | `parche` (Vega-Lite, compilado en el servidor) | gráfico en vista Code |
  | `pasos` | `entran`, `cambian`, `salen`, `conexiones` | Data Flow |
  | `tarjeta` | `id \| despues_de`, `tipo`, `sql \| texto` | Canvas |
  | `diagrama` | `mermaid` | diagrama |

  El servidor comprueba que el `objetivo` sea de los que admite el tipo activo (un modelo que manda `celda` en un
  `.sql` recibe un error que le dice qué usar).
- **`propose_file`** — `{ ruta, contenido, resumen }`: un archivo nuevo. El chat muestra «Create `queries/x.sql`»
  con **Create** y **Open first**; si ya existe, lo dice y no lo pisa. Arregla X1. `append` desaparece: es una
  propuesta `rango` al final.

### La propuesta guarda su estado

La llamada a la herramienta guarda `estado: propuesta | aplicada | rechazada | caducada` en el mensaje. Una ruta
nueva `POST /api/ai/conversations/:id/propuestas/:toolCallId` (antes del atrapa-todo) lo cambia. Al reabrir:
pendiente con Accept / Reject, o «Applied», o «Rejected». **Caducada** cuando el archivo cambió en esa parte desde
que se propuso (se compara el texto del objetivo): se ofrece «Propose again». Arregla A1.

### La revisión, por familias

- **En Monaco** (`ai/revision/RevisionEnMonaco.js`): `.sql`, texto, Markdown en vista de código, el SQL de una celda,
  la consulta de un gráfico, la vista Code de un gráfico, el SQL de una tarjeta. Decoraciones de líneas que salen
  (en una *view zone*) y que entran, y un widget **Accept · Reject · Next**. Diff por líneas `utils/diffLineas.js`
  (LCS), puro. Mientras está pendiente, esas líneas son de solo lectura (decisión 2).
- **Por partes** (`ai/revision/Fantasma.jsx`): la celda nueva, la lámina nueva, la tarjeta nueva, el paso nuevo. El
  mismo aspecto en todos: borde discontinuo del acento, etiqueta «Proposed», Accept / Reject en su esquina.
- **Antes / Propuesta** (`ai/revision/AntesYPropuesta.jsx`): el gráfico, la lámina, el diagrama. Un conmutador sobre
  el mismo lienzo, más la lista de lo que cambia.

Aceptar **nunca** guarda en disco: llama a `aplicar`, pasa `validar` y entra al editor como un cambio más (se deshace
con Ctrl+Z en los editores que lo tienen).

### Los editores que no releían su contenido

`ChainEditor` y `AmoxvisPane` / `DataVisualizer` aprenden a releer cuando el contenido llega de fuera, con el mismo
patrón que el notebook y el Canvas (`ultimoEmitido`): si lo que llega no es lo último que emitieron, lo vuelven a
leer. Arregla X3, y de paso un cambio hecho en otra pestaña o en el disco.

## Fases

Cada fase es una entrega que se puede usar. A partir de E2 cada fase lleva **sus tipos completos** (puertas, foco,
contexto, propuesta, revisión, inicio y pruebas), en lugar de una capa de todo a la vez.

### E1 — Que no rompa ni filtre (todos los tipos, sin cambiar la forma)
| | Cambio | Arregla |
|---|---|---|
| 1 | `propose_file` en lugar de `write_file create/append`; nada se escribe sin **Create** | X1 |
| 2 | El contenido del archivo pasa por la política de IA; las fotos del Canvas nunca salen; los archivos de credenciales no van a la nube | X2, C1, T1 |
| 3 | En `.sqlchain`, `.amoxvis`, `.amoxcanvas` y `.amoxdiagram` el Assistant **explica pero no propone** hasta su fase (el servidor no le da `write_file` ahí, y el prompt lo dice) | X3, V1 |
| 4 | «Apply to chart» va con el id de la pestaña; solo ese gráfico lo recibe; fuera la rama muerta de `update_chart_config` en `useAiChat` | X4 |
| 5 | El prompt dice el tipo de archivo con su nombre real y su idioma; `buildAssistantQueryContext` solo sobre SQL; tope de tamaño | X5, X7 |
| 6 | La propuesta guarda su estado (A1); «Apply to editor» → **Insert at cursor** / **Replace selection** (A2); idioma y CLOUD (A10, A11) | A1, A2 |
| 7 | La guía deja de prometer «Selección = alcance» hasta E2 | — |

**Tamaño:** pequeño. **Se prueba:** `probarAssist.mjs` (política sobre cada tipo, `propose_file` que no pisa, el
prompt por tipo) y la app con conversaciones sembradas.

**Hecha (2026-11-07).** Lo que quedó:
- `server/ai/archivoActivo.js` (puro): `tipoDe`, `esCredencial`, `prepararArchivo` → `{ tipo, nombre, idioma,
  contenido, notas, puedeProponer, retenido }`. Lo llama `politica.sanearOpciones` en modo assistant con cualquier
  política (el tope, las fotos y las credenciales valen también con «filas»); `currentQuery` queda solo con SQL y el
  resto del archivo viaja en `archivo`. `buildAssistantModeSection` y `buildLiveEditorState` lo usan; el bloque va
  en su idioma. El tope es de 16.000 caracteres por líneas enteras; un archivo recortado o con partes retenidas
  tampoco admite propuestas (perdería lo que el modelo no ve).
- `write_file` solo tiene `content` y `description`, y solo se ofrece si `archivo.puedeProponer`. `propose_file`
  comprueba la ruta y que no exista, y no escribe. `POST /api/ai/propuestas/crear-archivo` crea con `flag: 'wx'`.
- **Un hallazgo más grave que A1:** desde que `edit_file` pasó a llamarse `write_file`, `ChatMessage` filtraba
  por el nombre viejo y **ninguna** propuesta tenía Accept / Reject, ni en la sesión: todas salían como «Write
  file ✓». Ahora `PropuestaBlock` pinta cada estado (`client/src/components/ai/propuestas.js`, puro): pendiente,
  aplicada, rechazada, **caducada** (la huella FNV del archivo cambió desde la propuesta: se ofrece «Propose
  again») y **anterior** (sin estado guardado). El estado va en la propia llamada del mensaje;
  `POST /api/ai/conversations/:id/propuestas/:toolCallId` lo cambia (`persistence.setEstadoPropuesta`).
- Aceptar en un `.sql` va por `executeEdits` del Monaco de la pestaña (`memoriaDePestana.editorDe`): Ctrl+Z lo
  deshace. «Insert at cursor» es un solo botón: en el cursor, o sobre la selección si la hay (el toast dice cuál);
  en una línea con texto, la consulta va después, separada por una línea en blanco. Solo en `.sql`; en los demás,
  Copy y Run.
- «Apply to chart» solo en `.sql`, y el evento lleva `tabId`: `DataVisualizer` lo toma solo con `destinoIa`
  (`ResultsTable` le pasa `clavePestana`).
- Los chips de objetos solo leen una consulta; «Pensando…» → «Thinking…»; CLOUD con cualquier proveedor que no sea
  local; la exportación a Markdown dice el estado de cada propuesta.
- `scripts/probarAssist.mjs` 54/0. Siguen verdes `probarDeepDive` 46, `probarCuotaDeepDive` 14, `probarGraficoIA`
  14, `probarGraficos` 177, `probarFlujoGrafico` 22, `probarInteraccion` 106. En la app (tienda de ejemplo,
  conversación sembrada): la propuesta antigua sale como «earlier session», Accept aplica y Ctrl+Z deshace, el
  estado sobrevive al servidor, Create crea y abre el archivo, Insert at cursor entra en la línea vacía y sobrevive
  al cambio de pestaña.

### E2 — La base, con `.sql` y texto
- Las piezas comunes: `archivos/index.js`, `propose_change`, `diffLineas`, `RevisionEnMonaco`, `onFoco` +
  `memoriaDePestana`. (La ruta de estados y el lado del servidor del archivo activo, `server/ai/archivoActivo.js`,
  ya están desde E1: `propose_change` crece sobre ellos.)
- **`.sql`:** foco (selección o sentencia), `resultsError` (S1), propuesta `rango`, diff en el editor; barra sobre la
  selección (Explain · Fix · Optimize · Ask…), **Fix with Assist** en el error, **Explain this result · Chart it**
  en los resultados, Ctrl+L con selección = Ask; el inicio según el estado (A6). dbt: SQL compilado y YAML del
  modelo en el contexto, la propuesta en Jinja (S3).
- **Texto:** lo mismo sin ejecutar; el idioma (T2); los archivos del proyecto que conoce (T3).
- El botón **Assist** con el mismo texto y el mismo sitio en todos los editores que lo tienen (X9).

**Tamaño:** grande (es la base). **Se prueba:** `diffLineas` (entra, sale, se mueve, se repite), `aplicar`/`validar`
de `sql.js` y `texto.js`, «Insert at cursor» que no toca lo demás, la selección y el error en el prompt.

**Hecha (2026-11-08).** Lo que quedó (y en qué se aparta del dibujo de arriba):
- **Servidor.**
  - `propose_change` solo en los tipos por líneas (`archivo.porLineas`: `.sql` y texto). Recibe
    `target: { kind: 'lines', start_line, end_line, current_text? }`, `new_text` y `summary`; la unión ya está
    lista para los objetivos de E3–E5. Comprueba el rango y, si `current_text` no coincide, busca dónde está ese
    texto (si aparece una sola vez). Quita los prefijos `12 | ` que el modelo copie. Devuelve `objetivo`,
    `contenido`, `original` y `ancla` (las líneas vecinas).
  - En esos tipos, `write_file` ya no se ofrece.
  - El prompt numera las líneas y añade «Where the user is» (la selección, o la sentencia bajo el cursor) y «The
    last run failed». `archivoActivo.prepararFoco` pasa ambas cosas por la política: el error sale sin los
    literales entre comillas y, si el archivo no sale, su selección tampoco.
  - Los archivos conocidos (`metrics.yml`, `joins.yml`, YAML de dbt, `project.json`, fuentes) llevan una línea
    que dice qué son.
  - Un modelo dbt (`dbtDelArchivo`, que lee `dbtModelo.info` con sus `columnas` nuevas) da nombre,
    materialización, columnas y el SQL compilado del manifiesto, sin lanzar dbt. El compilado sirve para resolver
    las tablas y el prompt pide escribir en Jinja.
- **Cliente, piezas puras.**
  - `utils/diffLineas.js` (LCS, con prefijo y sufijo comunes fuera de la tabla).
  - `ai/archivos/rango.js` (`ubicarRango` / `aplicarRango`): una propuesta por líneas se ubica por su texto, así
    que sigue a sus líneas si se escribe arriba, y solo caduca si cambiaron esas líneas (`propuestas.estadoDe`).
  - `ai/archivos/index.js`: `tipoDePestana`, `sentenciaEn`, `focoDeEditor`, `seleccionConBarra` y `inicioDe`
    (A6, por tipo y estado). No hay un módulo `sql.js` / `texto.js` por separado: hasta E3 comparten todo.
- **El foco.**
  - `memoriaDePestana.fijarFoco` / `focoDe`: fuera de React; `amox_foco` avisa solo cuando cambia la selección.
  - `getActiveTabInfo` gana `id`, `foco` y `resultsError`.
- **En el editor: `ai/revision/conectarAsistente.jsx`**, para `SqlEditor` (solo con `modeloPorPestana`) y
  `TextEditor`.
  - El foco.
  - La barra sobre la selección: content widget; más de una palabra; Escape la cierra hasta otra selección.
    Ofrece Explain · Fix · Optimize · Ask… en SQL y Explain · Improve · Ask… en texto.
  - La revisión, `RevisionEnMonaco.jsx`:
    - lo que sale con una decoración roja; lo que entra en una view zone verde;
    - la barra como content widget colgado de la línea anterior, en un hueco de 30 px (`ordinal` 0, antes de la
      zona verde);
    - solo lectura mientras el cursor está en las líneas de la propuesta;
    - se repinta al cambiar el texto.
  - El chat y el editor se hablan por `ai/propuestasEnEditor.js`, una suscripción por ruta; «Review» manda
    `amox_revisar_propuesta`.
- **Aplicar.** `LayoutManager.aplicarPropuesta` hace una sola edición exacta (el cursor no salta y Ctrl+Z la
  deshace). Sin Monaco de la pestaña (texto) va por el estado de la pestaña; ahí `@monaco-editor/react` también
  la deja deshacer.
- **Las puertas.**
  - `amox_asistir` sale de la barra, de **Fix with Assist** en el error, y de **Explain** / **Chart it** en los
    resultados de un `.sql` (`ResultsTable.onAsistir`).
  - App abre el panel y el panel la convierte en la pregunta.
  - Ctrl+L con selección abre el panel con la caja enfocada.
  - La caja muestra «Selection · lines a–b».
- **X9:** el botón **Assist** es igual en los cuatro editores: el mismo icono, sin «Close Assist» y con
  `aria-pressed`.
- **A4:** `EditProposalBlock` usa `diffLineas`: lo que sale y lo que entra, con dos líneas de contexto y lo demás
  plegado.
- **Pruebas.**
  - `probarAssist.mjs`: 110/0.
  - Siguen verdes `probarDeepDive` 46, `probarCuotaDeepDive` 14, `probarGraficoIA` 14, `probarGraficos` 177,
    `probarFlujoGrafico` 22 y `probarInteraccion` 106.
  - En la app, con la tienda de ejemplo:
    - una propuesta en `.sql` se ve en el editor, bloquea su línea, sigue a su línea al escribir arriba y se
      acepta desde la barra del editor;
    - en `metrics.yml`, una inserción se acepta desde el chat y Ctrl+Z la deshace;
    - la barra sobre la selección envía la pregunta con la selección;
    - **Fix with Assist** manda el error;
    - el inicio ofrece **Fix the error** cuando hay error.
  También **Explain** de los resultados envía la pregunta con el resultado en pantalla (filas y `queryId`).
- **Sin probar:** un modelo real usando los números de línea y `current_text`.

### E3 — Notebook y Markdown
- **Notebook:** foco de la celda con su resultado o error (N2); contexto con las celdas en una línea, el grafo y las
  vistas vivas (N3), los parámetros con su valor (N4); propuesta `celda` (`cambiar` · `despues_de`) (N1); revisión
  dentro de la celda y **celda fantasma**; menú **Assist** en cada celda, **Fix with Assist** en su error, **Write
  from the result above** en una celda de texto.
- **Markdown:** foco selección o sección (M2); propuesta `rango` o `seccion` (M1); barra sobre la selección (Rewrite
  · Shorter · Explain · Continue), también en la vista de lectura con el texto propuesto subrayado; `RULES.md` y el
  glosario reconocidos como suyos (M3).

**Tamaño:** mediano. **Se prueba:** `cuaderno.js` ida y vuelta (marcas, parámetros y estado visual intactos al
cambiar una celda; nombre que choca; celda que lee algo que no existe), `markdown.js` por secciones.

**Hecha (2026-11-08).** Lo que quedó (y en qué se aparta de arriba):
- **Notebook — el foco.** `CuadernoEditor` (con `tabId` nuevo) deja en `memoriaDePestana.fijarProveedorDeFoco` una
  función que se lee al enviar:
  - `celda: { n }`;
  - `cuaderno` (`ai/archivos/cuaderno.estructuraDeCuaderno`: cada celda con número, tipo, nombre, texto, qué lee,
    si corrió o falló, materializada o borrador; los parámetros y las vistas vivas);
  - el `resultado` o el `error` de esa celda. Una celda de texto toma el resultado de la de SQL de arriba.

  `getActiveTabInfo` saca resultado y error del foco y los manda como `results` / `resultsError`: pasan por la
  política, y el `queryId` de la celda sirve a `display_chart`.
- **Notebook — en el servidor.** `archivoActivo` convierte la estructura en el texto que lee el modelo («### Cell 2
  · SQL `ventas_mes` (reads: ventas · ran, 12 rows)», parámetros, vistas vivas), con `porCeldas` y `celdas`.
  `propose_change` acepta `kind: 'cell'` (número) y `kind: 'new_cell'` (`after_cell`, `cell_type`, `name`
  validado y único). Quita las cercas ```sql. Devuelve `objetivo: { tipo: 'celda', accion: 'cambiar' |
  'despues_de', n, celdaTipo, nombre }`, `original` y `anclaNombre`. El prompt explica que cada celda deja una
  vista, `{{param}}` y una celda por llamada. En el notebook ya no se ofrece `write_file`.
- **Notebook — ubicar y aplicar.**
  - `ubicarCelda` busca una celda con nombre por su nombre y una sin nombre por número + texto, o por su texto si
    es único; caduca si su texto cambió.
  - El cuaderno aplica la propuesta sobre **su propio documento**, por `fijarAplicador`, que
    `LayoutManager.aplicarPropuesta` llama para `objetivo.tipo === 'celda'`. Las demás celdas conservan su `id` y
    con él su resultado: releer el archivo los habría perdido.
- **Notebook — la revisión** (`cuaderno/PropuestaEnCuaderno.jsx`): `RevisionDeCelda` bajo la celda (con
  `EditProposalBlock`) y `CeldaFantasma` (borde discontinuo) en el hueco donde entraría.
- **Notebook — las puertas.**
  - El mando **Assist** del canalón (`Canalon`). En SQL ofrece Explain this cell · Fix the error · Chart the
    result; en texto, Write from the result above · Improve this text.
  - **Fix with Assist** en el error de la celda (`Celda`).
  - **Write from the result above** en una celda de texto vacía bajo un resultado (`CeldaTexto`).
  - El inicio del panel, según la celda.
  - **Sin bloqueo de líneas** en el notebook: la propuesta caduca si se edita su celda.
- **Markdown.**
  - Es `porLineas` (como `.sql` y texto): líneas numeradas, `propose_change` por rango y revisión en su Monaco
    (`conectarAsistente` en `MarkdownEditor`, con `tabId` nuevo). No hizo falta el objetivo `seccion`: el modelo
    señala la sección por sus líneas.
  - El foco lleva `seccion` (`seccionEn`: del encabezado al siguiente de su nivel, sin contar los `#` de los
    bloques de código).
  - La barra: Rewrite · Shorter · Explain · Continue · Ask…, debajo de la selección; la burbuja de formato sigue
    encima.
  - **En la vista de lectura** no hay selección ni subrayado (aplazado): un aviso dice que hay propuestas y **Show
    it** pasa a la vista dividida y la enseña.
  - M3: `RULES.md`, `context/glossary.md` y `SKILL.md` se reconocen, con su inicio (Add a rule · Check the rules…).
- **La barra de la revisión en Monaco** pasó de content widget a **overlay widget**, colocado sobre su hueco medido
  en el DOM (zona de 38 px). Colgada de una línea, una línea partida en dos filas quedaba tapada, y el relleno del
  editor de Markdown la corría.
- **Un fallo de antes, arreglado.** Al cambiar de archivo, el panel guardaba en su caché la ruta nueva con la
  conversación vieja: al volver a un archivo se abría el chat de otro, y con E2/E3 sus propuestas habrían llegado
  al editor equivocado. La caché se escribe con la ruta de la conversación (`rutaDeLaConversacion`), y las
  propuestas solo se publican si la conversación en pantalla es la del archivo.
- **Pruebas.**
  - `probarAssist.mjs`: 146/0.
  - Siguen verdes `probarCuaderno` 45, `probarDeepDive` 46, `probarCuotaDeepDive` 14, `probarGraficoIA` 14,
    `probarGraficos` 177, `probarFlujoGrafico` 22 y `probarInteraccion` 106.
  - En la app, con el notebook de la tienda:
    - Review lleva a la propuesta bajo la celda;
    - Accept cambia la celda 2 y deja las demás;
    - la celda fantasma se acepta y entra en su sitio;
    - el menú Assist de una celda de texto envía la celda activa (n = 5) con las 9 celdas y los parámetros.
  - En `RULES.md`:
    - las dos barras sobre la selección, sin pisarse;
    - la propuesta, en el editor y en la vista de lectura (aviso + Show it);
    - Accept desde el editor.
- **Sin probar:** un modelo real eligiendo celda y número, y «Chart the result» de una celda con un modelo real.

### E4 — Report Flow y gráfico
- **Report Flow:** foco de la lámina (R2); contexto con el índice, los diseños y el `.amoxvis` de la lámina
  resumido (R3); propuesta `lamina` (R1); miniatura marcada y **Antes / Propuesta** en la lámina; **Assist** en la
  barra de la lámina (Tighten the text · Write the headline from the chart · Speaker notes · Add a slide after).
- **Gráfico:** botón **Assist** en la cabecera de Story Flow; foco de la etapa; contexto con paneles, consulta,
  columnas y muestra (V2); propuesta `paneles` (y `spec` en la vista Code) (V1); **Antes / Propuesta** en la figura
  con la lista de cambios; la pregunta de cada etapa; **Suggest story** responde como propuesta (V3).
  `AmoxvisPane` relee su contenido (X3).

**Tamaño:** mediano. **Se prueba:** `deck.js` ida y vuelta (diseño que no existe, gráfico que no existe), `grafico.js`
con `capacidades` (un panel que ese tipo no admite se rechaza) y el spec compilado; `probarGraficos` sigue verde.

### E5 — Data Flow, Canvas y diagrama
- **Data Flow:** la barra de IA de abajo pasa a ser **el Assistant de este archivo** (misma conversación; el panel
  se abre si se quiere seguir hablando) (X8); foco del paso con su error (F2); propuesta `pasos`; revisión con
  **fantasmas en el lienzo** y la lista de `diffDeProcesos` (F1, F3); **Fix with Assist** en un paso con error;
  `ChainEditor` relee su contenido (X3).
- **Canvas:** foco de la tarjeta; contexto sin fotos (C1); propuesta `tarjeta`; **tarjeta fantasma** conectada a la
  seleccionada; **Ask about this card**, **Ask a question → cards**.
- **Diagrama:** **Draw with Assist…** (descripción, o desde un `.sql` / `.sqlchain`) (D2); propuesta `diagrama`
  validada con `mermaidFlow` (D1); **Antes / Propuesta** dibujado.

**Tamaño:** grande. **Se prueba:** `flujo.js` (pasos que entran y salen, un ciclo rechazado por `computeLayers`),
`lienzo.js` ida y vuelta sin perder fotos ni tarjetas de tipo desconocido, `diagrama.js` con mermaid fuera del
subconjunto rechazado.

### E6 — El chat, más corto (todos)
- **A7** «Run» corre en el chat, con «Open in editor» (decisión 3); hoy abre una pestaña nueva cada vez.
- **A5** la respuesta primero; el trabajo plegado en una línea («Ran 1 query · proposed 1 change»).
- **A12** el gráfico del chat con sus acciones en un menú y «Apply to this file's chart».
- **A9** el archivo de la conversación arriba del chat; el historial con las del archivo y las recientes.
- El anuncio de cada propuesta con su icono de tipo y **Review**, que lleva al sitio.

**Tamaño:** pequeño.

## Orden

**E1** primero y solo (es corta y cierra los cuatro problemas de Alta transversales). **E2** después: sin la base,
cada tipo se haría a su manera. **E3 → E4 → E5** por riesgo y uso: el notebook es el que más se usa con el
Assistant y el que más arriesga hoy. **E6** puede ir en cualquier momento después de E2.

## Cómo se verifica

- `scripts/probarAssist.mjs` (nuevo, puro, con `AMOXSQL_HOME` temporal cuando toque servidor): `diffLineas`, cada
  módulo de `archivos/` (`aplicar` + `validar` ida y vuelta con archivos reales de la tienda de ejemplo), el prompt de
  cada tipo, la política sobre el contenido de cada tipo, `propose_file` que no pisa, los estados de una propuesta.
- En la app (Electron con home temporal, como `probarInteraccion`): conversaciones **sembradas** con una propuesta de
  cada tipo, para probar Accept / Reject / caducada sin depender del modelo.
- Lo que depende del modelo (que elija el `objetivo` correcto), con tu prueba en cada fase.

## Decisiones (tomadas el 2026-11-07: las seis, como se proponían)

1. **¿Barra flotante sobre la selección o solo Ctrl+L?** Propuesta: las dos; la barra aparece con una selección de
   más de una palabra y se cierra con Escape.
2. **¿Las líneas con una propuesta pendiente se bloquean?** Propuesta: sí, con «Reject» a mano.
3. **«Run» desde el chat:** propuesta: en el chat, con «Open in editor».
4. **La barra de IA de Data Flow:** ¿pasa a ser el Assistant de ese archivo (propuesta), o se queda como una IA
   aparte?
5. **El orden después de E2:** notebook primero (propuesta) o Report Flow primero.
6. **Archivos de credenciales con un proveedor en la nube:** ¿no se mandan nunca (propuesta), o se mandan con las
   claves tapadas?
