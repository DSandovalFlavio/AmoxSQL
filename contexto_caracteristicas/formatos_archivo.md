# AmoxSQL — Formatos de Archivo Propios

> Referencia completa de todos los formatos de archivo que AmoxSQL lee, escribe o interpreta.  
> Lector y escritor del cuaderno: `client/src/utils/cuadernoFile.js`

---

## 1. `.sqlnb` — El cuaderno

### Markdown con cabecera

El cuaderno **no es JSON**. Es markdown con front-matter, y eso es deliberado: se lee tal
cual en cualquier editor, y un diff de Git enseña el análisis en vez de llaves.

```markdown
---
titulo: Caída de septiembre
parametros:
  desde: 2026-09-01
  hasta: 2026-09-30
---

# ¿Por qué cayeron las ventas?

Contexto del análisis.

<!-- celda: ventas_limpias -->
```sql
-- Quito devoluciones
SELECT * FROM ventas WHERE NOT devuelta AND f >= {{desde}};
```

<!-- celda: por_region materializada -->
```sql
-- Gasto por región
SELECT region, sum(importe) AS total FROM ventas_limpias GROUP BY region;
```
```

| Pieza | Qué es |
|---|---|
| Front-matter | `titulo` y `parametros` (pares `nombre: valor`, un solo nivel) |
| `<!-- celda: nombre -->` | El nombre de la celda, que es **el de la vista temporal que deja puesta** |
| ` materializada` | Detrás del nombre: la celda deja una tabla temporal en vez de una vista |
| Bloque ` ```sql ` | Una celda de SQL |
| Markdown suelto | Una celda de texto |

**Lo que el archivo NO guarda:** resultados, configuración de gráficos ni modo de vista. Eso
va en el archivo de estado, porque es de quien mira y no del análisis.

### Parámetros

`{{nombre}}`, la misma convención que los tableros `.amoxdeck`, con la misma función de
sustitución (`injectEnvironmentVariables`). Un texto entra **entrecomillado** y un número tal
cual, así que se escribe `f >= {{desde}}`.

No confundir con `${...}`, que son las variables del editor de consultas y tienen su propio
panel. Que el producto arrastre dos convenciones es un lío heredado; el cuaderno se queda con
la suya porque cambiarla rompería en silencio los archivos guardados.

### Formatos anteriores

`leerCuaderno` reconoce y lee tres formatos viejos, y los **guarda ya en el nuevo**:

| Formato | Cómo se reconoce | Qué pasa al abrirlo |
|---|---|---|
| JSON v3.0 | `{ version, cells[], environment }` | Las celdas `input` pasan a `parametros` de la cabecera |
| JSON v2.0 | `type: "sql"` en vez de `"code"` | Igual |
| Marcadores | `-- !CELL:CODE!` / `-- !CELL:MARKDOWN!` | Igual |

Las celdas de código de esos formatos **no tenían nombre**, así que salen sin él y se
bautizan (`paso_N`) la primera vez que se ejecutan.

---

## 2. `.sqlnb.state.json` — El estado visual

Archivo hermano del `.sqlnb` que guarda **lo que es de quien mira, no del análisis**: el modo
de cada celda, el reparto entre editor y resultado, y la configuración de su gráfico.

**Nombre:** `{mismo-nombre}.sqlnb.state.json` — `analisis.sqlnb` → `analisis.sqlnb.state.json`

```json
{
  "celdas": {
    "n:ventas_limpias": {
      "modo": "ambos",
      "reparto": 0.5,
      "vista": "chart",
      "grafico": { "chartType": "bar", "xAxisKey": "region" }
    },
    "p:2": { "modo": "resultado" }
  }
}
```

### La clave no es el identificador, y eso importa

`n:nombre` cuando la celda tiene nombre; `p:posición` mientras no lo tenga.

**No puede ser el `id` de la celda**, aunque sea lo natural: el identificador se genera al
leer el archivo, así que cambia en cada apertura y el estado guardado quedaría huérfano —el
gráfico configurado hoy aparecería mañana como una tabla, sin error y sin causa visible—.

Como la posición se usa cuando no hay nombre, **añadir, borrar, mover y renombrar reescriben
el mapa** (`reclavar` en `claves.js`). Sin eso, mover una celda una fila hacia arriba le daría
el gráfico de su vecina, que es exactamente lo que hacía la notebook anterior.

### El endpoint reescribe el archivo entero

`POST /api/notebook-state` **no fusiona**. El cuaderno guarda lo suyo bajo `celdas`, pero el
mismo archivo puede llevar el `cells` de la notebook anterior: quien escriba tiene que
conservar lo que no es suyo, o borrará del disco el trabajo de otro.

---

## 3. `.amoxvis` — Chart Configuration

Archivo JSON que guarda la configuración completa de un gráfico. Se puede usar standalone (guardado desde ResultsTable "Save chart config") o referenciado desde el estado de una celda de cuaderno.

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
