# Plan de Implementación — Rediseño de la ventana Deep Dive

## Problema

Hoy una sesión Deep Dive vuelca todo en un solo stream vertical: `create_plan`, los muchos `update_plan`, queries, razonamientos, gráficos y al final el summary, todo apilado hacia arriba. Se pierde el hilo conversacional y se siente "revuelto" / caja negra.

## Concepto: Transcript + Inspector de pasos (master–detail)

Separar **qué se conversó** (hilo) de **cómo lo hizo la IA en cada paso** (inspector), conservando la verbosidad pero ordenada.

### Modelo de turnos — corte por **mensaje de texto real**

Un **turno** se delimita por **cada mensaje de texto real**, venga del `user` o de la `AI`. **No** cuentan como mensaje (quedan como *actividad* dentro del turno): queries (`execute_sql`), `create_plan`/`update_plan`, razonamiento (`<think>`), gráficos (`display_chart`), etc.

```
👤 user: "hazme un EDA"                       ← turno (user)
🤖 AI: "tengo que planificar…"                ← turno (ai)   actividad: create_plan, 1ª query, razonamiento
🤖 AI: "analicé X y encontré Y…"              ← turno (ai)   actividad: queries, update_plan, charts, razonamiento
🤖 AI: "en resumen… (summary)"                ← turno (ai)   actividad: últimos updates, chart final
```

- Un mismo prompt del usuario puede generar **varios turnos de IA** (uno por cada chunk de prosa que escribe).
- La actividad **sin texto** que la IA produjo para llegar a ese mensaje se **adjunta a ese turno** y se muestra en el inspector cuando se selecciona.

**Algoritmo de agrupado** (`groupIntoTurns(messages)`):
1. Recorrer `messages` en orden, acumulando `pendingActivity` (toolCalls + razonamiento de mensajes assistant sin prosa).
2. `role === 'user'` → empuja un turno `{type:'user', text}`.
3. `role === 'assistant'` con prosa visible → empuja un turno `{type:'ai', text, activity: pendingActivity + activity propia}` y limpia `pendingActivity`.
4. `role === 'assistant'` solo con toolCalls/razonamiento (sin prosa) → acumula en `pendingActivity`.
5. Si al final queda `pendingActivity` (turno en curso sin prosa todavía) → turno `{type:'ai', text:'', activity, inProgress:true}`.

## Layout — 3 regiones

La **barra derecha (plan + artifacts) es fija**; el **resto se divide a la mitad** entre **chat** e **inspector**.

```
┌─────────────────────────┬──────────────────────────┬───────────────┐
│ CHAT (50% del restante) │ INSPECTOR (50%)          │ PLAN (fija)   │
│  hilo de turnos          │  detalle del turno       │  ───────────  │
│  (user / ai cards)       │  seleccionado:           │  ARTIFACTS    │
│  ...                     │  razonamiento, updates,  │  (fija)       │
│                          │  queries, tablas, charts │               │
│  [ input + adjuntar ]    │                          │               │
└─────────────────────────┴──────────────────────────┴───────────────┘
```

- **Chat (izq.)**: el hilo limpio. Cada turno es una tarjeta seleccionable: `👤` burbuja de usuario; `🤖` tarjeta con la **prosa** del turno + una tira compacta de actividad ("✓ 3 pasos · 2 gráficos"). El **input** (con selección de modelo y **adjuntar archivos/tablas**) va al fondo de esta columna.
- **Inspector (centro)**: el detalle del **turno seleccionado** — razonamiento (colapsable), línea de tiempo de `update_plan`, queries (con "View data"), tablas y gráficos. Es lo que hoy está revuelto, ahora contenido por turno.
- **Plan & Artifacts (der., fija)**: `SessionInventory` (plan por fases arriba + artifacts abajo). Sin cambios funcionales.

### Interacción
- **Selección master–detail**: click en un turno `ai` del hilo → el inspector muestra su actividad. Default: último turno.
- **Auto-follow al generar**: mientras el modelo trabaja, el inspector sigue el turno en curso en vivo (razonamiento streameando, tool calls apareciendo, charts renderizando). Al terminar, queda navegable.
- Turnos `user` no tienen inspector (o muestran "sin actividad").

## Componentes

| Componente | Acción |
|---|---|
| `deepDiveTurns.js` (nuevo) | `groupIntoTurns(messages)` → array de turnos |
| `DeepDiveTranscript.jsx` (nuevo) | Hilo izquierdo: tarjetas de turno limpias + tira de actividad; maneja selección |
| `DeepDiveInspector.jsx` (nuevo) | Centro: render del detalle del turno seleccionado (reusa el render de razonamiento/tools/charts de `ChatMessage`) |
| `ChatMessage.jsx` | Extraer/exponer los sub-render (reasoning, toolCalls, charts) para reusarlos en el inspector, o un modo `inspector` |
| `AiDivingPanel.jsx` | Reestructurar a 3 regiones (CSS grid): chat \| inspector \| `SessionInventory`; mover input a la columna chat; estado `selectedTurnId` |
| `index.css` | Grid de 3 regiones (chat+inspector dividen el restante 50/50; sidebar fija); estilos de tarjetas de turno e inspector |
| `SessionInventory` / `AgentPlanPanel` | Sin cambios (ya son la barra derecha) |

## Plan por fases (commits)

1. **`groupIntoTurns` util** + tests mentales con la conversación real (EDA).
2. **Reestructura de layout** en `AiDivingPanel`: grid de 3 regiones (chat \| inspector \| sidebar), input movido a la columna chat. (Sin partir aún el contenido — primero el esqueleto.)
3. **Transcript izquierdo** (`DeepDiveTranscript`): tarjetas de turno + selección + tira de actividad.
4. **Inspector central** (`DeepDiveInspector`): detalle del turno seleccionado reusando el render de `ChatMessage`; auto-follow al generar.
5. **Input + adjuntar archivos** en la columna chat (mover el drop/attach al input).
6. **CSS final + responsive**: en ancho reducido, el inspector colapsa y se abre como overlay/pestaña al seleccionar un turno; la barra derecha se puede colapsar.

## Decisiones tomadas (defaults; ajustables)
- La tarjeta `ai` del hilo muestra **la prosa del turno** (no solo un titular) — es corta por diseño (cada chunk es breve). El detalle pesado va al inspector.
- **Responsive**: < ~1100px el inspector se vuelve overlay (se abre al seleccionar un turno); la barra derecha colapsable con un botón.
- La barra derecha refleja el **plan y artifacts de la sesión** (acumulativo), no del turno seleccionado.

## Riesgos / notas
- `ChatMessage` hoy mezcla render de prosa + tools + charts; hay que separarlo limpio para reusar en hilo (solo prosa) vs inspector (solo actividad). Es el punto más delicado.
- Mantener el **streaming** funcionando en el inspector (turno en curso) es clave para no perder la sensación de "ver cómo analiza".
- No romper la persistencia ni el `startConversationId` (apertura desde el sidebar de Conversations).
