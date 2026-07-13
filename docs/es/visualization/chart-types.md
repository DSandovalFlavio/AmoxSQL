# Tipos de gráfico

**🌐 [English](../../en/visualization/chart-types.md) · Español**

> Los 17 tipos de gráfico de Story Flow, agrupados por lo que quieres comunicar — Comparar, Tendencia, Composición, Relación y Flujo — no por su geometría.

<!-- 📷 CAPTURE: docs/images/visualization/chart-type-selector.png — El selector de tipo de la etapa Type, con las categorías Compare/Trend/Composition/Relationship/Flow expandidas mostrando los iconos de cada tipo. -->

## Qué es

La etapa **Type** de [Story Flow](story-flow.md) es una rejilla visual, no un desplegable. Los tipos están agrupados por **intención narrativa** (qué quieres que el lector entienda), y dentro de cada grupo van de simple a complejo. Elegir bien el tipo es la primera decisión de la historia: la forma correcta hace que el mensaje se lea en segundos.

Un principio guía todo el catálogo: **la forma de los datos manda**. Una trampa habitual: una fecha con solo 2–3 períodos es una *comparación*, no una *tendencia* — usa barras agrupadas, no una línea.

## Cuándo usarlo

Usa esta página como referencia al abrir la pestaña **Type**. Si dudas, empieza por la intención: ¿comparas magnitudes, muestras un cambio en el tiempo, descompones un todo, relacionas dos variables, o sigues etapas de un flujo? El grupo te acota los candidatos.

## Cómo usarlo

1. En el panel de Story Flow, abre la pestaña **Type**.
2. Expande la categoría que encaje con tu mensaje (Compare, Trend, Composition, Relationship, Flow).
3. Haz clic en el tipo. El gráfico se redibuja al instante; ajusta canales en **Data** si hace falta.

> **Variantes apiladas.** Las variantes 100% y apiladas (vertical u horizontal) son en realidad una barra con un **modo de apilado**. Elegir "Stacked Column" equivale a barra vertical + apilado; "100% Stacked Bar" es barra horizontal + proporcional. Puedes cambiar el modo también en **Format → Bar Options → Bar Layout**.
>
> **Bubble = scatter + tamaño.** El tipo Bubble es un scatter con una columna de **tamaño** (canal *Bubble Size* en la etapa Data). Sin columna de tamaño, se comporta como scatter uniforme.

## Referencia de tipos

### Comparar — magnitudes lado a lado
| Tipo | Etiqueta en UI | Úsalo para |
|---|---|---|
| `bar` | Column | Comparar categorías con barras verticales. El caballo de batalla; ideal también para 2–3 períodos. Con Split By → barras agrupadas. |
| `bar-horizontal` | Bar | Ranking, nombres de categoría largos o muchas categorías (barras horizontales). |

### Tendencia — cambio sobre un continuo
| Tipo | Etiqueta en UI | Úsalo para |
|---|---|---|
| `line` | Line | Serie temporal real (idealmente ≥4–5 puntos). |
| `area` | Stacked Area | Serie temporal enfatizando volumen, con áreas apiladas. |
| `combo` | Combo | Dos métricas a escalas distintas (barra + línea), usando eje Y secundario. |

### Composición — partes de un todo
| Tipo | Etiqueta en UI | Úsalo para |
|---|---|---|
| `bar-stacked` | Stacked Column | Composición absoluta entre categorías (columnas apiladas). |
| `bar-100` | 100% Stacked | Distribución porcentual entre categorías (normaliza a 100%). |
| `bar-horizontal-stacked` | Stacked Bar | Composición absoluta en barras horizontales. |
| `bar-horizontal-100` | 100% Stacked Bar | Distribución porcentual en barras horizontales. |
| `donut` | Donut | Proporción con pocos segmentos (≤7); admite KPI en el centro. |
| `pie` | Pie | Proporción en círculo completo (mejor donut para legibilidad). |
| `treemap` | Treemap | Proporciones jerárquicas como rectángulos anidados. |

### Relación — cómo se relacionan las variables
| Tipo | Etiqueta en UI | Úsalo para |
|---|---|---|
| `scatter` | Scatter | Correlación entre dos variables numéricas. |
| `bubble` | Bubble | Correlación con un tercer valor codificado en el tamaño (scatter + tamaño). |
| `heatmap` | Heatmap | Patrón en dos dimensiones por intensidad de color (p. ej. cohortes). |

### Flujo — etapas / pipeline
| Tipo | Etiqueta en UI | Úsalo para |
|---|---|---|
| `funnel` | Funnel | Etapas secuenciales con caída (embudo de conversión). |
| `waterfall` | Waterfall | Puente acumulativo: cómo suman/restan los componentes hasta un total. |

## Tips y gemas

- **2–3 períodos ⇒ barras, no línea.** Una línea con pocos puntos sugiere una tendencia que no existe. Reserva `line`/`area` para series con varios puntos.
- **Muchos segmentos ⇒ barras, no donut.** Con más de ~7 partes, un donut se vuelve ilegible; una barra horizontal ordenada comunica mejor.
- **La etiqueta de la UI no es la geometría interna.** "Column" es barra vertical y "Bar" es horizontal; las apiladas son la misma barra con otro *Bar Layout*.
- **La IA razona el tipo, no lo busca.** Cuando le pides un gráfico, el asistente elige la forma con estos mismos criterios de intención.

## Relacionado

- [Story Flow](story-flow.md) · [Formato y estilo](format-and-style.md)
- [Narrativa y overlays](storytelling-and-overlays.md) · [Exportar gráficos](exporting-charts.md)
