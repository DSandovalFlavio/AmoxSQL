# Formatos de archivo

**🌐 [English](../../en/reference/file-formats.md) · Español**

> Referencia de cada formato de archivo que AmoxSQL lee, escribe o interpreta: qué guarda, cómo está estructurado y qué estudio lo edita.

## Qué es

AmoxSQL trabaja siempre sobre archivos reales en tu proyecto — nada queda encerrado en una base de datos opaca. Cada feature del IDE tiene un formato de archivo detrás: el editor edita `.sql`, los notebooks son `.sqlnb`, los gráficos se guardan como `.amoxvis`, los reportes como `.amoxdeck`, y las pipelines visuales como `.sqlchain`. Todos son texto (SQL, JSON, Markdown o YAML), así que puedes versionarlos con Git, editarlos a mano y compartirlos.

Esta página es la referencia de todos ellos. Para el detalle técnico del parser de notebooks, ver `contexto_caracteristicas/formatos_archivo.md` en las docs de desarrollo.

## Resumen

| Formato | Contenido | Estructura | Se edita en |
|---|---|---|---|
| `.sql` | Consulta SQL plana | Texto SQL | [Editor SQL](../editor/sql-editor.md) |
| `.sqlnb` | Notebook (celdas + entorno) | JSON v3.0 | [Notebooks](../notebooks/notebooks.md) |
| `.sqlnb.state.json` | Estado visual del notebook | JSON | Generado (sidecar) |
| `.amoxvis` | Configuración de un gráfico | JSON | [Story Flow](../visualization/story-flow.md) |
| `.amoxdeck` | Deck de presentación | Markdown + front-matter | [Report Flow](../reports/report-flow.md) |
| `.sqlchain` | Pipeline de transformación | JSON (DAG) | [Data Flow](../data-flow/data-flow.md) |
| `RULES.md` | Reglas de IA del proyecto | Markdown | Editor de texto |
| `agent/skills/<id>/SKILL.md` | Skill de IA | Markdown + YAML | [Skills](../ai/skills.md) |
| `context/*` | Contexto de dominio para IA | YAML + Markdown | [Contexto como código](../ai/context-as-code.md) |

## `.sql` — SQL plano

Un archivo de texto con SQL de DuckDB. Es el formato más simple y el que abres por defecto en el [Editor SQL](../editor/sql-editor.md).

| Aspecto | Detalle |
|---|---|
| Contenido | Una o varias sentencias SQL separadas por `;` |
| Estructura | Texto plano (sin metadatos) |
| Se edita en | Editor SQL |
| Gema | Si contiene varias sentencias `;`, AmoxSQL ofrece convertirlo en un Notebook (una celda por sentencia) |

## `.sqlnb` — SQL Notebook

Un notebook: una secuencia de celdas de SQL, Markdown e input, más el entorno (ruta de base de datos y variables). Es el formato de un análisis narrado paso a paso. Ver [Notebooks](../notebooks/notebooks.md).

| Aspecto | Detalle |
|---|---|
| Formato actual | JSON v3.0 |
| Estructura | `{ version, cells[], environment }` |
| Tipos de celda | `code` (SQL), `markdown`, `input` (variable interactiva) |
| Estado embebido | Cada celda `code` puede llevar `state` (resultado, `chartConfig`, `viewMode`, alto) |
| Entorno | `environment.dbPath` y `environment.variables` |
| Compatibilidad | Lee también v2.0 (`type: "sql"`) y el formato legacy con marcadores `-- [CELL:...]`; ambos migran a v3.0 al abrir |
| Límite | Los resultados se truncan a 500 filas al guardar (`state.result.truncated` lo indica) |
| Se edita en | Interfaz de notebook |

## `.sqlnb.state.json` — Sidecar de estado del notebook

Archivo hermano de un `.sqlnb` que guarda el estado visual (resultados, configuración de gráficos, vista activa) por separado, para que el notebook en sí se mantenga "limpio".

| Aspecto | Detalle |
|---|---|
| Nombre | `{nombre}.sqlnb.state.json` (p. ej. `analysis.sqlnb` → `analysis.sqlnb.state.json`) |
| Estructura | `{ version, cells: { <cellId>: { result, chartConfig, viewMode, resultHeight } }, lastModified }` |
| Cuándo se crea | Al ejecutar una celda en un notebook ya guardado en disco |
| Prioridad | Si existe, su estado gana sobre el `state` embebido en el `.sqlnb` — puedes editar el SQL sin perder resultados |
| Se edita en | Generado automáticamente (no se edita a mano) |

## `.amoxvis` — Configuración de gráfico

Todo lo necesario para reconstruir un gráfico: tipo, ejes, títulos, tema de color, formato numérico, líneas de referencia y — clave — la propia consulta que lo alimenta. Un `.amoxvis` es autosuficiente: al abrirlo, AmoxSQL re-ejecuta su `query` y vuelve a dibujar.

| Aspecto | Detalle |
|---|---|
| Estructura | JSON con `chartType`, `xAxisKey`, `yAxisKeys[]`, títulos, `colorTheme`, formato, líneas de referencia y `query` |
| Lleva su consulta | Sí — el campo `query` hace el archivo independiente |
| Tipos de gráfico | `bar`, `bar-stacked`, `bar-horizontal`, `bar-100`, `line`, `area`, `donut`, `scatter`, `bubble`, `combo`, `funnel`, `heatmap`, `treemap` |
| Uso | Standalone, embebido en una celda de notebook (`state.chartConfig`) o referenciado desde un deck |
| Se edita en | [Story Flow](../visualization/story-flow.md) |

## `.amoxdeck` — Deck de Report Flow

Una presentación en formato markdown-first: un bloque de front-matter YAML, seguido de diapositivas separadas por líneas `---`, con directivas de layout y gráficos embebidos.

| Aspecto | Detalle |
|---|---|
| Estructura | Front-matter YAML (`title`, `theme`, `aspect`, variables) + diapositivas |
| Separador de slides | Una línea que contenga solo `---` (se ignora dentro de bloques de código) |
| Layout por slide | Directiva `<!-- layout: NAME -->` en la primera línea (`title`, `content`, `content-chart`, `chart-full`, `two-col`; default `content`) |
| Gráficos | Bloques cercados ` ```amoxchart ` que referencian un `.amoxvis` por ruta (`src: charts/foo.amoxvis`) |
| Exporta a | PowerPoint editable y Word |
| Se edita en | [Report Flow Studio](../reports/report-flow.md) |

## `.sqlchain` — Pipeline de Data Flow

Una pipeline de transformación como grafo dirigido acíclico (DAG): nodos (fuentes, transformaciones, salidas) conectados por aristas. Ver [Data Flow](../data-flow/data-flow.md).

| Aspecto | Detalle |
|---|---|
| Estructura | JSON `{ version, name, description, nodes[], edges[], variables }` |
| Nodo | `{ id, type, label, description, position, config }` |
| Arista | `{ id, source, target }` |
| Modelo | DAG (sin ciclos; se valida al ejecutar) |
| Se edita en | [Data Flow Studio](../data-flow/data-flow.md) |

## `RULES.md` — Reglas de IA del proyecto

Archivo Markdown en la raíz del proyecto con instrucciones de comportamiento que la IA lee al inicio de cada conversación y sigue estrictamente (convenciones de esquema, reglas de negocio, prohibiciones).

| Aspecto | Detalle |
|---|---|
| Ubicación | Raíz del proyecto |
| Formato | Markdown libre (una lista de reglas) |
| Propósito | Comportamiento de la IA (a diferencia de `context/`, que aporta semántica del dominio) |
| Se edita en | Editor de texto · ver [Contexto como código](../ai/context-as-code.md) |

## `agent/skills/<id>/SKILL.md` — Skills de IA

Un skill es un procedimiento reutilizable que la IA puede activar. Cada skill vive en su carpeta `agent/skills/<id>/` con un `SKILL.md` de front-matter YAML + cuerpo Markdown que se inyecta en el system prompt.

| Aspecto | Detalle |
|---|---|
| Ubicación | `agent/skills/<id>/SKILL.md` (proyecto) o el set inicial del sistema |
| Front-matter | `name`, `description`, y opcionalmente `keywords`, `next` |
| Cuerpo | Markdown con el procedimiento; se inyecta cuando el skill está activo |
| Se edita en | Editor de texto · ver [Skills](../ai/skills.md) |

## `context/` — Contexto de dominio para IA

Carpeta opcional (`context/` en la raíz del proyecto, o `.amoxsql/context/`) que enseña a la IA la semántica de tu negocio: métricas, joins, glosario y ejemplos.

| Archivo | Contenido |
|---|---|
| `metrics.yml` | Métricas nombradas: `name`, `sql`, `description`, `grain`, `table` |
| `joins.yml` | Relaciones entre tablas: `from`, `to`, `on`, `type` |
| `glossary.md` | Términos de dominio en Markdown libre |
| `examples/*.sql` | Pares pregunta → SQL (el primer bloque de comentarios es la pregunta) |

Se edita con cualquier editor de texto. Ver [Contexto como código](../ai/context-as-code.md).

## Tips y gemas

- **Todo es texto y versionable:** `.sqlnb`, `.amoxvis`, `.amoxdeck` y `.sqlchain` son JSON/Markdown/YAML — ideales para Git y para revisar diffs.
- **El `.amoxvis` es portátil:** como lleva su propia `query`, puedes moverlo entre proyectos y sigue funcionando mientras exista la tabla que consulta.
- **El sidecar te protege:** editar el SQL de un notebook no borra tus resultados porque viven en el `.sqlnb.state.json`.
- **`RULES.md` vs `context/`:** el primero dice *cómo comportarse*; el segundo dice *qué significan las cosas*.

## Relacionado

- [Editor SQL](../editor/sql-editor.md) · [Notebooks](../notebooks/notebooks.md) · [Story Flow](../visualization/story-flow.md)
- [Report Flow](../reports/report-flow.md) · [Data Flow](../data-flow/data-flow.md)
- [Contexto como código](../ai/context-as-code.md) · [Skills](../ai/skills.md) · [Configuración](configuration.md)
