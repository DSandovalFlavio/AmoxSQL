# Sistema de IA (Chat, Tools, Persistencia, Memoria)

> **Versión documentada:** AmoxSQL v2.1.3 · Fases 1 y 2 del roadmap implementadas.

## Arquitectura General

El sistema AI tiene dos modos: **Assistant** (sidebar contextual del editor) y **Diving** (análisis profundo con persistencia). Soporta Ollama (local) y Gemini (cloud) con un sistema de tiers que adapta funcionalidades según la capacidad del modelo.

```
AiSidebar (React) ──SSE──> /api/ai/chat/stream (Express)
                              ├── AiManager (Vercel AI SDK)
                              │   ├── streamText() / generateText()
                              │   ├── createTools() — 7-9 tools con Zod
                              │   └── buildSystemPrompt() — dinamico
                              ├── AiPersistence (DuckDB)
                              │   └── amoxsql_ai schema (6 tablas)
                              └── Memory/Compaction/UserRules
```

---

## Archivos Clave

| Archivo | Responsabilidad |
|---------|----------------|
| `client/src/components/AiSidebar.jsx` (410+ lineas) | UI del chat, SSE stream, drag-drop context |
| `client/src/components/ai/ChatMessage.jsx` | Renderizado de mensajes (markdown, thinking) |
| `client/src/components/ai/ToolCallBlock.jsx` (111 lineas) | Bloques colapsables de tool calls |
| `server/index.js` (lineas 755-1289) | Endpoints /api/ai/* |
| `server/AiManager.js` (600+ lineas) | Orquestacion: chat, stream, prompt-only |
| `server/ai/tools.js` (443 lineas) | Definiciones de tools con Zod schemas |
| `server/ai/systemPrompt.js` (338 lineas) | Builder de system prompt dinamico |
| `server/ai/persistence.js` | Persistencia en DuckDB (amoxsql_ai schema) |
| `server/ai/memory.js` (144 lineas) | Extraccion de memorias cross-conversacion |
| `server/ai/compaction.js` (147 lineas) | Compactacion de contexto |
| `server/ai/userRules.js` (25 lineas) | Loader de RULES.md |
| `server/ai/modelProfiles.js` | Perfiles y tiers de modelos |

---

## Flujo de Mensajes Completo

```
1. Usuario escribe mensaje en AiSidebar
   -> handleSend() (lineas 219-410)

2. Cliente construye request:
   - messages[], provider, model, mode
   - contextFiles[], contextTables[] (drag-drop)
   - currentQuery, currentResult, currentChartConfig (modo assistant)
   - activeSkillId (opcional)

3. POST /api/ai/chat/stream (server lineas 802-917)
   -> buildTableContext() — Schema de todas las tablas (cache 5min)
   -> buildFileContext() — Columnas + sample rows de archivos
   -> loadUserRules() — Lee RULES.md del proyecto
   -> loadMemoriesText() — Memorias de conversaciones anteriores
   -> getModelProfile() — Determina tier del modelo

4. Segun tier:
   - LOW (1-2B): promptOnlyStreamChat() — 2 pasadas sin tools
   - MEDIUM+ (4B+): streamChat() — streamText() con tool loop

5. Server emite eventos SSE:
   - text-delta: Texto incremental
   - tool-call: { toolName, args, toolCallId }
   - tool-result: { toolName, result, toolCallId }
   - step-finish: Paso completado
   - finish: { usage, queryResults }

6. Cliente parsea SSE stream:
   - text-delta → Acumula fullText, detecta <think> blocks
   - tool-call → Agrega a activeToolCalls con loading=true
   - tool-result → Actualiza tool call con resultado
   - [DONE] → Crea mensaje assistant, merge tool calls

7. Diving mode: Persiste en DB
   -> persistMessage() — POST /api/ai/conversations/:id/messages
   -> persistQueryResult() — Para cada execute_sql
   -> persistChartConfig() — Para cada display_chart
   -> autoTitle() — Auto-genera titulo del primer mensaje
```

---

## AI Tools (server/ai/tools.js)

### Tools Core (todos los modos)

| Tool | Input (Zod) | Funcion |
|------|-------------|---------|
| `execute_sql` | `{ query: string }` | Ejecuta SQL via DuckDB, timeout 30s, max 200 rows. Genera queryId para charts |
| `list_tables` | ninguno | Lista tablas con conteo de columnas y filas |
| `describe_table` | `{ table_name: string }` | Columnas + tipos + 5 sample rows |
| `display_chart` | `{ query_id, chart_type, title, x_axis_key, y_axis_keys[] }` | Crea chart config. 13 tipos: bar, line, area, donut, scatter, bubble, combo, funnel, heatmap, treemap, bar-stacked, bar-horizontal, bar-100 |
| `read_file` | `{ file_path: string }` | Lee archivo (max 50KB, no binarios). Previene path traversal |
| `suggest_followups` | `{ suggestions: string[] }` | 2-4 sugerencias. Senaliza fin del tool loop |

### Tools Mode-Specific

| Tool | Modo | Funcion |
|------|------|---------|
| `build_notebook` | Diving | Crea archivo .sqlnb con celdas |
| `edit_file` | Assistant | Reemplaza contenido del archivo activo |
| `update_chart_config` | Assistant | Merge cambios en chart config activo |
| `save_to_vault` | Ambos | Guarda analisis permanentemente |

### Reglas de Ejecucion
- `execute_sql`: Resultados completos (200+ rows) en Map `queryResults` para referencia de `display_chart`
- Timeout: 30 segundos por query
- Errores: Se retornan como `{ error: message }` al modelo
- `suggest_followups` siempre debe ser el ultimo tool call

---

## System Prompt (server/ai/systemPrompt.js)

### Estructura del Prompt (tier medium+)

```
1. Identidad: "AmoxSQL AI — DuckDB data analyst"
2. Fecha/hora actual
3. Principios: Precision, DuckDB expertise, privacidad, concision
4. Descripcion de tools disponibles (mode-dependent)
5. Reglas de uso de tools (list_tables/describe_table obligatorios)
6. Reglas SQL de DuckDB (QUALIFY, SAMPLE, EXCLUDE, COLUMNS(*), read_*)
7. Tabla de 13 tipos de chart (medium+ only)
8. Contexto de datos: schemas de tablas con columnas y row counts
9. Instrucciones por modo:
   - Assistant: conciso, sidebar, contexto del editor (query, results, chart config)
   - Diving: analisis completo, proactivo, crea notebooks
10. Skill activa (si hay)
11. User Rules (de RULES.md)
12. Memorias (de conversaciones pasadas)
```

### Prompt Compacto (tier low, ~800 tokens)
- Minimo: solo generacion SQL
- Schema compacto (sin row counts, una linea por tabla)
- Sin tools, sin charts

---

## Sistema de Tiers (server/ai/modelProfiles.js)

| Tier | Modelos | Tools | Charts | Steps | Max Tokens |
|------|---------|-------|--------|-------|------------|
| **low** | qwen3:1.7b, phi3:mini | No | No | 1 | 2K |
| **medium** | qwen3:8b, llama3:8b | Si | Si | 5 | 8K |
| **high** | qwen3.5:27b, llama3:70b | Si | Si | 10 | 16K |
| **cloud** | gemini-2.5-flash/pro | Si | Si | 15 | 16K |

### Capabilities por Tier
- `supportsToolCalling` — medium+
- `supportsCharts` — medium+
- `supportsNotebooks` — medium+
- `supportsMemory` — medium+
- `systemPromptBudget` — 800 (low) a 8K (cloud)

---

## Modo Prompt-Only (tier low)

`promptOnlyStreamChat()` en AiManager.js (lineas 369-600+):

```
Pasada 1: Genera texto con SQL embebido (sin tool calling)
Pasada 2: Extrae SQL del texto, corrige nombres de tablas,
           ejecuta, opcionalmente resume resultados
```
- Mapeo virtual de tablas para desambiguar nombres
- Auto-correccion de queries fallidos (maxRetries)
- Retorna async generator de eventos SSE

---

## Persistencia (server/ai/persistence.js)

### Schema `amoxsql_ai` (6 tablas)

| Tabla | Columnas Clave | Proposito |
|-------|---------------|-----------|
| `conversations` | id, title, mode, is_starred, provider, model, file_path, session_name | Metadata de conversaciones |
| `messages` | id, conversation_id, role, content, tool_calls (JSON), token_count | Mensajes de chat |
| `query_results` | id, message_id, sql_query, columns_info, data (JSON max 500 rows), execution_time | Resultados SQL |
| `chart_configs` | id, query_result_id, chart_type, config (JSON) | Configuraciones de charts |
| `memories` | id, category, content, superseded_by | Memorias extraidas |
| `session_artifacts` | id, conversation_id, artifact_type, file_path, sql_snapshot, metadata | Artefactos de sesion |
| `analysis_vault` | id, conversation_id, title, description, sql_content, result_snapshot, chart_config, tags | Analisis guardados |

### Endpoints de Persistencia

| Endpoint | Metodo | Funcion |
|----------|--------|---------|
| `/api/ai/conversations` | GET | Listar (search, limit, offset, mode) |
| `/api/ai/conversations/by-file` | GET | Por archivo (assistant mode) |
| `/api/ai/conversations/:id` | GET | Conversacion completa con messages/results/charts |
| `/api/ai/conversations` | POST | Crear nueva |
| `/api/ai/conversations/:id` | DELETE | Eliminar (cascade) |
| `/api/ai/conversations/:id/star` | PUT | Toggle starred |
| `/api/ai/conversations/:id/title` | PUT | Actualizar titulo |
| `/api/ai/conversations/:id/title/auto` | PUT | Auto-generar titulo |
| `/api/ai/conversations/:id/messages` | POST | Agregar mensaje |
| `/api/ai/conversations/:id/query-results` | POST | Guardar resultado SQL |
| `/api/ai/conversations/:id/chart-configs` | POST | Guardar chart config |
| `/api/ai/vault` | GET/POST/PUT/DELETE | CRUD del vault de analisis |
| `/api/ai/sessions` | GET | Listar sesiones diving |
| `/api/ai/sessions/:id/artifacts` | GET/POST/DELETE | CRUD de artefactos |

---

## Memoria Cross-Conversacion (server/ai/memory.js)

### Extraccion (lineas 12-85)
```
1. Ejecuta en background (no bloquea respuesta)
2. Solo procesa si hay input reciente del usuario
3. generateObject() con Zod schema:
   - global_rules[]: Preferencias de formato/comportamiento
   - personal_facts[]: Hechos sobre usuario/datos
4. Fallback: generateText() + JSON parse si generateObject() falla
5. Guarda via aiPersistence.addMemory()
```

### Carga (lineas 120-144)
- Formatea memorias no-superseded en markdown
- Secciones: "User Rules & Preferences" y "Facts About the User / Data"
- Se inyecta en system prompt

---

## Compactacion de Contexto (server/ai/compaction.js)

### Estrategia de 3 Niveles (lineas 66-147)

```
1. SIN compactacion — Si mensajes antiguos < 75% del context window
2. Limpieza de tool results — Trunca execute_sql a 10 rows, strip display_chart
3. Sumarizacion — LLM resume mensajes mas antiguos, reemplaza con system message
```

- Mantiene ultimos 4 mensajes intactos
- Estimacion: 3.5 chars por token
- Fallback: trunca ultima mitad si sumarizacion falla

---

## User Rules (server/ai/userRules.js)

- Busca `RULES.md` en raiz del proyecto
- Lee y trimea contenido
- Retorna null si no existe
- Se inyecta como seccion "User Rules" en system prompt

---

## Context Building

### buildTableContext() (server/index.js, lineas 635-689)
- Query: `information_schema.tables` (excluye amoxsql_ai, amoxsql_chains, pg_catalog)
- Para cada tabla (max 30): `DESCRIBE` + `COUNT(*)`
- Cache TTL: 5 minutos
- Invalidacion: en DDL/DML (CREATE, DROP, ALTER, INSERT, DELETE, UPDATE)

### buildFileContext() (server/index.js, lineas 702-747)
- Detecta extension (.csv, .parquet, .xlsx, .json)
- Usa funcion DuckDB apropiada (read_csv_auto, read_parquet, read_xlsx, read_json_auto)
- Retorna columnas + 3 sample rows + row count

---

## Drag & Drop de Contexto (AiSidebar.jsx, lineas 124-137)

- Acepta objetos JSON serializados (archivos o tablas)
- Via `dataTransfer` del evento drag
- Previene duplicados
- Se almacena en `contextObjects[]`
- Se envia como `contextFiles[]` y `contextTables[]` en cada request

---

## Renderizado de Tool Calls (ToolCallBlock.jsx)

- Bloque colapsable con estado: loading (spinner), success (check), error (X)
- Muestra input args y output como JSON (truncado a 800 chars)
- Metadata: execute_sql muestra "X rows - Yms", describe_table muestra nombre
- ChatMessage renderiza thinking blocks ocultos y markdown

---

## System Prompt Modular (v2 — server/ai/prompt/)

El system prompt se construye desde builders independientes. Refactorizado en la Fase 1 del roadmap.

```
server/ai/prompt/
├── index.js     ← buildSystemPrompt(options) — composer principal
├── schema.js    ← formatTableSchemas(), formatFileSchemas()
├── tools.js     ← buildToolsSection(enablePlanner, tier, mode)
├── modes.js     ← buildAssistantModeSection(), buildDivingModeSection()
└── context.js   ← buildChartTypesSection(), buildUserRulesSection(),
                    buildMemoriesSection(), buildSkillSection()
```

`server/ai/systemPrompt.js` es ahora un thin re-export: `module.exports = require('./prompt/index')`.

Para extender el prompt (agregar nueva sección):
1. Crear builder en el archivo apropiado de `server/ai/prompt/`
2. Importarlo en `index.js`
3. Añadirlo en el orden deseado dentro de `buildSystemPrompt()`

---

## SQL Self-Correction Loop (Fase 1)

Cuando `execute_sql` retorna un error, el loop intenta corregir automáticamente antes de rendirse.

```javascript
// server/ai/agenticLoop.js
const MAX_SQL_CORRECTION_RETRIES = 3;

// Dentro del loop agentic:
if (toolName === 'execute_sql' && toolResult.error) {
  iterSqlErrors.push({ query: toolArgs.query, error: toolResult.error });
}
if (toolName === 'execute_sql' && !toolResult.error) {
  iterSqlSuccesses++;
}

// Después de cada iteración con errores y sin éxitos:
if (iterSqlErrors.length > 0 && iterSqlSuccesses === 0 && sqlCorrectionRetries < MAX_SQL_CORRECTION_RETRIES) {
  sqlCorrectionRetries++;
  // Inyectar turno de "usuario" con la directiva de corrección
  messages.push({
    role: 'user',
    content: buildSqlCorrectionPrompt(iterSqlErrors)
  });
  // continuar el loop con el mensaje inyectado
}
```

`buildSqlCorrectionPrompt()` genera un mensaje como:
```
Your previous SQL failed with:
  Query: SELECT * FROM ordrrs LIMIT 5
  Error: Table "ordrrs" not found

Use list_tables to verify exact table names, then fix and retry.
```

---

## Presupuesto de iteraciones y cierre garantizado (ciclo de vida)

El loop agentic (`server/ai/agenticLoop.js`) mide su trabajo en **iteraciones** (cada una permite hasta `ITER_MAX_STEPS = 10` tool calls). Constantes clave:

```javascript
const MAX_LOOP_ITERATIONS     = 50;  // techo absoluto (working + wrap-up)
const DEFAULT_LOOP_ITERATIONS = 25;  // presupuesto antes de que un plan lo dimensione
const WRAP_UP_RESERVE         = 1;   // turno final reservado para síntesis forzada
```

**Presupuesto dinámico.** Al crearse un plan, `create_plan` (`tools_planner.js`) calcula `dynamicMaxIterations = min(50, max(25, pasos × 5))` y el loop redimensiona `effectiveMaxIterations` a ese valor (capado bajo `MAX_LOOP_ITERATIONS - WRAP_UP_RESERVE`). Un plan de 7 pasos obtiene 35 iteraciones; uno de 10+ llega al techo de 50.

**Countdown escalonado.** `buildContinuationPrompt` inyecta el estado del presupuesto en cada turno (`Iteration X/Y — Z left`) y escala la urgencia al 50%, al 25% y en las últimas 3 iteraciones — el modelo converge en vez de quedarse sin ciclos en frío.

**Turno de wrap-up garantizado.** Si se agota el presupuesto de trabajo sin `final_answer`, el loop corre **una iteración reservada** con `buildWrapUpPrompt`: fuerza al modelo a sintetizar y llamar `final_answer` (prohibiéndole otras tools). Si aun así no finaliza:
- Los pasos que quedaron `in_progress`/`running` se re-estatusan a **`interrupted`** y se emite un `plan-progress` final veraz (el panel deja de mostrar spinners eternos; el badge pasa a `Paused`).
- Si tampoco hubo prosa, `buildFallbackSummary` emite un resumen parcial construido desde las notas de los pasos, para que el chat nunca quede vacío.
- Se emite `ask-continue` y el plan se persiste como `paused` (con el snapshot de pasos).

**Sweep de `final_answer`.** Al finalizar normalmente, `final_answer` barre los pasos `pending`/`running`/**`in_progress`** → `done`. (El caso `in_progress` faltaba y era la causa de que el último paso nunca se marcara completo.)

**Prosa primero (red de seguridad).** El loop acumula `fullRunText`; al llamar `final_answer`, si la prosa visible (con `<think>` quitado por `stripThinkText`) es < 220 chars pese a haber output estructurado, des-suprime y streamea el `summary` como texto — el chat nunca queda con una tarjeta pelada. El prompt (Step 5) exige narrar 2-4 frases antes de `final_answer`.

**Continuación.** Al agotar ciclos se emite `ask-continue` y el plan se persiste `paused`. La UI ofrece: **Continuar** (presupuesto fresco de 30), **Con instrucciones…** (el texto viaja como turno de usuario → continue con foco), **Finalizar con lo que hay** (`continueBudget: 1` en el body → el wrap-up fuerza la síntesis), **Cancelar**. Al reabrir una conversación cuyo plan quedó incompleto, el cliente lo detecta (sin `final_answer` + pasos pendientes), lo marca `paused` y re-ofrece continuar.

Auditoría y plan: [deep_dive_ciclo_vida.md](../docs/dev/deep_dive_ciclo_vida.md), [plan_deep_dive_ciclo_vida.md](../docs/dev/plan_deep_dive_ciclo_vida.md).

---

## Plan Visible y Editable (Fase 1)

Los planes del AI se pueden editar en la UI antes de ejecutarse.

### Flujo

```
Cliente (AiDivingPanel):
  userSkippedSteps = new Set()    ← IDs de steps que el usuario skippeó
  
  Al hacer submit:
    planStepOverrides = Array.from(userSkippedSteps).map(id => ({
      stepId: id, status: 'skipped', note: 'Skipped by user'
    }))
    POST /api/ai/chat/stream con { ..., planStepOverrides }

Servidor (agenticLoop.js):
  En el handler de create_plan:
    Para cada step en activePlan.steps:
      Si step.id está en planStepOverrides → step.status = 'skipped'
```

### UI (AgentPlanPanel.jsx)

- Badge "editable" visible cuando el plan está activo y no está generando
- Botón skip (LuSkipForward) aparece en hover sobre cada step
- Steps skipped por el usuario se muestran con nota "skipped by user"
- El conteo de steps completados incluye los skipped

---

## Nuevas Tools (Fase 1 y 2)

Tools agregadas en v2.1.x además de las 17 originales:

### `validate_sql`
```javascript
Input:  { query: string }
Output: { valid: true, plan: "PROJECTION..." }
     | { valid: false, error: "...", hint: "..." }
```
Corre `EXPLAIN {query}` sin ejecutar. Detecta errores de sintaxis, columnas inválidas, tablas no existentes.

### `explain_query`
```javascript
Input:  { query: string, format?: "text" | "json" }
Output: { plan: "...", estimated_rows: N }
```
Corre `EXPLAIN ANALYZE`. Útil para entender el plan de ejecución antes de correr una query costosa.

### `lint_query`
```javascript
Input:  { query: string }
Output: { issues: [{ severity: "warn"|"error", message: "...", suggestion: "..." }] }
```
Detecta 7 antipatrones DuckDB-specific:
1. `SELECT *` sin `LIMIT` en tablas grandes
2. `LIKE '%x%'` (leading wildcard — no puede usar índice)
3. `DISTINCT` redundante cuando hay `GROUP BY`
4. `ORDER BY` sin `LIMIT` en queries grandes
5. Producto cartesiano (JOIN sin ON)
6. Funciones no deterministas en GROUP BY
7. Conversiones de tipo implícitas que pueden fallar

### `compare_tables`
```javascript
Input:  { set_a: string, set_b: string }  // queryId o nombre de tabla
Output: {
  schema_diff: { only_in_a: [...], only_in_b: [...], type_changes: [...] },
  row_counts: { a: N, b: M, diff: N-M },
  numeric_stats: [{ column, mean_a, mean_b, diff_pct, ... }],  // ordenado por |diff_pct|
  summary: "A tiene 150 filas más. La columna 'amount' difiere en un 23.5%."
}
```
Compara dos resultados (por queryId del cache) o dos tablas. Útil para comparar períodos o versiones de datos.

### `correlate_metrics`
```javascript
Input:  { table_name: string, target_column: string, candidate_columns?: string[] }
Output: {
  correlations: [{ column, pearson_r, abs_r, strength: "strong"|"moderate"|"weak" }],
  insights: {
    strong_correlations: [...],   // |r| > 0.7
    moderate_correlations: [...], // 0.4 < |r| ≤ 0.7
    top_driver: { column, pearson_r }
  },
  sql_used: "SELECT CORR(TRY_CAST(...)) ..."
}
```
Calcula correlación de Pearson entre la columna target y todas las columnas numéricas candidatas. Auto-descubre numéricas via `DESCRIBE`.

### `lookup_metric`
```javascript
Input:  { name: string }
Output: { name, sql, description, grain, table }
     | { error: "Metric 'xyz' not found in context/metrics.yml" }
```
Lee `context/metrics.yml` del proyecto actual. El AI debe llamar este tool antes de calcular cualquier métrica de negocio.

### `find_example`
```javascript
Input:  { query: string }  // pregunta en lenguaje natural
Output: [{ question, sql, file, score }]  // top 3 por similitud de keywords
```
Busca ejemplos relevantes en `context/examples/*.sql`. Ayuda al AI a seguir patrones establecidos para queries similares.

---

## NarrativeCard — final_answer Estructurado (Fase 2)

`final_answer` ahora acepta campos estructurados además del `summary` legacy. Cuando hay campos estructurados, el cliente renderiza una `NarrativeCard` en lugar de texto plano.

### Schema Zod (server/ai/tools.js)

```javascript
final_answer: tool({
  parameters: z.object({
    tldr:              z.string().optional(),       // 1-2 oraciones: el takeaway principal
    findings:          z.array(z.object({
      point:   z.string(),                          // observación
      value:   z.string().optional(),               // métrica de soporte ("+ 41%", "$50k")
      so_what: z.string().optional(),               // POR QUÉ importa / qué implica — sin esto es solo un dato
      source_query_id: z.string().optional()        // queryId de la execute_sql que lo produjo
    })).optional(),
    likely_cause:      z.string().optional(),       // el "por qué" del hallazgo principal
    suggested_actions: z.array(z.string()).optional(), // acciones concretas, cada una con su razón
    caveats:           z.array(z.string()).optional(), // limitaciones de datos, supuestos
    followup_questions: z.array(z.string()).optional(),
    summary:           z.string().optional()        // narrativa de cierre en prosa — SIEMPRE incluirla (es la respuesta; los campos son el recap)
  })
})
```

**Voz narrativa (auditoría narrativa 2026-07).** El agente narra un arco: OPENING (con create_plan, la hipótesis), PER-STEP (hallazgo + por qué importa + qué cambia, narrado en el chat antes de marcar done), PIVOTS, y CLOSING (2-4 párrafos). El lever es `buildContinuationPrompt` (`agenticLoop.js`) — el único mensaje que el modelo lee cada turno — que ahora exige el ciclo narrar→ejecutar→narrar y lleva un "story so far" (los `note` de los pasos done). El `resolvedSummary` de respaldo construye prosa, no bullets. Ver [deep_dive_narrativa.md](../docs/dev/deep_dive_narrativa.md).

### Renderizado (ChatMessage.jsx — NarrativeCard)

```
┌─────────────────────────────────────┐
│ ⚡ Revenue creció 23% YoY en Q3      │  ← tldr
├─────────────────────────────────────┤
│ Hallazgos                           │
│  📈 Región West lidera crecimiento  │
│     +41%                            │
│  📈 Q3 fue el mes récord            │
│     $50k                            │
├─────────────────────────────────────┤
│ ❓ ¿Por qué? (toggle collapsible)   │  ← likely_cause
│   La campaña de agosto impulsó...   │
├─────────────────────────────────────┤
│ Acciones sugeridas                  │  ← suggested_actions
│   1. Replicar campaña en Q4         │
│   2. Investigar caída de East...    │
└─────────────────────────────────────┘
```

**Lógica de detección:** Si `toolResult.tldr || toolResult.findings?.length`, se suprime el streaming del summary y se renderiza NarrativeCard. Los mensajes con solo `summary` siguen renderizando como markdown.

**Expandida por defecto:** la NarrativeCard abre `detailsOpen`/`causeOpen` en `true` — los findings, el "Why?" y los caveats se ven sin clicks. Colapsarlos tras "Show summary" hacía que las respuestas de Deep Dive parecieran vacías (el usuario solo veía el `tldr`).

---

## Context-as-Code Integration

El AI carga el contexto del proyecto (`context/`) al inicio de cada conversación.

```javascript
// agenticLoop.js — se carga en paralelo con otras inicializaciones
const [userRules, memories, activeSkill, projectCtx] = await Promise.all([
  loadUserRules(projectPath),
  loadMemoriesText(dbManager),
  loadActiveSkill(activeSkillId),
  loadProjectContext(projectPath)   // ← contextLoader.js
]);

// Se inyecta al system prompt
buildSystemPrompt({ ..., projectCtx })
  // → buildProjectContextSection(projectCtx)
  // → Sección "## Project Semantic Context" con métricas, joins, glosario, ejemplos
```

Ver documentación completa en [`contexto_codigo_ai.md`](contexto_codigo_ai.md).

---

## Query Cache — Flujo Completo

```
execute_sql exitoso:
  1. Guarda en Map: queryResults.set(queryId, result)
  2. Fire-and-forget: aiPersistence.saveQueryCache(dbManager, {
       queryId, conversationId, sqlQuery, columns, data, rowCount, execMs
     })

display_chart(queryId):
  1. Busca: queryResults.get(queryId)          ← in-memory (fast)
  2. Si no: aiPersistence.getQueryCache(dbManager, queryId)  ← DB (slow, pero disponible)
  3. Actualiza in-memory Map con el resultado recuperado

compare_tables(queryId):
  Usa el mismo mecanismo de recovery del cache

Pruning (automático):
  Después de saveQueryCache: si hay >100 entries para la conversación,
  elimina los más viejos (FIFO por created_at)
```

**Formato de queryId:** `qr_{timestamp}_{6chars_random}`  
Ejemplo: `qr_1715084620123_a1b2c3`
