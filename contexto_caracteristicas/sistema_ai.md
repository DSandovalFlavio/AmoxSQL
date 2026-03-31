# Sistema de IA (Chat, Tools, Persistencia, Memoria)

## Arquitectura General

El sistema AI tiene dos modos: **Assistant** (sidebar contextual del editor) y **Diving** (analisis profundo con persistencia). Soporta Ollama (local) y Gemini (cloud) con un sistema de tiers que adapta funcionalidades segun la capacidad del modelo.

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
