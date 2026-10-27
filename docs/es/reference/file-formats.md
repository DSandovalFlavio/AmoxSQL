# Formatos de archivo

**🌐 [English](../../en/reference/file-formats.md) · Español**

> Referencia de cada formato de archivo que AmoxSQL lee, escribe o interpreta: qué guarda, cómo está estructurado y qué estudio lo edita.

## Qué es

AmoxSQL trabaja siempre sobre archivos reales en tu proyecto — nada queda encerrado en una base de datos opaca. Cada feature del IDE tiene un formato de archivo detrás: el editor edita `.sql`, los cuadernos son `.sqlnb`, los gráficos se guardan como `.amoxvis`, los reportes como `.amoxdeck`, y las pipelines visuales como `.sqlchain`. Todos son texto (SQL, JSON, Markdown o YAML), así que puedes versionarlos con Git, editarlos a mano y compartirlos.

Esta página es la referencia de todos ellos. Para el detalle técnico del parser de notebooks, ver `contexto_caracteristicas/formatos_archivo.md` en las docs de desarrollo.

## Resumen

| Formato | Contenido | Estructura | Se edita en |
|---|---|---|---|
| `.sql` | Consulta SQL plana | Texto SQL | [Editor SQL](../editor/sql-editor.md) |
| `.sqlnb` | Cuaderno (celdas + parámetros) | Markdown con cabecera | [Cuadernos](../notebooks/notebooks.md) |
| `.sqlnb.state.json` | Estado visual del cuaderno | JSON | Generado (al lado) |
| `.amoxvis` | Un gráfico, con su consulta | JSON (Vega-Lite) | [Story Flow](../visualization/story-flow.md) |
| `.amoxdeck` | Deck de presentación | Markdown + front-matter | [Report Flow](../reports/report-flow.md) |
| `.sqlchain` | Pipeline de transformación | JSON (DAG) | [Data Flow](../data-flow/data-flow.md) |
| `.amoxproject` | Un proyecto en un archivo, o una plantilla | ZIP con `amoxproject.json` | [Proyectos](../user-guide/projects-and-connections.md) |
| `.amoxcanvas` | Canvas: tarjetas conectadas, con su foto | JSON | [Canvas](../notebooks/canvas.md) |
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

Un cuaderno: una secuencia de celdas de SQL y de texto, más los parámetros. Es **markdown con cabecera**, no JSON: se lee tal cual en cualquier editor y los cambios se revisan en un diff como cualquier otro texto. Ver [Cuadernos](../notebooks/notebooks.md).

| Aspecto | Detalle |
|---|---|
| Formato actual | Markdown con front-matter |
| Cabecera | `titulo` y `parametros` (pares `nombre: valor`) |
| Celda de SQL | Un bloque cercado ` ```sql `, precedido de `<!-- celda: nombre -->` si tiene nombre |
| Celda de texto | Markdown a secas, entre bloques |
| El nombre de la celda | Es el de la vista temporal que deja puesta al ejecutarse |
| Compatibilidad | Lee también JSON v3.0, v2.0 y el formato de marcadores `-- !CELL:CODE!`; los tres se guardan ya en el formato nuevo, y las celdas `input` pasan a ser parámetros de la cabecera |
| Lo que NO guarda | Resultados ni configuración de gráficos: eso vive en el archivo de estado |
| Se edita en | La interfaz del cuaderno |

```markdown
---
parametros:
  desde: 2026-09-01
---

# Caída de septiembre

<!-- celda: ventas_limpias -->
```sql
-- Quito devoluciones
SELECT * FROM ventas WHERE NOT devuelta AND f >= {{desde}};
```
```

## `.sqlnb.state.json` — Sidecar de estado del notebook

Archivo hermano de un `.sqlnb` que guarda el estado visual (resultados, configuración de gráficos, vista activa) por separado, para que el notebook en sí se mantenga "limpio".

| Aspecto | Detalle |
|---|---|
| Nombre | `{nombre}.sqlnb.state.json` (p. ej. `analysis.sqlnb` → `analysis.sqlnb.state.json`) |
| Estructura | `{ version, cells: { <cellId>: { result, chartConfig, viewMode, resultHeight } }, lastModified }` |
| Cuándo se crea | Al ejecutar una celda en un notebook ya guardado en disco |
| Prioridad | Si existe, su estado gana sobre el `state` embebido en el `.sqlnb` — puedes editar el SQL sin perder resultados |
| Se edita en | Generado automáticamente (no se edita a mano) |

## `.amoxvis` — Gráfico (Vega-Lite)

Un gráfico de AmoxSQL **es un spec de Vega-Lite válido** (esquema v6), así que no queda encerrado en AmoxSQL: cualquier herramienta que lea Vega-Lite lo dibuja. Lo que es solo de AmoxSQL va en `usermeta.amoxsql`, el campo que Vega-Lite reserva para metadatos de la aplicación y que los demás ignoran.

```json
{
  "$schema": "https://vega.github.io/schema/vega-lite/v6.json",
  "title": { "text": "Los 10 productos que más venden", "subtitle": "2024, en pesos" },
  "data": { "name": "dataset" },
  "mark": "bar",
  "encoding": { "y": { "field": "producto", "type": "nominal" }, "x": { "field": "venta", "type": "quantitative" } },
  "usermeta": { "amoxsql": { "version": 2, "modo": "interfaz", "consulta": "SELECT …", "interfaz": { "chartType": "bar-horizontal" } } }
}
```

| Aspecto | Detalle |
|---|---|
| Estructura | Vega-Lite v6 (`$schema`, `title`, `data`, `mark`/`layer`, `encoding`, `transform`…) + `usermeta.amoxsql` |
| Los datos | Por nombre: `"data": {"name": "dataset"}`. AmoxSQL los llena con el resultado de la consulta |
| Lleva su consulta | Sí — `usermeta.amoxsql.consulta`; `origen` si salió de un `.sql` guardado |
| `modo` | `interfaz`: los paneles de Story Flow (en `interfaz`, solo lo que difiere de fábrica) generan el spec al abrir. `codigo`: el spec escrito a mano es la figura |
| Mapa de rectángulos | Se guarda como spec de **Vega** (`$schema` de Vega): Vega-Lite no tiene diseño jerárquico |
| Formato anterior | La configuración plana de antes (`chartType`, `xAxisKey`, `query`…) se sigue abriendo y se guarda en el formato nuevo |
| Uso | Standalone, embebido en una celda de notebook (`state.chartConfig`) o referenciado desde un deck |
| Se edita en | [Story Flow](../visualization/story-flow.md) — con los paneles o directamente en código |

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

Carpeta opcional (`context/` en la raíz del proyecto; la del workspace, en su `Contexto`) que enseña a la IA la semántica de tu negocio: métricas, joins, glosario y ejemplos.

| Archivo | Contenido |
|---|---|
| `metrics.yml` | Métricas nombradas: `name`, `sql`, `description`, `grain`, `table` |
| `joins.yml` | Relaciones entre tablas: `from`, `to`, `on`, `type` |
| `glossary.md` | Términos de dominio en Markdown libre |
| `examples/*.sql` | Pares pregunta → SQL (el primer bloque de comentarios es la pregunta) |

Se edita con cualquier editor de texto. Ver [Contexto como código](../ai/context-as-code.md).

## Tips y gemas

- **Todo es texto y versionable:** `.sqlnb`, `.amoxvis`, `.amoxdeck` y `.sqlchain` son Markdown/JSON/YAML — ideales para Git y para revisar diffs. El cuaderno además es markdown legible, así que un diff enseña el análisis y no una llave de JSON.
- **El `.amoxvis` es portátil:** como lleva su propia `query`, puedes moverlo entre proyectos y sigue funcionando mientras exista la tabla que consulta.
- **El estado va aparte:** el modo de cada celda y la configuración de sus gráficos viven en el `.sqlnb.state.json`, no en el documento. Son de quien mira, no del análisis.
- **`RULES.md` vs `context/`:** el primero dice *cómo comportarse*; el segundo dice *qué significan las cosas*.

## Relacionado

- [Editor SQL](../editor/sql-editor.md) · [Notebooks](../notebooks/notebooks.md) · [Story Flow](../visualization/story-flow.md)
- [Report Flow](../reports/report-flow.md) · [Data Flow](../data-flow/data-flow.md)
- [Contexto como código](../ai/context-as-code.md) · [Skills](../ai/skills.md) · [Configuración](configuration.md)
