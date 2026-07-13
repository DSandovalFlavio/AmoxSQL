# Report Flow

**🌐 [English](../../en/reports/report-flow.md) · Español**

> Construye presentaciones a partir de tu análisis: decks `.amoxdeck` de slides en markdown con gráficos en vivo que se refrescan con datos actuales, editados visualmente en el Report Flow Studio.

<!-- 📷 CAPTURE: docs/images/reports/report-flow-studio.png — El Report Flow Studio en vista Design: barra de herramientas arriba (Refresh all, Export PowerPoint, Design/Present/Source, Save), panel lateral Slides/Layouts/Charts a la izquierda y la slide activa con prosa y un gráfico embebido a la derecha. -->

## Qué es

**Report Flow** es la sección de presentaciones de AmoxSQL. Un deck se guarda como archivo **`.amoxdeck`**, que por dentro es simplemente markdown: un bloque de *front-matter* (título, tema, proporción, variables), slides separadas por una línea `---`, una directiva de layout por slide, y gráficos embebidos como bloques ` ```amoxchart ` que **referencian un archivo `.amoxvis`** por ruta.

Pero no editas ese markdown a mano: el **Report Flow Studio** es una interfaz visual, igual que Story Flow construye un gráfico y guarda `.amoxvis` por debajo. Los gráficos del deck son **embeds en vivo** — cada uno recuerda la query del `.amoxvis` y se re-ejecuta cuando pulsas **Refresh all**, así el deck refleja datos actuales sin rehacer el análisis.

El deck se abre en el IDE al hacer doble clic en un `.amoxdeck`. Desde aquí puedes exportar a PowerPoint editable (ver [Exportar a Office](export-to-office.md)).

## Cuándo usarlo

- Cuando el análisis termina en una presentación y quieres que los gráficos sigan vivos, no capturas estáticas.
- Para armar un informe recurrente: usa **variables** en el front-matter (p. ej. una región) y refresca el deck cuando cambien los datos.
- Cuando prefieres editar visualmente slide a slide en lugar de escribir markdown.

## Cómo usarlo

### Crear y estructurar un deck
1. Abre un archivo `.amoxdeck` (o crea uno). Se abre en el Report Flow Studio.
2. Empieza en la vista **Design**, que edita **una slide activa** cada vez.
3. En el panel **Layouts**, elige el layout de la slide activa; en **Slides**, reordena, mueve o borra slides, o pulsa **+ Add slide**.

### Añadir prosa y gráficos
1. La prosa es *click-to-edit* directamente sobre la slide.
2. En el panel **Charts**, elige un `.amoxvis` para colocarlo en la slide activa (reemplaza el gráfico de esa slide; nunca se añade al final del archivo).
3. Una slide de solo contenido gana su hueco de gráfico al promocionarse a `content-chart` automáticamente.

### Refrescar los gráficos
1. Pulsa **Refresh all** en la barra de herramientas.
2. Cada gráfico re-ejecuta su query contra las **variables actuales** del deck (`{{variable}}`), actualizando los datos.

### Revisar y exportar
1. La vista **Present** renderiza todas las slides en solo lectura, para revisar (y es el origen DOM del export de gráficos como imagen).
2. La vista **Source** muestra el markdown crudo en el editor, para usuarios avanzados.
3. **Export PowerPoint** genera la presentación (ver [Exportar a Office](export-to-office.md)).

## Referencia de opciones

### Front-matter del deck
| Campo | Qué controla |
|---|---|
| `title` | Título del deck (badge en la barra) |
| `theme` | Tema visual del deck |
| `aspect` | Proporción de slide: `16:9` · `4:3` · `1:1` |
| `variables` | Pares clave/valor inyectados en las queries como `{{clave}}` |

### Layouts de slide
| Layout | Para |
|---|---|
| `title` | Portada / separador (título centrado) |
| `content` | Solo prosa |
| `content-chart` | Prosa + gráfico en dos columnas |
| `chart-full` | Gráfico a slide completa |
| `two-col` | Dos columnas |

La directiva `<!-- layout: X -->` es la primera línea de la slide; por defecto es `content`.

### Studio — vistas y paneles
| Elemento | Qué hace |
|---|---|
| Vista Design | Edita la slide activa (prosa click-to-edit + hueco de gráfico) |
| Vista Present | Todas las slides en solo lectura (revisión + origen para export como imagen) |
| Vista Source | Markdown crudo en el editor |
| Panel Slides | Reordenar, mover, borrar, añadir slides |
| Panel Layouts | Aplicar un layout a la slide activa |
| Panel Charts | Insertar/reemplazar el gráfico de la slide activa |
| Refresh all | Re-ejecuta todas las queries con las variables del deck |

## Tips y gemas

- **Los gráficos son embeds vivos, no imágenes:** un `.amoxchart` apunta a un `.amoxvis` por ruta; cambia el `.amoxvis` y el deck lo refleja al refrescar.
- **Variables para informes plantilla:** define `region: "US"` en el front-matter, úsala como `{{region}}` en las queries y cambia solo esa línea para regenerar el deck.
- **El markdown es el almacenamiento, no la interfaz:** editas visualmente; la vista Source existe por si necesitas el control fino.
- **Insertar gráfico actúa sobre la slide activa:** elegir un chart lo coloca en la slide en foco, no al final del archivo.

## Formatos relacionados

- `.amoxdeck` — deck de presentación en markdown (ver [Formatos de archivo](../reference/file-formats.md)).
- `.amoxvis` — gráfico embebido, con su query (ver [Exportar gráficos](../visualization/exporting-charts.md)).

## Relacionado

- [Exportar a Office](export-to-office.md) · [Story Flow](../visualization/story-flow.md)
- [Exportar gráficos](../visualization/exporting-charts.md) · [Notebooks](../notebooks/notebooks.md)
