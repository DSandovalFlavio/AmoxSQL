# Deep Dive — Auditoría de la voz narrativa y conversacional

> **Fecha:** 2026-07-09 · **Estado:** auditoría cerrada; plan en [plan_deep_dive_narrativa.md](plan_deep_dive_narrativa.md)
> 4ª auditoría de 50 preguntas de Deep Dive (previas: deixis, inspector, ciclo de vida).

## El síntoma

Deep Dive responde **seco**: datos duros e insights cortos, sin narrativa — no explica el análisis que hizo, por qué tomó sus decisiones, ni por qué sus insights merecen atención. El usuario esperaba un **analista que acompaña** (hipótesis, conversación fluida, historia), y recibe un **reporte telegráfico**.

**¿F4 del ciclo de vida no lo arregló?** No — F4 fue un paliativo anti-"tarjeta pelada": si la prosa era < 220 chars, streamea el `summary`… que son los mismos bullets. Evita el vacío, no crea narrativa. Este problema tiene sus propias causas raíz.

## Parte 1 — Causas raíz (la cadena que seca la voz)

### N1 · El continuation prompt es puro modo comando — y es lo que el modelo lee CADA iteración

`buildContinuationPrompt` (`server/ai/agenticLoop.js`) se inyecta como turno de usuario en **cada** iteración:

> *"Continue with step s5: mark it `update_plan(..., in_progress)`, do the work, then `update_plan(..., done)`."*

Cero exigencia narrativa. Por **recency bias**, este mensaje mecánico pesa más que el "Analytical Narrator" del system prompt (que queda a miles de tokens de distancia, detrás del schema). El modelo aprende que su trabajo es *ejecutar y marcar*, no *narrar*. **Es la causa #1 y también el lever #1**: es el único texto que tenemos garantizado frente a los ojos del modelo en cada turno.

### N2 · La presión de presupuesto (F2) empeoró el tono

Los avisos que añadimos empujan a lo seco: *"one iteration should complete one plan step"*, *"Skip any remaining optional steps"*, y el wrap-up pide *"**Briefly** synthesize"*. Ahorrar ciclos ≠ ahorrar palabras, pero el modelo no distingue.

### N3 · `final_answer` está diseñado anti-narrativa

- La descripción del tool dice literalmente: *"**skip the legacy summary field** when using tldr/findings"* — desincentiva el único campo narrativo.
- El `resolvedSummary` auto-construido es una lista de bullets (`**TL;DR:** … **Findings:** - …`).
- El schema de `findings` es `{point, value}` — **no existe campo "por qué importa"**. Un finding sin su "so what" es un dato duro.
- El Step 5 del protocolo (que yo mismo escribí en F4) pide *"2-4 **sentences**"* — pedí poco y eso entrega.

### N4 · No existe un arco narrativo requerido

Nada en el prompt pide: **apertura** ("esto voy a investigar y por qué estas preguntas"), **transiciones** ("s3 mostró X, lo que cambia lo que buscaré en s4"), **hipótesis explícitas** ("mi hipótesis es estacionalidad; la pruebo con…"), **pivotes narrados** ("descarto el análisis geográfico porque…"), ni **cierre con historia** (contexto → hallazgos → causa → recomendación). El "Analytical Narrator" da estilo por-respuesta, no estructura de sesión.

### N5 · La skill de storytelling existe… y está muerta

`agent/skills/data-storytelling/SKILL.md` es un framework excelente (mensaje primero, título que declara la conclusión, un protagonista). Pero las skills solo se activan por **selección manual**, y `matchSkillByIntent()` (`server/ai/skills.js:171`) — que haría auto-activación por intención — está implementado y **nunca se llama** (dead code, verificado por grep).

### N6 · Sin compensación por modelo

Los tiers flash/small (el screenshot usa Gemini Flash) tienden a lo telegráfico por naturaleza. `modelProfiles` ajusta contexto/steps pero **no el estilo**: un modelo chico necesita instrucciones narrativas más literales (plantillas, ejemplos), y recibe las mismas.

### N7 · La UI concatena la prosa del run en un bloque

Todo el run es un mensaje: las frases sueltas que el modelo escribe entre pasos se pegan sin costura y se leen como fragmentos inconexos. La narración por-paso vive en el inspector, pero **el chat es la cara** — si la prosa no tiene párrafos con arco, el turno se ve como notas sueltas.

## Parte 2 — Las 50 preguntas de expectativa conversacional

Lo que un usuario espera *sentir* en la conversación durante distintos análisis (EDA, investigación de métrica, comparación, series de tiempo, hipótesis). Leyenda: ✅ pasa hoy · ⚠️ a veces / depende del modelo · ❌ falla hoy

### A. Apertura y encuadre (¿me sitúa antes de ejecutar?)
1. ¿Me dice qué va a investigar y por qué ese enfoque? ⚠️ (el plan lista pasos, pero no narra el porqué del enfoque)
2. ¿Explica por qué eligió ESOS pasos y no otros? ❌
3. ¿Menciona qué espera encontrar (hipótesis inicial)? ❌
4. ¿Reconoce mi pregunta con sus palabras antes de arrancar? ⚠️
5. ¿Me anticipa qué NO va a cubrir y por qué? ❌ (solo aparece post-hoc en caveats)
6. ¿Si mi pregunta es vaga, conversa para acotarla en vez de asumir? ⚠️ (`ask_user` existe; rara vez se usa)

### B. Narración del proceso (¿siento que analiza, no que ejecuta?)
7. ¿Narra qué encontró en cada paso, no solo lo marca done? ⚠️ (la `note` del update_plan es un titular de una línea)
8. ¿Explica por qué el hallazgo de un paso cambia lo que sigue? ❌
9. ¿Narra sus decisiones metodológicas (por qué ese JOIN, ese periodo, esa agregación)? ❌
10. ¿Cuenta cuándo descarta un camino y por qué? ⚠️ (a veces en la note; nunca en el chat)
11. ¿Dice cuándo algo lo sorprendió? ❌
12. ¿Narra los errores y cómo los corrigió, o los esconde? ⚠️ (sql-correction es silencioso en el chat)
13. ¿Los pasos se leen como capítulos conectados o como tareas sueltas? ❌
14. ¿Distingue exploración ("estoy tanteando") de conclusión ("esto ya es un hallazgo")? ❌

### C. Insights con su "por qué importa" (¿son insights o datos duros?)
15. ¿Cada insight trae su "so what"? ❌ (schema `{point, value}` no tiene el campo)
16. ¿Contextualiza la magnitud ("$45M = 23% del total, 2× el segundo")? ⚠️ (el prompt lo pide; el continuation lo mata)
17. ¿Distingue lo esperado de lo anómalo? ❌
18. ¿Prioriza los insights (cuál es EL hallazgo vs los secundarios)? ⚠️ (tldr existe; el ranking interno no se narra)
19. ¿Conecta insights entre sí ("la estacionalidad explica el pico de Portátiles")? ❌
20. ¿Cuantifica la oportunidad/riesgo del insight ("suavizar enero vale ~$2M")? ❌
21. ¿Los números van tejidos en frases o en pares label:valor? ⚠️ (prompt lo pide; resolvedSummary son bullets)

### D. Hipótesis y razonamiento (¿es un compañero de pensamiento?)
22. ¿Plantea hipótesis explícitas antes de probar? ❌
23. ¿Narra la confirmación/refutación ("mi hipótesis era X; los datos dicen Y")? ❌
24. ¿Ofrece explicaciones causales candidatas con su grado de confianza? ⚠️ (`likely_cause` existe, escondido tras "Why?")
25. ¿Propone hipótesis alternativas que valdría la pena probar? ⚠️ (followups a veces)
26. ¿Distingue correlación de causalidad al narrar? ⚠️
27. ¿Razona en voz alta sobre calidad de datos cuando afecta la conclusión? ⚠️ (caveats al final, no en el momento)
28. ¿Me invita a retarlo ("¿ves algo raro en esto?")? ❌

### E. Conversación fluida (¿es un diálogo o un dispensador?)
29. ¿Un follow-up simple recibe respuesta conversacional (sin plan, sin tarjeta)? ⚠️ (el protocolo lo permite; RULE ZERO a veces re-planea)
30. ¿Mantiene el hilo ("como vimos en s3…") entre turnos? ⚠️
31. ¿Responde "¿por qué?" sobre un hallazgo con profundidad y no repitiendo el dato? ⚠️
32. ¿Adopta mis palabras/términos de negocio al responder? ⚠️
33. ¿Puedo discrepar y que argumente en vez de plegarse? ⚠️
34. ¿Cierra sus respuestas invitando a continuar la conversación? ⚠️ (followup chips ≠ invitación narrada)
35. ¿El tono es de colega analista o de sistema que reporta? ❌ (hoy: sistema)

### F. Cierre narrativo (¿la historia completa?)
36. ¿El cierre cuenta la historia (contexto → qué encontré → por qué → qué haría)? ❌ (tldr + bullets)
37. ¿El cierre conecta con MI pregunta original? ⚠️
38. ¿Explica el "por qué" del hallazgo principal de forma visible? ❌ (doble-colapsado hasta F1.5; ahora visible pero sigue siendo 1 frase)
39. ¿Las recomendaciones traen su razonamiento ("bundling EN ENERO porque la caída post-navideña…")? ⚠️
40. ¿Reconoce qué quedó abierto y lo convierte en siguiente conversación? ⚠️
41. ¿El cierre tiene proporción con el análisis (25 pasos ≠ 2 líneas)? ❌

### G. Tono y registro (¿se adapta?)
42. ¿Detecta si quiero registro ejecutivo vs técnico? ❌
43. ¿Puedo pedirle "cuéntamelo más simple/profundo" y cambia? ⚠️ (texto libre funciona, no persiste)
44. ¿Responde en mi idioma consistentemente? ✅
45. ¿La densidad de números se adapta al registro? ❌
46. ¿RULES.md permite fijar el tono por proyecto? ✅ (existe; poco documentado para esto)

### H. Proactividad conversacional (¿propone o espera?)
47. ¿Sugiere el siguiente análisis con argumento ("valdría ver X porque Y")? ⚠️ (chips sin porqué)
48. ¿Ofrece guardar/reportar cuando el análisis lo amerita? ✅ (notebook offer)
49. ¿Pregunta qué me interesó más para profundizar? ❌
50. ¿Propone hipótesis nuevas que surgieron del análisis? ⚠️

**Score: 4 ✅ · 24 ⚠️ · 22 ❌** — y los ⚠️ dependen del modelo: con tiers flash caen a ❌. Las categorías B (proceso), C (so-what), D (hipótesis) y F (cierre) — el corazón del "analista compañero" — son las más rojas.

## Parte 3 — Síntesis

El sistema tiene **la intención correcta en el lugar equivocado**: el "Analytical Narrator" vive en el system prompt (lejos), mientras el mensaje que el modelo ve cada turno (`buildContinuationPrompt`) ordena ejecutar sin narrar, y el instrumento de cierre (`final_answer`) premia bullets sin "so what". La skill de storytelling que resolvería medio problema está desconectada. El resultado inevitable: datos duros bien formateados sin historia.

Plan de corrección: [plan_deep_dive_narrativa.md](plan_deep_dive_narrativa.md).
