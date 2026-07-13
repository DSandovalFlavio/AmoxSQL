# Contexto como código

**🌐 [English](../../en/ai/context-as-code.md) · Español**

> La capa semántica de tu proyecto: unos archivos versionables que le enseñan a la IA qué significan tus datos, cómo se unen tus tablas y qué quiere decir "revenue" en tu negocio — para que responda con exactitud a *tu* realidad, no a una genérica.

<!-- 📷 CAPTURE: docs/images/ai/context-folder.png — Ajustes → IA, tab de contexto: estado de la carpeta context/ con metrics.yml, joins.yml, glossary.md y examples marcados -->

## Qué es

La IA ve el esquema de tus tablas (nombres de columna, tipos) pero **no sabe qué significan en términos de negocio**. Sin ayuda, "revenue" podría ser `orders.total`, `payments.amount` o `invoices.value` — y adivina. Un JOIN entre `orders` y `customers` podría ir por `customer_id`, `user_id` o `email`. "MAU" no existe como columna en ningún lado.

El **contexto como código** resuelve esto con una carpeta `context/` en la raíz de tu proyecto donde defines métricas, joins canónicos y un glosario en archivos YAML/Markdown. La IA los lee automáticamente al inicio de **cada** conversación y los usa como fuente de verdad. Todo es opcional: si la carpeta no existe, la IA trabaja sin contexto extra.

Aparte, un archivo `RULES.md` en la raíz define **cómo debe comportarse** la IA en este proyecto (convenciones, restricciones, preferencias). La distinción clave: `context/` es *qué significan los datos*; `RULES.md` es *cómo debe actuar la IA*.

## Cuándo usarlo

- Cuando tienes **términos de negocio propios** ("revenue", "churn", "usuario activo") con una definición exacta que la IA debe respetar siempre.
- Cuando tus tablas se unen de una forma concreta y no quieres que la IA adivine las llaves.
- Cuando trabajas en **equipo**: versionas el contexto en el repo y todos comparten las mismas definiciones sin re-explicarlas.

## Cómo usarlo

### Crear la carpeta desde Ajustes
1. Abre **Ajustes → IA** y ve a la tab de contexto (*AI Context*).
2. Si no existe `context/`, verás el botón **Create Context Folder**. Marca qué archivos quieres (métricas, joins, glosario, ejemplos) y créalos.
3. AmoxSQL genera la estructura con ejemplos comentados que puedes editar. Si la carpeta ya existe, el botón pasa a **Add Missing Files**.

### Definir métricas — `context/metrics.yml`
Cada métrica lleva su expresión SQL de DuckDB, una descripción y opcionalmente `grain` y `table`. La IA la consulta con la herramienta `lookup_metric` antes de calcular.

```yaml
metrics:
  - name: revenue
    sql: "SUM(amount) FILTER (WHERE status = 'paid')"
    description: Revenue pagado total. Excluye reembolsos y pedidos de prueba.
    grain: order
    table: orders
```

### Definir joins — `context/joins.yml`
Las relaciones correctas entre tablas, para que la IA no adivine columnas. La condición `on` puede incluir filtros que siempre aplican.

```yaml
joins:
  - from: orders
    to: customers
    on: "orders.customer_id = customers.id"
    type: LEFT
```

### Definir el glosario — `context/glossary.md`
Markdown libre con los términos del dominio y sus reglas (qué excluye "revenue", qué es un "usuario activo", que `amount` está en centavos, etc.). La IA lo lee entero.

### Añadir ejemplos — `context/examples/*.sql`
Pares (pregunta → SQL canónico). Las primeras líneas de comentario (`--`) son la pregunta; el resto es el SQL de referencia. La IA los busca con `find_example` cuando la pregunta se parece.

```sql
-- ¿Cuál es la tendencia de revenue mensual de los últimos 12 meses?
SELECT DATE_TRUNC('month', created_at) AS mes,
       SUM(amount) FILTER (WHERE status = 'paid') AS revenue
FROM orders
WHERE created_at >= CURRENT_DATE - INTERVAL 12 MONTHS
GROUP BY 1 ORDER BY 1;
```

### Definir reglas de comportamiento — `RULES.md`
En la raíz del proyecto (no dentro de `context/`). Markdown libre con las convenciones que la IA debe seguir.

```markdown
## Queries
- Usa siempre el schema `analytics.*`, nunca `raw.*` salvo que se pida.
- No sugieras `DROP`, `DELETE` ni `TRUNCATE`.
## Negocio
- `amount` está en centavos — divide entre 100 en la presentación final.
- Los pedidos de prueba tienen `customer_id IN (1, 2, 3)` — exclúyelos.
```

## Referencia

| Archivo | Ubicación | Contenido | Herramienta que lo lee |
|---|---|---|---|
| `metrics.yml` | `context/` | Definiciones de métricas de negocio | `lookup_metric` |
| `joins.yml` | `context/` | Joins canónicos entre tablas | Contexto del prompt |
| `glossary.md` | `context/` | Términos del dominio y sus reglas | Contexto del prompt |
| `examples/*.sql` | `context/examples/` | Pares pregunta → SQL canónico | `find_example` |
| `RULES.md` | Raíz del proyecto | Reglas de comportamiento de la IA | Contexto del prompt |

### Endpoints (para referencia)

| Endpoint | Qué hace |
|---|---|
| `GET /api/ai/context-status` | Estado actual de la carpeta `context/` del proyecto |
| `POST /api/ai/context-setup` | Crea la carpeta y los archivos seleccionados |

## Tips y gemas

- **La expresión `sql` de una métrica debe ser autónoma** — sin alias ni CTEs — porque la IA la incrusta en sus propias queries.
- **Verifica que se cargó:** pregúntale a la IA *"¿qué métricas conoces?"* o *"¿tienes un ejemplo para retención de cohortes?"*.
- **`context/` responde el "qué"; `RULES.md` el "cómo".** Mantenerlos separados evita confusión: definiciones de datos por un lado, política de comportamiento por otro.
- **Commitea `context/` y `RULES.md` al repo.** Es la forma más barata de dar a todo el equipo una IA que ya entiende el negocio.

## Relacionado

- [Herramientas del agente](agent-tools.md) · [Skills](skills.md) · [Memoria](memory.md)
- [Deep Dive](deep-dive.md) · [Precisión y salvaguardas](accuracy-and-guardrails.md)
