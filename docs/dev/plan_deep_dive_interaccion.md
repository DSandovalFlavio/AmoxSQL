# Plan de Implementación — Interactividad humano ↔ agente (referencia de artefactos)

Deriva de [deep_dive_interaccion.md](deep_dive_interaccion.md). El agente ya **comunica** sus resultados paso a paso; falta que el humano pueda **señalar** cualquier artefacto y conversar sobre él. Esto plantea la **capa de referencia (deixis)** y las interacciones de mayor valor.

## Objetivo
Que desde el chat se pueda **referenciar un artefacto** (gráfico, query, número, paso del plan, hallazgo, tabla/columna) y preguntar/actuar sobre él, con el agente recibiendo ese artefacto como **contexto del turno**.

Ejemplo objetivo: *"Sobre **[este gráfico]** ¿por qué Q4 sube tanto?"* → el agente responde con el chart + su query/datos en contexto.

## Arquitectura

### Modelo de una referencia
Objeto ligero (el dato pesado lo expande el servidor desde el caché por `queryId`):
```js
{
  type: 'chart' | 'query' | 'step' | 'finding' | 'table' | 'number',
  label,                 // texto para el chip ("Gráfico: Top ciudades")
  queryId?,              // chart/query/number → para rehidratar datos
  column?,               // number → columna citada
  chartConfig?,          // chart → config (chartType, ejes, split…)
  stepId?, stepLabel?,   // step → s5 + descripción + insight
  findingText?,          // finding → la oración del hallazgo
  table?, columnName?,   // table/column
}
```

### Flujo
1. **"Ask about this"** en cada artefacto → `addReference(ref)` + foco en el input.
2. El input muestra **chips de referencia** (como los de contexto) con quitar.
3. Al enviar, el cliente manda `referencedArtifacts: [...]` en el body del chat.
4. El **servidor expande** cada ref (rehidrata datos de query por `queryId` desde el caché/persistencia) e **inyecta un bloque "Referenced artifacts"** en el prompt del turno.
5. El agente responde usando ese contexto (guía de prompt incluida).

### Por qué es factible
Ya existen los ladrillos: `queryId` en `execute_sql`/citaciones, `chartConfig` en `display_chart`, el caché `queryResults` + persistencia por query, y el patrón `currentResult`/`currentChartConfig` que ya se inyecta en modo assistant. Esto lo **generaliza** a cualquier artefacto de la sesión.

## Componentes a tocar
| Capa | Archivo | Cambio |
|------|---------|--------|
| Estado | `useAiChat.js` | `pendingReferences`, `addReference`, `removeReference`; incluir `referencedArtifacts` en el body del send; limpiar al enviar |
| Input | `AiDivingPanel.jsx` / `AiAssistantPanel.jsx` | render de **chips de referencia** en el composer (junto a los de contexto) |
| Artefactos | `ChatResultsBlock.jsx` (chart), `SqlActivityBlock.jsx` (query), `DeepDiveInspector.jsx` (paso), `ChatMessage.jsx`→`NarrativeCard` (hallazgo) | botón **"Ask about this"** que llama `addReference` |
| Menciones | nuevo `ArtifactMention.jsx` | autocompletado `@/#` de artefactos de la sesión |
| Servidor | `server/index.js` (endpoint chat) | aceptar `referencedArtifacts`; expandir por `queryId` |
| Prompt | `server/ai/prompt/context.js` | `buildReferencesSection(refs)` inyecta los artefactos referenciados |
| Guía | `server/ai/prompt/modes.js` | instruir cómo usar los artefactos referenciados |

## Fases (commits)

### Fase 1 — Cimiento de la capa de referencia
- `useAiChat`: estado `pendingReferences` + `addReference`/`removeReference` + enviar `referencedArtifacts` + limpiar tras enviar.
- Composer (ambos modos): **chips de referencia** (reusar el patrón de los chips de contexto).
- Servidor: endpoint acepta `referencedArtifacts`; expande cada ref con `queryId` (datos + SQL) desde caché/persistencia.
- Prompt: `buildReferencesSection` + guía mínima ("el usuario está preguntando sobre estos artefactos: …").

### Fase 2 — "Ask about this" en GRÁFICOS (tu caso exacto)
- Botón en el gráfico (inspector y chat) → `addReference({type:'chart', queryId, chartConfig, label})`.
- Prueba E2E: señalar un gráfico y preguntar; el agente responde con ese chart en contexto.

### Fase 3 — Extender a query, paso y hallazgo
- `SqlActivityBlock` → ref `query` (queryId + SQL).
- Header de paso en el inspector → ref `step` (stepId + label + insight).
- `NarrativeCard` (hallazgo) → ref `finding` (texto + source_query_id).

### Fase 4 — Menciones @/# + autocompletado
- Al escribir `@`/`#` en el input, listar artefactos de la sesión (pasos, gráficos, tablas) e insertar la referencia.

### Fase 5 — Quick-actions por artefacto
- En cada artefacto: *Explicar · Rehacer distinto · Profundizar · Validar* → pre-llenan el prompt con la referencia + instrucción canónica.

### Fase 6 — Selección de número/texto → "preguntar sobre esto"
- Seleccionar un valor en una respuesta → acción flotante que crea una ref `number` (queryId+columna).

### Fase 7 (aparte, menor) — Dirigir en vuelo
- Redirigir mid-loop, agregar paso, aprobar plan antes de ejecutar. (Toca el `agenticLoop`; va en su propio PR.)

## Guía de prompt (cómo el agente usa las referencias)
- Si hay `referencedArtifacts`, el agente debe **anclar su respuesta a ellos** (no re-explorar a ciegas): leer el chart/query/datos provistos y responder específicamente.
- Para una ref de **gráfico**: puede explicar el patrón, recalcular sobre su query, o proponer un cambio de config.
- Para una ref de **query/paso**: puede explicar, optimizar o re-ejecutar variantes.
- Mantener la voz conversacional y, si re-ejecuta, usar `execute_sql` (no inventar ids).

## Edge cases / decisiones
- **Tamaño**: no mandar datasets completos en la ref; mandar `queryId` y que el servidor rehidrate (con tope de filas, como ya hace `display_chart`).
- **Refs múltiples**: permitir varias (comparar dos gráficos) — `referencedArtifacts` es array.
- **Ref obsoleta**: si el `queryId` ya no está en caché, el servidor cae a la persistencia; si tampoco, avisa y el agente re-ejecuta.
- **Ambos modos**: la capa sirve a assistant y diving (generaliza `currentChartConfig`/`currentResult`).
- **Persistencia**: las refs son por-turno (no se guardan); el artefacto sí está persistido.

## Orden sugerido
1. **Fase 1 + Fase 2** (cimiento + gráficos) — entrega tu caso exacto end-to-end.
2. **Fase 3** (query, paso, hallazgo) — completa la deixis.
3. **Fase 4** (menciones) y **Fase 5** (quick-actions) — fluidez.
4. **Fase 6** (selección) y **Fase 7** (dirigir en vuelo) — refinamiento.

## Métrica de éxito
Poder tomar cualquier gráfico/query/paso/hallazgo de una sesión, decir "explícame/cámbiame/profundiza **esto**", y que el agente responda **anclado a ese artefacto** sin que tengas que describirlo con palabras.
