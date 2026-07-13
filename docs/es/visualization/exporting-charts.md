# Exportar gráficos

**🌐 [English](../../en/visualization/exporting-charts.md) · Español**

> La etapa Export de Story Flow: saca el gráfico como PNG en tamaños listos para slides o redes, cópialo al portapapeles, o guárdalo como `.amoxvis` para reutilizarlo y refrescarlo.

<!-- 📷 CAPTURE: docs/images/visualization/export-stage.png — La pestaña Export con las secciones Clipboard, Canvas size (presets PowerPoint 16:9, 4:3, Square, Phone Story, Wide Banner, Original) y Configuration file. -->

## Qué es

La etapa **Export** ("Ship it") es el paso ⑥ de [Story Flow](story-flow.md). Tiene dos naturalezas distintas: sacar una **imagen** (PNG a un tamaño concreto o al portapapeles) y guardar la **configuración** como archivo `.amoxvis`. La imagen es el resultado final; el `.amoxvis` es la receta reutilizable — recuerda que **lleva la query dentro**, así que el gráfico puede regenerarse solo o dentro de un deck de [Report Flow](../reports/report-flow.md).

## Cuándo usarlo

- **PNG** cuando necesitas una imagen para pegar en una presentación, documento o red social.
- **Copiar al portapapeles** cuando vas a pegar de inmediato en otra app.
- **`.amoxvis`** cuando el gráfico vive más de un momento: lo reabrirás, lo pondrás en un deck o lo refrescarás con datos nuevos.
- **Pegar JSON de la IA** cuando el asistente te entrega una configuración y quieres aplicarla al gráfico actual.

## Cómo usarlo

### Descargar como PNG
1. Abre la pestaña **Export**.
2. En **Canvas size**, elige un preset o **Original size** (usa el tamaño real en pantalla).
3. El PNG se genera y se descarga al instante. En pantalla completa, un botón **PNG** hace lo mismo con el tamaño actual.

### Copiar al portapapeles
1. En **Clipboard**, pulsa **Copy chart as image**.
2. El gráfico se copia como PNG; pégalo con Ctrl+V en cualquier app.

### Guardar y cargar configuración
1. En **Configuration file**, pulsa **Save as .amoxvis** y dale nombre.
2. Se guarda la configuración completa **más la query** que alimenta el gráfico.
3. Para recuperar una configuración, usa **Load configuration** y elige un `.amoxvis` (o `.json`).

### Pegar JSON desde la IA
1. Pulsa **Paste JSON from AI** y pega el objeto de configuración.
2. AmoxSQL lo **valida contra las columnas** del resultado actual antes de aplicarlo, para que los ejes referencien columnas que existen.
3. Si es válido, la configuración se aplica al gráfico en pantalla.

## Referencia de opciones

### Presets de tamaño (PNG)
| Preset | Dimensiones | Para |
|---|---|---|
| PowerPoint 16:9 | 1920 × 1080 | Slide panorámica |
| PowerPoint 4:3 | 1440 × 1080 | Slide clásica |
| Square (1:1) | 1080 × 1080 | Publicación cuadrada |
| Phone Story (9:16) | 1080 × 1920 | Historia vertical |
| Wide Banner | 1200 × 628 | Banner / vista previa de enlace |
| Original size | tamaño en pantalla | Exportar tal cual se ve |

### Acciones
| Acción | Qué hace |
|---|---|
| Copy chart as image | Copia el gráfico al portapapeles como PNG |
| Save as .amoxvis | Guarda configuración + query en un archivo `.amoxvis` |
| Load configuration | Carga un `.amoxvis`/`.json` en el gráfico actual |
| Paste JSON from AI | Aplica una config pegada, validándola contra las columnas |

## Tips y gemas

- **El `.amoxvis` no es una imagen:** es la receta viva con la query; ábrelo más tarde y se re-ejecuta con datos actuales.
- **Original size respeta tu layout:** si ajustaste márgenes y proporción, "Original size" exporta exactamente eso.
- **La validación evita ejes rotos:** pegar JSON de la IA no aplicará una configuración que apunte a columnas inexistentes.
- **PNG para compartir, `.amoxvis` para construir:** usa PNG cuando el destino es plano; usa `.amoxvis` cuando el gráfico entrará en un deck de Report Flow.

## Formatos relacionados

- `.amoxvis` — configuración de gráfico con query embebida (ver [Formatos de archivo](../reference/file-formats.md)).

## Relacionado

- [Story Flow](story-flow.md) · [Formato y estilo](format-and-style.md)
- [Report Flow (decks)](../reports/report-flow.md) · [Exportar a Office](../reports/export-to-office.md)
