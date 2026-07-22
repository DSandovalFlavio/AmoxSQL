# Plan — Performance de AI local (Ollama): hacia el primer token casi instantáneo

> **Estado**: EN CURSO — F0, F1, F2, F3 hechas (rama `claude/ai-local-performance`). Faltan F4–F7.
> **Fecha**: 2026-07-22
> **Objetivo**: que los modelos locales (ornith, gemma4, qwen3.5, lfm2.5) respondan en AmoxSQL con una latencia percibida cercana a la de la terminal `ollama run`, y que el cambio de modelo no cueste un minuto de espera.
>
> **Progreso**:
> - ✅ **F0** — plan + instrumentación (`server/ai/perfLog.js`): log por request con load/prefill/gen/ttft. Validado en vivo.
> - ✅ **F1** — runtime explícito de Ollama: `keep_alive` '4h', `num_ctx` por tier (idéntico por request, instancia cacheada), sampling por familia, `think:false` para qwen3.5/qwen3/ornith. `contextWindow` clampeado al num_ctx real. Validado en vivo con qwen3.5:0.8b.
> - ✅ **F2** — opciones muertas del AI SDK v6: `maxSteps`→`stopWhen: stepCountIs()`, `maxTokens`→`maxOutputTokens` en todos los call sites. Verificado: 2 tool calls encadenados en UNA request.
> - ✅ **F3** — prefijo estable (fecha al final, día; estado vivo al tail) + contexto acotado para assistant (solo tablas referenciadas + roster). Medido: assistant ~5084→~3003 tk; 99% del prompt estable al editar la query.
> - ⏳ **F4** — warmup + ciclo de vida del modelo + memorias fuera del camino crítico.
> - ⏳ **F5** — toggle de thinking On/Off/Auto por modelo en la UI.
> - ⏳ **F6** — modelo por modo + hint de idoneidad en Deep Dive.
> - ⏳ **F7** — docs de usuario.

---

## 1. Diagnóstico

### 1.1 El hardware manda — dos máquinas de referencia

| | Dev (vieja) | **Target** (uso real con AI local; piso del público objetivo) |
|---|---|---|
| Equipo | Escritorio i3-8100 | Dell Precision 3581 |
| CPU | 4 núcleos | **i9-13900H** (14 núcleos) |
| RAM | 16 GB | **32 GB** |
| GPU | Quadro P600, **2 GB** VRAM | dGPU con **8 GB** VRAM (+ iGPU) |
| Inferencia | Modelos 4–9B casi todo en **CPU** | Modelos 2–9B (Q4) **completos en VRAM** |

- En la máquina target, un 9B Q4_K_M (~5.6 GB) cabe en 8 GB con espacio para KV cache → prefill en GPU a miles de tok/s. Los problemas de latencia ahí son **software** (cache roto, cold start, thinking, round-trips), no cómputo.
- En la máquina dev (peor caso), el prefill en CPU es el costo dominante → la dieta de prompt y el prefix cache son vitales.
- Conclusión estructural: **calibrar defaults para la máquina target, pero el prefijo estable + keep_alive + warmup benefician a ambas por igual**. La app valida en runtime con `/api/ps` (`size_vram < size` = offload a CPU → avisar).

### 1.2 Por qué la terminal se siente rápida y AmoxSQL no

| Factor | Terminal `ollama run` | AmoxSQL hoy |
|---|---|---|
| System prompt | ~0 tokens | **~6,000 tokens** (diving, 5 tablas) |
| Schemas de tools | 0 | **+2–4k tokens** (97 campos descritos) |
| Prefix cache | Siempre hit (historial estable) | Se invalida (fecha con minutos, memorias en background) |
| Modelo caliente | Sí, toda la sesión | Se descarga a los 5 min (default `keep_alive`) |
| `num_ctx` | Default estable | Default **4096** — nuestro prompt NO CABE → truncación silenciosa |

### 1.3 Hallazgos concretos en el código

| # | Hallazgo | Archivo | Impacto |
|---|---|---|---|
| H1 | `ollama(modelName)` sin opciones: sin `keep_alive`, sin `num_ctx`, sin `think`, sin sampling | `server/AiManager.js:237` | Modelo se descarga a 5 min; contexto 4096 (truncación); qwen3.5 piensa en silencio antes de responder |
| H2 | `maxSteps` **no existe en AI SDK v6** (es `stopWhen`) → el loop agéntico hace **1 paso por iteración** y re-manda todo el contexto en cada request | `server/ai/agenticLoop.js:451` | Multiplica round-trips y prefill; el costo más grande del modo diving |
| H3 | `maxTokens` **no existe en AI SDK v6** (es `maxOutputTokens`) → generación sin tope | `AiManager.js`, `agenticLoop.js`, `compaction.js`, `memory.js`, `promptOnlyMode.js` | Correctness + outputs sin límite |
| H4 | `extractMemories` corre tras **cada turno** con el **mismo modelo local** | `AiManager.js`, `agenticLoop.js` → `memory.js` | Compite por el único slot de Ollama, invalida el KV cache, y el siguiente mensaje del usuario hace cola detrás |
| H5 | Fecha con **hora:minuto** al inicio de la sección dinámica del prompt | `server/ai/prompt/index.js:79` | Rompe el prefix cache cada minuto, justo antes del schema (lo más pesado) |
| H6 | `modelProfiles` declara contextos de 32k–128k pero Ollama sirve 4096 | `server/ai/modelProfiles.js` | La compactación opera sobre una realidad falsa → nunca compacta → truncación |
| H7 | Cero warmup al cambiar de modelo en el dropdown | `client/.../ModelDropdown.jsx` | El primer mensaje paga la carga completa del modelo |
| H8 | Ollama instalado: **v0.20.2**, sin variables `OLLAMA_*` | entorno | Se pierden mejoras clave de versiones posteriores (ver 1.4) |
| H9 | **El modo assistant recibe el schema COMPLETO de la DB** — si el usuario no arrastra contexto, `buildTableContext(null)` carga hasta 30 tablas con columnas/muestras, igual que diving | `server/index.js:1969`, `client/.../useAiChat.js:408` | El modo "ligero" paga el mismo prefill que el pesado; lo único bien acotado hoy es `currentQuery`/`currentResult`/`currentChartConfig` |

**Superficies de AI existentes** (inventario): modo **assistant** (editor SQL / notebook / gráfico activo), modo **diving** (Deep Dive), extracción de memorias (LLM, por turno — H4), compactación (LLM cuando desborda), auto-título de conversación (LLM, 1 vez), chart-story (estadístico puro, **sin** LLM — costo cero), `/api/ai/generate` legacy. Solo assistant y diving están en el camino crítico de latencia percibida.

### 1.4 Hechos verificados de Ollama (investigación jul-2026)

- **Última versión: v0.32.1**. Cambios relevantes posteriores a la 0.20 del usuario:
  - v0.30.8: **prompt caching mejorado** (desacoplado del context shift → mejor reutilización del KV cache).
  - v0.31.2: **flash attention extendido a GPUs NVIDIA compute capability 6.x** (¡la Quadro P600 es 6.1!).
  - Fixes de tool calling de qwen3.5 (tool calls emitidos como texto plano en 0.17.x).
- **`keep_alive`**: default 5 min; `-1` = residente indefinido; **el parámetro por request (endpoint nativo) sobreescribe el env var**. Preload = `POST /api/chat {"model": X, "messages": []}` (regresa de inmediato con el modelo cargando).
- **Prefix/KV cache**: Ollama reutiliza el KV cache si el prefijo de tokens coincide **byte a byte desde el token 0**; el primer byte distinto fuerza re-prefill desde ahí. Observable: `prompt_eval_count` pequeño en la respuesta = cache hit.
- **`num_ctx`**: default por VRAM (**<24 GB → 4096**). **Cambiarlo entre requests fuerza unload+reload del modelo** → hay que mandar EXACTAMENTE el mismo valor en cada request, incluido el warmup.
- **`OLLAMA_FLASH_ATTENTION=1` + `OLLAMA_KV_CACHE_TYPE=q8_0`**: KV cache a mitad de memoria con pérdida de calidad despreciable (q8_0 requiere flash attention).
- **`OLLAMA_NUM_PARALLEL=1`** (default) es lo correcto para app de escritorio mono-usuario: máxima localidad de cache.
- **`/api/ps`**: expone modelos cargados, `size_vram` vs `size` (detecta offload a CPU) y `expires_at` — ideal para UI de estado.
- **Streaming + tools**: resuelto desde v0.8.0 en el endpoint nativo (que usa `ai-sdk-ollama`). Los argumentos de cada tool call llegan como un bloque, no token a token — la UI ya lo maneja así.
- **`ai-sdk-ollama@^3`** (AI SDK v6, la nuestra): las opciones se fijan **al construir la instancia del modelo**: `ollama(name, { keep_alive, options: { num_ctx, ... }, ... })`. Instancias baratas; una por combinación (modelo, opciones) evita el reload-trap de `num_ctx`.

### 1.5 Los modelos candidatos en este hardware

| Modelo | Activos / totales | Contexto | Notas verificadas | Target (8GB VRAM) | Dev (2GB, CPU) |
|---|---|---|---|---|---|
| **lfm2.5:8b-a1b** | ~1B / 8B (MoE) | 128K | Diseñado para tool calling rápido en edge (~146–253 tok/s en CPU modernas); razonamiento **siempre activo** (CoT corto, sin toggle documentado) | ⭐ Rapidísimo | ⭐ **Mejor opción** |
| **gemma4:e2b** | 2.3B / 5.1B | 128K | Thinking se activa con token `<|think|>` en el system prompt (nosotros NO lo ponemos → apagado). Sampling recomendado: temp 1.0, top_p 0.95, top_k 64 | ⭐ Rapidísimo | ⭐ Muy bueno |
| **qwen3.5:2b / 4b** | 2B / 4B | 256K | **Thinking ON por default** → apagar con `think:false` (endpoint nativo). Sampling: temp 0.6, top_p 0.95, top_k 20 | ⭐ Rapidísimo | ⭐/OK |
| **qwen3.5:9b** | 9B | 256K | Igual que arriba | ⭐ **Viable y bueno** — Q4 cabe en 8GB | ⚠️ Prefill de minutos |
| **ornith:9b** | 9B (base qwen3.5) | ~256K (no confirmado) | Sampling: temp 0.6, top_k 20, top_p 0.95; thinking probable vía `think` | ⭐ **Viable** — Q4 (5.6GB) cabe en 8GB | ⚠️ Lento |
| **gemma4:e4b** | 4.5B / 8B | 128K | Igual que e2b | ⭐ Muy bueno | En el límite |

---

## 2. Plan de implementación

### F0 — Instrumentación + entorno (medir antes de tocar)
1. Log por request Ollama: `load_duration`, `prompt_eval_count` (el observable de cache-hit), `eval_count`, tokens/s, TTFT. Un log line legible: `[AI Perf] model=X load=1.2s prefill=5800tk (cache hit: 320tk nuevos) gen=42tk @ 3.1tk/s`.
2. Documentar (y sugerir en la UI de Settings → sección diagnóstico) la configuración de entorno recomendada:
   - Actualizar Ollama a **≥ 0.32** (prompt caching + flash attention en CC 6.x + fixes qwen3.5).
   - `OLLAMA_FLASH_ATTENTION=1`, `OLLAMA_KV_CACHE_TYPE=q8_0`, `OLLAMA_NUM_PARALLEL=1`.
3. **Criterio de éxito de todo el plan**: en turno 2+ de una conversación, `prompt_eval_count` debe ser pequeño (~solo el mensaje nuevo). Si es ~todo el prompt, el cache se está rompiendo.

### F1 — Plumbing de opciones de Ollama (el fix núcleo)
1. `AiManager.getModel()`: para provider ollama, construir la instancia con opciones y **cachearla por (modelo, opciones)**:
   ```js
   ollama(modelName, {
     keep_alive: '4h',                    // configurable; nunca el default de 5m
     options: { num_ctx: profile.numCtx, ...profile.sampling },
     think: profile.thinkOff ? false : undefined,   // qwen3.5/ornith
   })
   ```
2. Nuevo campo en `modelProfiles`: `numCtx` local realista y **único por modelo** (mismo valor en TODA request, warmup incluido — cambiar `num_ctx` = reload). Defaults calibrados a la máquina target (8 GB VRAM): **16384 para ≤4B efectivos, 16384 para 9B Q4** (subir a 32768 los ≤4B si `/api/ps` confirma `size_vram == size`); configurable en Settings ("Contexto del modelo local"). La regla dura: que el modelo + KV quepan en VRAM sin offload.
3. Alinear `profile.contextWindow` (provider ollama) al `numCtx` real → la compactación por fin opera sobre la verdad (arregla H6).
4. Sampling por familia en el perfil: qwen3.5/ornith (0.6/0.95/20), gemma4 (1.0/0.95/64); lfm2.5 sin override hasta verificar su params blob.

### F2 — Resucitar las opciones muertas del AI SDK v6
1. `agenticLoop.js`: `maxSteps:` → `stopWhen: stepCountIs(Math.min(profile.maxSteps, ITER_MAX_STEPS))`. **Restaura multi-step por iteración** → una fracción de los round-trips actuales en modo diving (H2).
2. `maxTokens` → `maxOutputTokens` en los 5 archivos afectados (H3).
3. Verificación runtime: log de `result.steps.length` por iteración (debe ser >1 cuando hay tools encadenadas).

### F3 — Dieta de prompt + prefijo estable + contexto por modo (la palanca grande)

**Principio de diseño**: el único modo que necesita "todo" (DB completa / carpeta de archivos) es **Deep Dive**. Assistant es un copiloto del archivo activo — su contexto correcto es acotado y explícito.

1. **Contexto acotado para assistant** (arregla H9). El schema que recibe assistant pasa a ser SOLO:
   - Las **tablas referenciadas en la query/notebook activo** (extraer identificadores del SQL server-side; matchear contra `information_schema` — nada de las otras 25 tablas).
   - Lo que el usuario **arrastre** al input (`contextObjects`, ya existe).
   - El **archivo activo** si es file-linked (ya existe vía `filePath`).
   - `currentQuery` / `currentResult` / `currentChartConfig` (ya bien acotados hoy).
   - **Contexto perezoso para el resto**: `list_tables`/`describe_table` siguen disponibles como tools — si el modelo necesita otra tabla, la pide (1 tool call barato) en vez de pagarla en cada prompt.
2. **Mover la fecha al final** de la sección dinámica y bajar granularidad a día (sin hora:minuto) — H5. Nada volátil antes del schema.
3. Orden del prompt por estabilidad: estático (identidad+tools+reglas) → schema (semi-estático, serialización determinista con orden estable de tablas/columnas) → cola dinámica (fecha, memorias, contexto vivo).
4. **Dieta local**: para provider ollama, formato compacto de schema (nombres+tipos, `maxContextRows` reducido) y sección de tools/gráficas recortada en assistant (sin planner, chart-types resumido). Metas: assistant **≤ ~1,200 tokens** de system prompt; diving local **≤ ~2,500** (hoy ambos ~6,000+).
5. Auditar `formatTableSchemas` para determinismo (orden de tablas/columnas estable entre requests).
6. Diving NO cambia de alcance: sigue recibiendo el contexto completo — es su trabajo.

### F4 — Warmup + ciclo de vida del modelo (UX de "instantáneo")
1. Endpoint `POST /api/ai/warmup { model }`: dispara `/api/chat` nativo con `messages: []` y **las mismas opciones/`num_ctx`** que usará el chat real (si no, doble carga).
2. Cliente: warmup fire-and-forget al (a) seleccionar modelo en `ModelDropdown`, (b) abrir la app con el modelo guardado, (c) abrir el sidebar de AI.
3. Endpoint proxy `GET /api/ai/model-status` → `/api/ps`: el dropdown muestra estado real (● caliente / ◐ cargando / ○ frío, y "CPU" si `size_vram < size`).
4. **Memorias fuera del camino crítico** (H4): `extractMemories` deja de correr por turno con modelos locales. Config `memoryExtraction: 'always' | 'cloud-only' | 'off'` (default `cloud-only`). Para local, opción futura: extraer solo al cerrar/archivar conversación.

### F5 — Toggle de thinking universal + validación por modelo
1. **Control de razonamiento por modelo, primera clase en la UI** (petición explícita del autor): selector `Auto | On | Off` visible junto al selector de modelo (y persistido por modelo en config, `ollamaThinkOverrides`). Implementación por familia:
   - qwen3.5 / ornith (y cualquier modelo con capability `thinking` en `/api/show`): parámetro nativo `think: true|false` del endpoint `/api/chat`.
   - gemma4: se activa inyectando el token `<|think|>` al inicio del system prompt (On lo inyecta; Off/Auto no). ⚠️ Inyectarlo cambia el prefijo → rompe el prefix cache al alternar; documentar.
   - lfm2.5: razonamiento siempre activo por diseño (sin toggle) → el selector se muestra deshabilitado con tooltip.
   - `Auto` = el default del modelo, salvo qwen3.5/ornith donde Auto = Off en el tool loop (el CoT invisible es latencia percibida pura).
2. La capability `thinking` ya se detecta en `fetchOllamaModelInfo` → usarla para decidir qué mecanismo aplica y si se muestra el toggle.
3. Matriz de validación en ambas máquinas (target y dev): lfm2.5, gemma4:e2b/e4b, qwen3.5:2b/4b/9b, ornith:9b — TTFT primer mensaje (frío/caliente), TTFT turno 2 (`prompt_eval_count` chico), diving 3 pasos, thinking On/Off.

### F6 — Modelo por modo (la división <15B / >15B)

**Visión del autor**: los modelos <15B están destinados a todos los modos EXCEPTO Deep Dive; Deep Dive requiere modelos potentes (>15–25B locales, p. ej. gemma4:26b/31b, qwen3.5:27b/35b — o cloud).

1. **Preferencia de modelo por modo** en config: `modelPerMode: { assistant: 'lfm2.5', diving: 'qwen3.5:27b' }` (default: el modelo global actual para ambos, sin romper nada). El dropdown de cada panel recuerda su propio modelo.
2. **Hint de idoneidad en Deep Dive**: si el modelo activo en diving es tier medium (<15B), mostrar un aviso suave no bloqueante ("Este modelo es pequeño para Deep Dive — funcionará, pero un modelo ≥25B o cloud da análisis mucho más profundos"). Nunca bloquear: es una recomendación, no una jaula.
3. **Dupla caliente**: con modelo chico (assistant) + grande (diving), en la máquina target documentar `OLLAMA_MAX_LOADED_MODELS=2` para que el chico siga residente cuando el grande carga (si la suma cabe; si no, LRU evict — el warmup de F4 cubre el regreso).
4. Sinergia con F3: assistant = contexto chico + modelo chico → instantáneo; diving = contexto completo + modelo grande → potente. Cada modo optimizado para lo suyo.

### F7 — Documentación de usuario
1. Página en `docs/` (ES/EN): "AI local rápida" — qué modelo elegir según tu hardware, cómo actualizar Ollama, variables de entorno recomendadas, y qué significa el indicador de estado del modelo.
2. Recomendación de modelos in-app según footprint (ya existe capability-detection; añadir hint de velocidad estimada vs RAM/VRAM detectada… fase opcional).

---

## 3. Resultados esperados

| Escenario | Hoy | Con el plan |
|---|---|---|
| Primer mensaje tras cambiar modelo | Carga completa + prefill 8–10k tk (minutos en CPU) | Warmup en background al seleccionarlo + prompt ≤2.5k → segundos |
| Turno 2+ de una conversación | Re-prefill casi total (fecha/memorias rompen cache) | Cache hit: solo el mensaje nuevo se procesa |
| Modo diving (agentic loop) | 1 paso por request, contexto completo cada vez | Multi-step por request + prefijo cacheado |
| Modelo tras 5 min de pausa | Descargado → cold start | `keep_alive` largo → sigue caliente |
| qwen3.5 | Piensa en silencio antes de responder | `think:false` → responde de inmediato |
| Calidad (truncación silenciosa a 4096) | El modelo no ve parte del schema | `num_ctx` real y alineado con compactación |
| Modo assistant | Recibe TODA la DB (hasta 30 tablas), ~6k tk | Solo query activa + tablas referenciadas + drag&drop, ~1.2k tk → con modelo chico en GPU: **casi instantáneo** |
| Deep Dive con modelo chico | Sin guía | Hint de idoneidad + preferencia de modelo por modo |

## 4. Riesgos y decisiones abiertas

- **Máquina dev (16 GB RAM, CPU)**: es el peor caso, no el target — ahí aplican `num_ctx` conservador (8k), KV `q8_0` y un solo modelo residente. En la target (8 GB VRAM / 32 GB RAM) hay margen para 2 modelos chicos residentes (`OLLAMA_MAX_LOADED_MODELS=2`) y contextos de 16–32k. Los defaults del código apuntan a la target; Settings permite bajar.
- **`keep_alive` largo** retiene VRAM/RAM aunque el usuario no use la AI → default '4h' configurable, no `-1`, y documentado.
- **ai-sdk-ollama v3 está en modo mantenimiento** (v4 = AI SDK v7). Sin urgencia, pero anotar para el futuro upgrade del stack AI.
- **No confirmados** (verificar en F5): toggle de thinking en ornith; params recomendados de lfm2.5; campo context_length en `/api/ps` 0.32.
