# Notebooks (.sqlnb)

**🌐 [English](../../en/notebooks/notebooks.md) · Español**

> Documentos interactivos que combinan celdas de SQL, texto y variables de entrada, con ejecución secuencial y re-ejecución reactiva.

<img src="../../../images/05_sql_notebook.png" alt="SQL Notebook de AmoxSQL" width="100%" />

## Qué es

Un **SQL Notebook** (`.sqlnb`) es un documento vivo hecho de **celdas**. Cada celda es de código (SQL), de texto (Markdown) o de entrada (una variable con nombre). Mezclas explicación y análisis en un solo archivo: cada celda de código lleva sus **propios resultados** debajo (tabla, gráfico o perfil), y el texto entre ellas cuenta la historia.

A diferencia del [Editor SQL](../editor/sql-editor.md) —una sola query enfocada—, el notebook está pensado para un análisis narrado de varios pasos: cargas datos en una celda, los transformas en la siguiente, los visualizas en otra y describes las conclusiones en Markdown.

Cualquier archivo `.sqlnb` que abras se renderiza como notebook automáticamente (AmoxSQL lo detecta por la extensión). El estado —resultados en caché, configuración de gráficos, valores de variables— se guarda **dentro del propio archivo**, así que reabrirlo te devuelve exactamente donde lo dejaste.

## Cuándo usarlo

- Para un análisis exploratorio de varios pasos que quieras leer de arriba abajo.
- Cuando quieras parametrizar una consulta con **variables de entrada** y recalcular al cambiarlas.
- Para armar un **informe** reproducible que luego exportas a HTML o Word (ver [Informes desde un notebook](reports.md)).
- Si solo necesitas una consulta suelta, usa el [Editor SQL](../editor/sql-editor.md). Para encadenar transformaciones visualmente, usa [Data Flow](../data-flow/data-flow.md).

## Cómo usarlo

### Añadir y organizar celdas
1. Usa los botones **+ SQL**, **+ Text** e **Input** (en la barra superior o al final del notebook) para crear celdas.
2. Reordénalas arrastrándolas por el cuerpo de la celda, o con las flechas **Subir/Bajar** de la barra de la celda.
3. Elimínalas con el botón de papelera (pide confirmación).

### Celda de código (SQL)
Escribe SQL con el mismo editor y autocompletado del editor principal. Ejecútala con el botón **Run** o **Ctrl+Enter**; los resultados aparecen debajo con los modos Tabla / Gráfico / Perfil (ver [Tabla de resultados](../results/results-table.md)). El panel de resultados es **redimensionable** (arrastra el asa inferior) y puedes **sacarlo a una ventana aparte** con Pop-out. El glifo ▶ del margen depura CTEs igual que en el editor.

### Celda de texto (Markdown)
Haz **doble clic** para editar; escribe Markdown (soporta GFM: tablas, listas de tareas, etc.). Haz clic fuera para volver a la vista renderizada.

### Celda de entrada (variable)
Define una variable con un **nombre** (se referencia como `{{nombre}}`) y un **valor** con tipo **Texto / Número / Fecha**. Cualquier celda de código que contenga `{{nombre}}` recibe ese valor al ejecutarse: las cadenas se insertan entre comillas y los números tal cual.

> **`{{var}}` vs `${var}`:** las variables de entrada del notebook usan llaves dobles `{{ }}` y viven en el archivo `.sqlnb`. No las confundas con las variables `${...}` del editor SQL, que se gestionan en su propio panel (ver [Variables](../editor/variables.md)).

### Ejecutar el notebook
| Acción | Cómo | Qué hace |
|---|---|---|
| Ejecutar una celda | Botón **Run** · **Ctrl+Enter** | Corre solo esa celda de código |
| Ejecutar todo | **Run All** · **Ctrl+Shift+Enter** | Corre todas las celdas de código en orden |
| Ejecutar esta y las de arriba | Botón ▲▲ de la celda | Desde la primera hasta esta, en secuencia |
| Ejecutar esta y las de abajo | Botón ▼▼ de la celda | Desde esta hasta la última, en secuencia |

Las ejecuciones en lote van **secuenciales y se detienen en el primer error**; el botón **Stop** muestra el progreso `(actual/total)` y permite cancelar.

### Gema: re-ejecución reactiva (DAG)
Al **cambiar el valor de una celda de entrada**, AmoxSQL vuelve a ejecutar automáticamente **solo** las celdas de código que referencian esa `{{variable}}` —no todo el notebook—. Es como una mini hoja de cálculo: mueves un parámetro y los pasos que dependen de él se recalculan solos. Las dependencias se infieren buscando `{{variable}}` en el texto de cada celda.

## Referencia de tipos de celda

| Tipo | Contenido | Edición | Resultados |
|---|---|---|---|
| **Code** | SQL de DuckDB | Editor Monaco con autocompletado | Tabla / Gráfico / Perfil debajo |
| **Text** | Markdown (GFM) | Doble clic para editar | — (se renderiza) |
| **Input** | Valor de variable `{{ }}` | Nombre + Valor + tipo (texto/número/fecha) | Dispara re-ejecución reactiva |

## Tips y gemas

- **Resultados persistidos:** cada celda guarda su último resultado (hasta 500 filas), la configuración de su gráfico y el modo de vista dentro del `.sqlnb`. Reabrir el archivo no requiere volver a ejecutar.
- **Convierte un `.sql` en notebook:** si un archivo del editor tiene varias sentencias separadas por `;`, AmoxSQL ofrece convertirlo en un notebook (una celda por sentencia).
- **Compatibilidad hacia atrás:** el formato actual es JSON v3.0; los notebooks antiguos v2.0 y de marcadores (`-- !CELL:CODE!`) se migran automáticamente al abrirlos, incluido el estado del sidecar `.sqlnb.state.json`.

## Atajos y formatos relacionados

- **Ctrl+Enter** ejecuta la celda activa · **Ctrl+Shift+Enter** ejecuta todo · **Ctrl+S** guarda · **Esc** sale del modo Presentación.
- Formatos: `.sqlnb` (JSON v3.0 con `cells` + `environment`) y su sidecar heredado `.sqlnb.state.json`. Ver [Formatos de archivo](../reference/file-formats.md).

## Relacionado

- [Informes desde un notebook](reports.md) · [Editor SQL](../editor/sql-editor.md) · [Variables](../editor/variables.md)
- [Tabla de resultados](../results/results-table.md) · [Perfil de datos](../results/data-profiler.md)
- [Formatos de archivo](../reference/file-formats.md)
