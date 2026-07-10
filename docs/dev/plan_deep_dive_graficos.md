# Plan de Implementación — Deep Dive: color con teoría y storytelling en gráficos

> Deriva de [deep_dive_graficos.md](deep_dive_graficos.md) (auditoría; causas G1–G7).
> **Estado:** ✅ F1, F2, F3 implementadas (F3 sin `protagonist` — revertido). **F1 evolucionó** a "color como decisión de diseño" (ver addendum abajo). F4/F5 pendientes.

## Addendum — Color como razonamiento del agente (evolución de F1, a pedido del usuario)

En vez de reglas rígidas + defaults hardcodeados, el agente **razona** su paleta por análisis, considerando: el mensaje/intención, la legibilidad, el **tema activo de AmoxSQL** (modo claro/oscuro + acento) y teoría del color — eligiendo entre TODAS las paletas curadas.

- **Tema en vivo → prompt**: el cliente envía `uiTheme {mode, theme, accent, accentColor}` (`useAiChat` lee `document.body` + localStorage) → `server/index.js` → `agenticLoop` → `buildDynamicSection` emite una sección "Rendering context" con el modo y el acento reales. Así el agente elige colores que leen en el fondo actual y armonizan con el acento.
- **Razonamiento de color** (`prompt/context.js`): la sección "Color is a design decision" reemplaza las reglas rígidas por un proceso (familia por intención → legibilidad → armonía con el acento → consistencia de sesión → semántica), + un **catálogo completo** de paletas con su carácter.
- **Enum ampliado** (`tools.js`): `color_theme` pasa de 12 a 19 paletas (añade set1/set2/purples/ylorbr/rdylbu/rdylgn/piyg) — el agente tiene "todas las mejores disponibles".
- **Sin hardcodeo**: el `highlight` default sigue `var(--accent-primary)` (no rojo); `protagonist` (gris/morado hardcodeado) fue eliminado. El énfasis es `highlight` + la paleta razonada.

## Objetivo

Que los gráficos del agente se vean como los haría un analista con criterio: **un color con propósito** (ranking = un tono + protagonista resaltado; series = categórica; magnitud = secuencial; rojo reservado a lo negativo), **consistentes entre sí** dentro del análisis, y con la **capa de storytelling** (takeaway, anotaciones) que Story Flow ya sabe renderizar.

## Fases

---

### Fase 1 — Teoría de color en el prompt + matar la receta del arcoíris (G1, G2, G3)

La palanca más barata y grande — solo server, solo texto:

1. **Eliminar la receta `bar_color_mode="dimension"` para rankings** (`server/ai/prompt/tools.js:55`) → nueva receta: *ranking = `bar_color_mode:"series"` (un solo color) + `highlight:{type:"max"}` (o `exact` en el protagonista de la historia)*.
2. **Corregir la descripción del schema** (`server/ai/tools.js:321`): `dimension` NO es "good for single-series bar" — es para pocos ítems categóricos genuinamente distintos (≤5) donde la identidad de cada uno importa (nunca rankings largos).
3. **Sección "Color with intent"** en `buildChartTypesSection` (`server/ai/prompt/context.js`), reemplazando la frase inejecutable:
   - Mapa intención→paleta: comparación de series → categórica (`default`/`vivid`/`dark2`); magnitud ordenada → secuencial (`blues`/`greens`); desviación → divergente (`spectral`); **rojo reservado** para negativo/alerta/bajo meta (nunca decorativo); `corporate` solo como fondo neutro de un protagonista.
   - **Consistencia de sesión**: elige UNA paleta al inicio del análisis y úsala en todos los charts; cambia solo con razón semántica.
   - Ranking de una métrica = un color + protagonista resaltado; el título declara la conclusión (alineado con la skill data-storytelling).

**Archivos:** `server/ai/prompt/tools.js`, `server/ai/prompt/context.js`, `server/ai/tools.js` (descriptions).

---

### Fase 2 — Linter de color en `display_chart` (G6)

El agente ya obedece `warnings` (lo hace con líneas de <3 puntos). Añadir en `execute()` (`server/ai/tools.js:389-427`):

- `bar_color_mode:'dimension'` con 1 serie y >5 categorías → warning: "single-metric ranking reads better with one color + highlight; re-call with bar_color_mode='series' + highlight".
- Paleta secuencial (`blues/greens/reds`) con datos categóricos sin orden (x no numérica/fecha y sin sort por valor) → warning.
- Paleta red-first (`reds`/`sunset`) o `ref_line`/`highlight` rojos sobre una métrica sin semántica negativa → warning suave (heurística: y_axis_keys sin "loss/churn/error/cost").
- **Donut >7 slices → warning en código** (hoy es solo prompt).

**Archivos:** `server/ai/tools.js`.

---

### Fase 3 — Exponer la capa de storytelling al agente (G4)

Ampliar el schema de `display_chart` y el `fullConfig` del chat:

1. **`takeaway`** (string): la conclusión de una línea bajo el chart. Mapea a `takeaway` del config; `ChatResultsBlock` lo agrega al `fullConfig` y se renderiza (verificar dónde lo pinta `ChartRenderer`/frame; si es del frame del visualizer, renderizarlo como caption del chart en chat).
2. **`annotations`** (array acotada, máx 3): `{ type: 'text'|'box', x, y?, x2?, y2?, text, color? }` — mapea a `annotations[]`; `ChartRenderer.jsx:369-407` ya sabe pintarlas; solo hay que dejar de omitirlas en `ChatResultsBlock`.
3. ~~**`protagonist`**~~ — **DESCARTADO.** Se implementó (héroe en color, resto en gris neutro vía `seriesConfig`; single-series → `highlight`) pero se **revirtió** a petición del usuario: forzaba colores hardcodeados (gris `#8b93a1`, morado `#9b87f5`) que pisaban el tema. El énfasis se logra con el `highlight` existente (que el agente colorea o usa su default), sin hardcodear. `seriesConfig` vuelve a `{}` en el chat.
4. Prompt: documentar los campos de storytelling en `buildToolsSection` con la regla "cada chart importante lleva takeaway; anota el punto que sostiene tu hallazgo".

**Archivos:** `server/ai/tools.js` (schema+map), `server/ai/prompt/tools.js`, `client/src/components/ai/ChatResultsBlock.jsx`.

---

### Fase 4 — Conectar `chart_storyteller` al chart del chat (G5)

Hoy su output muere en un cache. Dos opciones (elegir al implementar):

- **A (merge):** si `chart_storyteller` se llama tras un `display_chart` del mismo `query_id`, fusionar `chart_title/subtitle/footnote` + `key_insights→takeaway` al `chartConfig` ya emitido (re-emitir un `tool-result` actualizado o aplicar el merge en el cliente al detectar `story:<query_id>`).
- **B (retirar del loop):** con F3, el agente ya puede poner takeaway/anotaciones él mismo con mejor contexto; degradar `chart_storyteller` a herramienta interna del tab Story (quitarla del set del agente) para que no gaste iteraciones en un no-op visible.

**Archivos:** `server/ai/tools.js` y/o `client/.../ChatResultsBlock.jsx`.

---

### Fase 5 — "Open in Story Flow" completo (G7)

Con F3 en su lugar, el export (`App.jsx handleExportAmoxvis`) ya llevará `takeaway`/`annotations`/`seriesConfig` de forma natural (van en `fullConfig`). Verificar y ajustar si algún campo se pierde en el flat `.amoxvis`.

---

### Fase 6 — Verificación visual

Correr el EDA de referencia y revisar los charts contra la tabla "paletas correctas" de la auditoría: ranking en un color con protagonista, paleta consistente entre charts, rojo solo semántico, takeaway visible, ≥1 anotación en el hallazgo principal.

## Orden y entrega

1. **F1+F2** (prompt + linter) — solo server, arregla el 80% del síntoma de color de inmediato.
2. **F3** (storytelling expuesto) — schema + cliente; habilita takeaway/anotaciones/protagonista.
3. **F4** (storyteller) y **F5** (export) — coherencia del pipeline.
4. **F6** — verificación con el EDA real.

## Métrica de éxito

Repetir el EDA del screenshot: el ranking de ciudades sale en **un color con San Francisco resaltado y el título declarando la conclusión**; los 3+ charts del análisis comparten paleta; la línea de estacionalidad no es roja; al menos el hallazgo principal lleva **takeaway y una anotación**; y "Open in Story Flow" abre un chart que ya no hay que arreglar.
