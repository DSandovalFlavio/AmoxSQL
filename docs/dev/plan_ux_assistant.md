# Plan — El Assistant donde está el trabajo, en cada archivo

**Sale de:** [auditoria_ux_assistant.md](auditoria_ux_assistant.md) (A1–A13) y
[auditoria_assistant_por_archivo.md](auditoria_assistant_por_archivo.md) (X1–X10 y los hallazgos por tipo)
**Estado:** propuesta, sin implementar (2026-11-07). Mockups en el artifact «El Assistant donde está el trabajo».

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

### E2 — La base, con `.sql` y texto
- Las piezas comunes: `archivos/index.js`, `propose_change`, la ruta de estados, `diffLineas`, `RevisionEnMonaco`,
  `onFoco` + `memoriaDePestana`, `server/ai/prompt/archivo.js`.
- **`.sql`:** foco (selección o sentencia), `resultsError` (S1), propuesta `rango`, diff en el editor; barra sobre la
  selección (Explain · Fix · Optimize · Ask…), **Fix with Assist** en el error, **Explain this result · Chart it**
  en los resultados, Ctrl+L con selección = Ask; el inicio según el estado (A6). dbt: SQL compilado y YAML del
  modelo en el contexto, la propuesta en Jinja (S3).
- **Texto:** lo mismo sin ejecutar; el idioma (T2); los archivos del proyecto que conoce (T3).
- El botón **Assist** con el mismo texto y el mismo sitio en todos los editores que lo tienen (X9).

**Tamaño:** grande (es la base). **Se prueba:** `diffLineas` (entra, sale, se mueve, se repite), `aplicar`/`validar`
de `sql.js` y `texto.js`, «Insert at cursor» que no toca lo demás, la selección y el error en el prompt.

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

## Decisiones que te tocan

1. **¿Barra flotante sobre la selección o solo Ctrl+L?** Propuesta: las dos; la barra aparece con una selección de
   más de una palabra y se cierra con Escape.
2. **¿Las líneas con una propuesta pendiente se bloquean?** Propuesta: sí, con «Reject» a mano.
3. **«Run» desde el chat:** propuesta: en el chat, con «Open in editor».
4. **La barra de IA de Data Flow:** ¿pasa a ser el Assistant de ese archivo (propuesta), o se queda como una IA
   aparte?
5. **El orden después de E2:** notebook primero (propuesta) o Report Flow primero.
6. **Archivos de credenciales con un proveedor en la nube:** ¿no se mandan nunca (propuesta), o se mandan con las
   claves tapadas?
