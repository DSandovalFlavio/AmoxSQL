# AmoxSQL — Formatos de Archivo Propios

> Referencia completa de todos los formatos de archivo que AmoxSQL lee, escribe o interpreta.  
> Parser principal: `client/src/utils/notebookParser.js`

---

## 1. `.sqlnb` — SQL Notebook

### Formato Actual: v3.0 (JSON)

Los notebooks son archivos JSON con extensión `.sqlnb`. El estado visual (resultados, charts) puede estar embebido en el JSON (v3.0) o en un sidecar separado.

```json
{
  "version": "3.0",
  "cells": [
    {
      "id": "cell_abc123",
      "type": "code",
      "content": "SELECT * FROM orders LIMIT 10",
      "state": {
        "result": {
          "data": [{ "order_id": 1, "amount": 150.0, "status": "paid" }],
          "columns": [
            { "name": "order_id", "type": "BIGINT" },
            { "name": "amount",   "type": "DOUBLE" },
            { "name": "status",   "type": "VARCHAR" }
          ],
          "rowCount": 10,
          "totalRows": 50000,
          "truncated": true,
          "executionTime": 234
        },
        "chartConfig": {
          "chartType": "bar",
          "xAxisKey": "status",
          "yAxisKeys": ["amount"]
        },
        "viewMode": "chart",
        "resultHeight": 350
      }
    },
    {
      "id": "cell_def456",
      "type": "markdown",
      "content": "## Análisis de Ventas\n\nEl 60% de los pedidos están en estado `paid`."
    },
    {
      "id": "cell_ghi789",
      "type": "input",
      "content": "",
      "inputConfig": {
        "label": "Fecha inicio",
        "variable": "start_date",
        "defaultValue": "2024-01-01",
        "inputType": "date"
      }
    }
  ],
  "environment": {
    "dbPath": "/path/to/data.duckdb",
    "variables": {
      "start_date": "2024-01-01"
    }
  }
}
```

### Campos de una Celda

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `id` | string | ✅ | Identificador único (`cell_{random}`) |
| `type` | `"code"` \| `"markdown"` \| `"input"` | ✅ | Tipo de celda |
| `content` | string | ✅ | SQL, markdown, o vacío para inputs |
| `state` | object | ❌ | Estado visual (solo celdas `code`) |
| `state.result` | object | ❌ | Resultado de la última ejecución |
| `state.chartConfig` | object | ❌ | Config del gráfico (ver formato `.amoxvis`) |
| `state.viewMode` | `"table"` \| `"chart"` | ❌ | Vista activa al abrir |
| `state.resultHeight` | number | ❌ | Altura del panel de resultados en px |
| `inputConfig` | object | ❌ | Solo para celdas `input` |

**Límite de serialización:** Los resultados se truncan a 500 filas al guardar en `.sqlnb`. Esto mantiene el archivo en un tamaño razonable. `state.result.truncated` indica si hay más filas disponibles.

### Formato Legacy: v2.0 (JSON anterior)

```json
{
  "version": "2.0",
  "cells": [
    { "id": "c1", "type": "sql", "content": "SELECT 1" }
  ]
}
```

Diferencias: `type: "sql"` en lugar de `"code"`, sin campo `state` embebido, sin `environment`.

`notebookParser.js` detecta ambas versiones y migra automáticamente a v3.0 al parsear.

### Formato Legacy: marker-based (pre-v2.0)

El formato más antiguo usaba marcadores de texto plano:
```
-- [CELL:sql]
SELECT * FROM orders
-- [/CELL]
-- [CELL:markdown]
## Title
-- [/CELL]
```

También soportado por el parser — migra a v3.0 automáticamente.

---

## 2. `.sqlnb.state.json` — Sidecar State

Archivo hermano del `.sqlnb` que persiste el estado visual sin modificar el notebook principal. Permite que el notebook sea "limpio" mientras el estado visual se guarda por separado.

**Nombre:** `{mismo-nombre}.sqlnb.state.json`  
**Ejemplo:** `analysis.sqlnb` → `analysis.sqlnb.state.json`

```json
{
  "version": "1.0",
  "cells": {
    "cell_abc123": {
      "result": {
        "data": [...],
        "columns": [...],
        "rowCount": 10,
        "executionTime": 234
      },
      "chartConfig": { "chartType": "line", "xAxisKey": "month" },
      "viewMode": "chart",
      "resultHeight": 400
    },
    "cell_def456": {
      "viewMode": "table"
    }
  },
  "lastModified": "2026-05-01T12:34:56.000Z"
}
```

**Cuándo se crea:** Al ejecutar una celda en un notebook que ya está guardado en disco.

**Prioridad:** Al abrir un notebook, si existe el sidecar, su estado tiene prioridad sobre el estado embebido en el `.sqlnb`. Esto permite editar el SQL del notebook sin perder los resultados del sidecar.

---

## 3. `.amoxvis` — Chart Configuration

Archivo JSON que guarda la configuración completa de un gráfico. Se puede usar standalone (guardado desde ResultsTable "Save chart config") o embebido en `state.chartConfig` dentro de un `.sqlnb`.

```json
{
  "chartType": "bar",
  "xAxisKey": "mes",
  "yAxisKeys": ["ventas", "margen"],
  "rightYAxisKey": null,
  "splitByKey": null,
  "bubbleSizeKey": null,

  "chartTitle": "Ventas Mensuales 2024",
  "chartSubtitle": "Crecimiento sostenido Q3-Q4",
  "chartFootnote": "Fuente: ERP · Actualizado 2026-05-01",
  "textAlign": "left",

  "colorTheme": "ocean",
  "backgroundTone": "transparent",
  "fontFamily": "Inter",
  "textScale": 1.0,

  "showLabels": true,
  "dataLabelPosition": "top",
  "dataLabelSize": 12,
  "tooltipShowPercent": false,
  "showPercentages": false,

  "numberFormat": "compact",
  "decimalPlaces": 1,

  "gridMode": "y",
  "showAxisLines": false,
  "yLogScale": false,
  "yAxisDomain": null,
  "xAxisLabelAngle": 0,
  "xAxisTitle": "",
  "yAxisTitle": "Ventas (MXN)",

  "lineType": "monotone",
  "lineAreaFill": false,
  "showDots": true,
  "isCumulative": false,

  "barRadius": 4,
  "barStackMode": "none",

  "donutThickness": 60,

  "scatterQuadrants": false,

  "dateAggregation": "month",
  "sortMode": "none",
  "limit": 100,

  "legendPosition": "bottom",

  "refLine": { "axis": "y", "value": 25000, "label": "Meta", "color": "#ff4444" },
  "goalLine": { "value": 30000, "label": "Objetivo anual", "color": "#22c55e" },
  "trendLine": true,

  "query": "SELECT mes, ventas, margen FROM reporte_mensual ORDER BY mes"
}
```

### Tipos de Gráfico Disponibles

`bar`, `bar-stacked`, `bar-horizontal`, `bar-100`, `line`, `area`, `donut`, `scatter`, `bubble`, `combo`, `funnel`, `heatmap`, `treemap`

### Temas de Color Disponibles

`default`, `vivid`, `set1`, `set2`, `pastel`, `dark2`, `blues`, `greens`, `reds`, `purples`, `ocean`, `sunset`, `corporate`, `neon`

---

## 4. `context/` — Carpeta de Contexto AI

Carpeta opcional en la raíz del proyecto que enseña al AI sobre el dominio de negocio. Ver doc completo en [`contexto_codigo_ai.md`](contexto_codigo_ai.md).

### Estructura

```
{proyecto}/
└── context/
    ├── metrics.yml
    ├── joins.yml
    ├── glossary.md
    └── examples/
        ├── monthly_revenue.sql
        └── cohort_retention.sql
```

### `context/metrics.yml`

```yaml
metrics:
  - name: revenue
    sql: "SUM(amount) FILTER (WHERE status = 'paid')"
    description: Total paid revenue (excludes refunds and test orders)
    grain: order
    table: orders

  - name: mau
    sql: "COUNT(DISTINCT user_id)"
    description: Monthly Active Users (any event in the period)
    grain: user
    table: events
```

Campos por métrica:

| Campo | Requerido | Descripción |
|-------|-----------|-------------|
| `name` | ✅ | Nombre de la métrica (usado por `lookup_metric`) |
| `sql` | ✅ | Expresión SQL (puede ser cualquier agregación) |
| `description` | ❌ | Qué mide, qué excluye |
| `grain` | ❌ | Nivel de granularidad (`order`, `user`, `event`) |
| `table` | ❌ | Tabla principal donde se aplica |

### `context/joins.yml`

```yaml
joins:
  - from: orders
    to: customers
    on: "orders.customer_id = customers.id"
    type: LEFT

  - from: orders
    to: products
    on: "orders.product_id = products.id"
    type: INNER
```

Campos:

| Campo | Requerido | Descripción |
|-------|-----------|-------------|
| `from` | ✅ | Tabla origen |
| `to` | ✅ | Tabla destino |
| `on` | ✅ | Condición de join (columnas exactas) |
| `type` | ❌ | `INNER`, `LEFT`, `RIGHT` (default: `INNER`) |

### `context/glossary.md`

Markdown libre que define términos del dominio:

```markdown
## Términos de Negocio

**Revenue**: Suma de `amount` donde `status = 'paid'`. No incluye reembolsos
ni pedidos de prueba (`customer_id IN (1, 2, 3)`).

**Active User**: Usuario que disparó al menos un evento en el período.
Columna: `events.user_id`, período: ventana de 30 días.

**Churn**: Usuario que no ha tenido actividad en >90 días tras haberla tenido.
```

### `context/examples/*.sql`

Pares pregunta → SQL. El primer bloque de comentarios es la pregunta; el resto es el SQL:

```sql
-- What is the monthly revenue trend for the last 12 months?
SELECT
    DATE_TRUNC('month', created_at) AS month,
    SUM(amount) FILTER (WHERE status = 'paid') AS revenue
FROM orders
WHERE created_at >= CURRENT_DATE - INTERVAL 12 MONTHS
GROUP BY 1
ORDER BY 1;
```

---

## 5. `RULES.md` — Reglas de Comportamiento del AI

Archivo Markdown en la raíz del proyecto. El AI lo lee al inicio de cada conversación y sigue las instrucciones estrictamente.

```markdown
# Reglas del Proyecto

- Siempre usar el schema `analytics` al queryear tablas (ej: `analytics.orders`)
- La columna `ts` está siempre en UTC. Convertir a local con `AT TIME ZONE 'America/Mexico_City'`
- Revenue excluye pedidos de prueba donde `customer_id IN (1, 2, 3)`
- Preferir CTEs sobre subqueries para queries de más de 2 joins
- No sugerir operaciones DROP, DELETE ni TRUNCATE
- El campo `amount` está en centavos MXN — dividir entre 100 para mostrar en pesos
```

**Diferencia con `context/`:**

| | `RULES.md` | `context/` |
|---|---|---|
| Propósito | Comportamiento del AI | Semántica del dominio |
| Formato | Markdown libre | YAML + Markdown estructurado |
| Ejemplo | "Usar schema analytics" | "revenue = SUM(amount) WHERE status='paid'" |

---

## 6. `agent/skills/*.md` — Skills del Agente

Skills que el usuario puede activar para dar instrucciones adicionales al AI. Se cargan desde el directorio `agent/skills/` del proyecto o de las templates del sistema.

**Formato: YAML frontmatter + Markdown body:**

```markdown
---
name: Explore First
description: Enforces iterative schema probing before writing SQL
---

# Explore First

Before writing any analytical SQL on a table you haven't profiled this session:

1. Call `list_tables` to confirm the exact table name
2. Call `describe_table` to get exact column names and types
3. Run `SELECT * FROM <table> LIMIT 5` to see real data values
4. Call `profile_data` to understand distributions and nulls
5. Only then write your analytical query

**Never skip step 2** — column name mismatches cause query failures.
```

**Campos del frontmatter:**

| Campo | Requerido | Descripción |
|-------|-----------|-------------|
| `name` | ✅ | Nombre mostrado en la UI |
| `description` | ✅ | Una línea describiendo qué hace el skill |

El body markdown se inyecta directamente en el system prompt cuando el skill está activo.
