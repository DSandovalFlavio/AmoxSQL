# Informes desde un notebook

**🌐 [English](../../en/notebooks/reports.md) · Español**

> Convierte tu notebook en un documento limpio para leer, presentar o exportar a HTML y Word.

## Qué es

Todo [SQL Notebook](notebooks.md) tiene, además del modo **Edit**, un modo **Report** y un modo **Present** que lo transforman en un documento pulido: sin barras de herramientas de celda, con el texto y los resultados centrados en una página tipo "hoja". Desde ahí puedes ocultar el código, imprimir, o **exportar** a un archivo HTML autocontenido o a Word.

Es la forma de compartir el análisis con alguien que no va a abrir AmoxSQL: el mismo notebook con el que trabajaste se vuelve el entregable.

## Cuándo usarlo

- Para presentar los hallazgos de un notebook a otra persona o proyectarlos.
- Para generar un informe HTML o Word que puedas enviar por correo o archivar.
- Cuando quieras un PDF: se obtiene imprimiendo el modo Report.
- Para un entregable con plantillas y diapositivas editables (PowerPoint/Word nativo), usa en cambio [Report Flow](../reports/report-flow.md).

## Cómo usarlo

### Cambiar a vista de informe
1. En la barra del notebook, usa el conmutador **Edit / Report**. En **Report** el documento se muestra centrado, sin las herramientas de edición de cada celda.
2. Pulsa **Present** para entrar en pantalla completa (modo presentación). Sal con **Esc** o el botón **Exit**.

### Mostrar u ocultar el código
El botón **Show Code / Code Hidden** alterna la visibilidad de los bloques SQL. Con el código oculto, el informe muestra solo el texto y los resultados (tablas y gráficos) —ideal para una audiencia de negocio—.

### Imprimir / PDF
Pulsa **Print** para abrir el diálogo de impresión del sistema. Elige "Guardar como PDF" para obtener un PDF del informe.

### Exportar a HTML
El botón **Export HTML** genera un **archivo `.html` autocontenido** (todo embebido, sin dependencias externas) que se descarga directamente. Incluye:

- **Tabla de contenido** construida a partir de los encabezados Markdown (con enlaces internos).
- **Tablas ordenables**: haz clic en el encabezado de columna para ordenar (muestra hasta 200 filas por tabla).
- **Gráficos como imagen PNG**: cada gráfico se captura tal como se ve y se incrusta como imagen de alta resolución (2x), con su título, subtítulo y nota al pie.
- **Tema claro/oscuro**: el HTML adopta el tema activo de la app en el momento de exportar.

### Exportar a Word
El botón **Export Word** genera un documento **`.docx`** del informe del notebook: respeta el ajuste de "ocultar código", incluye el texto, las tablas y los gráficos con su configuración. Es un documento editable, no una imagen.

> **Alcance:** *Export Word* aquí cubre el **informe del notebook**. Para presentaciones y documentos de Office con plantillas y gráficos refrescables desde un deck, mira [Exportar a Office](../reports/export-to-office.md).

## Referencia de acciones (barra en modo Report/Present)

| Botón | Qué hace | Notas |
|---|---|---|
| **Edit / Report** | Cambia entre edición y vista de informe | — |
| **Present** | Pantalla completa | Salir con Esc |
| **Show Code / Code Hidden** | Muestra u oculta los bloques SQL | Afecta también a las exportaciones |
| **Print** | Diálogo de impresión del sistema | Ruta hacia PDF |
| **Export HTML** | Descarga un `.html` autocontenido | TOC, tablas ordenables, gráficos PNG, tema |
| **Export Word** | Descarga un `.docx` del informe | Editable; respeta "ocultar código" |

## Tips y gemas

- **El "mostrar/ocultar código" se propaga:** si ocultas el código antes de exportar, el HTML y el Word salen igualmente sin SQL.
- **Los gráficos se exportan como se ven:** ajusta cada gráfico (tipo, colores, título) en la vista de la celda antes de exportar; la exportación captura ese estado exacto.
- **Límite de filas en tablas exportadas:** el HTML incrusta hasta 200 filas por tabla para mantener el archivo ligero. Para el conjunto completo, exporta los datos desde el editor o la tabla de resultados (ver [Guardar resultados](../results/saving-results.md)).
- **Reproducibilidad:** como los resultados se guardan dentro del `.sqlnb`, puedes exportar un informe sin volver a ejecutar las consultas.

## Atajos y formatos relacionados

- **Esc** sale del modo Presentación.
- Salidas: `.html` (autocontenido) y `.docx` (Word). Ver [Formatos de archivo](../reference/file-formats.md).

## Relacionado

- [Notebooks (.sqlnb)](notebooks.md) · [Tabla de resultados](../results/results-table.md)
- [Report Flow (decks)](../reports/report-flow.md) · [Exportar a Office](../reports/export-to-office.md)
- [Guardar resultados](../results/saving-results.md)
