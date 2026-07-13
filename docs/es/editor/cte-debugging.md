# Depurar CTEs

**🌐 [English](../../en/editor/cte-debugging.md) · Español**

> Ejecuta una CTE de forma aislada con un clic: ve el resultado intermedio de cualquier paso de tu query sin desarmarla.

## Qué es

Las Common Table Expressions (`WITH nombre AS (…)`) encadenan pasos de transformación, pero cuando el resultado final sale mal cuesta saber qué CTE es la culpable. La depuración de CTEs resuelve exactamente eso.

Junto a cada definición `nombre AS (` aparece un glifo **▶** en el margen izquierdo del editor (el "gutter", donde van los números de línea). Al hacer clic, AmoxSQL ejecuta la query **truncada hasta esa CTE** y le añade un `SELECT * FROM <cte> LIMIT 100`, mostrándote sus filas intermedias en una ventana. La query real del editor no se toca.

Funciona igual en el [editor SQL](sql-editor.md) y en las celdas de un [Notebook](../notebooks/notebooks.md).

## Cuándo usarlo

- Cuando una query con varias CTEs devuelve algo inesperado y quieres localizar en qué paso se rompe.
- Para inspeccionar el resultado de un join o una agregación intermedia sin comentar el resto del SQL.
- Al construir una transformación por capas: verifica cada CTE en cuanto la escribes.

## Cómo usarlo

1. Escribe una query con al menos una CTE:
   ```sql
   WITH base AS (
     SELECT * FROM pedidos WHERE estado = 'pagado'
   ),
   por_region AS (
     SELECT region, SUM(monto) AS total
     FROM base GROUP BY region
   )
   SELECT * FROM por_region ORDER BY total DESC;
   ```
2. Fíjate en el glifo **▶** que aparece en el margen, a la altura de cada línea `base AS (` y `por_region AS (`.
3. Haz clic en el ▶ de la CTE que quieras inspeccionar.
4. AmoxSQL ejecuta la query cortada justo después del cierre de esa CTE y le añade `SELECT * FROM <cte> LIMIT 100`. Las filas aparecen en una ventana modal, con su tiempo de ejecución.
5. Cierra la ventana y sigue editando. Puedes probar otra CTE inmediatamente.

<!-- 📷 CAPTURE: docs/images/editor/cte-debug-glyph.png — glifo ▶ en el margen junto a una definición de CTE -->

<!-- 📷 CAPTURE: docs/images/editor/cte-debug-modal.png — ventana con el resultado intermedio de una CTE -->

### En celdas de Notebook
En un Notebook, cada celda de código con CTEs muestra los mismos glifos ▶. El resultado se abre en la misma ventana, sin afectar el resultado guardado de la celda.

## Cómo se construye la query de depuración

| Parte | Origen |
|---|---|
| Prefijo | Todo tu SQL desde el inicio hasta el paréntesis de cierre de la CTE seleccionada |
| Sufijo | `SELECT * FROM <nombre_cte> LIMIT 100` (añadido automáticamente) |
| Variables | Las [variables](variables.md) `${...}` se resuelven antes de ejecutar |
| Límite | 100 filas, para que la vista previa sea instantánea |

El editor detecta los límites de la CTE contando paréntesis, así que las subconsultas anidadas dentro de la CTE no confunden el corte.

## Tips y gemas

- **El ▶ aparece en cualquier `nombre AS (`**, así que también lo verás en definiciones que no sean CTEs de nivel superior; úsalo con criterio sobre las CTEs del bloque `WITH`.
- **No modifica tu archivo:** la query de depuración se construye y ejecuta al vuelo; tu buffer y tu resultado principal quedan intactos.
- **Combínalo con el autocompletado:** el editor ya resuelve las columnas de salida de cada CTE (ver [Autocompletado](autocomplete.md)), así que puedes escribir el siguiente paso con confianza y luego depurarlo.
- **Pasa el mouse sobre el glifo** para ver un tooltip con el nombre de la CTE que se ejecutará.

## Relacionado

- [Editor SQL](sql-editor.md) · [Autocompletado](autocomplete.md) · [Variables](variables.md)
- [Notebooks](../notebooks/notebooks.md) · [Tabla de resultados](../results/results-table.md)
- [Plan de ejecución](../results/execution-plan.md)
