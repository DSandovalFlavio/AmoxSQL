# AmoxSQL — Context-as-Code: Semantic Layer Local

> Cómo enseñar al AI sobre el dominio de negocio del proyecto usando archivos versionables.  
> Implementado en: `server/ai/contextLoader.js`, `server/ai/prompt/index.js`

---

## ¿Qué es el Context-as-Code?

El AI de AmoxSQL ve los schemas de las tablas (nombres de columnas, tipos de datos) pero no sabe qué significan en términos de negocio. Sin contexto adicional:

- "Revenue" podría ser `orders.total`, `payments.amount`, `invoices.value` — el AI adivina.
- Un JOIN entre `orders` y `customers` puede ser por `customer_id`, `user_id` o `email` — el AI puede equivocarse.
- "MAU" no existe en ningún nombre de columna — el AI no sabe calcularlo.

La carpeta `context/` resuelve esto: el desarrollador o analista define métricas, relaciones y glosario en archivos YAML/Markdown que el AI lee automáticamente al inicio de cada conversación.

---

## Estructura de la Carpeta

```
{raíz del proyecto}/
└── context/
    ├── metrics.yml          ← definiciones de métricas de negocio
    ├── joins.yml            ← relaciones canónicas entre tablas
    ├── glossary.md          ← glosario de términos del dominio
    └── examples/
        ├── monthly_revenue.sql   ← par (pregunta, SQL canónico)
        └── cohort_retention.sql
```

Todos los archivos son **opcionales**. Si la carpeta no existe, el AI funciona sin contexto adicional.

---

## Cómo se Carga (Flujo Técnico)

```
Al iniciar una conversación AI:
  agenticLoop.js
    └── loadProjectContext(ROOT_DIR)     ← server/ai/contextLoader.js
         ├── Lee context/metrics.yml     → parseMetrics()
         ├── Lee context/joins.yml       → parseJoins()
         ├── Lee context/glossary.md     → string crudo
         └── Lee context/examples/*.sql  → parseExampleFile()
              └── Retorna: { metrics[], joins[], glossary, examples[] }

  buildSystemPrompt(options)             ← server/ai/prompt/index.js
    └── buildProjectContextSection(ctx)  ← server/ai/contextLoader.js
         └── Genera sección markdown inyectada al system prompt:
              ## Project Semantic Context
              ### Business Metrics
              **revenue** — ...SQL: `SUM(amount)...`
              ### Canonical Joins
              - `orders` → `customers`: LEFT JOIN ON orders.customer_id = customers.id
              ### Domain Glossary
              ...
              ### Example Queries
              **Q: What is the monthly revenue?**
              ```sql ... ```
```

El AI recibe este contexto como parte de sus instrucciones iniciales, antes de que el usuario escriba el primer mensaje.

---

## `context/metrics.yml` — Métricas de Negocio

Define cómo calcular cada métrica. El AI usa `lookup_metric` para encontrar la definición antes de escribir SQL.

```yaml
metrics:
  - name: revenue
    sql: "SUM(amount) FILTER (WHERE status = 'paid')"
    description: Total paid revenue. Excludes refunds and test orders.
    grain: order
    table: orders

  - name: gmv
    sql: "SUM(subtotal)"
    description: Gross Merchandise Value - all orders regardless of status
    grain: order
    table: orders

  - name: mau
    sql: "COUNT(DISTINCT user_id)"
    description: Monthly Active Users - any event in the 30-day window
    grain: user
    table: events

  - name: arpu
    sql: "SUM(amount) FILTER (WHERE status = 'paid') / NULLIF(COUNT(DISTINCT customer_id), 0)"
    description: Average Revenue Per User
    grain: customer
    table: orders
```

**Buenas prácticas:**
- La expresión `sql` debe ser autónoma (sin alias ni CTEs).
- Incluir en `description` qué casos excluye (refunds, test data, nulls).
- Usar `grain` para indicar el nivel de deduplicación esperado.

---

## `context/joins.yml` — Joins Canónicos

Define las relaciones correctas entre tablas. Evita que el AI intente adivinar columnas de join.

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

  - from: events
    to: users
    on: "events.user_id = users.id"
    type: LEFT

  - from: orders
    to: payments
    on: "orders.id = payments.order_id AND payments.status = 'confirmed'"
    type: LEFT
```

**Nota:** La condición `on` puede incluir condiciones adicionales (no solo igualdad). Esto es útil para joins con filtros que siempre aplican.

---

## `context/glossary.md` — Glosario del Dominio

Markdown libre que define términos que el AI debe conocer para interpretar preguntas correctamente.

```markdown
## Términos de Negocio

**Revenue**: Suma de `orders.amount` donde `status = 'paid'`. No incluye:
- Pedidos en estado `refunded` o `cancelled`
- Pedidos de prueba donde `customer_id IN (1, 2, 3)`

**Active User**: Usuario con al menos 1 evento en los últimos 30 días.
Columna: `events.user_id`. Ventana: rodante de 30 días desde CURRENT_DATE.

**Churn**: Usuario sin actividad en >90 días tras haber tenido actividad.
Calcular como: usuarios activos en período T-1 que no aparecen en período T.

**SKU**: `products.sku` — identificador único de variante de producto.
Un producto puede tener múltiples SKUs (tallas, colores).

## Convenciones Técnicas

- Todos los timestamps (`created_at`, `updated_at`) están en UTC.
- `amount` siempre en centavos MXN. Dividir entre 100 para mostrar en pesos.
- El schema `analytics` contiene las tablas limpias; `raw` contiene datos sin procesar.
- Usar siempre `analytics.*` en queries analíticas.
```

---

## `context/examples/*.sql` — Ejemplos de Queries

Pares (pregunta → SQL canónico) que el AI usa como referencia cuando hay preguntas similares.

**Convención del archivo:**
- Las primeras líneas de comentario (`--` o `/* */`) son la pregunta en lenguaje natural.
- El resto del archivo es el SQL canónico.

```sql
-- What is the monthly revenue trend for the last 12 months?
-- Breakdown by month with month-over-month growth rate.
SELECT
    DATE_TRUNC('month', created_at)                      AS month,
    SUM(amount) FILTER (WHERE status = 'paid')           AS revenue,
    LAG(SUM(amount) FILTER (WHERE status = 'paid')) OVER (
        ORDER BY DATE_TRUNC('month', created_at)
    )                                                     AS prev_revenue,
    ROUND(
        100.0 * (
            SUM(amount) FILTER (WHERE status = 'paid') -
            LAG(SUM(amount) FILTER (WHERE status = 'paid')) OVER (ORDER BY DATE_TRUNC('month', created_at))
        ) / NULLIF(LAG(SUM(amount) FILTER (WHERE status = 'paid')) OVER (ORDER BY DATE_TRUNC('month', created_at)), 0),
        1
    )                                                     AS mom_growth_pct
FROM orders
WHERE created_at >= CURRENT_DATE - INTERVAL 12 MONTHS
GROUP BY 1
ORDER BY 1;
```

El AI busca ejemplos relevantes con la tool `find_example` antes de escribir SQL nuevo.

---

## `RULES.md` — Reglas de Comportamiento

Archivo en la raíz del proyecto (no dentro de `context/`). Define cómo debe comportarse el AI en este proyecto específico.

**Diferencia clave:**
- `context/` → "Qué significan los datos" (métricas, relaciones, términos)
- `RULES.md` → "Cómo debe actuar el AI" (convenciones, restricciones, preferencias)

```markdown
# Reglas del Proyecto

## Queries
- Siempre usar schema `analytics.*` — nunca `raw.*` salvo que se pida explícitamente
- Preferir CTEs sobre subqueries cuando hay más de 2 joins
- Siempre incluir `LIMIT 1000` en queries exploratorias para evitar escaneos completos

## Seguridad
- No sugerir `DROP`, `DELETE` ni `TRUNCATE` — proponer alternativas (soft delete, archivado)
- No exponer columnas PII (`email`, `phone`, `name`) en resultados por defecto

## Negocio
- `amount` está en centavos — siempre dividir entre 100 en la presentación final
- Los "pedidos de prueba" tienen `customer_id IN (1, 2, 3)` — excluirlos en métricas
- Cuando el usuario diga "últimos N meses", usar meses calendario completos
```

---

## `agent/skills/*.md` — Skills del Agente

Skills que agregan instrucciones especializadas al AI para tareas específicas. El usuario las activa desde la UI del chat.

**Formato:**
```markdown
---
name: Explore First
description: Forces careful schema inspection before writing SQL
---

# Explore First

Before writing SQL on any table you haven't explicitly profiled:

1. `list_tables` — confirm the exact table name exists
2. `describe_table` — get exact column names and types
3. `SELECT * FROM <table> LIMIT 5` — see real data values  
4. `profile_data` — understand distributions, nulls, data quality
5. Only then write your analytical query

**Never skip step 2** — column name mismatches are the #1 cause of failures.
```

**Dónde buscar skills:**
1. Directorio del proyecto: `{proyecto}/agent/skills/*.md`
2. Templates del sistema: `templates/agent/skills/*.md` (incluidas en la app)

---

## UI — Settings > AI Context Tab

La tab "AI Context" en Settings (`stg-ctx-*`) permite:

1. **Ver el estado actual:** si existe `context/`, muestra qué archivos están configurados y cuáles faltan.
2. **Crear desde templates:** botón "Create Context Folder" genera la estructura básica con ejemplos de `metrics.yml`, `joins.yml`, `glossary.md` y 2 ejemplos SQL.
3. **Seleccionar archivos:** checklist para elegir qué archivos incluir al crear.

**Endpoints relacionados:**
- `GET /api/ai/context-status` → estado actual del contexto del proyecto
- `POST /api/ai/context-setup` → crear la carpeta y archivos seleccionados

---

## Tools Relacionadas

### `lookup_metric`

Busca la definición de una métrica en `context/metrics.yml`:

```
Input: { name: "revenue" }
Output: {
  name: "revenue",
  sql: "SUM(amount) FILTER (WHERE status = 'paid')",
  description: "Total paid revenue",
  grain: "order",
  table: "orders"
}
```

El AI debe llamar `lookup_metric` antes de escribir SQL con métricas de negocio.

### `find_example`

Busca ejemplos relevantes en `context/examples/*.sql` por palabras clave:

```
Input: { query: "monthly revenue trend" }
Output: [
  {
    question: "What is the monthly revenue trend for the last 12 months?",
    sql: "SELECT DATE_TRUNC('month', created_at) AS month...",
    file: "monthly_revenue.sql",
    score: 0.85
  }
]
```

El AI usa estos ejemplos como referencia para escribir SQL similar.

---

## Impacto en Accuracy

Con `context/` configurado correctamente:

| Pregunta | Sin context/ | Con context/ |
|---------|-------------|-------------|
| "¿Cuál fue el revenue del Q3?" | Puede usar la columna equivocada o definición incorrecta | Usa la SQL de `metrics.yml` exactamente |
| "Muéstrame clientes con sus pedidos" | Puede adivinar el JOIN incorrectamente | Usa el join de `joins.yml` con `LEFT JOIN ON orders.customer_id = customers.id` |
| "¿Qué es el MAU en junio?" | No sabe qué es MAU | Lee la definición del glosario y calcula correctamente |
| "¿Cómo calculo la retención?" | Puede inventar un approach | Encuentra el ejemplo `cohort_retention.sql` y lo adapta |
