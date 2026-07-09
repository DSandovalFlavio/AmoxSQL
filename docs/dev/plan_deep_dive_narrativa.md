# Plan de Implementación — Deep Dive: voz narrativa y conversacional

> Deriva de [deep_dive_narrativa.md](deep_dive_narrativa.md) (auditoría; causas N1–N7, preguntas Q1–Q50).
> **Estado:** pendiente de arranque.

## Objetivo

Que Deep Dive se sienta como un **analista que acompaña**: narra qué investiga y por qué, cuenta lo que va encontrando y cómo cambia su rumbo, entrega insights con su "por qué importa", y cierra con la historia completa — sin perder la disciplina del plan ni el presupuesto de ciclos.

## Principio de diseño

**La narrativa se exige donde el modelo mira**: el continuation prompt (cada iteración) y los schemas de tools (cada llamada) — no solo en el system prompt. Y se pide **estructura de historia** (apertura/transición/cierre), no solo "sé narrativo".

## Fases

---

### Fase 1 — El continuation prompt narra (N1, N2 · el lever más grande)

Reescribir `buildContinuationPrompt` (`server/ai/agenticLoop.js`) para que cada turno exija el ciclo **narrar → ejecutar → narrar**:

- Directiva nueva por paso: *"Before update_plan(done): write 2-3 sentences IN THE CHAT narrating what you found, why it matters for the user's question, and how it shapes the next step. THEN mark the step done (the note = one-line headline of that narration)."*
- Añadir al bloque de estado del plan una línea de **memoria narrativa**: "Story so far: <concatenación de notes>" para que el hilo no se pierda entre iteraciones/compactación.
- **Re-balancear los avisos de presupuesto (F2 del ciclo de vida)**: cambiar "one iteration should complete one plan step" por "complete one step per iteration — narrating as you go; narration is cheap, extra queries are not". El wrap-up deja de decir "briefly": pide *"a complete closing narrative (2-4 short paragraphs)"*.

**Archivos:** `server/ai/agenticLoop.js` (buildContinuationPrompt, buildWrapUpPrompt).

---

### Fase 2 — Arco narrativo obligatorio en el prompt de modo (N4)

En `buildDivingModeSection` (`server/ai/prompt/modes.js`), reemplazar la lista suelta del "Analytical Narrator" por una sección **"Narrative Arc — how an analysis reads"** con las 4 piezas obligatorias:

1. **OPENING** (junto a create_plan): 2-3 frases — qué voy a investigar, por qué estas preguntas, qué hipótesis tengo.
2. **PER-STEP** (durante): hallazgo narrado + por qué importa + qué cambia. Sorpresas y descartes se cuentan ("descarto X porque…").
3. **PIVOTS**: si el plan cambia de rumbo, narrar el porqué en el momento.
4. **CLOSING** (antes de final_answer): **2-4 párrafos** que cuentan la historia completa — contexto → qué encontré (conectando hallazgos) → por qué pasa → qué haría yo. Corregir el "2-4 sentences" del Step 5 (quedó corto).

Añadir además a "Conversation State": *"Follow-up questions get a CONVERSATIONAL reply — prose, no plan, no card — unless they require new multi-step analysis"* (Q29-35) y cerrar cada respuesta invitando a continuar (una pregunta o propuesta narrada, no solo chips).

**Archivos:** `server/ai/prompt/modes.js`.

---

### Fase 3 — `final_answer` pro-narrativa (N3 · insights con "so what")

1. **Campo nuevo `so_what`** en cada finding: `{point, value, so_what, source_query_id}` — "why this deserves attention / what it implies". El prompt lo exige; `NarrativeCard` lo renderiza como subtítulo del finding (texto secundario bajo el punto).
2. **Rehabilitar `summary` como narrativa**: la descripción del tool deja de decir "skip the legacy summary field"; pasa a *"summary: the closing narrative in flowing markdown prose (2-4 short paragraphs). ALWAYS provide it — the structured fields are the recap, the summary is the story"*.
3. **`resolvedSummary` deja de ser bullets**: si el modelo no dio summary, construir párrafos (tldr como frase inicial + findings tejidos en prosa + likely_cause + acciones) en lugar de la lista `**Findings:** - …`.
4. Subir el umbral de la red de seguridad prosa-primero (F4 del ciclo de vida) de 220 → **600 chars**, y streamear el `summary` narrativo (ya no bullets) cuando dispare.

**Archivos:** `server/ai/tools.js` (schema + description + resolvedSummary), `server/ai/agenticLoop.js` (umbral), `client/src/components/ai/ChatMessage.jsx` (render de `so_what`), `server/ai/prompt/modes.js` (documentar el campo).

---

### Fase 4 — Conectar la skill de storytelling (N5)

`matchSkillByIntent()` está implementado y muerto. Conectarlo:

- En el endpoint de chat (`server/index.js`), si `mode==='diving'` y NO hay `activeSkillId`, correr `matchSkillByIntent(último mensaje del usuario, loadSkills())`; si hay match con confianza suficiente, cargar esa skill como contexto del turno (y emitir un evento `skill-activated` para que la UI muestre el chip).
- Caso especial: cuando el análisis va a cerrar (o al construir notebooks/charts finales), la skill `data-storytelling` aporta el framework de "mensaje primero / título que declara la conclusión" — evaluar inyectar su sección de titulares en el prompt del wrap-up.

**Archivos:** `server/index.js`, `server/ai/skills.js` (sin cambios de lógica), UI opcional para el chip.

---

### Fase 5 — Plantillas literales SOLO para modelos locales chicos (N6 · condicional)

**Alcance corregido**: los modelos cloud que se usan en la práctica (Gemini 3.5 Flash, MiniMax M3) son tier `cloud` en `modelProfiles` y **no necesitan ni recibirían** esto — son perfectamente capaces de narrar; su sequedad la causan las instrucciones (N1-N3), que arreglan F1-F3. Esta fase aplica únicamente a los **tiers medium/low de Ollama local** (gemma4:e2b, phi4:mini…), que no siguen instrucciones abstractas de estilo.

- "Plantilla literal" = andamio de rellenar-huecos en el prompt (ej.: *"Al cerrar cada paso escribe: «Encontré ___. Esto importa porque ___. Por eso ahora ___.»"*). Los modelos chicos replican patrones literales mucho mejor que directivas abstractas; el costo es prosa formulaica — aceptable en un 4B, empobrecedor en uno grande (por eso NUNCA se inyecta en cloud/high).
- **Condicional a F7**: solo se implementa si tras F1-F3 los modelos locales medium siguen secos en la verificación.

**Archivos:** `server/ai/prompt/modes.js`, `server/ai/prompt/index.js` (pasar el profile).

---

### Fase 6 — La prosa del run se lee como capítulos (N7 · UI, opcional)

- Mínimo: CSS — párrafos de la prosa del turno con espaciado real (aire entre capítulos de narración).
- Evaluar (no comprometido): intercalar marcadores ligeros de paso en el chat ("— s3 · Tendencia temporal —") derivados de los `update_plan`, para que la narración concatenada tenga costuras visibles. Riesgo: ruido; decidir tras probar F1-F3, que pueden bastar.

**Archivos:** `client/src/index.css`, quizá `DeepDiveTranscript.jsx`.

---

### Fase 7 — Verificación con checklist

Correr el EDA de referencia (export.csv) con los modelos reales de uso — **Gemini 3.5 Flash y MiniMax M3** (cloud) y un Ollama medium local — y evaluar contra las 8 categorías de la auditoría (A-H). Criterio de salida: B/C/D/F pasan de ❌ a ✅/⚠️ en los cloud. Si el local medium sigue seco → activa F5.

## Orden y entrega

1. **F1+F2+F3** — un PR (server prompt + tool + render del so_what): es el motor narrativo completo.
2. **F4** (skill auto-activada) — PR corto separado.
3. **F5** (tiers) y **F6** (UI) — según resultados de F7.

## Métrica de éxito

Pedir "hazme un EDA de este archivo" y que la conversación se lea así: el agente **abre** contando qué va a investigar y su hipótesis; **narra** cada capítulo (hallazgo → por qué importa → qué sigue); **cierra** con 2-4 párrafos que cuentan la historia y recomiendan con argumentos; y un follow-up ("¿por qué cae enero?") recibe una respuesta conversacional de colega, no una tarjeta. Los findings de la tarjeta traen su "so what" visible.
