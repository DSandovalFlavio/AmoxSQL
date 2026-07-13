# Snippets

**🌐 [English](../../en/editor/snippets.md) · Español**

> Una biblioteca de patrones SQL listos para insertar — funciones de ventana, PIVOT, detección de outliers, modelos dbt — más tus propios snippets guardados.

## Qué es

El panel de **Snippets** es una barra lateral con plantillas de SQL probadas que insertas en el editor con un clic. En lugar de recordar la sintaxis exacta de un `PIVOT` o de una detección de outliers por IQR, la buscas, la insertas y rellenas los huecos.

Cada snippet trae marcadores `${placeholder}` en los puntos que debes personalizar (nombre de tabla, columna, periodo…), de modo que al insertarlo solo tienes que reemplazar esas partes.

La biblioteca integrada está agrupada por temas, y puedes guardar tus propios snippets en **"My Snippets"**, que persisten en el servidor local entre sesiones.

## Cuándo usarlo

- Cuando necesitas un patrón que no te sabes de memoria: running total, year-over-year, date spine, etc.
- Para estandarizar cómo tu equipo escribe una transformación (por ejemplo, un modelo staging de dbt).
- Cuando repites una misma query base a menudo: guárdala como snippet propio.

## Cómo usarlo

### Abrir el panel
Abre la barra lateral de Snippets. Verás un buscador arriba y las categorías desplegables debajo, cada una con su contador de snippets.

<!-- 📷 CAPTURE: docs/images/editor/snippets-panel.png — panel de snippets con categorías desplegadas -->

### Insertar un snippet
1. (Opcional) Escribe en el buscador para filtrar por nombre, descripción o contenido del SQL.
2. Despliega una categoría y localiza el snippet.
3. Haz clic sobre él para **insertarlo en el editor activo** en la posición del cursor.
4. Reemplaza los `${placeholder}` por tus tablas y columnas reales.

Cada snippet muestra también un icono de **copiar** si prefieres llevarlo al portapapeles en lugar de insertarlo.

### Guardar un snippet propio
1. Pulsa el botón **+** de la cabecera del panel.
2. Dale un **nombre** y pega el **SQL**.
3. Pulsa **Save Snippet**. Aparecerá en la categoría **"My Snippets"** y quedará guardado en el servidor local.
4. El icono de papelera de cada snippet propio lo elimina.

## Referencia de la biblioteca integrada

| Categoría | Qué incluye |
|---|---|
| **Window Functions** | ROW_NUMBER, Running Total, LAG/LEAD, Percentile Rank |
| **Aggregation Patterns** | PIVOT (crosstab), UNPIVOT, Year over Year |
| **Date Operations** | Date Spine (rango continuo de fechas), Date Truncate por periodo |
| **Data Quality** | Null Check, Duplicate Finder, Outlier Detection (IQR) |
| **DuckDB Specific** | Read CSV, Read Parquet, SUMMARIZE, Export to Parquet |
| **DBT Models** | Staging, Intermediate, Mart, Incremental, Snapshot (SCD2), Custom Test, Macro, Source Config |
| **My Snippets** | Tus snippets guardados (aparece solo si tienes alguno) |

## Tips y gemas

- **Los placeholders `${...}`** marcan lo que debes cambiar. Recórrelos y sustituye tabla, columna o periodo según el caso.
- **El buscador mira dentro del SQL**, no solo el nombre: busca "quantile" y encontrarás la detección de outliers por IQR aunque no recuerdes su título.
- **La detección de outliers** usa el rango intercuartílico (Q1/Q3 con `QUANTILE_CONT`) — un patrón robusto que no te tienes que reescribir cada vez.
- **Snippets de dbt:** los patrones de la categoría DBT Models traen `{{ config(...) }}`, `ref()` y `source()` ya colocados; úsalos como punto de partida de tus modelos en el [DBT Studio](../dbt/dbt-studio.md).
- **Copiar vs insertar:** el icono de copiar es útil cuando quieres pegar el patrón en otra herramienta o en un comentario.

## Atajos / formatos

- Sintaxis de placeholder: `${nombre_del_hueco}`.
- Los snippets propios se guardan vía el endpoint local de snippets y persisten entre reinicios.

## Relacionado

- [Editor SQL](sql-editor.md) · [Autocompletado](autocomplete.md) · [Variables](variables.md)
- [DBT Studio](../dbt/dbt-studio.md) · [Extensiones de DuckDB](../data/duckdb-extensions.md)
- [Data Profiler](../results/data-profiler.md)
