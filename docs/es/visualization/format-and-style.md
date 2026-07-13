# Formato y estilo

**🌐 [English](../../en/visualization/format-and-style.md) · Español**

> Las dos etapas que hacen el gráfico legible y luego bonito: Format afina ejes, números, cuadrícula, leyenda, etiquetas y tooltips; Style aplica paletas, tipografía y acabado de tarjeta.

<!-- 📷 CAPTURE: docs/images/visualization/format-style-tabs.png — Las pestañas Format y Style de Story Flow una junto a otra: a la izquierda las secciones de Format (Number Format, Axis Labels, Grid & Legend), a la derecha las de Style (Color Palette, Typography, Card). -->

## Qué es

**Format** ("Make it readable") y **Style** ("Make it look good") son las etapas ③ y ④ de [Story Flow](story-flow.md). Format es la mecánica: que los valores se lean sin esfuerzo. Style es el acabado: una identidad visual limpia. Las opciones que aparecen se adaptan al tipo de gráfico activo — un donut no muestra controles de eje, un scatter añade cuadrantes, etc.

## Cuándo usarlo

- **Format**: cuando los números se solapan, la escala engaña, faltan etiquetas o el tooltip no dice lo suficiente.
- **Style**: cuando el gráfico va a un informe o deck y necesita paleta, tipografía y marco coherentes con el resto.

## Cómo usarlo

### Format — legibilidad
1. Abre la pestaña **Format**.
2. En **Number Format**, elige la abreviación (compacto, moneda, miles, millones, porcentaje…) y los decimales.
3. En **Axis Labels**, ajusta tamaño, intensidad, separación, longitud máxima (truncado) y rotación de las etiquetas.
4. En **Vertical Axis**, activa escala logarítmica o fija manualmente Y Min/Max; si usas eje secundario, ajusta su rango.
5. En **Data Labels**, activa etiquetas de valor, elige el estilo de tooltip (Standard o **Rich**, con Δ vs. anterior) y la posición de la etiqueta.
6. En **Grid & Legend**, elige cuadrícula, líneas de eje y posición de la leyenda.
7. Ajusta **Margins & Spacing** si el contenido roza los bordes.

### Style — apariencia
1. Abre la pestaña **Style**.
2. Elige una **paleta** de los cinco grupos, o define **colores por serie** uno a uno.
3. En **Typography**, elige fuente, escala de texto e intensidad de etiquetas.
4. Ajusta **Background** (tono del lienzo), **Card** (sombra, radio, fondo degradado) y **Border**.

## Referencia — etapa Format

### Números y ejes
| Sección | Opción | Valores |
|---|---|---|
| Number Format | Abbreviation | Auto (compacto) · Standard · Currency · Thousands · Millions · Billions · Percentage · Raw (8 opciones) |
| | Decimal Places | Auto · 0 · 1 · 2 · 3 · 4 |
| Axis Labels | Label Size | 8–24 px |
| | Label Intensity | 20–100% (opacidad de ticks, títulos y leyenda) |
| | Gap from Axis | 0–30 px |
| | Max Length | 0 = auto; >0 trunca a N caracteres |
| | Label Rotation | 0° · 45° · 90° (line/bar/area/combo/waterfall) |
| Vertical Axis | Logarithmic Scale | On/Off (datos con órdenes de magnitud) |
| | Y Min / Y Max | Dominio manual (vacío = auto) |
| Secondary Axis (Right) | Min / Max | Aparece al asignar un eje Y secundario |
| Axis Titles | Category / Value Axis Title | Texto + interruptor de mostrar |

### Detalle del mark
| Sección | Opción | Valores |
|---|---|---|
| Data Labels | Show Data Labels | On/Off |
| | Tooltip Style | Standard · **Rich (valor + Δ vs. anterior)** |
| | Show % of Total in Tooltip | On/Off (solo con tooltip Standard) |
| | Label Position | Outside · Inside Center · Inside Start · Inside End |
| | Label Size · Hide if space < | 8–20 px · umbral en px para ocultar etiquetas apretadas |
| Grid & Legend | Grid Lines | Both · Horizontal · Vertical · None |
| | Show Axis Lines & Ticks | On/Off |
| | Legend Position | Top · Bottom · Left · Right · Hidden |
| Line Options | Interpolation | Smooth · Linear · Step · Step Before · Step After |
| | Fill Area · Show Points · Cumulative Sum | Relleno de área · puntos · total acumulado |
| Bar Options | Bar Layout | Grouped · Stacked · 100% Stacked |
| | Corner Radius | 0–20 px |
| | Color Mode | By Series · By Category · **Intensity by Value** (solo agrupado) |
| Donut Options | Inner Radius (Thickness) | 0–90 |
| | Center Metric | None · Total · Average |
| Scatter Options | Automatic Quadrants | Crosshairs en las medias |
| Combo Options | Line series toggles | Elige qué series son línea; el resto, barras |
| Margins & Spacing | Title Gap · Top · Bottom · Left · Right | Márgenes en px |

## Referencia — etapa Style

| Sección | Opción | Valores |
|---|---|---|
| Color Palette | Grupos | **Modern** (default, vivid, neon) · **Qualitative** (set1, set2, pastel, dark2) · **Sequential** (blues, greens, reds, purples, ylorbr) · **Diverging** (spectral, rdylbu, rdylgn, piyg) · **Brand** (ocean, sunset, corporate) |
| Series Colors | Color por serie | Color individual; en línea/combo, también estilo (Solid/Dashed/Dotted); en donut, color por segmento |
| Background | Canvas Tone | Default · Darker · Lighter · Warm · Cool · Custom (color) |
| Typography | Font Family | System · Inter · Lato · IBM Plex Sans · Manrope · Space Grotesk · Lora · JetBrains Mono (8) |
| | Text Size Scale · Label Intensity | 75–200% · 20–100% |
| Fill (line/area) | Area Fill | Gradient (desvanece) · Solid |
| Card | Drop shadow · Corner Radius · Gradient background | On/Off · 0–28 px · degradado From → To |
| Border | Border Style | None · Solid · Dashed · Subtle (+ color) |

## Tips y gemas

- **Tooltip Rich = valor + delta:** muestra automáticamente el cambio frente al punto anterior, sin configurar nada más.
- **Color por intensidad:** en barras agrupadas, "Intensity by Value" tiñe cada barra según su valor — un mapa de calor 1D gratis.
- **KPI en el centro del donut:** "Center Metric" pone el total o el promedio en el hueco central.
- **Cuadrantes del scatter:** activa "Automatic Quadrants" para dividir el gráfico por las medias y clasificar los puntos en cuatro zonas.
- **Fija el dominio Y para comparar:** si generas varios gráficos que se leerán juntos, fija Y Min/Max para que las escalas coincidan.

## Relacionado

- [Story Flow](story-flow.md) · [Tipos de gráfico](chart-types.md)
- [Narrativa y overlays](storytelling-and-overlays.md) · [Exportar gráficos](exporting-charts.md)
