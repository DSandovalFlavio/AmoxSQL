# Exportar a Office

**🌐 [English](../../en/reports/export-to-office.md) · Español**

> Saca tu trabajo a PowerPoint y Word con contenido nativo y editable: un deck de Report Flow se convierte en una presentación `.pptx`, y el informe de un notebook en un documento `.docx`.

<!-- 📷 CAPTURE: docs/images/reports/export-to-office-menu.png — El menú desplegable Export PowerPoint del Report Flow Studio mostrando las dos opciones: "Native charts (editable)" y "Image charts", con la segunda atenuada cuando no se está en la vista Present. -->

## Qué es

AmoxSQL exporta a los dos formatos de Office más habituales, cada uno desde una sección distinta:

- **PowerPoint (`.pptx`)** desde un deck de [Report Flow](report-flow.md): cada slide se convierte en una slide nativa con texto, tablas y gráficos.
- **Word (`.docx`)** desde el informe de un [Notebook](../notebooks/notebooks.md): el texto markdown, las tablas de resultados y los gráficos se vuelven contenido nativo de Word.

En ambos casos, los gráficos se **vuelven a consultar en el momento del export** — el resultado refleja los datos actuales, no un render viejo. El texto y las tablas son contenido nativo y editable, no imágenes.

## Cuándo usarlo

- **PowerPoint** cuando el destino es una presentación y quieres gráficos que se puedan editar en PowerPoint (o, para tipos sin equivalente, una imagen fiel).
- **Word** cuando el destino es un documento de informe a partir de un notebook narrado.
- Si solo necesitas una imagen suelta de un gráfico, usa el PNG de [Exportar gráficos](../visualization/exporting-charts.md).

## Cómo usarlo

### PowerPoint — gráficos nativos (editables)
1. En el Report Flow Studio, abre el menú junto a **Export PowerPoint** y elige **Native charts (editable)**.
2. Los tipos con mapeo nativo (barra, línea, área, donut, pie, combo y sus variantes de barra) se exportan como **gráficos reales de PowerPoint**: al hacer doble clic en PowerPoint se abre la rejilla de datos.
3. Los tipos sin mapeo nativo caen automáticamente a imagen.

### PowerPoint — gráficos como imagen
1. Cambia a la vista **Present** (imprescindible: es donde cada gráfico está montado en el DOM para capturarlo).
2. En el menú de export, elige **Image charts**.
3. Cada gráfico se captura como PNG y se inserta en la slide. Fuera de la vista Present, esta opción está deshabilitada.

### Word — informe del notebook
1. Desde un notebook, lanza el export a Word.
2. AmoxSQL recorre las celdas: el markdown pasa a texto nativo, las tablas de resultados a tablas de Word, y los gráficos se insertan como PNG.
3. Los gráficos se capturan siempre en tema claro (Word se lee sobre página blanca), restaurando tu tema después.

## Referencia de opciones

### PowerPoint: modos de gráfico
| Modo | Qué produce | Requisito |
|---|---|---|
| Native charts (editable) | Gráficos nativos de PowerPoint donde exista mapeo | — |
| Image charts | Captura PNG del gráfico montado | **Vista Present activa** |

### Tipos con gráfico nativo en PowerPoint
| Nativo (editable) | Solo imagen |
|---|---|
| bar, bar-stacked, bar-100 | scatter |
| bar-horizontal (+ stacked, + 100%) | bubble |
| line, area | heatmap |
| donut, pie | treemap |
| combo | funnel, waterfall |

### Word (desde el notebook)
| Elemento | Cómo se exporta |
|---|---|
| Texto markdown | Texto nativo de Word (encabezados, negrita, listas, enlaces) |
| Tablas de resultados | Tablas nativas de Word (hasta 200 filas por tabla) |
| Gráficos | Imagen PNG (capturada en tema claro) |
| Código SQL | Bloques monoespaciados (se pueden ocultar) |

## Tips y gemas

- **Nativo suelta los overlays narrativos.** En modo nativo, el gráfico de PowerPoint conserva el tipo, las series, las etiquetas y los colores base, pero **descarta** anotaciones, líneas de meta/referencia, tendencia y KPI destacado — no tienen equivalente en la API de gráficos de PowerPoint. Si necesitas esos overlays fieles, exporta ese gráfico como imagen.
- **Imagen exige la vista Present.** El export como imagen captura el gráfico ya montado; solo la vista Present tiene todas las slides en el DOM, así que cambia a Present antes.
- **Word exporta el notebook, no el deck.** El `.docx` sale del informe del notebook (texto + tablas + gráficos), no de un deck de Report Flow.
- **Siempre datos frescos.** Tanto PowerPoint como Word re-ejecutan las queries al exportar.

## Formatos relacionados

- `.amoxdeck` — deck fuente del export a PowerPoint (ver [Report Flow](report-flow.md)).
- `.sqlnb` — notebook fuente del export a Word (ver [Notebooks](../notebooks/notebooks.md)).

## Relacionado

- [Report Flow (decks)](report-flow.md) · [Exportar gráficos](../visualization/exporting-charts.md)
- [Notebooks](../notebooks/notebooks.md) · [Informes desde un notebook](../notebooks/reports.md)
