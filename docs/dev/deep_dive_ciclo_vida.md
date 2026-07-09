# Deep Dive — Auditoría del ciclo de vida del análisis (presupuesto, cierre y continuación)

> **Fecha:** 2026-07-09 · **Estado:** auditoría cerrada; plan en [plan_deep_dive_ciclo_vida.md](plan_deep_dive_ciclo_vida.md)

Tercera auditoría de 50 preguntas sobre Deep Dive. Las dos anteriores cubrieron la **deixis** ([deep_dive_interaccion.md](deep_dive_interaccion.md)) y el **inspector** ([deep_dive_inspector_analisis.md](deep_dive_inspector_analisis.md)). Esta cubre el **ciclo de vida**: qué pasa cuando el presupuesto de ciclos se agota, cómo cierra un análisis y cómo se continúa.

Síntomas reportados por el usuario (con screenshots):
1. Los 25 ciclos siempre se quedan cortos.
2. Al agotarse los ciclos, el plan queda con pasos saltados/sin marcar; **el último paso nunca se marca como completo**.
3. La respuesta final del chat es pobre; los insights quedan escondidos tras "Show summary".
4. Al terminar (o casi), **se genera un mensaje nuevo que roba el foco**: el inspector vuelve al empty state y hay que re-clickear "view steps".
5. (Observado en screenshot) El panel ARTIFACTS muestra "0 — No artifacts yet" pese a que el análisis produjo 3 gráficos. **Pendiente de verificar.**

---

## Parte 1 — Diagnóstico técnico (causas raíz confirmadas en código)

### B1 · El último paso nunca se marca `done` — bug de enum

Cuando el modelo llama `final_answer`, hay un barrido que auto-completa los pasos abiertos (`server/ai/tools.js:954-960`):

```js
if (step.status === 'pending' || step.status === 'running') {
    step.status = 'done';
}
```

Pero `update_plan` **nunca escribe `'running'`** — su enum es `['in_progress', 'done', 'failed', 'skipped', 'pending']` (`server/ai/tools_planner.js:65`). El paso que el modelo tenía `in_progress` al decidir cerrar (típicamente el último) **no matchea el barrido y queda congelado en `in_progress` para siempre**. En el cliente, `AgentPlanPanel` renderiza `in_progress` como spinner (`AgentPlanPanel.jsx:107-112`), así que el paso queda "girando" eternamente y `doneCount` sub-reporta (5/7).

### B2 · Agotar ciclos = corte en seco, sin síntesis ni re-estatus

El tope es solo la guarda del `while` (`server/ai/agenticLoop.js:254`). Al agotarse (`agenticLoop.js:629-642`):
- Se emite `ask-continue` y el plan se persiste como `paused`. **No hay iteración de gracia**: el modelo no recibe un turno final para sintetizar ni cerrar pasos.
- Los pasos pendientes solo se **cuentan**, nunca se re-estatusan → s6 queda con spinner (si estaba `in_progress`) y s7 en círculo vacío, indefinidamente.
- El modelo solo se entera del presupuesto en las **últimas 3 iteraciones** (countdown "URGENT" en `buildContinuationPrompt`, `agenticLoop.js:92-95`) — y solo si existe plan activo. Nunca se le dice el total al inicio.

Además el **badge del header puede decir DONE** aunque el plan quedó pausado con pasos sin terminar — el estado visible miente.

### B3 · El presupuesto dinámico hasta 50 ya existe… pero está muerto

- `create_plan` calcula `dynamicMaxIterations = min(50, max(15, pasos × 3))` y lo devuelve (`tools_planner.js:41-43,56`), pero **el loop nunca lo lee**: `effectiveMaxIterations` se asigna una vez y jamás se reasigna (`agenticLoop.js:245`), pese al comentario "grows when a plan is created".
- El comentario "Hard ceiling — never grows" (`agenticLoop.js:28`) también es falso: `continueMode` pasa `maxIterations: 30` sin clamp (`server/index.js:2181`).
- El hardcap prometido en `tools_planner.js:42` ("Capa 4 will enforce…") **nunca se implementó**.
- **No hay ningún otro acoplamiento a "25"** en el server (verificado por grep): subir el techo no rompe nada oculto. La compactación es proporcional al context window (80%, `compaction.js:76,96`), no al número de iteraciones — con 50 ciclos solo compacta más veces (costo/latencia, no corrección).

**Veredicto sobre 25→50: sí, viable.** La forma correcta no es solo cambiar la constante, sino conectar el presupuesto dinámico ya escrito (planes chicos no pagan 50 ciclos; planes de 7 pasos obtienen 21+; techo absoluto 50).

### B4 · Respuesta final pobre + insights escondidos — dos mitades

- **Server**: cuando `final_answer` trae `tldr`/`findings`, el loop **suprime** el streaming del resumen como texto del chat para no duplicar (`agenticLoop.js:396-418`). Todo el valor viaja en el payload estructurado.
- **Cliente**: ese payload se renderiza como `NarrativeCard` con `detailsOpen = useState(false)` (`ChatMessage.jsx:154`) — solo el `tldr` de 1-2 líneas es visible; Findings, "Why?", Next steps y Caveats quedan tras el toggle "Show summary" (y `likely_cause` tras un **segundo** toggle). No existe auto-expand.
- El diseño documentado dice lo contrario: *"prosa primero; la tarjeta de resumen estructurado es un complemento colapsable, no la respuesta entera"* ([modos_ai.md](../../contexto_caracteristicas/modos_ai.md)). El prompt lo pide, pero el pipeline lo desincentiva: el modelo aprende que `final_answer` "ya lo dice todo" y escribe poca prosa.

### B5 · El mensaje nuevo del final roba el foco del inspector

Cadena exacta (`AiDivingPanel.jsx:113-146`, `useAiChat.js:631-689`, `deepDiveTurns.js:31-66`):

1. Durante la generación, la selección del inspector se **fuerza** al turno vivo `'__live__'` en cada render (`AiDivingPanel.jsx:135-138`) — el usuario no puede fijar un turno anterior.
2. Al terminar el run, `setMessages` agrega el mensaje del asistente **sin `id`** (`useAiChat.js:633-638`) → los ids de turno son posicionales (`a-${i}`).
3. El turno `'__live__'` desaparece en ese mismo render → `selectedTurn` resuelve a `null` **al menos un frame** → el inspector muestra el empty state ("Select a step on the left…").
4. El efecto reconciliador salta la selección al **último turno AI** (`AiDivingPanel.jsx:140-143`) — que suele ser el **trailing de prosa/síntesis sin actividad** (la síntesis llega como mensaje aparte, ver modelo de turnos en [plan_deep_dive_layout.md](plan_deep_dive_layout.md)). `buildStepGroups` devuelve vacío para él → "No activity for this message."
5. Resultado: el análisis que estabas viendo se pierde de vista y hay que re-clickear "view steps →" en la burbuja anterior.

Deuda relacionada: `AiDivingPanel.jsx` (769 líneas) mezcla layout+composer+selección+side-effects; `useAiChat.js` (990 líneas) es un god-hook; y hay **3 derivaciones paralelas** del modelo de plan (`buildStepGroups`, `buildSessionArtifacts`, reload path) más **2 fuentes de verdad** del estado de pasos (snapshot `planState` vs tool calls por turno).

---

## Parte 2 — Las 50 preguntas del ciclo de vida

Leyenda: ✅ posible hoy · ⚠️ parcial / indirecto · ❌ falta

### A. Presupuesto y transparencia
1. ¿Cuántos ciclos tiene el agente para mi análisis? ❌ (25 fijo e invisible; solo se ve "25 steps" a posteriori)
2. ¿Cuántos le quedan mientras corre? ⚠️ (`step-start` trae `iteration/maxIterations` pero la UI no muestra presupuesto restante)
3. ¿El **agente** sabe cuánto presupuesto tiene? ❌ (solo countdown en las últimas 3 iteraciones, y solo con plan activo)
4. ¿El presupuesto se adapta al tamaño del plan? ❌ (`dynamicMaxIterations` calculado pero nunca aplicado)
5. ¿Puedo darle más presupuesto de entrada ("tómate tu tiempo")? ❌
6. ¿Sé por qué se detuvo (terminó vs se quedó sin ciclos)? ⚠️ (`ask-continue` existe, pero el badge puede decir DONE)
7. ¿Un análisis sin ciclos se distingue de uno completado? ❌ (mismo aspecto; pasos huérfanos como única pista)
8. ¿Los retries/errores me cuestan ciclos visiblemente? ⚠️ (los consumen; `sql-correction` se emite pero no se explica el costo)

### B. Cierre y calidad del final
9. ¿Siempre hay síntesis final aunque se agoten los ciclos? ❌ (corte en seco, cero prosa de cierre)
10. ¿La respuesta final del chat es autosuficiente? ❌ (1-2 líneas de tldr)
11. ¿Los insights se ven sin clicks extra? ❌ (todo tras "Show summary"; "Why?" tras segundo toggle)
12. ¿El plan refleja fielmente lo que se hizo? ❌ (último paso congelado `in_progress` — bug B1)
13. ¿Los pasos no alcanzados quedan marcados como tal? ❌ (spinner eterno + círculo vacío — B2)
14. ¿Sé qué me perdí por falta de ciclos? ⚠️ (a veces el modelo lo anota en la nota del paso o caveats)
15. ¿El foco permanece en el análisis al terminar? ❌ (selección robada — B5)
16. ¿Puedo ver síntesis y pasos a la vez? ⚠️ (chat + inspector coexisten, pero la selección se pierde justo al final)

### C. Continuar un análisis interrumpido
17. ¿Puedo continuar cuando se agotan los ciclos? ✅ (tarjeta ask-continue → continue)
18. ¿El continue retoma el plan donde quedó? ✅ (plan `paused` + resume prompt)
19. ¿Puedo continuar con foco ("solo termina s6")? ❌
20. ¿Puedo elegir cuántos ciclos extra dar? ❌ (30 hardcodeado, sin clamp)
21. ¿Puedo retomar tras cerrar la app? ⚠️ (la conversación y el plan `paused` persisten; la tarjeta ask-continue no reaparece al recargar)
22. ¿Puedo re-lanzar solo el paso que quedó a medias? ❌
23. ¿Si el modelo se atasca, se recupera solo? ⚠️ (idle/stall watchdogs existen; el usuario no ve qué pasó)
24. ¿Un follow-up reutiliza todo el contexto del análisis? ✅ (misma conversación + compaction)

### D. Extender / redirigir después
25. "Ahora analiza también X" → ¿extiende el plan existente? ❌ (turno nuevo, plan nuevo)
26. ¿Profundizar un hallazgo queda ligado al análisis original? ⚠️ (refs de artefactos ayudan; no hay vínculo de plan)
27. ¿Puedo editar el plan pausado antes de continuar? ❌
28. ¿Puedo aprobar el plan antes de que corra? ⚠️ (se ve y se puede skip; no hay gate de aprobación)
29. ¿Puedo priorizar pasos ("haz s6 primero")? ❌
30. ¿Un follow-up chip puede escalar a análisis planificado? ⚠️ (manda texto; el modelo decide)
31. ¿Redirigir en vuelo ("mejor enfócate en churn")? ❌ (F7 pendiente de [plan_deep_dive_interaccion.md](plan_deep_dive_interaccion.md))

### E. Sesiones y trazabilidad
32. ¿Reabrir la conversación restaura plan + pasos + gráficos? ⚠️ (se reconstruye, pero los ids cambian y la selección/estado visual se resetea)
33. ¿Puedo comparar dos corridas del mismo análisis? ❌
34. ¿Duplicar un análisis con otra tabla/periodo? ❌
35. ¿Historial de ciclos usados por corrida? ❌
36. ¿Renombrar/organizar sesiones? ✅
37. ¿Buscar dentro de un análisis largo? ❌
38. ¿Ver todos los artefactos juntos? ⚠️ (panel ARTIFACTS existe, pero se observó "0 artifacts" con 3 gráficos creados — verificar bug)

### F. Consumo del resultado
39. ¿Guardar como notebook? ✅ ("Save as notebook")
40. ¿Exportar la conversación/resumen? ✅ (export a Markdown)
41. ¿Mandar gráficos a Story Flow? ✅ ("Open in Story Flow")
42. ¿Generar un deck (.amoxdeck) desde el análisis? ❌
43. ¿Copiar findings con sus citas? ⚠️ (a mano desde la tarjeta)
44. ¿Aviso cuando el análisis termina y estoy en otra pestaña? ❌

### G. Confianza al cierre
45. ¿Sé qué números fueron verificados? ⚠️ (`verifyFindings` agrega caveat de no-verificados — visible solo expandido)
46. ¿Sé qué pasos fallaron y por qué? ⚠️ (badge failed; motivo enterrado)
47. ¿Los caveats se ven sin expandir? ❌ (dentro del colapsable)
48. ¿El agente declara supuestos al pausar? ❌ (no hay turno de pausa)
49. ¿Plan (derecha) e inspector (centro) cuentan la misma historia? ⚠️ (dos fuentes de verdad; divergen al agotar ciclos)
50. ¿Puedo confiar en el badge DONE? ❌ (dice DONE con pasos sin terminar)

**Score: 7 ✅ · 16 ⚠️ · 27 ❌** — la mitad inferior del ciclo de vida (cierre + continuación) es donde se concentra el rojo.

---

## Parte 3 — Resumen de brechas (prioridad)

1. **El cierre es el punto más roto**: bug de enum (B1), corte sin síntesis (B2), badge mentiroso (Q50), foco robado (B5). Es lo que el usuario percibe como "bug" hoy.
2. **Presupuesto ciego**: ni el usuario ni el agente saben cuánto hay/queda; el mecanismo dinámico hasta 50 está escrito y desconectado (B3).
3. **La síntesis final traiciona el diseño "prosa primero"** (B4): supresión en server + colapso en cliente.
4. **Continuar funciona pero es primitivo**: sin foco, sin elección de presupuesto, sin reaparecer tras recarga, sin editar el plan pausado (C/D).
5. **Deuda estructural**: selección sin ids estables, 3 derivaciones del plan, 2 fuentes de verdad de status — el terreno donde estos bugs crecen.

El plan de corrección por fases está en [plan_deep_dive_ciclo_vida.md](plan_deep_dive_ciclo_vida.md).
