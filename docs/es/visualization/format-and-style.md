# Formato y estilo

**🌐 [English](../../en/visualization/format-and-style.md) · Español**

> Las dos etapas que hacen el gráfico legible y luego bonito: Format afina números, ejes, rejilla, leyenda, etiquetas, tooltip, marcas e interacción; Style aplica paleta, nombres de serie, tipografía y la tarjeta.

<img src="../../images/visualization/format-style-tabs.png" alt="Las pestañas Format y Style de Story Flow una junto a otra." width="100%" />

## Qué es

**Format** ("Make it readable") y **Style** ("Make it look good") son las etapas ③ y ④ de [Story Flow](story-flow.md). Format es la mecánica: que los valores se lean sin esfuerzo. Style es el acabado. Cada panel enseña solo lo que el tipo activo puede dibujar —un anillo no tiene ejes, una dispersión tiene zoom—, y todo lo que cambias aquí se escribe en el Vega-Lite de la figura (lo ves en **Code**).

## Cuándo usarlo

- **Format**: cuando los números se solapan, la escala engaña, faltan etiquetas o el tooltip no dice lo suficiente.
- **Style**: cuando el gráfico va a un informe o deck y necesita paleta, tipografía y marco coherentes con el resto.

## Cómo usarlo

Las secciones están en el orden en que se lee una figura: primero las cifras, luego los ejes, después los detalles.

### Format — legibilidad
1. **Numbers** — el formato (compacto, moneda, miles, millones, porcentaje…) y los decimales. Vale para ejes, etiquetas, tooltip y KPI.
2. **Value axis** — la escala (lineal, logarítmica o raíz cuadrada), si empieza en cero (automático, siempre, nunca) y el mínimo y máximo. Con un eje derecho (en **Data**), aquí está también su rango.
3. **Axis titles & labels** — los títulos de cada eje, la rotación de las etiquetas de categoría, su tamaño, longitud máxima, separación e intensidad.
4. **Grid & legend** — rejilla, líneas de eje y la leyenda. Con la leyenda arriba, abajo o a un lado puedes activar **Click the legend to highlight a series**: un clic en una serie apaga las demás.
5. **Labels & tooltip** — las cifras sobre las marcas (en barras, fuera o dentro de la barra; en el anillo, qué dicen y dónde), qué añade el tooltip (**% of total** o **change vs previous**) y **Also show in the tooltip**, para sumar columnas del resultado.
6. **Marcas** — lo propio del tipo: **Lines** (forma suave, recta o en escalón; puntos; relleno), **Bars** (lado a lado, apiladas o al 100 %; color; radio), **Donut** (tamaño del hueco y qué va en el centro), **Scatter** (cuadrantes), **Combo** (qué series son línea).
7. **Interaction** — **Zoom and pan**: automático (en dispersiones y series de fechas largas), siempre o nunca. Rueda para acercar, arrastrar para moverse, doble clic para volver.

### Style — apariencia
1. **Color Palette** — elige una paleta por su propósito (categórica, secuencial, divergente, de marca).
2. **Series: colors & names** — el color de cada serie, **el nombre con el que sale en la leyenda** y, en líneas, el trazo (continuo, discontinuo, punteado).
3. **Fill** — en líneas y áreas, degradado o sólido.
4. **Typography** — la fuente y la escala del texto.
5. **Card** — cómo se reparte la tarjeta (**Layout**), el fondo, la sombra, el radio, el degradado y el borde.

## Referencia — etapa Format

| Sección | Opción | Valores |
|---|---|---|
| Numbers | Format · Decimals | Auto (compacto) · Standard · Currency · Thousands · Millions · Billions · Percentage · Raw · Auto/0–4 |
| Value axis | Scale | Linear · Logarithmic · Square root |
| | Start at zero | Automatic · Always · Never |
| | Min / Max | Vacío = automático; también para el eje derecho |
| Axis titles & labels | Category / Value axis title | Texto + mostrar |
| | Category label rotation | 0° · 45° · 90° |
| | Label size · Max label length · Gap · Intensity | 8–24 px · 0 = auto · 0–30 px · 20–100 % |
| Grid & legend | Grid lines · Axis lines | Both · Horizontal · Vertical · None |
| | Legend | In the subtitle · Top · Bottom · Left · Right · Hidden |
| | Click the legend to highlight a series | Con leyenda en la figura y varias series |
| Labels & tooltip | Values on the marks · Label position · Label size | Barras: Outside · Inside the bar |
| | Content · Position (anillo) | % · valor · nombre · nombre + % · nombre + valor; fuera/dentro |
| | Tooltip | Value · Value + % of total · Value + change vs previous |
| | Also show in the tooltip | Columnas del resultado (en gráficos que suman, solo numéricas, sumadas) |
| Lines | Shape · Points · Fill | Smooth · Straight · Step · Step before · Step after |
| Bars | Layout · Color · Corner radius | Side by side · Stacked · Stacked to 100 % · One color · Per category · Intensity |
| Donut | Hole size · In the center | 20–85 % · Nothing · Total · Average |
| Scatter | Quadrants | Las medias de cada eje |
| Combo | Line series | Qué series son línea |
| Interaction | Zoom and pan | Automatic · Always · Never |

## Referencia — etapa Style

| Sección | Opción | Valores |
|---|---|---|
| Color Palette | Grupos | Modern · Qualitative · Sequential · Diverging · Brand · Sterling |
| Series: colors & names | Color · Name in the legend · Trazo | Por serie (en anillo, por segmento); trazo en líneas: Solid · Dashed · Dotted |
| Fill | Area fill | Gradient · Solid |
| Typography | Font family · Text size scale | 8 fuentes · 75–200 % |
| Card | Layout · Background · Drop shadow · Corner radius · Gradient · Border | Stacked · Side by side · Automatic; tonos de fondo; 0–28 px; None · Solid · Dashed · Subtle |

## Tips y gemas

- **Lo que escribes en código vuelve a los paneles:** si cambias en **Code** el título de un eje o la escala, el panel lo muestra. Lo que los paneles no saben representar queda marcado (ver [Story Flow](story-flow.md#el-código-manda)).
- **Nombra las series:** «Costo total» en la leyenda en lugar de `costo_total`, sin tocar la consulta.
- **Leyenda que se usa:** con varias series, «Click the legend to highlight a series» deja leer una sola sin crear otro gráfico.
- **Fija el eje para comparar:** si varios gráficos se leerán juntos, fija mínimo y máximo para que las escalas coincidan.

## Relacionado

- [Story Flow](story-flow.md) · [Tipos de gráfico](chart-types.md)
- [Narrativa y overlays](storytelling-and-overlays.md) · [Exportar gráficos](exporting-charts.md)
