# Comparar resultados

**🌐 [English](../../en/results/compare-results.md) · Español**

> Guarda una foto de un resultado y compárala con otro para ver qué filas se añadieron, se quitaron o siguen igual.

<!-- 📷 CAPTURE: docs/images/results/compare-results.png — Modal de comparación con el selector de columna clave y las pestañas Added/Removed/Unchanged. -->

## Qué es

**Comparar resultados** te deja tomar una **instantánea** del resultado actual y, después de ejecutar otra consulta, enfrentarla contra la nueva. AmoxSQL calcula el **diff por una columna clave** y reparte las filas en tres grupos: **Added** (añadidas), **Removed** (quitadas) y **Unchanged** (sin cambios de existencia).

Vive en la [tabla de resultados](results-table.md), en los botones **Store A** y **Compare** de la barra de herramientas.

## Cuándo usarlo

- Para ver qué cambió entre dos versiones de una consulta (antes/después de un `WHERE`, un `JOIN` o una transformación).
- Para comparar dos periodos, dos filtros o dos tablas con el mismo esquema.
- Para validar una migración o una limpieza: ¿qué filas desaparecieron o aparecieron?

No es un diff celda por celda: compara **presencia de filas** según la columna clave que elijas.

## Cómo usarlo

1. Ejecuta la primera consulta. En la barra de resultados pulsa **Store A** — se guarda una instantánea de las filas actuales (aparece un aviso).
2. Ejecuta la segunda consulta (o cambia el filtro y vuelve a correr).
3. Pulsa **Compare**. Se abre el modal de comparación.
4. Elige la **columna clave** en el desplegable. Es la columna que identifica cada fila (por ejemplo `id`). Con "— No key (show all) —" se muestran todas las filas de cada lado sin emparejar.
5. Alterna entre **Added / Removed / Unchanged** para revisar cada grupo. Cada pestaña muestra su recuento.
6. Para descartar la instantánea, pulsa la **✕** junto a Compare.

## Referencia

| Elemento | Qué hace |
|---|---|
| **Store A** | Toma una instantánea del resultado actual (ya filtrado y ordenado) |
| **Compare** | Abre el diff entre la instantánea (A) y el resultado actual (B) |
| **✕** (limpiar) | Descarta la instantánea guardada |
| **Key Column** | Columna que empareja filas entre A y B |
| **Added** | Filas presentes en B pero no en A (según la clave) |
| **Removed** | Filas presentes en A pero no en B |
| **Unchanged** | Filas cuya clave existe en ambos lados |

## Tips y gemas

- **Elige bien la clave:** el diff se basa en ella. Una columna única (un `id`) da resultados nítidos; una columna repetida puede emparejar filas que no querías.
- **Compara "manzanas con manzanas":** funciona mejor cuando ambos resultados comparten el esquema (mismas columnas). Puedes comparar dos consultas distintas siempre que la columna clave exista en ambas.
- **La instantánea es la vista, no la query:** **Store A** guarda las filas tal como están (con tu filtro y orden aplicados), no re-ejecuta nada.
- **Vista previa acotada:** cada grupo muestra hasta 100 filas en el modal, con un aviso de cuántas más hay; para el detalle completo, exporta cada resultado por separado (ver [Guardar resultados](saving-results.md)).

## Relacionado

- [Tabla de resultados](results-table.md) · [Guardar resultados](saving-results.md)
- [Perfil de datos](data-profiler.md) · [Editor SQL](../editor/sql-editor.md)
