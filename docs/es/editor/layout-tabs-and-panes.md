# Layout, pestañas y paneles

**🌐 [English](../../en/editor/layout-tabs-and-panes.md) · Español**

> Trabaja con varios archivos a la vez: pestañas por panel, división en dos paneles y arrastrar y soltar, con recuperación de tu sesión al reabrir.

## Qué es

El área central de AmoxSQL organiza tu trabajo en **pestañas** dentro de **paneles**. Puedes tener un solo panel con varias pestañas, o **dividir la vista en dos paneles** lado a lado para comparar dos archivos o mantener una query a la vista mientras editas otra.

Cada pestaña puede alojar un tipo de contenido distinto (SQL, Notebook, Markdown, un gráfico, un diagrama…), y el estado se conserva: al reabrir AmoxSQL, tus pestañas vuelven donde estaban. Si la app se cerró de forma inesperada con cambios sin guardar, te ofrece **recuperar** el borrador.

## Cuándo usarlo

- Cuando trabajas con varios archivos y quieres saltar entre ellos rápido.
- Para comparar dos queries o resultados uno junto al otro con la vista dividida.
- Cuando necesitas mantener un resultado visible mientras editas: sácalo a una ventana aparte.

## Cómo usarlo

### Pestañas
Cada archivo abierto es una pestaña en el panel. La pestaña activa está resaltada; un **punto** junto al nombre indica **cambios sin guardar** (dirty). La **X** cierra la pestaña.

- **Nueva pestaña:** el botón **+** al inicio de la barra crea una query SQL. El **chevron** (▾) de al lado despliega el menú para crear **SQL Query**, **Notebook** o **Markdown**.
- **Cambiar de pestaña:** haz clic, o usa **Ctrl+Tab** / **Ctrl+Shift+Tab**.
- **Cerrar:** la X de la pestaña o **Ctrl+W**.

<!-- 📷 CAPTURE: docs/images/editor/tab-bar.png — barra de pestañas con el botón + y el menú de nuevo archivo -->

### Dividir en dos paneles
Arrastra una pestaña hacia el **borde derecho** (o izquierdo) de la ventana para abrir un segundo panel y soltarla ahí. Con la vista dividida, cada panel tiene su propia barra de pestañas y su pestaña activa. Cuando el panel derecho se queda **sin pestañas**, la división **se colapsa sola** y vuelves a un único panel.

### Arrastrar y soltar pestañas
Arrastra una pestaña para reordenarla dentro de su panel o moverla al otro. Mientras arrastras aparecen **zonas de destino** resaltadas (bordes y mitades de la ventana) que te indican dónde caerá la pestaña al soltar.

<!-- 📷 CAPTURE: docs/images/editor/drag-drop-zones.png — overlay de zonas de destino al arrastrar una pestaña entre paneles -->

### Sacar los resultados a una ventana aparte
El panel de resultados puede **abrirse en una ventana independiente** (pop-out) para tenerlo en otra pantalla o junto al editor. La ventana se actualiza sola cuando cambian los resultados. Ver [Tabla de resultados](../results/results-table.md).

### Recuperación tras cierre inesperado
Mientras editas, AmoxSQL guarda un borrador local del contenido. Si reabres un archivo y hay un borrador con cambios que no se guardaron, aparece un aviso con un botón **Recover** para restaurarlos; si no, se descarta.

### Varias sentencias → Notebook
Si ejecutas un archivo con varias sentencias separadas por `;`, AmoxSQL te propone **convertirlo en un Notebook** (una celda por sentencia) en lugar de correrlas a ciegas, porque el panel de resultados tabula una sola consulta. Ver [Notebooks](../notebooks/notebooks.md).

## Referencia de tipos de pestaña

| Tipo | Contenido | Doc |
|---|---|---|
| `sql` | Query SQL en el editor | [Editor SQL](sql-editor.md) |
| `sqlnb` | Notebook con celdas | [Notebooks](../notebooks/notebooks.md) |
| `sqlchain` | Pipeline visual (Data Flow) | [Data Flow](../data-flow/data-flow.md) |
| `md` | Documento Markdown | — |
| `amoxdeck` | Deck de presentación (Report Flow) | [Report Flow](../reports/report-flow.md) |
| `amoxvis` | Configuración de gráfico (Story Flow) | [Story Flow](../visualization/story-flow.md) |
| `er-diagram` | Diagrama entidad-relación | [Diagrama ER](../data/er-diagram.md) |
| `dbt-lineage` | Grafo de linaje dbt | [DBT Studio](../dbt/dbt-studio.md) |
| `datadiving` | Sesión de exploración de datos | — |

## Tips y gemas

- **El punto dirty** te avisa de cambios sin guardar antes de cerrar; guárdalos con **Ctrl+S**.
- **Auto-merge del split:** no hace falta "desdividir" a mano; cierra la última pestaña del panel derecho y la vista vuelve a un panel.
- **Tu sesión se restaura:** las pestañas abiertas se recuerdan y vuelven al reabrir la app.
- **Pop-out para dos pantallas:** saca los resultados a otra ventana y deja el editor a pantalla completa.
- **Deja que convierta a Notebook:** para scripts multi-sentencia, la conversión a Notebook te da un resultado aislado por celda en vez de errores.

## Atajos / formatos

| Atajo | Acción |
|---|---|
| Ctrl+N · Ctrl+Shift+N | Nueva query SQL · nuevo Notebook |
| Ctrl+W | Cerrar pestaña activa |
| Ctrl+Tab · Ctrl+Shift+Tab | Pestaña siguiente · anterior |
| Ctrl+S | Guardar la pestaña activa |

## Relacionado

- [Editor SQL](sql-editor.md) · [Paleta de comandos](command-palette.md) · [La interfaz](../user-guide/interface.md)
- [Notebooks](../notebooks/notebooks.md) · [Tabla de resultados](../results/results-table.md)
- [Data Flow](../data-flow/data-flow.md) · [Formatos de archivo](../reference/file-formats.md)
