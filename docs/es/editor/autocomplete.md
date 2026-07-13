# Autocompletado

**🌐 [English](../../en/editor/autocomplete.md) · Español**

> Sugerencias de tablas, columnas y funciones que entienden dónde está tu cursor y qué columnas produce tu propia query — incluidas las de CTEs y subconsultas.

## Qué es

El autocompletado del editor no adivina: combina **tres capas** que trabajan juntas mientras escribes.

1. Un **worker en segundo plano** analiza tu SQL con un árbol de sintaxis (AST) real y determina en qué cláusula estás (`SELECT`, `FROM`, `WHERE`, `JOIN`, `GROUP BY`, `ORDER BY`, `HAVING`…), qué tablas y alias hay a la vista, y si estás tras un punto (`alias.`).
2. Una **caché global del esquema** guarda todas las tablas y columnas de tu base de datos, lista para responder al instante.
3. El **backend con DuckDB** rellena lo que la caché no tiene: el esquema de archivos de datos que referencias y — la gema — las columnas de salida de CTEs y subconsultas, resueltas con `DESCRIBE` bajo demanda.

Todo es local y determinista. No interviene ninguna IA: el resultado depende solo de tu esquema y de la estructura del SQL.

## Cuándo usarlo

- Siempre que escribas SQL: es automático mientras tecleas y con `Ctrl+Espacio` a demanda.
- Cuando trabajas con una query larga y no recuerdas los nombres exactos de columnas — sobre todo tras un `JOIN` con varias tablas.
- Cuando encadenas CTEs y quieres ver qué columnas expone cada paso intermedio sin ejecutarlo.

## Cómo usarlo

### Completado consciente de la cláusula
Escribe con normalidad. Según dónde esté el cursor, el editor filtra lo que ofrece:

- En `FROM` / `JOIN` verás tablas y funciones de tabla, no columnas sueltas.
- En `SELECT`, `WHERE`, `GROUP BY`, `HAVING`, `ORDER BY` verás columnas con su alias.
- Las **funciones de DuckDB** se filtran por cláusula: no se ofrecen agregados dentro de un `WHERE`, y las funciones de tabla aparecen en el `FROM`.

Si hay varias tablas a la vista, el editor prefija las columnas con su alias (`u.id`, `o.id`) para evitar el error de "columna ambigua".

### Columnas por dot-access
Escribe `alias.` o `tabla.` y aparecerán solo las columnas de esa tabla resuelta. El punto es un carácter disparador, así que la lista se abre sola.

<!-- 📷 CAPTURE: docs/images/editor/autocomplete-dot-access.png — popup de columnas tras escribir un alias con punto -->

### Columnas de CTEs y subconsultas (la gema)
Un analizador puramente sintáctico no puede saber qué columnas produce `SELECT a + b AS total`. AmoxSQL sí: cuando escribes `mi_cte.` o pides completado dentro de una query que usa una CTE, el editor le pide a DuckDB un `DESCRIBE` de esa expresión y te devuelve sus columnas reales — nombres derivados, expresiones y renombrados incluidos.

```sql
WITH ventas AS (
  SELECT region, SUM(monto) AS total_ventas
  FROM pedidos GROUP BY region
)
SELECT ventas.   -- ← ofrece: region, total_ventas
FROM ventas
```

### Rutas de archivos dentro de comillas
Escribe una comilla (`'` o `"`) en un `FROM` y el editor completa **rutas de archivos** de tu proyecto en lugar de SQL. Al referenciar un `.csv`, `.parquet`, `.json` o `.xlsx`, AmoxSQL escanea su esquema en segundo plano y añade sus columnas a la caché, así que el resto de la query autocompleta como si fuera una tabla.

### Hover de funciones
Pasa el mouse sobre una función de DuckDB para ver una tarjeta con su **firma**, **categoría** y **descripción**, más una tabla de parámetros cuando aplica.

<!-- 📷 CAPTURE: docs/images/editor/autocomplete-hover-doc.png — tarjeta de hover con firma y descripción de una función -->

### Snippets y ayudas dbt/Jinja
El popup también incluye snippets inteligentes (por ejemplo `LEFT JOIN`, plantilla de CTE). Las ayudas de dbt/Jinja (`ref`, `source`, `config`, `var`, `macro`) solo aparecen en archivos con plantillas, donde son útiles — nunca ensucian un `.sql` plano.

## Referencia de comportamiento

| Cláusula del cursor | Ofrece tablas | Ofrece columnas | Funciones |
|---|---|---|---|
| Inicio (ROOT) | No | No | No (solo keywords: SELECT, WITH…) |
| FROM / JOIN | Sí | No | De tabla / macro |
| SELECT | No | Sí (con scope) | Escalares, agregados, ventana, macro |
| WHERE | No | Sí (con scope) | Escalares, macro (sin agregados) |
| GROUP BY | No | Sí (con scope) | No |
| ORDER BY | No | Sí (con scope) | Escalares, agregados, ventana |
| HAVING | No | Sí (con scope) | Agregados, escalares, macro |

| Carácter disparador | Qué activa |
|---|---|
| `.` | Columnas de la tabla/alias/CTE resuelto |
| `'` `"` | Rutas de archivos e identificadores entre comillas |
| `/` | Rutas de archivos dentro de un string |
| `{` | Variables Jinja/dbt (`{{ ref('…') }}`) |

## Tips y gemas

- **Aislamiento de scope:** las columnas de una query externa no contaminan una subconsulta. El editor acota el statement actual antes de sugerir.
- **Auto-quoting:** si un identificador tiene espacios, acentos, empieza con dígito o es una palabra reservada, el editor lo entrecomilla solo (`"user name"`).
- **Fallback ante SQL a medio escribir:** si el AST tiene errores mientras tecleas rápido, el editor cae a un listado global de columnas en vez de quedarse en blanco.
- **La caché se refresca con tu esquema:** al importar o crear tablas, las columnas nuevas aparecen en las sugerencias sin recargar.

## Atajos

| Atajo | Acción |
|---|---|
| Ctrl+Espacio | Abrir sugerencias a demanda |
| `.` `'` `"` `/` `{` | Disparadores automáticos |
| Enter · Tab | Aceptar sugerencia |
| Esc | Cerrar el popup |

## Relacionado

- [Editor SQL](sql-editor.md) · [Depurar CTEs](cte-debugging.md) · [Snippets](snippets.md)
- [Explorador de base de datos](../data/database-explorer.md) · [Importar datos](../data/importing-data.md)
- [DBT Studio](../dbt/dbt-studio.md)
