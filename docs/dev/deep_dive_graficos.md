# Deep Dive — Auditoría del uso de capacidades de visualización (color, énfasis y storytelling)

> **Fecha:** 2026-07-09 · **Estado:** auditoría cerrada; plan en [plan_deep_dive_graficos.md](plan_deep_dive_graficos.md)
> 5ª auditoría de Deep Dive (previas: deixis, inspector, ciclo de vida, narrativa).

## El síntoma (observado en un EDA real)

En un mismo análisis, el agente produjo: un **ranking de ciudades en arcoíris** (10 colores para UNA métrica), un **chart de categorías en grises lavados**, y una **línea de ingresos en rojo** (semántica de alarma sin razón). Cero anotaciones, cero takeaway, cero énfasis de protagonista, títulos que describen en vez de concluir — pese a que **Story Flow soporta todo eso**.

## Diagnóstico — la cadena causal (G1–G7)

### G1 · El arcoíris es POR INSTRUCCIÓN: el prompt lo recomienda

La receta de ranking del prompt dice literalmente `bar_color_mode="dimension"` (`server/ai/prompt/tools.js:55`) — el modo que pinta **un color de paleta por categoría** (`ChartRenderer.jsx:653`). Y la descripción del schema lo refuerza: *"dimension=one color per category (**good for single-series bar**)"* (`server/ai/tools.js:321`). Es exactamente lo contrario a la teoría (Knaflic: un ranking de una métrica = UN color + resaltar el protagonista). El arcoíris no es un accidente del modelo: **le enseñamos a hacerlo**.

### G2 · La única frase de teoría de color del prompt es INEJECUTABLE

`buildChartTypesSection` tiene una sola línea de énfasis (`server/ai/prompt/context.js:17`): *"One protagonist series in color, the rest muted (use `highlight` or `color_theme`)"*. Pero:
- "The rest muted" requiere **color por serie** (`seriesConfig`) — que `display_chart` **no expone** y que el render del chat **borra** (`ChatResultsBlock.jsx:171` hardcodea `seriesConfig: {}`).
- `highlight` solo recolorea UNA barra (max/min/exact); `color_theme` cambia la paleta ENTERA.
El agente recibe la instrucción correcta sin herramientas para cumplirla.

### G3 · La paleta es una tirada libre por llamada — sin semántica ni consistencia

`color_theme` es un enum de 12 paletas sin mapa de uso: nada ata **secuencial** a magnitud ordenada, **categórica** a series, **divergente** a desviaciones, ni reserva **rojo** para lo negativo. Y como cada `display_chart` re-elige desde cero, un mismo análisis mezcla arcoíris + grises (`corporate`, `constants.js:30`) + rojos (`reds`/`sunset`, `constants.js:19,29`). Sin la paleta → default `'default'` (categórica 8 colores) en el chat (`ChatResultsBlock.jsx:125`).

### G4 · La capa de storytelling es INALCANZABLE para el agente

Lo mejor de Story Flow no está en el schema de `display_chart` ni en el `fullConfig` del chat:

| Capacidad Story Flow | Config | ¿Agente puede? | ¿Chat la renderiza? |
|---|---|---|---|
| **Anotaciones** (texto/caja) | `annotations[]` | ❌ no está en el schema | ❌ nunca llega al fullConfig (aunque `ChartRenderer.jsx:369-407` sabe pintarlas) |
| **Takeaway** | `takeaway` | ❌ | ❌ |
| **Color por serie / protagonista** | `seriesConfig` | ❌ | ❌ borrado (`:171`) |
| **Área de referencia** | `refArea` | ❌ | ❌ |
| Intensidad de labels, tipografía, fondo, tooltips ricos, posición de data labels | varios | ❌ | — |

Lo que SÍ alcanza: `color_theme`, `bar_color_mode`, `highlight` (1 barra), `goal_line`/`ref_line`/`trend_line`, `headline_kpi`, títulos/subtítulo/footnote, formato/orden.

### G5 · `chart_storyteller` es un callejón sin salida

Genera `chart_title/subtitle/headline/key_insights/footnote` con estadística real (`server/ai/chartStory.js:136-146`)… y el resultado **nunca toca el chart del chat**: se guarda como `story:<query_id>` y solo lo consume el **tab Story del editor** (`StoryPanel.jsx:43-67`), a mano. El agente lo llama (se ve en el inspector) y el usuario no ve ningún efecto.

### G6 · Cero validación de color

`display_chart` valida columnas, líneas con <3 puntos y trend sobre multi-series (`tools.js:389-427`) — pero **nada de color**: ni `dimension` sobre ranking, ni secuencial para categorías, ni rojo para métricas positivas, ni donut >7 (esa regla es solo prompt). El agente ya reacciona bien a `warnings` — el canal existe y está desaprovechado.

### G7 · "Open in Story Flow" hereda lo malo sin lo bueno

El export lleva el `fullConfig` completo — **con los colores malos intactos** — pero sin `takeaway`/`annotations`/`seriesConfig` (nunca existieron). El usuario abre el chart en el editor y tiene que arreglar el color a mano y crear el storytelling desde cero.

## Las paletas correctas (referencia)

| Situación | Correcto | Hoy el agente hace |
|---|---|---|
| Ranking de UNA métrica | UN color (`bar_color_mode="series"`) + `highlight` en el protagonista | Arcoíris (`dimension`, por instrucción) |
| Comparación multi-series | Paleta categórica (`default`, `vivid`, `dark2`) — un color POR SERIE | A veces bien, a veces gris/rojo |
| Magnitud ordenada (heatmap, intensidad) | Secuencial (`blues`, `greens`) | Sin criterio |
| Desviación +/− | Divergente (`spectral`) | Sin criterio |
| Negativo / alerta / bajo meta | Rojo — **reservado** para esto | Rojo decorativo en ingresos |
| Mismo análisis, N charts | UNA paleta consistente | Re-tirada por chart |

## Síntesis

El agente tiene **12 paletas sin manual, una receta que produce arcoíris, una instrucción de protagonista sin herramienta para ejecutarla, un storyteller desconectado y ninguna validación**. Las dos capacidades que producirían charts disciplinados — **color por serie/protagonista** y **anotaciones+takeaway** — están cerradas con llave para la IA. El resultado inevitable es el que viste: color sin teoría y cero storytelling.

Plan de corrección: [plan_deep_dive_graficos.md](plan_deep_dive_graficos.md).
