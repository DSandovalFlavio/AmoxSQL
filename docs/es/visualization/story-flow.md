# Story Flow

**🌐 [English](../../en/visualization/story-flow.md) · Español**

> La sección de visualización de AmoxSQL: convierte el resultado de una query en un gráfico que cuenta algo, guiándote por seis etapas — de "qué forma tiene la historia" hasta "envíalo".

<img src="../../../images/06_data_visualizer.png" alt="Story Flow en AmoxSQL" width="100%" />

## Qué es

**Story Flow** es la capa de visualización de AmoxSQL. No es un panel de "elige gráfico y ya"; está organizado como la secuencia natural de contar una historia con datos: seis etapas, de izquierda a derecha, cada una con un único trabajo. Editas un gráfico sobre el resultado de una query sin salir del IDE, y el motor local (DuckDB) alimenta el gráfico directamente — sin subir datos a ningún lado.

Las seis etapas son pestañas en la barra lateral del panel:

1. **Type** — "¿Qué forma cuenta la historia?" Eliges el tipo por lo que quieres comunicar (ver [Tipos de gráfico](chart-types.md)).
2. **Data** — "¿Qué va dónde?" Mapeas columnas a canales (X, Y, color/split, tamaño, eje secundario) y modelas los datos (orden, top-N, agregación de fechas).
3. **Format** — "Hazlo legible." Ejes, formato de número, cuadrícula, leyenda, etiquetas y tooltips (ver [Formato y estilo](format-and-style.md)).
4. **Style** — "Hazlo lucir." Paletas, colores por serie, tipografía, tarjeta y fondo.
5. **Story** — "Hazlo hablar." Título/subtítulo/takeaway, KPI destacado, anotaciones, líneas de meta/referencia, tendencia y foco (ver [Narrativa y overlays](storytelling-and-overlays.md)).
6. **Export** — "Envíalo." PNG en varios tamaños, copiar al portapapeles y guardar la configuración como `.amoxvis` (ver [Exportar gráficos](exporting-charts.md)).

La figura se dibuja con **Vega-Lite**, la gramática de gráficos abierta, y se guarda como archivo **`.amoxvis`**: un Vega-Lite válido que **lleva su propia query** dentro. Por eso un `.amoxvis` puede volver a ejecutarse por sí solo (al abrirlo) o dentro de un deck de [Report Flow](../reports/report-flow.md), refrescando el gráfico con datos actuales sin rehacer el análisis.

## Cuándo usarlo

- Cuando ya tienes un resultado en pantalla y quieres verlo como gráfico en lugar de tabla.
- Para preparar un gráfico que reutilizarás: guárdalo como `.amoxvis` y colócalo en un deck o refréscalo más tarde.
- Cuando quieras que la IA proponga un gráfico y luego lo ajustes a mano (ver más abajo el hook de actualización en vivo).
- Si solo necesitas explorar valores fila a fila, quédate en la [Tabla de resultados](../results/results-table.md); si quieres estadísticas descriptivas, usa el [Data Profiler](../results/data-profiler.md).

## Cómo usarlo

### Abrir el gráfico desde un resultado
1. Ejecuta una query en el [Editor SQL](../editor/sql-editor.md) o en un [Notebook](../notebooks/notebooks.md).
2. En el panel de resultados, cambia de **Table** a **Chart** con el conmutador de vista de la barra superior.
3. Aparece Story Flow con el gráfico y la barra lateral de seis etapas. AmoxSQL preselecciona ejes razonables a partir de las columnas.

### Abrir un archivo `.amoxvis`
1. Haz doble clic en un archivo `.amoxvis` en el [Explorador de archivos](../data/file-explorer.md).
2. Se abre en pantalla completa: ejecuta la query guardada al montar y muestra el gráfico.
3. Usa **Reload** para volver a leer la query guardada del disco y re-ejecutar, o **Edit SQL** para abrir la misma query como pestaña SQL.

### Recorrer las etapas
1. Empieza en **Type** y elige la forma; luego avanza por **Data → Format → Style → Story → Export**.
2. No es obligatorio seguir el orden: cada pestaña es independiente y los cambios se reflejan en vivo.
3. El pie de cada pestaña muestra una pista corta ("What goes where?", etc.) para orientarte.

### Paneles o código
En la cabecera de la barra lateral hay un interruptor **Panels | Code**:

- **Panels** (por defecto) — trabajas con las seis etapas. Cada cambio genera el Vega-Lite de la figura.
- **Code** — la barra lateral se vuelve un editor con el **Vega-Lite** de la figura. Puedes escribirlo o pegar uno; la figura se redibuja al dejar de teclear. El editor valida contra el esquema de Vega-Lite y autocompleta mientras escribes.

Reglas para que no haya sorpresas:

- **En cuanto editas el código, el código manda.** Las etapas Type, Data y Format dejan de cambiar la figura (lo dice un aviso). Style, Story y Export siguen funcionando: el título, la conclusión, la fuente, la paleta y la tarjeta valen igual en los dos modos.
- **Un error no borra la figura.** Si el JSON está a medio escribir o Vega-Lite no lo entiende, se queda la última figura buena y el error aparece debajo del editor.
- **Volver a los paneles** se hace desde el aviso, con **Use the panels again**. Pide confirmación porque descarta el código.
- Los datos llegan con el nombre `dataset` (`"data": {"name": "dataset"}`). El título y la conclusión no van en el código: viven en **Story**.
- **Add layer…** (arriba del editor) añade al spec una capa hecha: **Mean line**, **Median line**, **Value labels** o **Regression line**. Solo ofrece las que tienen sentido en esa figura (una recta de regresión necesita una X numérica o de fechas).

### La guía y el tour
- El botón **?** (icono de info) en la cabecera del panel abre un cajón con la **guía de Story Flow**: explica las seis etapas y los principios de narrativa. La misma guía vive en Ajustes → Story Flow.
- La primera vez que abres Story Flow arranca un **tour de bienvenida** (un carrusel por las seis etapas). Puedes reproducirlo de nuevo desde la guía.

### Actualización en vivo desde la IA
Cuando el [Asistente de IA](../ai/editor-assistant.md) dibuja o ajusta un gráfico, Story Flow escucha ese cambio y **fusiona** la configuración de la IA con la tuya sin pisar los ejes ni los campos que ya elegiste. Así puedes pedirle un gráfico y seguir afinándolo a mano.

### Pantalla completa
El botón de maximizar (esquina superior derecha del área del gráfico) lleva el gráfico a pantalla completa; en ese modo aparece también un botón **PNG** para descargar al instante.

## Referencia de opciones

### Las seis etapas
| Etapa | Pista | Qué controla | Página |
|---|---|---|---|
| **Type** | What shape tells the story? | Tipo de gráfico (17, agrupados por intención) | [Tipos de gráfico](chart-types.md) |
| **Data** | What goes where? | Canales X/Y/split/tamaño/eje 2º, orden, top-N, agregación de fecha | esta página |
| **Format** | Make it readable | Ejes, formato de número, cuadrícula, leyenda, etiquetas, tooltips | [Formato y estilo](format-and-style.md) |
| **Style** | Make it look good | Paleta, colores por serie, tipografía, tarjeta, fondo, borde | [Formato y estilo](format-and-style.md) |
| **Story** | Make it speak | Título/takeaway, KPI, anotaciones, líneas de meta/referencia, foco, tendencia | [Narrativa y overlays](storytelling-and-overlays.md) |
| **Export** | Ship it | PNG por tamaño, portapapeles, `.amoxvis`, pegar JSON | [Exportar gráficos](exporting-charts.md) |

### Canales (etapa Data)
| Canal | Qué hace |
|---|---|
| Category (X) | Dimensión/categoría del eje X (en donut, la etiqueta del segmento) |
| Values (Y) | Una o más columnas de valor (checkboxes; con Split By pasa a una sola) |
| Secondary Y-Axis (Right) | Segunda escala a la derecha para una de las series |
| Split By Column | Pivota en una serie por valor único (barras agrupadas, líneas múltiples) |
| Bubble Size | Radio de burbuja (solo scatter/bubble) |
| Sort By · Limit | Orden (label/valor, asc/desc) y top-N (vacío = todo) |
| Date Aggregation | Agrupar una columna de fecha por mes o año |

## Tips y gemas

- **El `.amoxvis` es autónomo:** guarda la figura *y* la query, así que el gráfico puede regenerarse solo — la base de un deck de Report Flow que se refresca.
- **El `.amoxvis` no es privativo:** es un Vega-Lite válido. Lo que es de AmoxSQL (la query, el estado de los paneles) va en `usermeta`, un campo que Vega-Lite reserva para eso y que cualquier otra herramienta ignora.
- **Tus ejes sobreviven a re-consultas:** al re-ejecutar una query con columnas distintas, Story Flow solo rellena los ejes que faltan o que dejaron de ser válidos; tu elección manual se respeta mientras la columna exista.
- **La IA no pisa tu trabajo:** una propuesta de la IA se fusiona sobre tu config actual, no la reemplaza.
- **El tema sigue tu configuración:** el gráfico adopta el tema y el color de acento activos.

## Formatos relacionados

- `.amoxvis` — un Vega-Lite con la query embebida (ver [Formatos de archivo](../reference/file-formats.md)).

## Relacionado

- [Tipos de gráfico](chart-types.md) · [Narrativa y overlays](storytelling-and-overlays.md)
- [Formato y estilo](format-and-style.md) · [Exportar gráficos](exporting-charts.md)
- [Report Flow (decks)](../reports/report-flow.md) · [Tabla de resultados](../results/results-table.md)
