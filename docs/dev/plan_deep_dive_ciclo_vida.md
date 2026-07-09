# Plan de Implementación — Deep Dive: ciclo de vida del análisis

> Deriva de [deep_dive_ciclo_vida.md](deep_dive_ciclo_vida.md) (auditoría). Referencias B1–B5 y Q1–Q50 apuntan a ese doc.
> **Estado:** ✅ **F1 (cierre veraz) y F2 (presupuesto 50 + wrap-up) implementadas.** F3–F6 pendientes.

## Objetivo

Que un análisis Deep Dive **cierre siempre bien** (síntesis garantizada, plan veraz, foco intacto), con un **presupuesto de ciclos honesto y adaptativo** (hasta 50), y que **continuarlo** sea un flujo de primera clase.

## Fases (cada una = un PR independiente y shippeable)

---

### Fase 1 — Cierre veraz (quick fixes quirúrgicos) 🩹 ✅ HECHA

Los 4 fixes que eliminan los bugs visibles hoy. Bajo riesgo, alto impacto.

| # | Cambio | Archivo | Detalle |
|---|--------|---------|---------|
| 1.1 | **Fix enum del barrido** (B1) | `server/ai/tools.js:956` | `status === 'pending' \|\| 'running' \|\| 'in_progress'` → los tres van a `done` al llamar `final_answer`. (Conservar `'running'` por si hay planes viejos persistidos.) |
| 1.2 | **Re-estatus al agotar ciclos** (B2) | `server/ai/agenticLoop.js:629-642` | Antes de emitir `ask-continue`: pasos `in_progress` → `'interrupted'` (status nuevo), y emitir un último `plan-progress` con el snapshot final para que el cliente tenga la verdad. Persistir con el plan `paused`. |
| 1.3 | **Spinner honesto** | `client/.../AgentPlanPanel.jsx:107-112` | `in_progress`/`interrupted` con `!isGenerating` → icono de pausa (LuCirclePause) + tono warning, no spinner. `doneCount` y barra de progreso consistentes. |
| 1.4 | **Badge veraz** (Q50) | `AgentPlanPanel` / header del panel | El badge refleja `planState.status`: `DONE` solo si `completed`; `PAUSED — out of cycles` si `paused`; distinguirlo visualmente. |
| 1.5 | **NarrativeCard auto-expandida** (B4-cliente, Q11/47) | `client/.../ChatMessage.jsx:154` | `detailsOpen` default `true` cuando `hasDetails`; "Why?" inline sin segundo toggle; caveats siempre visibles (son confianza, no detalle). Toggle pasa a "Hide summary". |

**Verificación:** correr un análisis que agote ciclos → plan sin spinners eternos, badge PAUSED, findings visibles sin clicks.

---

### Fase 2 — Presupuesto 50 + wrap-up garantizado 🔋 ✅ HECHA

> Nota de implementación: la fórmula del presupuesto dinámico se subió a `min(50, max(25, pasos×5))` (en vez de `pasos×3`, que daba 21 para 7 pasos — *más corto* que los 25 originales y contrario a la queja). El default pre-plan es 25; un plan de 7 pasos ahora obtiene 35. El wrap-up es un turno reservado dentro del loop (working budget + `WRAP_UP_RESERVE`), no un `toolChoice` forzado (evita romper Ollama y preserva la prosa). El continue sigue en 30, capado por el techo en el loop.


| # | Cambio | Archivo | Detalle |
|---|--------|---------|---------|
| 2.1 | **Techo absoluto 50** | `agenticLoop.js:29` | `MAX_LOOP_ITERATIONS = 50`. Es techo, no default efectivo (ver 2.2). |
| 2.2 | **Conectar el presupuesto dinámico** (B3) | `agenticLoop.js` (~367, al procesar `create_plan`) | Al crearse el plan: `effectiveMaxIterations = min(50, max(15, pasos × 3 + 4))` — reusar `dynamicMaxIterations` que `tools_planner.js:41-43` ya calcula (+4 = margen para plan/síntesis). Planes chicos no pagan 50; un EDA de 7 pasos obtiene ~25→ ahora sí alcanza. |
| 2.3 | **Clamp de continue** | `server/index.js:2181` | `continueMode`: `maxIterations = min(50, usados_previos_no; presupuesto fresco de p.ej. 20)` — configurable, con techo 50 por corrida. |
| 2.4 | **Presupuesto en el prompt desde el inicio** | `agenticLoop.js` `buildContinuationPrompt` + `modes.js` | Decirle al modelo el total al arrancar ("Tienes N iteraciones; planea acorde") y countdown escalonado: aviso al 50%, al 25%, y el URGENT actual en las últimas 3. Sin plan activo también aplica. |
| 2.5 | **Wrap-up garantizado** (B2, Q9) | `agenticLoop.js` | Reservar la última iteración: si `itersLeft === 1` y no hubo `final_answer`, inyectar prompt "SOLO puedes llamar final_answer — sintetiza lo que tienes y marca lo pendiente en caveats" (y `toolChoice: 'final_answer'` si el provider lo soporta). **Nunca** terminar sin síntesis: `ask-continue` pasa a emitirse *después* de esa síntesis parcial. |
| 2.6 | **Comentarios/deuda** | `agenticLoop.js:28,244`, `tools_planner.js:42` | Corregir los 3 comentarios falsos detectados; el hardcap prometido ahora existe de verdad. |

**Nota compaction:** el umbral es proporcional al context window (80%) — con 50 ciclos compacta más veces (costo/latencia), sin cambio de corrección. Vigilar en pruebas con Ollama local (context chico).

**Verificación:** plan de 7 pasos completa sus 7 pasos; al forzar agotamiento, siempre hay síntesis parcial + tarjeta continue.

---

### Fase 3 — Selección estable del inspector (el foco robado) 🎯

| # | Cambio | Archivo | Detalle |
|---|--------|---------|---------|
| 3.1 | **Ids estables de mensaje** | `client/.../useAiChat.js:633-638` | Asignar `id` client-side (`crypto.randomUUID()`) al `assistantMsg` agregado al terminar; mismo patrón para mensajes user. `groupIntoTurns` deja de depender del índice. |
| 3.2 | **Selección con pin** (B5) | `AiDivingPanel.jsx:131-146` | Modelo `{ id, pinned }`: click manual → `pinned: true`; auto-follow del turno vivo **solo si no hay pin**. Al terminar: si hay pin, se respeta; si no, seleccionar **el último turno con actividad** (no el trailing de prosa). |
| 3.3 | **Sin frame null** | `AiDivingPanel.jsx` | Resolver la selección post-run en el mismo render (derivación en `useMemo`/functional update), no en un `useEffect` que llega un frame tarde → el empty state ya no parpadea. |
| 3.4 | **Adjuntar la síntesis al turno del trabajo** (opcional) | `deepDiveTurns.js` | Si el mensaje final es prosa-only sin actividad propia y pertenece al mismo run, fusionarlo con el turno anterior como "cierre" en vez de burbuja nueva — elimina de raíz la burbuja que roba foco. Evaluar contra el modelo de turnos documentado en [plan_deep_dive_layout.md](plan_deep_dive_layout.md). |

**Verificación:** inspeccionar un paso mientras corre → al terminar, la vista no salta; empty state no aparece nunca durante un run.

---

### Fase 4 — Síntesis "prosa primero" de verdad 📝

Restaurar el contrato de [modos_ai.md](../../contexto_caracteristicas/modos_ai.md): prosa narrada primero, tarjeta como recap.

| # | Cambio | Archivo | Detalle |
|---|--------|---------|---------|
| 4.1 | **Prompt: síntesis narrada obligatoria** | `server/ai/prompt/modes.js` | Antes de `final_answer`, el modelo DEBE escribir 2-4 párrafos de síntesis narrada como texto (qué encontró, qué significa, qué sigue). `final_answer` = recap estructurado, no la respuesta. |
| 4.2 | **Red de seguridad server** | `agenticLoop.js:396-418` | Si la prosa del turno final es corta (< ~200 chars), des-suprimir: streamear `resolvedSummary` como `text-delta` aunque haya structured output. Nadie vuelve a recibir 1 línea. |
| 4.3 | **Rebalancear NarrativeCard** | `ChatMessage.jsx` (NarrativeCard) | Con F1.5 hecho: findings y caveats visibles; colapsar solo lo largo (suggested_actions extensas). Jerarquía visual tldr → findings → why → actions → caveats. |

---

### Fase 5 — Continuación de primera clase 🔁

| # | Cambio | Archivo | Detalle |
|---|--------|---------|---------|
| 5.1 | **Tarjeta ask-continue rica** (Q19/20) | cliente (`useAiChat.js:582-597` + componente de la tarjeta) | Listar pasos pendientes/interrumpidos; acciones: **Continue** (presupuesto fresco), **Continue con instrucciones…** (input → se inyecta al resume prompt), **Finalizar con lo que hay** (fuerza wrap-up 2.5 sin más ciclos). |
| 5.2 | **Reanudar tras recargar** (Q21) | `useAiChat.js` reload path (~840) | Al cargar una conversación cuyo plan está `paused` → banner "Análisis pausado en s6 — ¿continuar?" que dispara el mismo continue. |
| 5.3 | **Continue con foco** (Q19) | `server/index.js` + `agenticLoop.js` | El resume prompt acepta la instrucción del usuario ("solo termina s6, ignora s7"). |
| 5.4 | **Extender el plan pausado** (Q25/27) | `tools_planner.js` + UI del plan | `update_plan` acepta `add_step`; en la UI, "+ Add step" sobre un plan pausado antes de continuar. (Germen de la F7 "dirigir en vuelo" de [plan_deep_dive_interaccion.md](plan_deep_dive_interaccion.md).) |

---

### Fase 6 — Pulidos y pendientes detectados (backlog) 📦

- **Indicador de presupuesto en la UI**: chip "ciclo 18/25" durante el run (los eventos `step-start` ya traen `iteration/maxIterations`). (Q1/2)
- **Verificar bug del panel ARTIFACTS** ("0 artifacts" con 3 gráficos creados — síntoma 5 de la auditoría).
- Notificación al terminar en otra pestaña (Q44).
- Export a `.amoxdeck` desde un análisis (Q42) — conecta con Report Flow.
- Refactor de deuda: unificar las 3 derivaciones del plan y las 2 fuentes de verdad de status (terreno de B1/B2/B5).

## Orden y entrega

1. **F1** (cierre veraz) — quirúrgica, resuelve lo que hoy se percibe como roto.
2. **F2** (presupuesto 50 + wrap-up) — el pedido explícito de subir ciclos, hecho bien.
3. **F3** (foco estable) — el bug de UX más irritante.
4. **F4** (prosa primero) y **F5** (continuación) — calidad y flujo.
5. **F6** — backlog según prioridad del momento.

F1+F2 pueden ir en un mismo PR si se quiere acelerar (ambas tocan el mismo tramo del loop); F3 siempre separada (solo cliente, riesgo distinto).

## Métrica de éxito

Correr un EDA de 7 pasos: **termina los 7** dentro del presupuesto dinámico; si se interrumpe, deja síntesis parcial + plan veraz (nada girando, badge PAUSED) + tarjeta para continuar con foco; al terminar, la vista inspeccionada **no se mueve** y los findings se leen sin ningún click.
