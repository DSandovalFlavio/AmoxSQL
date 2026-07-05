# Auditoría de Rendimiento a Fondo — 2026-07-04

> Auditoría multi-agente de TODOS los niveles de la app (renderer React, Monaco, streaming AI,
> Electron, server Express/DuckDB), motivada por dos síntomas reproducibles:
>
> **Síntoma A** — En el notebook, al escribir rápido el tecleo se traba y **el cursor se regresa
> al inicio de la línea** (los caracteres aparecen al principio).
>
> **Síntoma B** — En Deep Dive, el texto en streaming se siente trabado; al "terminar de escribir"
> la UI **se congela varios segundos y luego todo el texto cae de golpe**.
>
> Referencia comparativa: código fuente de VS Code (mismo editor Monaco), clonado y estudiado
> (ver §6). Ambos síntomas tienen causa raíz identificada con evidencia `file:line`.

---

## 1. Resumen ejecutivo

**Veredicto: NO hay que reestructurar la aplicación desde la base.** La arquitectura (3 procesos,
App como shell de fases, LayoutManager dueño de tabs, keep-alive de paneles, sin Redux) es
razonable. Lo que hay son **~15 defectos concretos que se componen multiplicativamente**, con 4
críticos. VS Code usa exactamente el mismo editor (Monaco ES el editor de VS Code); la diferencia
de fluidez no está en el editor sino en **cómo lo hospedamos**: AmoxSQL envuelve a Monaco en un
ciclo React que copia el texto 3 veces, se lo re-aplica al editor, y re-renderiza el árbol
completo de la app en cada tecla.

Las 4 causas dominantes:

| # | Causa | Síntoma que explica |
|---|-------|---------------------|
| 1 | `setValue()` reactivo con protocolo "anti-eco" defectuoso en SqlEditor | **A** — cursor salta a (1,1) |
| 2 | Cascada `onTabsChange` → re-render de App COMPLETA por cada tecla + `localStorage.setItem` síncrono del archivo entero por tecla | **A** y lentitud general al escribir |
| 3 | Un `setState` por token sin throttle + re-parseo de markdown de TODA la conversación por chunk + gráficos Recharts re-renderizando por token | **B** — streaming trabado |
| 4 | Evento SSE `finish` que serializa TODOS los resultados de queries sin límite de filas (server bloqueado en `JSON.stringify`, cliente bloqueado en `JSON.parse`)… y el cliente **descarta el dato** | **B** — el congelón final + volcado |

Agravante transversal: el uso diario es en **modo dev** (StrictMode = doble render, React
dev-build, DevTools abierto) → todo se percibe 2-4× peor que el build empaquetado. Los defectos
existen igual en prod, pero **toda medición debe hacerse contra `pnpm dist`**.

---

## 2. Síntoma A — El cursor que salta al inicio de línea (notebook)

### 2.1 La cadena causal completa

El único código de toda la app que reescribe programáticamente el buffer de Monaco es
`editorRef.current.setValue(value)` en `client/src/components/SqlEditor.jsx:332`. Monaco responde
a `setValue()` recolocando el cursor en (1,1) y destruyendo el undo stack — en una celda de una
línea, eso es literalmente "el cursor se regresa al inicio de la línea".

Cómo se llega ahí:

1. **El texto se copia 3 veces**: modelo Monaco → `localContent` en `NotebookCell.jsx:40`
   (debounce 300ms) → array `cells` en `SqlNotebook.jsx:14` (debounce 500ms).
2. **Re-inyección incondicional hacia abajo**: `NotebookCell.jsx:87-91` tiene
   `useEffect(() => setLocalContent(content), [content])` — cuando el debounce sube un valor y el
   usuario sigue tecleando, este efecto puede pisar un `localContent` más nuevo con `content` viejo.
3. **Closures stale**: `updateCell`/`moveCell`/`addCell` (`SqlNotebook.jsx:181-228`) capturan el
   array `cells` del render en vez de usar functional updates → un timer de 300ms disparado tarde
   hace `map` sobre un array viejo y **revierte el contenido de otras celdas**.
4. **El protocolo anti-eco falla**: `SqlEditor.jsx:298-334` compara el prop `value` entrante contra
   un historial de valores emitidos (`broadcastHistoryRef`, cap 50). El contenido BASE de la celda
   nunca pasó por `onChange` → no está en el historial → `setValue()`. Y la línea 333 **vacía el
   historial tras cada setValue**, así que el primer salto deja el sistema sin protección → cascada.
5. **La ventana de carrera solo es alcanzable porque el main thread está saturado**: cada tecla
   re-renderiza la ResultsTable/gráfico de la celda (memo anulado por `currentEditorQuery={localContent}`
   y arrows inline, `NotebookCell.jsx:460-473`), corre el rescan de CTEs con regex sobre el documento
   completo (`SqlEditor.jsx:600-631`, sin debounce), y cada pausa dispara re-render de TODAS las
   celdas (NotebookCell sin memo, `NotebookCell.jsx:513`) + `JSON.stringify` del notebook completo
   con resultados embebidos + `localStorage.setItem` síncrono + re-render de App entera (§4).
   Commits de React de cientos de ms abren la ventana entre "tecla nueva" y "resync con contenido viejo".

### 2.2 Hallazgos del notebook (severidad · evidencia)

| # | Hallazgo | Sev. | Evidencia |
|---|----------|------|-----------|
| N1 | `setValue()` manual con anti-eco por comparación de contenido; resetea cursor; historial se vacía tras cada uso | CRÍTICA | `SqlEditor.jsx:298-334` |
| N2 | Triple copia del texto + doble debounce + efecto de resync incondicional que puede revertir contenido y perder los últimos caracteres | CRÍTICA | `NotebookCell.jsx:40,87-91,141-154` · `SqlNotebook.jsx:14,173-178` |
| N3 | Mutadores de `cells` con closures stale, sin functional updates ni `useCallback` (Move pierde ediciones de forma 100% determinista) | ALTA | `SqlNotebook.jsx:181-228` · `NotebookCell.jsx:379-380` |
| N4 | Cada tecla re-renderiza ResultsTable + Recharts de la celda: memo anulado por `currentEditorQuery={localContent}`, `onDbChange={() => {}}` inline, `options` de Monaco recreado por render | ALTA | `NotebookCell.jsx:460-473` · `SqlEditor.jsx:1116-1155` |
| N5 | `NotebookCell` sin `React.memo` + props inestables desde SqlNotebook → cada `setCells` re-renderiza N celdas × (Monaco + tabla + gráfico) | ALTA | `NotebookCell.jsx:513` · `SqlNotebook.jsx:550-573` |
| N6 | Serialización del notebook COMPLETO (con hasta 500 filas de resultados por celda) + `localStorage.setItem` síncrono en cada pausa de tecleo; `draftSaver` dice "every 10 seconds" pero no tiene throttle | ALTA | `SqlNotebook.jsx:141-161` · `notebookParser.js:103-142` · `draftSaver.js:9-21` |
| N7 | Decoraciones CTE: regex + `getAllDecorations()` sobre el documento completo POR TECLA, sin debounce | MEDIA | `SqlEditor.jsx:600-631` |
| N8 | Un Web Worker + 2 WASM de tree-sitter POR CELDA; sin lazy-mount de editores (N celdas = N Monacos + N workers desde el mount) | MEDIA | `SqlEditor.jsx:701-702,758-768` |
| N9 | Autocompletado: caché de DESCRIBE indexada por el SQL del probe (cambia con cada edición → miss casi garantizado), awaits seriales, caché sin límite | MEDIA | `SqlEditor.jsx:30-33,835-864` |
| N10 | Celdas Input: cada tecla ejecuta SQL real en las celdas dependientes + serializa el notebook, sin debounce | ALTA | `NotebookCell.jsx:280-288` · `SqlNotebook.jsx:351-366` |

**Nota**: el buffer NO es controlado (`defaultValue={value}` en `SqlEditor.jsx:1112`) — la causa
clásica de `@monaco-editor/react` está descartada; el problema es el protocolo manual de sync.

### 2.3 La reparación de fondo (principio)

**Un solo dueño del texto: el modelo de Monaco mientras el editor tiene foco.**
- Eliminar el protocolo anti-eco por diffing de contenido. `setValue` solo ante eventos explícitos
  de reemplazo externo (cargar archivo, format, cambio de tab) señalizados con una prop de
  versión/epoch — nunca por comparación del prop `value`. Guardia mínima: jamás `setValue` si
  `editor.hasTextFocus()`.
- Eliminar la copia `localContent`; `onChange` debounced directo al padre; el resync hacia abajo
  solo para cambios externos genuinos.
- Todos los mutadores de `cells` con `setCells(prev => ...)` + `useCallback`.
- Cursor/selección como estado del modelo de la celda (patrón `NotebookCellEditorPool` de VS Code, §6).

---

## 3. Síntoma B — Streaming Deep Dive congelado + volcado de golpe

### 3.1 La cadena causal (cliente + server)

**Durante el stream (trabado):** el server emite un `text-delta` por token
(`server/ai/agenticLoop.js:317-320`). El cliente hace `setStreamingText(fullText)` por CADA evento
sin throttle (`useAiChat.js:481-488`, duplicado en `AiSidebar.jsx:327-334`), más dos
`String.match` con regex sobre el texto completo por chunk (detección `<think>`). Cada render
re-ejecuta `groupIntoTurns` y produce un array `turns` NUEVO (`AiDivingPanel.jsx:110-119`) → el
`memo` de `DeepDiveTranscript` nunca hace bail-out → **ReactMarkdown re-parsea TODOS los turnos de
la conversación en cada token** (`DeepDiveTranscript.jsx:54`) → costo O(n²). Los gráficos Recharts
del inspector también re-renderizan por token: `ChatResultsBlock` sin memo recalcula
`columns = Object.keys(data[0])` por render (`ChatResultsBlock.jsx:72,314`) → identidad nueva →
el `memo` de `ChartRenderer` falla. Cuando el render por chunk supera el intervalo entre tokens,
las lecturas del stream se retrasan y el socket entrega ráfagas → texto "a saltos".

**El congelón final:** al terminar, el server emite `finish` con
`queryResults: Object.fromEntries(queryResults)` — hasta 50 queries con **TODAS sus filas sin
recorte** (`server/ai/tools.js:75-81` guarda `data: result.rows` completo;
`agenticLoop.js:647-651`; `index.js:2203-2204`). `JSON.stringify` síncrono de un blob
potencialmente de decenas de MB bloquea el event loop del server; el cliente hace `JSON.parse` del
mismo blob en el main thread… y luego **lo descarta sin usarlo** (`useAiChat.js:527-528` es un
no-op). Al liberarse, se ejecutan de golpe el `setMessages` final y los renders encolados →
"todo el texto aparece de golpe".

**Del lado server, agravantes que producen silencios/ráfagas** (el transporte está limpio: NO hay
`compression` middleware, SSE escribe evento por evento — descartado como culpable):
- `execute_sql` materializa el resultado COMPLETO en JS antes de truncar a 200 filas:
  `reader.getRowObjectsJson()` convierte millones de filas en el hilo JS del server
  (`DatabaseManager.js:240-251`, `tools.js:55-86`). Sin LIMIT inyectado.
- **Una sola conexión DuckDB serializa todo**: query del usuario, DESCRIBE del autocompletado,
  tools del AI, persistencia y chains hacen fila (`DatabaseManager.js:312`, singleton).
- El timeout de 30s de `execute_sql` NO cancela la query (`tools.js:55-60`, `Promise.race` sin
  `interrupt()`) → query zombi ocupando la conexión, todo lo demás encolado detrás.
- `interruptQuery()` interrumpe **lo que sea que esté corriendo**, no la query objetivo
  (`index.js:3069-3078` + `DatabaseManager.js:305-309`).
- `buildTableContext`: DESCRIBE + COUNT(*) seriales de hasta 30 tablas ANTES del primer token
  (`index.js:1888-1906`).
- Bloqueadores síncronos conviviendo con el SSE: `execSync` conda hasta 10s (`index.js:4003`),
  `xlsx.read(fs.readFileSync(...))` (`index.js:1030,1058`), `readdirSync` recursivos, `writeFileSync`.

### 3.2 Hallazgos del streaming (severidad · evidencia)

| # | Hallazgo | Sev. | Evidencia |
|---|----------|------|-----------|
| S1 | Un `setState` con el texto completo por evento SSE, sin throttle; regex O(n) por chunk | CRÍTICA | `useAiChat.js:481-488` · `AiSidebar.jsx:327-334` |
| S2 | Cada chunk re-renderiza toda la transcripción y re-parsea el markdown de TODOS los turnos (array `turns` con identidad nueva por chunk) | CRÍTICA | `AiDivingPanel.jsx:110-119` · `DeepDiveTranscript.jsx:22-76` |
| S3 | Markdown del mensaje vivo re-parseado completo por chunk (también en modo notebook vía ChatMessage + remarkGfm) | CRÍTICA | `DeepDiveTranscript.jsx:54` · `ChatMessage.jsx:571-636` |
| S4 | Evento `finish` con TODOS los resultados sin límite; el cliente lo parsea y lo tira | CRÍTICA | `tools.js:75-81` · `agenticLoop.js:647-651` · `index.js:2203` · `useAiChat.js:527` |
| S5 | Gráficos Recharts del inspector re-renderizan por token (memos rotos por `columns`/turno vivo con identidad nueva) | ALTA | `ChatResultsBlock.jsx:72,314` · `DeepDiveInspector.jsx:49` |
| S6 | `scrollIntoView({behavior:'smooth'})` por chunk | ALTA | `useAiChat.js:221-224` · `AiSidebar.jsx:133-135` |
| S7 | Cada `tool-result` embarca 200 filas en el SSE y en el estado React (existe `/api/ai/query-cache/:id` para rehidratar) | MEDIA | `tools.js:64-114` · `useAiChat.js:500-511` |
| S8 | Silencios entre iteraciones (compaction puede hacer una llamada LLM completa sin emitir eventos) + `saveQueryCache` síncrono mid-stream | MEDIA | `compaction.js:124-129` · `persistence.js:609-618` |
| S9 | `console.log` del schema completo por request en modo prompt-only | BAJA | `AiManager.js:512` |
| E1 | `execute_sql` materializa resultado completo en JS, sin LIMIT | CRÍTICA | `tools.js:55-86` · `DatabaseManager.js:240-251` |
| E2 | Conexión DuckDB única para todo (user/autocomplete/AI/persistencia) | ALTA | `DatabaseManager.js:312` |
| E3 | Timeout de execute_sql no interrumpe la query (zombi) | ALTA | `tools.js:55-60` |
| E4 | `interruptQuery()` no dirigido (puede matar la query de otro) | ALTA | `index.js:3069-3078` |
| E5 | Síncronos bloqueantes en el proceso del SSE (execSync conda, xlsx, readdirSync, writeFileSync) | ALTA | `index.js:4003,1030,434...` |
| E6 | `buildTableContext` serial (30 tablas) antes del primer token | MEDIA | `index.js:1888-1906` |
| E7 | SSE sin `flushHeaders()` ni manejo de backpressure (higiene; chains sí lo hace) | MEDIA | `index.js:2090-2093` vs `4799` |
| E8 | Historial de queries: INSERT por query sin batch; `query()` definido dos veces (código muerto) | BAJA | `DatabaseManager.js:35,196,208` |

---

## 4. Defecto estructural global — la app entera re-renderiza por tecla

Esto degrada TODO el tecleo (editor .sql, markdown, deck, notebook), no solo el notebook:

```
SqlEditor.onChange (por tecla)
 → EditorPane: setLastEditTime (render del pane; EditorPane.jsx:301-304)
 → LayoutManager.handleContentChange → updateTab → setLeftTabs (array nuevo)
   → saveDraft() → localStorage.setItem SÍNCRONO con el CONTENIDO COMPLETO (por tecla; draftSaver.js:9-21)
   → useEffect [leftTabs] (LayoutManager.jsx:49-74):
       → localStorage.setItem(tabs) síncrono (por tecla)
       → onTabsChange → App.handleTabsChange (App.jsx:881-885)
           → setTitleBarTabs + setActiveTabInfo (objetos nuevos, con content y results completos)
           → RE-RENDER DE App COMPLETA POR TECLA
 × 2 en dev por StrictMode
```

| # | Hallazgo | Sev. | Evidencia |
|---|----------|------|-----------|
| G1 | `onTabsChange` dispara por keystroke y hace setState en App con contenido+results → re-render global por tecla | CRÍTICA | `LayoutManager.jsx:49-74,140-152` · `App.jsx:881-885` |
| G2 | `useToast()` devuelve objeto NUEVO por render → invalida los `useCallback` de App que dependen de `toast` → **anula memo(LayoutManager), memo(FileExplorer), memo(DbtPanel)**. Fix de 2 líneas (useMemo o `return ctx`) | CRÍTICA | `ToastProvider.jsx:163-173` · `App.jsx:635,734,844` |
| G3 | `saveDraft` sin throttle: escritura síncrona del archivo completo a localStorage por tecla | ALTA | `draftSaver.js:1-21` · `LayoutManager.jsx:148-151` |
| G4 | Props inline LayoutManager→EditorPane anulan `memo(EditorPane)`; `currentEditorQuery={activeTab.content}` re-renderiza ResultsTable por tecla; `lastEditTime` fuerza render extra | ALTA | `LayoutManager.jsx:986,1003` · `EditorPane.jsx:301-304,335` |
| G5 | Uso diario en modo dev: StrictMode (×2 renders), React dev-build, DevTools auto-abierto (`main.js:153-155`) → percepción 2-4× peor | ALTA (proceso) | `client/src/main.jsx:34` · `electron/main.js:155` |
| G6 | Drag de splitters = setState en App por mousemove sin rAF (sidebar y panel AI); ResultsTable ya lo hace bien (rAF) — usar ese patrón | MEDIA-ALTA | `App.jsx:1180-1183` · `AiAssistantPanel.jsx:247-252` |
| G7 | Componentes grandes sin memo con props inline desde App: AiAssistantPanel (8 arrows inline), TabBar, WindowTitleBar, CommandPalette | MEDIA | `App.jsx:946,1204-1287,1335-1351` |
| G8 | AiAssistantPanel recibe `activeFileContent`/`activeResult` como props reactivas (acoplado al ciclo de tecleo); debería leer on-demand vía `layoutRef` | MEDIA | `App.jsx:1335-1340` |
| G9 | El notebook mete resultados (MB) dentro de `tab.content` → viajan por toda la cadena G1/G3; deben vivir en el sidecar `.sqlnb.state.json` | MEDIA-ALTA | `SqlNotebook.jsx:151-161` |
| G10 | Bundle eager: Recharts (vía ResultsTable→DataVisualizer), mermaid (~1.5MB, estático en MarkdownPreview), katex, DeckEditor, ErDiagram, DbtLineageGraph en el chunk principal; sin `manualChunks` | MEDIA | `EditorPane.jsx:4-13` · `ResultsTable.jsx:7-8` · `MarkdownPreview.jsx:10` |
| G11 | 66 `transition: all` en index.css; `App.css` es dead code del template de Vite (no importado) | BAJA | `index.css:2069,2314,...` |

**Estado del plan previo** ([plan_rendimiento_ui.md](plan_rendimiento_ui.md)): la Fase 1 (memos +
useCallback) **SÍ se implementó, pero está desactivada en la práctica** por G2 (useToast) y G4
(props inline). La cascada G1 no estaba contemplada en ese plan y es hoy la causa dominante.

Cosas verificadas y SANAS (no tocar): GPU activa (cero `commandLine` switches), flags de
BrowserWindow correctos, zoom vía `setZoomFactor` nativo (no CSS), sin polling permanente, sin
compression en Express, writes de localStorage de App.jsx correctamente debounced, spinners CSS
ligados a estados de carga, preload con un solo `sendSync` inicial.

---

## 5. Lo que NO se toca

- **ResultsTable se queda como está** (paginada). La virtualización está VETADA en este repo (3
  intentos previos la empeoraron). Nada en esta auditoría la requiere: los fixes son de
  *frecuencia de render* (memo, throttle, identidades estables), no de estructura de la tabla.
- El "lazy-mount por visibilidad" propuesto para celdas/gráficos NO es virtualización de listas:
  es montar el componente pesado solo cuando entra al viewport (IntersectionObserver), sin
  windowing ni scroll sintético.

---

## 6. Referencia VS Code — por qué ahí "vuela" (código estudiado en local)

Clone sparse en `%LOCALAPPDATA%\Temp\vsc-src\vscode` (`src/vs/base`, `src/vs/editor`,
`workbench/contrib/notebook`, `workbench/contrib/chat`). Rutas relativas a `src/vs/`.

1. **El editor posee el texto; nadie se lo re-aplica.** El buffer vive en `TextModel` (piece tree,
   O(log n) por edit); un keystroke va del DOM al modelo y a un repintado incremental de SOLO las
   líneas afectadas (`ViewLines` + pool de nodos DOM del viewport, `editor/browser/view/viewLayer.ts:156`).
   N keystrokes en un frame = 1 repintado (`view.ts:880-888`). No existe ninguna ruta por la que el
   texto "suba" a un estado de UI y "baje" de nuevo al editor. Monaco en AmoxSQL ya hace todo esto
   solo — lo rompemos nosotros con el `setValue` reactivo (N1).
2. **Cursor/selección = estado del modelo de la celda, no del widget.** VS Code tiene un componente
   dedicado solo a no perder el cursor al reciclar la vista: `NotebookCellEditorPool.preserveFocusedEditor`
   (`notebook/browser/view/notebookCellEditorPool.ts:72`).
3. **Notebooks: editores por fila visible, no por celda.** Un `CodeEditorWidget` por template
   reciclable + `setModel()` al reasignar (`cellRenderer.ts:260-303`); con 200 celdas hay ~10-15
   editores vivos. Equivalente permitido en AmoxSQL: `createModel()` por celda (barato, vive fuera
   de React) + montar el widget solo en celdas visibles/enfocadas; el resto, HTML coloreado estático
   (`monaco.editor.colorize` cacheado) hasta recibir foco.
4. **Chat streaming a ~20 Hz con drenado suave.** Timer de 50ms por respuesta activa
   (`chatListRenderer.ts:1026-1039`); los tokens se acumulan en el modelo y en cada tick se revelan
   `elapsed × rate` palabras, con `rate` = velocidad medida del modelo clamp(40..2000 w/s) y
   **mínimo 80 w/s al completar** — el buffer restante se drena animado, nunca de un tirón
   (`getProgressiveRenderRate`, `chatListRenderer.ts:469-491`). Elimina exactamente el freeze+dump.
5. **Solo se re-parsea la parte de markdown en crecimiento**: diff por partes de contenido +
   `replaceWith` del último nodo (`chatListRenderer.ts:1909-2085`); los bloques cerrados no se tocan.
6. **Scheduling como disciplina**: `Delayer` (debounce), `Throttler` (colapsa peticiones),
   `RunOnceScheduler`, `runWhenGlobalIdle` con presupuesto de `IdleDeadline` (tokenización en
   background cede cada 1-2ms, `textModelTokens.ts:445-499`), `scheduleAtNextAnimationFrame` con
   prioridades y separación lecturas/escrituras de DOM (`dom.ts:464-506`).

---

## 7. Plan de corrección priorizado (impacto/esfuerzo)

### Fase 0 — Quick wins (1 sesión; desbloquean todo lo demás) · **HECHA (commit `f985f67`)**
1. **G2**: `useToast` estable (2 líneas) — reactiva de golpe memo(LayoutManager/FileExplorer/DbtPanel).
2. **S4**: eliminar `queryResults` del evento `finish` (nadie lo consume) + recortar `cacheEntry.data` a ≤500 filas.
3. **G3/N6**: debounce real (5-10s por path + flush en `beforeunload`) en `draftSaver`, excluyendo resultados.
4. **S1**: throttle del streaming — acumular deltas en un ref y flush con rAF o intervalo de 50-80ms; `isThinking` incremental sobre el delta.
5. **S6**: `scrollIntoView` → rAF-throttled y `behavior:'auto'` durante stream.
6. **S9**: quitar el `console.log` del schema (`AiManager.js:512`).
7. **G5** (proceso): no auto-abrir DevTools; medir siempre contra build empaquetado.

### Fase 1 — Tecleo (Síntoma A de raíz) · **HECHA (commit `0378427`)**

> **G9 — DESCARTADO por decisión de producto (2026-07-05):** los resultados embebidos en el
> `.sqlnb` se quedan. El formato v3.0 es autocontenido a propósito: al compartir el notebook,
> el receptor ve resultados y gráficos sin re-ejecutar. El costo (serialización más pesada al
> guardar) es aceptable y ya quedó fuera del hot path del tecleo (debounce + sin cascada).
1. **N1/N2**: un solo dueño del texto — eliminar anti-eco y `localContent`; `setValue` solo por señal explícita (epoch) y nunca con `hasTextFocus()`.
2. **N3**: functional updates + `useCallback` en todos los mutadores de `cells`.
3. **N4/N5**: `memo(NotebookCell)` + callbacks estables; `currentEditorQuery` muestreado al ejecutar (no por tecla); memoizar `options` de Monaco.
4. **G1**: desacoplar `onTabsChange` — App recibe solo metadata de tabs (id/nombre/dirty); `activeTabInfo` on-demand vía `layoutRef` (también cubre G8).
5. **G4**: estabilizar props LayoutManager→EditorPane; `lastEditTime` a ref.
6. **N7**: decoraciones CTE con debounce 150-300ms y `createDecorationsCollection`.
7. **G9**: resultados del notebook al sidecar `.sqlnb.state.json`, nunca dentro de `tab.content`.
8. **N10**: debounce 400-600ms en la propagación de celdas Input.

### Fase 2 — Streaming (Síntoma B de raíz) · **HECHA (commit `86d1df2`)** — S7 verificado sin cambio (el evento tool-result comparte el objeto de 200 filas del modelo); el typewriter adaptativo (punto 3) queda como pulido opcional de Fase 3
1. **S2/S3**: `<TranscriptTurn>` memoizado por turno (turnos históricos derivan solo de `messages`); el turno vivo aparte; markdown del mensaje vivo como texto plano o parseando solo el bloque final (bloques cerrados memoizados) — patrón VS Code §6.5.
2. **S5**: `columns`/`isDateCol` a `useMemo([data])`; `memo(ChatResultsBlock)`; turno vivo sin recrear objeto cuando solo cambió texto.
3. Typewriter con tasa adaptativa y drenado a ≥80 w/s al completar (§6.4) — opcional pero es el acabado "VS Code".
4. **E1**: inyectar LIMIT (~501) en `execute_sql` con el `applyRowLimit` existente (`index.js:3046`).
5. **E3**: `interrupt()` en el timeout de execute_sql.
6. **E2/E4**: conexiones DuckDB por carril (user / metadata-autocomplete / AI+persistencia) — DuckDB Neo permite `instance.connect()` múltiple; interrupt dirigido.
7. **E6**: `buildTableContext` en una sola query (`duckdb_tables()` con `estimated_size`) o en paralelo.
8. **S7**: tool-result a ~50 filas en el SSE; rehidratar por `queryId` bajo demanda.
9. **E7**: `flushHeaders()` + heartbeat durante compaction (S8).

### Fase 3 — Fondo y pulido
1. **N8**: worker SQL singleton compartido, documentos por `model.uri` (la infra de ruteo ya existe); lazy-mount de Monaco por celda (visible/enfocada; resto HTML coloreado).
2. **G10**: `lazy()` para DataVisualizer, DataProfiler, mermaid (dynamic import como QueryPlanViewer), DeckEditor, ErDiagram, DbtLineageGraph; `manualChunks` para recharts/monaco/markdown-stack.
3. **G6**: drags con mutación directa de DOM + un setState en mouseup (o rAF como ResultsTable).
4. **E5**: `fs.promises` en el server, `exec` async para conda, xlsx a `worker_thread`.
5. **G7**: memo + callbacks estables para AiAssistantPanel, TabBar, WindowTitleBar, CommandPalette.
6. **N9**: clave de caché de DESCRIBE normalizada + LRU; `Promise.all`.
7. **G11**: `transition: all` → propiedades explícitas; borrar `App.css`.
8. **E8**: batch del historial de queries; borrar el `query()` muerto.

**Criterio de "hecho" por fase**: React DevTools Profiler antes/después — al teclear en una celda
solo deben renderizar Monaco + esa celda; durante streaming, solo el turno vivo; siempre validado
también contra el build empaquetado (`pnpm dist`).

---

## 8. Correcciones a docs existentes detectadas de paso

- `CLAUDE.md` dice que el stdout del server "se pipea a través de main" — ya no:
  `utilityProcess.fork` sin `stdio` → `inherit` (`electron/main.js:233-243`).
- [pendiente_rendimiento_multiples_graficos.md](pendiente_rendimiento_multiples_graficos.md):
  las 4 hipótesis quedan CONFIRMADAS y ampliadas por esta auditoría (este doc la sustituye como
  fuente para la sesión de optimización).

## 9. Metodología

6 agentes en paralelo sobre v3.5.0 (`main@2c7420e`): tecleo de notebook, streaming Deep Dive,
arquitectura del renderer, Electron/server, código fuente de VS Code (clone sparse), y cartografía
de la app (que produjo [mapa_aplicacion.md](mapa_aplicacion.md)). Todos los hallazgos tienen
evidencia `file:line` verificada en el código actual; ninguno se basa en suposición.
