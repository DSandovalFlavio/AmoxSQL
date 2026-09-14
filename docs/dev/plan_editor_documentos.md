# Plan — Editor de documentos (`.md`)

> Rediseño del editor de markdown para su uso real: **documentación de procesos, flujos y notas escrita por ingenieros de datos**. No es un editor de informes analíticos — eso son los notebooks. Premisa y reparto de formatos en [`auditoria_editor_documentos.md`](auditoria_editor_documentos.md); interfaz en [`mockup_editor_markdown.html`](mockup_editor_markdown.html). Fecha: 2026-09-12. Reemplaza la v1 de este plan, que trataba el `.md` como documento analítico.

---

## 1. Diagnóstico (qué falla hoy)

`MarkdownEditor.jsx` (671 líneas) cubre lo básico: Monaco en modo markdown, tres vistas, índice, autocompletado con `@`, pegado de imágenes y exportación a PDF. Lo que falla, medido contra el uso real:

1. **Las casillas no se pueden marcar.** Se renderizan y ahí acaba todo. Es la interacción principal de un checklist, un runbook y una lista de pendientes, y no existe.
2. **La barra es un inventario, no una jerarquía.** 18 botones del mismo peso, sin etiquetas.
3. **No hay acceso a lo que no tiene botón.** Callouts (`> [!WARNING]`), diagramas mermaid y bloques de código con lenguaje se renderizan pero hay que escribirlos de memoria.
4. **El documento no conoce el proyecto.** El autocompletado con `@` existe (`MarkdownEditor.jsx:212-297`) pero inserta texto plano y solo ofrece esquema, `.sql` y `.amoxvis`: no ofrece `.sqlchain`, ni `.sqlnb`, ni otros `.md`.
5. **Nada agrega entre documentos.** Diez `.md` con pendientes dentro son diez archivos que hay que abrir uno a uno. No hay pendientes del proyecto, ni retroenlaces, ni búsqueda en contenido.
6. **No hay noción de vigencia.** Un runbook de hace dos años se ve igual que el de ayer.
7. **El índice está capado.** `tocEnabled = viewMode !== 'edit'` (`MarkdownEditor.jsx:419`): escribiendo a pantalla completa no hay navegación, y solo sirve para saltar.
8. **El PDF es un ráster.** `html2canvas` + `jsPDF` (`MarkdownEditor.jsx:119-146`): texto no seleccionable, enlaces muertos.
9. **Un `.md` nuevo nace vacío.** «# New Markdown File» para todos los casos.

---

## 2. Fuera de alcance

**El `.md` no ejecuta nada.** Si aparece un botón de ejecutar, el contenido está en el formato equivocado. Quedan descartados, con su destino:

| Descartado | Dónde vive |
|---|---|
| Bloque `sql` ejecutable con tabla de resultados | `.sqlnb` |
| Gráfico `amoxchart` incrustado | `.amoxdeck`, `.sqlnb` |
| Diccionario desde el perfilado, ficha de métrica | `DataProfiler`, `.sqlnb` |
| «Refrescar todo», «Congelar», frescura de datos | `.amoxdeck` |
| Sidecar `<archivo>.md.state.json` | — (sin resultados, no hay estado) |
| Grupo «Datos» en la barra, variables `{{ }}` | — |
| Convertir a deck / a notebook | — |

**Nada de funcionalidad de IA nueva.** Un `.md` ya abre el Assist al lado y ese asistente ya edita el markdown (`write_file` → `EditProposalBlock`, con diff y aceptar/rechazar). Es suficiente.

**Tampoco:** familia tipográfica, tamaño en px ni color de texto (son controles de procesador de textos, no existen en markdown), ni WYSIWYG real (ver §3.1).

**La interfaz resultante es más pequeña que la actual.** Ese es el objetivo, no un efecto secundario.

---

## 3. Decisiones técnicas

### 3.1 Monaco se queda

Descartados CodeMirror 6, ProseMirror/Tiptap, Lexical y Milkdown. Un WYSIWYG real obliga a un modelo de documento propio serializado a markdown en cada pulsación: se pierde el diff limpio en Git —que para documentación versionada es el punto— y quedan dos editores distintos en la app con dos temas y dos sistemas de atajos. El límite honesto: con Monaco los `##` siempre se ven.

### 3.2 El estado del documento sale de mdast

El selector de bloque, la barra contextual de tablas, el reordenar secciones y **el mapeo casilla-renderizada → línea del archivo** son el mismo problema: saber qué nodo hay bajo el cursor o bajo el clic y en qué líneas vive. Se resuelve una vez con `unified` + `remark-parse` + `remark-gfm`, ya instalados y ya usados así en `generateWordReport.js:11-24` y `generatePptxReport.js:27-37`. `node.position` da rangos exactos.

Parse con debounce de ~120 ms. Para documentos de decenas de KB es sub-milisegundo.

### 3.3 El menú `/` empieza por el proveedor de completado

| | `registerCompletionItemProvider` | `addContentWidget` + portal |
|---|---|---|
| Filtrado difuso, flechas, Enter | gratis | a mano |
| Snippets con tab stops (`InsertAsSnippet`) | gratis | a mano |
| Diseño del mockup (grupos, pie con atajos) | no | sí |
| Coste | bajo | medio-alto |

Se empieza por el proveedor; el catálogo (fase 2) es el mismo dato para las dos rutas.

### 3.4 Un índice del proyecto, servido por el backend

Los pendientes agregados, los retroenlaces y la búsqueda en contenido son **la misma lectura**: recorrer los `.md` del proyecto y extraer front-matter, casillas y enlaces. Un endpoint nuevo en vez de N peticiones desde el renderer:

```
GET /api/docs/index
→ [{ path, frontmatter: {owner, estado, revisado, tags},
     tasks: [{ line, text, done, owner, due }],
     links: [ruta relativa…] }]
```

Se cachea por `mtime`, igual que hace `ai/skills.js` con los SKILL.md. Con eso salen tres funciones de una.

### 3.5 Convenciones en texto plano, sin formato propietario

Nada de sintaxis inventada. Responsable y vencimiento son texto al final de la línea, se resaltan y se filtran, y fuera de AmoxSQL siguen siendo una lista normal:

```markdown
- [ ] Avisar a los consumidores aguas abajo @flavio vence 2026-09-14
```

El front-matter es YAML estándar (`js-yaml` ya está en las dos raíces de dependencias). Los diagramas son bloques ` ```mermaid ` normales.

### 3.6 Marcar una casilla escribe en el modelo, no en el disco

El clic en la vista previa localiza la línea vía mdast y aplica un `executeEdits` **sobre el modelo de Monaco**, no un write directo al archivo. Si se escribiera a disco con el editor abierto y sucio, el siguiente guardado pisaría la marca. El documento se marca como modificado igual que si se hubiera tecleado.

### 3.7 El front-matter no es markdown, pero CommonMark cree que sí

Un párrafo seguido de `---` es un **título setext**, así que las cuatro líneas
de metadatos YAML se convertían en una sección fantasma: ensuciaba el índice,
descuadraba el contador de secciones y —lo peligroso— `moveSection` podía
moverla y destrozar el archivo.

Se detecta en `parse()` con una expresión sobre el origen y se cuelga del árbol
(`tree.data.frontmatter`), para que `blockAt` lo reporte como **Cabecera** y
`sections` lo salte. Sin añadir `remark-frontmatter` ni tocar las firmas.

### 3.8 Dependencias nuevas

**Ninguna obligatoria.** Única candidata: `markdown-table` (~3 KB) para realinear tablas; son ~40 líneas propias. Recordar la cuarentena de 24 h de pnpm 11 (`minimumReleaseAge`).

---

## 4. Fases

### Fase 1 — Núcleo mdast, selector de bloque y barra en tres grupos — **hecha** (2026-09-13)

Con dos desvíos respecto al mockup, ambos para no perder funciones por el camino hasta que llegue la fase 2:

- **Formato lleva cinco botones, no cuatro**: el tachado se queda en la barra hasta que exista la burbuja de selección, que es donde le toca vivir.
- **El menú *Insertar* ya funciona como desplegable** (lista, lista numerada, tarea, cita, código, diagrama, separador y los cinco callouts). Es la misma lista de datos que en la fase 2 alimentará el menú de `/`, por eso vive en `INSERT_ITEMS` y no en el JSX.

**Nuevo:** `client/src/components/markdown/markdownModel.js`

```js
parse(content)                       // → árbol mdast, con caché de un hueco
blockAt(tree, line)                  // → { type, label, level, startLine, endLine, node }
sections(tree)                       // → títulos con rango de líneas y slug
sectionAt(tree, line)                // → la sección que contiene la línea
moveSection(content, from, to)       // → contenido nuevo (una sola edición)
taskAt(tree, line) / tasks(tree)     // → casillas, para la fase 3
replaceLineMarker(lineText, marker)  // → { prefixLength, text }
formatTable(content, node)           // → { text, startLine, endLine }
```

`blockAt` distingue título (con nivel), párrafo, cita, **callout** (y de qué
tipo), código (y de qué lenguaje), tabla, lista, lista numerada, tarea (marcada
o no) y separador. Una `#` dentro de un bloque de código no es un título, que es
justo lo que una regex no acertaba.

**Barra:**

```
[Título 2 ▾] │ B  I  <>  link │ tarea  tabla  [+ Insertar] │ ... │ [estructura][vistas] [Guardar] [Assist]
   bloque            formato            insertar                        contexto
```

El selector refleja el nodo bajo el cursor y lo convierte: títulos 1-6, párrafo, cita, callout (5 tipos), código, tabla, tarea. Reutiliza `toggleLinePrefix` y `removeHeadings`, ya escritos.

**Aceptación:** el selector acierta el tipo en cualquier línea y convierte entre todos ellos sin tocar sintaxis.

**Verificado:** 81 comprobaciones sobre `markdownModel` (bloques anidados, callouts, `#` dentro de código, rangos de sección con subtítulos, mover secciones en los dos sentidos, realineado de tablas con alineación y barras escapadas, y 35 conversiones de marcador incluidas sangrías e idempotencia), más `pnpm client:build`. La ruta de interfaz en la app **no** está ejercitada: requiere instalar las dependencias de la raíz (Electron y el binario de DuckDB).

### Fase 2 — Menú `/`, burbuja y barra contextual — **hecha** (2026-09-13)

Con dos desvíos respecto a lo planeado:

- **El catálogo tiene 26 entradas, no 21.** Los cinco callouts se listan por separado (`/aviso`, `/atencion`…) porque escribir el nombre del aviso es lo natural, y los seis niveles de título también.
- **`SlashMenu.jsx` es `slashMenu.js`**: por la ruta del proveedor de completado (§3.3) no es un componente de React, sino el registro del proveedor. La burbuja y la barra de bloque viven juntas en `EditorOverlay.jsx` porque comparten el mismo cálculo de posición.

La familia *Documento* entra a medias: `/cabecera`, `/fecha` e `/indice` —que se genera con los títulos reales del documento— sí; los enlaces a artefactos y las menciones de tabla esperan a la fase 5.

**Verificado:** 62 comprobaciones nuevas (edición de tablas: filas, columnas, alineación, filas desiguales y barras escapadas; disparo del menú `/`: acentos, guiones y los falsos positivos de `docs/dev`, `y/o`, `https://…`; catálogo: ids únicos, snippets e índice generado), más `pnpm client:build` y el linter.

### Fase 2 (original) — Menú `/`, burbuja y barra contextual

Catálogo en `markdownInsertables.js`, 21 entradas en tres familias (texto · procedimiento · documento y proyecto), misma fuente para `/` y para el botón *Insertar*. Cada entrada es un snippet con tab stops.

- **Burbuja de selección**: formato en línea, enlace, cita y *convertir en tarea*. `onDidChangeCursorSelection` + `getScrolledVisiblePosition()` + `createPortal`, el patrón de `FullscreenViewer` (`MarkdownPreview.jsx:79`). Sin acciones de asistente.
- **Barra contextual**: en tabla, añadir/quitar fila y columna, alineación y *Formatear*; en bloque de código, selector de lenguaje y copiar.
- **Bloque de pasos**: lista numerada con casilla, comando copiable y paso de verificación. En el archivo es markdown normal; lo que aporta la interfaz es insertarlo y renumerar al reordenar.

**Aceptación:** escribir un runbook de diez pasos con comandos y avisos sin tocar el ratón.

### Fase 3 — Tareas — **casi hecha** (2026-09-13)

La fase que justifica el rediseño.

- ✅ **Casillas interactivas** en la vista previa (§3.6). Marcar escribe en el documento por `executeEdits`, así que entra en la pila de deshacer. En vista solo-previa Monaco no está montado: ahí se edita el contenido y se avisa al padre, que es la única forma de que la casilla funcione en el modo donde más se usa.
- ✅ **Progreso por sección** (`2/6` con barra) junto a cada título de la vista previa.
- ✅ **Responsable y vencimiento** en texto plano (§3.5), reconocidos solo al final de la línea. Los vencidos se marcan en rojo.
- ✅ **Índice del proyecto** — `GET /api/docs/index` (§3.4), cacheado por mtime, saltando bloques cercados.
- ✅ **Panel de pendientes del proyecto**, agrupado por documento, con filtros y apertura del archivo al pulsar.
- ⬜ **Captura rápida** (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>N</kbd>): pendiente. Necesita un diálogo de entrada y decidir dónde vive el documento de notas del proyecto.

**Desvío:** los filtros del panel son *Pendientes · Todas · Vencidas*, no *Todas · Mías · Vencidas*. La app no sabe quién es el usuario, así que «mías» no se puede resolver sin inventarse una identidad; filtrar por responsable concreto es lo que tendría sentido cuando haya uno configurado.

**Verificado:** 51 comprobaciones (volteo con sangrías, viñetas `*`/`+`, numeradas con `)`, `[X]` mayúscula; responsable y vencimiento en los dos órdenes, y lo que NO deben comerse: `@` a media frase, correos, fechas sin la palabra `vence`; progreso acumulado por nivel de título). Más el endpoint contra el propio repositorio: **330 documentos, 160 tareas, 1141 enlaces**.

**Un fallo que encontró esa prueba:** el escaneo partía las líneas por `\n`, y con los `.md` en CRLF cada línea arrastraba un `\r` que impedía casar el `$` de la expresión de casillas — daba 0 tareas en 330 documentos. Ahora parte por `/\r?\n/`.

- **Casillas interactivas** en la vista previa (§3.6), con progreso por sección (`2/6`) calculado desde mdast.
- **Responsable y vencimiento** (§3.5): resaltado en el render, y vencidas en rojo.
- **Panel de pendientes del proyecto**: agrega los `- [ ]` de todos los `.md` vía `/api/docs/index` (§3.4), agrupados por documento, con filtros *todas / mías / vencidas*. Click abre el documento en la línea.
- **Captura rápida** (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>N</kbd>): añade una tarea con fecha al documento de notas del proyecto (configurable, por defecto `notas.md`) sin cambiar de pestaña.

**Aceptación:** llevar una migración de veinte pasos repartida en tres documentos sin abrirlos uno a uno.

### Fase 4 — Estructura, estado y búsqueda — **hecha** (2026-09-13)

- ✅ **Panel de estructura en las tres vistas** (`OutlinePanel.jsx`), construido con `sectionProgress`: nivel, texto y cuántas casillas lleva hecha cada sección. La condición `tocEnabled` que lo capaba ya no existe.
- ✅ **Reordenar arrastrando** (DnD nativo, el patrón de `TabBar`), con botones ↑/↓ en cada fila y con <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>↑↓</kbd>. Se aplica como una edición sobre el modelo completo, así que el movimiento se deshace de una vez.
- ✅ **Barra de estado**: palabras, tiempo de lectura, secciones y casillas hechas.
- ✅ **Modo foco** (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>): oculta barra y paneles y apaga la numeración.
- ✅ **Estado en Git por sección** (`gitSections.js`): se parsea el diff línea a línea, no por el rango del hunk — un hunk arrastra tres líneas de contexto por lado y marcaría como tocadas secciones que nadie tocó. **Solo se muestra con el documento guardado**: el diff habla del archivo en disco y el panel del documento en memoria, así que con cambios pendientes los números se desplazarían. Cuando no es fiable, el panel lo dice.
- ✅ **Búsqueda**: no se implementó aquí. La lupa del panel llama a la búsqueda global del proyecto — ver [`plan_busqueda_proyecto.md`](plan_busqueda_proyecto.md).

**Detalles de implementación que no estaban en el plan:**

- **El atajo NO es <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>↑↓</kbd>** como decía el plan: en Monaco eso ya es *duplicar línea*, y un `addCommand` no gana esa puja de forma fiable. Se usa <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>↑↓</kbd>, y cada fila del panel lleva además botones ↑/↓ — que es lo que hace la acción descubrible, igual que en el panel de slides de Report Flow.

- Bajar una sección se resuelve **subiendo la siguiente por delante**. Así `moveSection` solo necesita saber «insertar antes de», y no hay un caso especial para la última sección.
- Sube y baja se mueven entre **hermanas del mismo nivel**: un H2 no se cuela en medio de los H3 de otro.
- Los `addCommand` de Monaco se registran una vez y se quedarían con la primera versión del callback —y con un índice vacío—, así que el atajo llama a través de una ref.

### Fase 4 (original) — Estructura, estado y búsqueda

- El índice pasa a panel disponible en las tres vistas (quitar `tocEnabled`), con los rangos de `sections()`.
- **Reordenar** arrastrando (DnD nativo HTML5, el patrón de `TabBar.jsx` y `FileExplorer.jsx` — nada de librerías) y con <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>↑↓</kbd>. Un `executeEdits` por movimiento: un solo undo.
- Por sección: nivel, casillas hechas/totales y estado en Git (`simple-git`, ya usado por `GitPanel`).
- **Búsqueda en el contenido** de todos los `.md`, desde el mismo panel y el mismo índice.
- **Barra de estado**: palabras, lectura, secciones, progreso de casillas, rama, vigencia.
- **Modo foco** (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>).

### Fase 5 — Documento y proyecto — **casi hecha** (2026-09-13)

- ✅ **Cabecera de vigencia** (`DocHeader.jsx`): dueño, estado, última revisión y etiquetas como fichas. *Marcar revisado* pone la fecha de hoy. `leerFrontmatter` / `escribirFrontmatter` reescriben **solo** el bloque YAML, conservando las claves que no se tocan.
- ✅ **Enlaces `@` ampliados** a `.sqlchain`, `.sqlnb`, `.amoxdeck` y otros `.md`, cada uno diciendo qué es.
- ✅ **Retroenlaces** al pie del panel de estructura, del mismo índice del proyecto.
- ⬜ **Plantillas** al crear un `.md`. Pendiente: toca el flujo de creación de archivos, que vive fuera del editor.

### Fase 6 — Diagramas — **hecha** (2026-09-13)

- ✅ Cuatro plantillas mermaid en el catálogo (`/diagrama`, `/diagrama-secuencia`, `/diagrama-estados`, `/diagrama-er`).
- ✅ **Generar el diagrama desde un `.sqlchain`** (`diagramFromChain.js`): el menú lista las chains del proyecto y serializa su DAG a mermaid, con formas según el tipo de nodo y marcando los desactivados. Genera **una vez**; a partir de ahí es markdown editable.

### Fase 7 — Exportación — **a medias** (2026-09-13)

- ✅ **PDF real** por `webContents.printToPDF()` (IPC `export:pdf`): texto seleccionable y buscable, enlaces vivos, saltos de página que respetan títulos y tablas. Se exporta **siempre en claro** — un PDF oscuro es ilegible impreso. `html2canvas` y `jsPDF` ya no se importan en el editor.
- ⬜ Word, HTML autocontenido y copiar con formato.

### Fase 5 (original) — Documento y proyecto

- **Cabecera de front-matter** editable como fichas: dueño, estado, última revisión, etiquetas. Botón *Marcar revisado*. Aviso cuando supera el umbral (configurable, por defecto 6 meses).
- **Enlaces `@` ampliados**: además de esquema y `.sql`, ofrecer `.sqlchain`, `.sqlnb`, `.amoxdeck` y otros `.md`. La ficha abre la pestaña correspondiente — ya existe el mecanismo en `MarkdownPreview.jsx:FileLink` con `onOpenFile`.
- **Retroenlaces**: quién enlaza a este documento, desde el mismo índice de §3.4.
- **Plantillas** al crear un `.md`: runbook, incidencia, documentación de flujo, decisión técnica, checklist, nota. Archivos markdown en `templates/docs/`, editables por el usuario — mismo enfoque que `agent/skills/`. La interfaz rellena dueño y fecha.

### Fase 6 — Diagramas

- Inserción de mermaid con cuatro plantillas (flujo, secuencia, estados, ER) y vista previa en vivo mientras se escribe. El render ya existe (`MermaidDiagram` en `MarkdownPreview.jsx`).
- **Generar el diagrama desde un `.sqlchain`**: leer nodos y aristas del archivo y serializarlos a `flowchart`. El DAG ya está construido en Data Flow (`chainNodeTypes.js`, `chainUtils.js`); es recorrer una estructura que existe.

Genera el esqueleto **una vez**: a partir de ahí es markdown editable, no un enlace vivo. El documento describe el flujo, no lo refleja en tiempo real.

### Fase 7 — Exportación

- **PDF** por `webContents.printToPDF()` sobre una `BrowserWindow` oculta: paginación real, texto seleccionable, enlaces vivos. `main.js` ya tiene el canal IPC y el manejo de `will-download` (`electron/main.js:228-254`). Sustituye al ráster.
- **Word** con `docx` (`generateWordReport.js`) y **HTML autocontenido** (`generateHtmlReport.js`).
- `html2canvas-pro` y `jsPDF` **se quedan en el proyecto**: los usan los gráficos en PPTX, Word y la galería.

---

## 5. Lo que ya existe y no hay que rehacer

| Capacidad | Dónde |
|---|---|
| GFM, casillas renderizadas, KaTeX, mermaid, resaltado, anclas | `MarkdownPreview.jsx` |
| Callouts `> [!NOTE]` y los 5 tipos | `markdownUtils.js:remarkAlerts` |
| Enlaces a archivos del proyecto con vista previa y apertura en pestaña | `MarkdownPreview.jsx:FileLink` |
| Extracción del índice con slugs que casan con el render | `markdownUtils.js:extractToc` |
| Autocompletado contra el esquema real | `MarkdownEditor.jsx:212-297` |
| Pegado y arrastre de imágenes a `assets/` | `MarkdownEditor.jsx:handleImageFile` |
| Parseo markdown → mdast, y YAML | `unified` + `remark-parse`; `js-yaml` |
| DAG de las chains, ya modelado | `chains/chainNodeTypes.js`, `chainUtils.js` |
| Estado de Git del proyecto | `simple-git` + `GitPanel` |
| Decoraciones de Monaco | precedente en `SqlEditor.jsx:465` |

---

## 6. Archivos

**Nuevos**

- `client/src/components/markdown/markdownModel.js` — mdast y operaciones sobre rangos (fase 1)
- `client/src/components/markdown/markdownInsertables.js` — catálogo (fase 2)
- `client/src/components/markdown/SlashMenu.jsx` — proveedor de completado `/` (fase 2)
- `client/src/components/markdown/SelectionBubble.jsx` — burbuja y barra contextual (fase 2)
- `client/src/components/markdown/TasksPanel.jsx` — pendientes del proyecto (fase 3)
- `client/src/components/markdown/OutlinePanel.jsx` — estructura (fase 4)
- `client/src/components/markdown/DocHeader.jsx` — front-matter y vigencia (fase 5)
- `client/src/components/markdown/diagramFromChain.js` — `.sqlchain` → mermaid (fase 6)
- `templates/docs/*.md` — plantillas (fase 5)

**Modificados**

- `MarkdownEditor.jsx` — barra, paneles, cableado; debería *adelgazar*, no crecer
- `MarkdownPreview.jsx` — casillas interactivas, fichas de enlace, cabecera
- `markdownUtils.js` — `extractToc` se apoya en `markdownModel`
- `MarkdownEditor.css` — burbuja, popovers, paneles, pasos, casillas
- `server/index.js` — `GET /api/docs/index` (fase 3)
- `electron/main.js` + `preload.js` — canal IPC de `printToPDF` (fase 7)
- `SettingsModal.jsx` — umbral de vigencia y documento de notas, junto a `markdownDefaultView`

---

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| Marcar una casilla con el editor sucio pisa el cambio al guardar | Se edita el modelo de Monaco, nunca el disco (§3.6) |
| El índice del proyecto se queda obsoleto o cuesta en proyectos grandes | Caché por `mtime` como `ai/skills.js`; solo `.md`, solo front-matter, casillas y enlaces |
| El menú `/` interfiere con escribir una barra normal | Solo se dispara a principio de línea o tras espacio; <kbd>Esc</kbd> cierra y deja el carácter |
| Reordenar secciones corrompe el documento | Un único `executeEdits` por movimiento; rangos siempre desde mdast, nunca desde regex |
| El generador de diagramas se desincroniza de los tipos de nodo | Genera una sola vez y se marca como tal; no promete reflejar la chain en vivo |
| Las convenciones `@usuario` y `vence …` chocan con texto normal | Solo se reconocen al final de una línea de casilla; en cualquier otro sitio son texto |
| No hay tests en el repo | Cada fase se verifica ejercitando la ruta en la app (`pnpm start`); las fases son pequeñas a propósito |

---

## 8. Rediseño de la interfaz (v3) — **hecho** (2026-09-13)

Mockup: `mockup_editor_markdown_v3.html`. Sustituye al reparto anterior; ninguna
función se pierde, todas cambian de sitio.

**El criterio:** cada control vive donde vive lo que toca.

| Toca… | Vive en… |
|---|---|
| Un trozo de texto | Isla flotante sobre la selección |
| Un bloque nuevo | El cursor: `/` y la manija del margen |
| El documento entero | Columna derecha |
| Dónde estoy | Columna izquierda |
| La sesión | Barra superior — cuatro cosas |

De **21 controles permanentes a 5**, y de 64 px de cromo horizontal a 38.

### Lo que se hizo

- **Barra de sesión** (`.mde-topbar`): archivo, estado de guardado, vista y
  asistente. *Guardar* deja de ser un botón permanente y pasa a ser un estado
  que solo se vuelve accionable con cambios pendientes; el hueco se reserva
  para que la barra no baile.
- **Margen izquierdo** (`OutlinePanel` → `.mde-rail`): sin fondo, sin borde, sin
  esquinas, sin cabecera con icono. Progreso como barra de 2 px. Se pliega
  entero — nada de tira de iconos.
- **Columna derecha** (`DocPanel`, nuevo): documento, tareas (con pestaña del
  proyecto), enlaces distinguiendo *sale* de *entra*, y acciones con nombre.
  `DocHeader` pasa de tira horizontal a bloque vertical.
- **Lienzo**: sin números de línea, sin resaltado de línea activa y sin guías de
  sangría en «escribir»; medida fija de 74 ch. En «dividido» se conservan.
- **Manija del margen** (`EditorOverlay`): tercera pieza del overlay. Abre
  `InsertMenu` (nuevo) en la línea del ratón, con el catálogo de 30 entradas y
  las cadenas del proyecto.
- **Enlaces salientes**: `enlacesSalientes()` en `markdownModel`, 31 pruebas.

### Decisiones que conviene recordar

- **Los umbrales de columnas son del ancho del editor, no de la ventana.** Con
  el árbol de archivos y el asistente abiertos, una ventana de 1600 deja ~840 px
  aquí. El margen cae primero (tiene sustituto: <kbd>Ctrl+Shift+O</kbd>), la
  columna derecha después (no lo tiene). En vista dividida el margen no se
  muestra nunca.
- **El botón de restaurar el margen solo aparece si al pulsarlo va a pasar
  algo**: si no cabe por ancho, no se dibuja. Un botón muerto es peor que
  ninguno.
- **Monaco no puede pintar los títulos a su tamaño real.** Asume alto de línea
  uniforme, así que un H1 no puede ser más alto que un párrafo. Lo que sí se
  quita es el andamiaje; para verlo compuesto está la vista previa. El mockup
  enseña el ideal, no lo que Monaco permite.

### Trampas encontradas al implementarlo

| Síntoma | Causa | Arreglo |
|---|---|---|
| El editor se queda en blanco | La fila de la rejilla se dimensionaba por contenido; en el primer pintado no hay contenido, Monaco se medía a cero y se quedaba clavado en 5×5 | `grid-template-rows: minmax(0, 1fr)` explícito |
| En vista dividida cuatro paneles caían en dos columnas | `:not(:has(.mde-rail))` pesa más que `.mde-content--split`, y ganaba | Las reglas de dividido repiten las guardas para empatar en peso |
| La manija desaparecía justo al ir a pulsarla | El margen donde vive ya es «fuera» para el `onMouseLeave` de Monaco | El «salir» se escucha en el panel, no en el editor, y con retardo que la propia manija cancela |
| La cabecera decía «documento sin guardar» con el archivo abierto | `EditorPane` nunca pasaba `filePath` al editor de markdown | Se pasa, como a los otros dos editores |

### Lo que `filePath` tenía apagado sin que se notara

Ese último fallo era anterior al rediseño y dejaba muertas cuatro cosas ya
construidas: los cambios de Git por sección, los retroenlaces, el nombre del
archivo en el PDF y el resaltado del documento actual en los pendientes del
proyecto. Todas funcionan ahora.

### Lo que se pierde

Poner negrita con el ratón exige seleccionar antes — la isla no existe sin
selección — y quien busque «Insertar» en la barra no lo va a encontrar. Son dos
hábitos rotos a cambio de una pantalla que no pide nada cuando no la necesitas.

### Rendimiento al plegar la barra lateral

Síntoma: la animación de plegado se ve a tirones, y se nota sobre todo con un
markdown delante. Medido con perfiles de CPU y tiempos entre fotogramas, cuatro
plegados por tanda:

| | React | Disposición (nativo) |
|---|---|---|
| markdown, antes | 1326 ms | 642 ms |
| markdown, ahora | 1346 ms | **415 ms** |
| `.sql` (referencia) | 1293 ms | 340 ms |

Dos arreglos, los dos con medición detrás:

- **`DocPanel` y `OutlinePanel` van con `memo`**, y sus props se estabilizaron
  (`useCallback` para lo propio; los callbacks del padre se leen por referencia).
  Sin esto, cada columna se redibujaba entera en cada fotograma y cada icono era
  un elemento nuevo de React.
- **`contain: layout` en las dos columnas**: su interior no depende del ancho de
  las otras, así que el motor no vuelve a medirlas. Solo `layout` — con `paint`
  se recortaría el menú de estado, que se sale del panel a propósito.

Descartados por medición, no por intuición: guardar el ancho en estado por
fotograma (arreglado igualmente, pero no era el cuello de botella) y el
`automaticLayout` de Monaco (desactivarlo no mejoró nada).

**Lo que queda es anterior al rediseño y afecta a toda la aplicación.** Los
fotogramas largos (4–5 por plegado, el peor ~95 ms) salen igual con un `.sql`
delante. La causa está en `LayoutManager`: guarda el ancho de los paneles en
estado en cada fotograma y eso alimenta un efecto que avisa a `App`, con lo que
el árbol entero se vuelve a dibujar durante toda la animación —`FileExplorer`
aparece en el perfil sin tener por qué—. Arreglarlo toca `LayoutManager` y
`App`, fuera del editor de documentos.
