# Plan de ejecución

**🌐 [English](../../en/results/execution-plan.md) · Español**

> Ve cómo DuckDB ejecuta tu consulta —paso a paso, con nombres legibles, el cuello de botella marcado y pistas de optimización.

<img src="../../../images/11_query_plan.png" alt="Plan de ejecución de AmoxSQL" width="100%" />

## Qué es

El **Plan de ejecución** te muestra el árbol de operaciones que DuckDB usa para resolver tu SQL: escaneos, filtros, joins, agregaciones, ordenamientos. En vez del texto crudo de `EXPLAIN`, AmoxSQL lo presenta como un **árbol legible** con nombres amistosos ("Escanear tabla", "Group & aggregate", "Join (hash)"), tiempos por paso, filas por paso y el **paso más lento** resaltado.

Tiene dos modos: **Estimated** (el plan que el optimizador *cree* que ejecutará, sin correr la query) y **Actual** (ejecuta de verdad la consulta y mide tiempos y filas reales).

## Cuándo usarlo

- Cuando una consulta va lenta y quieres saber **dónde** se va el tiempo.
- Para comprobar si un filtro se está "empujando" al origen o si un join usa la estrategia adecuada.
- Para entender por qué el optimizador estima mal el número de filas.
- Antes de pedir ayuda a la IA para optimizar: aquí tienes el diagnóstico y el botón para enviarlo.

## Cómo usarlo

1. Con tu consulta en el [editor](../editor/sql-editor.md), pulsa **Analyze** en la barra de acciones, o **Ctrl+Shift+A**.
2. Se abre el plan. Usa el conmutador **Estimated / Actual**:
   - **Estimated** — `EXPLAIN`: el plan previsto, **sin ejecutar** la query. Instantáneo y seguro.
   - **Actual** — `EXPLAIN ANALYZE`: **ejecuta** la consulta y mide tiempo y filas reales por operador.
3. Explora el resultado en las tres vistas (arriba a la derecha):
   - **Tree** — el árbol de operadores, con tiempo, porcentaje y filas por paso; el más lento marcado.
   - **Cost** — barras horizontales por operador, ordenadas por tiempo propio.
   - **Graph** — un diagrama de flujo (DAG) del plan.
4. Lee las **pistas de optimización** de arriba y el banner del **paso más lento**.
5. Si quieres, pulsa **Optimize with AI** para enviar la query y su plan al [Asistente](../ai/editor-assistant.md).

### Métricas y fases (modo Actual)
En modo Actual, una franja muestra **Latencia, Filas, Filas escaneadas, CPU, Memoria pico y Bytes leídos**. Debajo, una barra de **fases** reparte el tiempo en **Planning** (planificación), **Execution** (operadores) e **I/O & setup** (lectura, sniffing de CSV, recolección) — revela si la consulta está limitada por cómputo o por E/S.

### Panel de la consulta
A la izquierda ves el SQL analizado; arrastra el separador para darle más o menos espacio.

## Referencia de pistas de optimización

El plan aplica reglas y sugiere mejoras concretas (severidad alta / media / informativa):

| Pista | Qué señala |
|---|---|
| Estimación de cardinalidad muy desviada | Estadísticas obsoletas → mal orden de joins; considera `ANALYZE` |
| Filtro descarta casi todo tras un escaneo | Empuja la condición al origen (un `WHERE` sobre la tabla/archivo) |
| Escaneo completo sin filtro | Añade un `WHERE` si no necesitas todas las filas |
| Ordenamiento caro que no es Top-N | Usa `ORDER BY … LIMIT` para un Top-N más barato |
| Cross product / nested-loop join | Falta una clave de igualdad en el join |
| Volcado a disco | Faltó memoria; reduce datos o sube `memory_limit` |
| Limitada por E/S | Convierte CSV → Parquet o cachea en una tabla |

## Referencia de nombres de operador

Algunos ejemplos de los nombres amistosos (con el nombre técnico de DuckDB debajo en el árbol):

| Amistoso | Operador DuckDB |
|---|---|
| Escanear tabla | `SEQ_SCAN` / `TABLE_SCAN` |
| Leer CSV / Parquet / JSON | `READ_CSV` / `PARQUET_SCAN` / `READ_JSON` |
| Group & aggregate | `HASH_GROUP_BY` |
| Filtrar filas | `FILTER` |
| Ordenar · Top N | `ORDER_BY` · `TOP_N` |
| Join (hash / merge / nested loop) | `HASH_JOIN` / `PIECEWISE_MERGE_JOIN` / `NESTED_LOOP_JOIN` |
| Funciones de ventana | `WINDOW` |

## Tips y gemas

- **Empieza en Estimated, confirma en Actual:** Estimated es instantáneo; cuando quieras números reales, cambia a Actual (ejecuta la query).
- **El "mapa de calor" del árbol:** los pasos que consumen más tiempo se tiñen (ámbar/rojo) y el más lento lleva la etiqueta "slowest".
- **Estimación desviada = ojo:** si un paso esperaba ~1.000 filas y llegaron 1.000.000, el optimizador pudo elegir mal; el nodo lo marca.
- **ANALYZE se bloquea en escrituras:** en consultas que no son de solo lectura (por ejemplo un `CREATE`/`INSERT`), el modo Actual se restringe y verás un aviso; usa Estimated.

## Atajos relacionados

- **Ctrl+Shift+A** abre el plan de ejecución. Ver [Atajos de teclado](../reference/keyboard-shortcuts.md).

## Relacionado

- [Editor SQL](../editor/sql-editor.md) · [Tabla de resultados](results-table.md)
- [Perfil de datos](data-profiler.md) · [Asistente de IA](../ai/editor-assistant.md)
