# Plan — Conciencia de sesión del Asistente AI

> **Problema en una frase:** el asistente ve el *texto* de tu query pero es **ciego a tu estado vivo** — no sabe qué resultado tienes en pantalla, con qué id referenciarlo, si estás mirando la tabla o un gráfico, ni qué gráfico estás armando. De ahí que pida el `query_id` cinco veces y diga "no puedo ver tu pantalla".

Origen: transcript real `datacsvsql 2.md` (2026-07-22). Auditoría hecha con 3 exploraciones paralelas + lectura directa. Rama: `claude/duckdb-expert` (PR #90).

> **ESTADO: IMPLEMENTADO (2026-07-23)** — las 6 fases están en la rama. Ver "Registro de implementación" al final.

---

## 1. Auditoría — qué recibe HOY el asistente

En modo **assistant**, lo único que llega al modelo sobre tu archivo abierto es:

| Campo | Contenido real | Origen |
|---|---|---|
| `currentQuery` | Texto SQL del editor (verbatim) | `useAiChat.js:493` |
| `currentResult` | **Solo** `{ rowCount, columns:[{name}] }` — sin valores | `useAiChat.js:516-521` → `modes.js:150-152` |
| `currentChartConfig` | `chartType \| X \| Y` (3 claves) | `modes.js:154-155` |
| `filePath` / `fileType` | Ruta y tipo | props |
| Objetos de FROM/JOIN | Columnas+tipos (fix A previo) | `resolveQueryObjects` |
| `uiTheme` | Tema claro/oscuro + accent | `useAiChat.js:498-503` |

## 2. Los 5 huecos (root causes)

### Hueco 1 — El resultado en pantalla es **irreferenciable** (id + datos + qué SQL lo produjo)
Hay **dos almacenes de resultados que nunca se tocan**:

| Ruta | Formato id | ¿En cache que lee `display_chart`? |
|---|---|---|
| IA `execute_sql` (`tools.js:119`) | `qr_<ts>_<rand>` | **Sí** (Map en memoria + `amoxsql_ai.query_cache`) |
| Run manual `/api/query` (`index.js:3471`) | UUID | **No** — el id solo vive en `activeQueries` para *cancelar* y se borra en `finally` (`index.js:3554`) |

Tres cortes independientes, cada uno fatal:
1. **Servidor:** `/api/query` nunca llama `saveQueryCache` — las filas se descartan tras la respuesta HTTP.
2. **Transporte:** el cliente manda `currentResult` sin `queryId`, sin filas, sin `resultsQuery` (la SQL que produjo el resultado, que puede diferir del editor actual). Todos existen en `tab.results` pero se recortan en `useAiChat.js:516-521`.
3. **Prompt:** `buildLiveEditorState` solo imprime "N rows, columns: …" y la regla (`modes.js:33`) le ordena al modelo "SIEMPRE ejecuta execute_sql primero" → el único `queryId` válido es uno que el modelo mismo genere.

**Consecuencia:** el modelo no puede graficar lo que ya ves; debe re-ejecutar. Los modelos chicos no lo hacen y piden un `query_id` que **no existe** para tu run manual y **no es visible** en ningún lado de la UI.

### Hueco 2 — Sin conciencia de vista (tabla / gráfico / perfil)
`viewMode` (`'table'|'chart'|'profile'`) vive **solo dentro de `ResultsTable`** (`ResultsTable.jsx:27`) y nunca sube al tab. `getActiveTabInfo` no lo expone. Por eso "¿puedes ver el gráfico que construyo?" → "no puedo ver tu pantalla".

### Hueco 3 — El gráfico que armas a mano **no se captura** (tabs .sql)
Para un `.sql`, `EditorPane` monta `ResultsTable` **sin** `onConfigChange` → la config que construyes en la vista Chart **nunca** se escribe en `tab.chartConfig`. El único escritor de `tab.chartConfig` en un `.sql` es la propia IA (`updateActiveChartConfig`). Así que `currentChartConfig` que recibe la IA está vacío/desfasado respecto a lo que realmente editas. (En notebooks sí está cableado: `NotebookCell.jsx:151`.)

### Hueco 4 — Diving mode ignora el estado vivo
`buildLiveEditorState` está gateado a `mode === 'assistant'` (`prompt/index.js:137`). Una conversación Deep Dive recibe **cero** contexto de editor vivo.

### Hueco 5 — Skill exportable para IA externa (no es un bug, es diseño)
`ExternalSkillsSection` (`SettingsModal.jsx:511-577`) genera `.md` desde el código real (`externalSkillTemplates.js`, campos derivados de `DataVisualizer/constants.js`). Es **paste-driven por diseño**: el usuario copia contexto con "Export for AI" y pega el JSON de vuelta. **No** sufre la ceguera de `query_id` (la evita por completo) y **sí** produce config renderizable. Su límite — no ve datos vivos — es inherente a una IA no integrada. Mejora menor posible, no core.

---

## 3. La idea clave de la solución

**Hacer del resultado en pantalla un artefacto de primera clase, referenciable por la IA — sin re-ejecución.**

El desbloqueo elegante: `display_chart` ya tiene un **fallback a cache persistente** (`tools.js:466-474`) — si el id no está en el Map, lo busca en `amoxsql_ai.query_cache` y lo hidrata. Entonces basta con **guardar el resultado del run manual en ese mismo cache** al momento de chatear. El modelo recibe el id en el prompt → llama `display_chart(query_id)` → resuelve contra el cache. **Cero re-ejecución, cambio mínimo.**

El id ya está en el cliente: `/api/query` devuelve `queryId` (`index.js:3546`) y queda en `tab.results.queryId`. Solo hay que enviarlo (con las filas) y persistirlo.

---

## 4. Plan de implementación por fases

> Convención del proyecto: **un commit por fase**, PR al final. Sin tests automatizados → validar corriendo la app.

### Fase 0 — El resultado vivo → cache referenciable (servidor)
- En el handler de `/api/ai/chat(/stream)` (o dentro de `buildAssistantQueryContext`), si `currentResult.queryId` && `currentResult.data`: llamar `aiPersistence.saveQueryCache(dbManager, { id: queryId, query: resultsQuery, columns, data, rowCount, executionTime })`.
- Idempotente (UPSERT o ignore-if-exists). Con eso `display_chart(query_id=<UUID del editor>)` resuelve por el fallback persistente ya existente.
- **Verificar** firma real de `saveQueryCache` (`persistence.js:619`) y que el UPSERT no duplique.

### Fase 1 — Transporte: enviar el estado vivo completo (cliente)
- `useAiChat.js:516-521` — enriquecer `currentResult`:
  ```
  { queryId, resultsQuery, rowCount, columns:[{name,type}], truncated,
    sample: primeras ~5 filas, data: filas (para registrar en cache) }
  ```
  (localhost + DuckDB local = enviar filas es barato; ver "Desktop-native mindset" en CLAUDE.md. Cap al rowLimit ya aplicado.)
- Añadir `currentView` (viewMode) y `resultsQuery` desde `getActiveTabInfo`.
- `getActiveTabInfo` ya devuelve `results`/`resultsQuery`; asegurar que `tab.results.queryId` fluya (ya está en `data`).

### Fase 2 — Prompt: que el modelo VEA el estado (`buildLiveEditorState`)
- Imprimir el resultado **con su id**: `**Resultado** (queryId \`<id>\`): N filas [truncado]; columnas con tipos; muestra de 5 filas`.
- Añadir línea: **"Puedes pasar este queryId directamente a display_chart / citarlo — no necesitas re-ejecutar si el resultado corresponde a la query actual."**
- Imprimir **vista activa**: "El usuario está viendo la vista **TABLA / GRÁFICO / PERFIL**".
- Imprimir el **gráfico en construcción** (ya parcial).
- Nota de correspondencia: si `resultsQuery !== currentQuery`, decir "este resultado lo produjo `<resultsQuery>`; el editor ahora muestra otra query (difieren)".
- Relajar la regla dura de `modes.js:33`: preferir el `queryId` vivo cuando coincide; `execute_sql` solo si no hay resultado vivo o la query cambió.

### Fase 3 — Conciencia de vista (subir `viewMode` al tab)
- `ResultsTable` → propagar `onViewModeChange` (ya existe el hook, `:29`).
- `EditorPane` → pasar `onViewModeChange` que haga `updateTab(tab.id, { viewMode })`, y `initialViewMode={tab.viewMode}`.
- `getActiveTabInfo` → exponer `activeView: tab.viewMode`.

### Fase 4 — Capturar el gráfico del usuario en tabs .sql
- `EditorPane` → cablear `onConfigChange` en `ResultsTable` (como en `NotebookCell.jsx:151`) → `updateTab(tab.id, { chartConfig })` (debounced, ya lo hace `useConfigChangeNotifier` a 500ms).
- Así `currentChartConfig` refleja lo que el usuario realmente arma, y con Fase 2 la IA puede decir "veo que armas un bar agrupado con X=week_start…".

### Fase 5 — display_chart contra el resultado vivo (rematar)
- Con Fase 0, `display_chart(query_id=<UUID>)` ya resuelve. Añadir conveniencia: si el modelo omite `query_id` pero hay un resultado vivo registrado, usarlo (o devolver hint con el id exacto).
- El botón "Apply to chart" del preview ya existe; verificar que aplique la config al `tab.chartConfig` del `.sql`.

### Fase 6 — (Opcional) Paridad diving + mejora skill externa
- Exponer estado vivo (ligero) también en diving mode.
- "Export for AI": incluir la config de gráfico en construcción para que la IA externa itere sobre ella. Secundario.

---

## 5. Qué arregla cada momento del transcript

- *"¿puedes ver mi query?"* → ya funcionaba (currentQuery). ✓
- *"pruébala que se ejecute"* → con id vivo, la IA puede validar sobre el resultado real. (Fase 0-2)
- *"¿puedes ver el gráfico que construyo?"* → **sí**: vista=GRÁFICO + config del usuario. (Fase 3-4)
- *"no sé cuál sería el query_id"* → **desaparece**: la IA ya trae el id del resultado en pantalla y grafica sin pedir nada. (Fase 0-2, 5)
- *`display_chart` JSON inválido* → con el id vivo la IA llama la **tool** `display_chart` (no pega JSON crudo), evitando el error de parseo.

---

## 6. Riesgos / decisiones abiertas
- **Tamaño de payload**: enviar filas al chatear. Cap al rowLimit; localhost lo absorbe. Para num_ctx chico, al prompt solo van 5 filas de muestra + tipos; las filas completas van al cache, no al prompt.
- **Truncamiento**: si el resultado está truncado, `display_chart` grafica solo lo visible (igual que execute_sql con límite). Anotarlo en el prompt.
- **Durabilidad**: `saveQueryCache` en cada chat con resultado nuevo. Reusar el pruning existente del cache. Evitar reescribir si el id ya está.
- **Rama**: implementado en `claude/duckdb-expert` (PR #90), decisión del usuario ("implementa todo de una en la misma rama").

---

## 7. Registro de implementación (2026-07-23)

Todo en `claude/duckdb-expert`:

- **F0** — `registerLiveResultCache(currentResult, conversationId)` en `server/index.js`: si el resultado en pantalla trae `queryId` + filas, las persiste en `amoxsql_ai.query_cache` (idempotente: chequea `getQueryCache` antes de insertar; PK evita duplicados) + `pruneQueryCache`. Llamado en ambos handlers (`/api/ai/chat` y `/chat/stream`) en la rama assistant. `display_chart` ya resuelve por su fallback a ese cache → **cero re-ejecución**.
- **F1** — `useAiChat.js`: `currentResult` ahora lleva `{ queryId, resultsQuery, rowCount, columns:[{name,type}], truncated, executionTime, data(≤500 para cache), sample(5 para prompt) }`. Nuevo `currentView` desde `liveCtx.activeView`.
- **F2** — `buildLiveEditorState` reescrito: vista activa + query + resultado **con su queryId** + tipos + muestra de 5 filas + nota si `resultsQuery ≠ currentQuery`. Regla de `buildAssistantModeSection` relajada: usar el id vivo si existe; **nunca** pedir el `query_id` al usuario. `currentView` enhebrado por index.js → AiManager (`chat`/`streamChat`) → agenticLoop → `buildDynamicSection`.
- **F3** — `viewMode` sube al tab: `ResultsTable` reporta la vista por `useEffect` (montaje + cambio) → `EditorPane` (nueva prop `onPersistUiState`) → `updateTab({viewMode})` → `getActiveTabInfo.activeView`.
- **F4** — `EditorPane` cablea `onConfigChange` del `ResultsTable` de `.sql` → `updateTab({chartConfig})` (solo estado de vista, sin dirty; se persiste a `tab.chartConfig`, NO a `initialChartConfig`, para no disparar LOAD_CONFIG mientras el usuario edita).
- **F5** — sin cambios en `display_chart` (el fallback a cache ya resuelve el id vivo); el prompt guía a usarlo.
- **F6** — `buildLiveEditorState` también se emite en diving cuando hay result/chart/view.

Validado: build cliente OK, `node --check` de index.js/AiManager/useAiChat OK, render de `buildLiveEditorState` verificado. Pendiente: prueba E2E con modelo real en máquina rápida.
