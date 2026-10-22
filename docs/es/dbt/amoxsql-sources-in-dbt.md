# Fuentes de AmoxSQL en dbt

**🌐 [English](../../en/dbt/amoxsql-sources-in-dbt.md) · Español**

> Las fuentes con nombre de AmoxSQL («ventas», «metas») se usan en dbt como `source('amoxsql', 'ventas')`, sin copiar rutas a los YAML. Y una consulta de AmoxSQL se convierte en un modelo de dbt con un clic.

## Qué es

Una [fuente con nombre](../data/sources.md) sabe dónde está su archivo **en esta computadora** y cómo leerlo (la hoja de un Excel, el delimitador de un CSV, el archivo más reciente de una carpeta). dbt no sabe nada de eso. Este puente se lo da sin que el proyecto dbt lleve rutas de nadie.

## Cuándo usarlo

- Cuando un modelo de dbt tiene que leer un archivo que AmoxSQL ya sabe leer.
- Cuando una consulta que funciona en AmoxSQL tiene que pasar a ser parte del proyecto dbt.

## Cómo usarlo

### Las fuentes en dbt

1. En [DBT Studio](dbt-studio.md) → **Sources**, abre **AmoxSQL sources in dbt**.
2. Marca las fuentes que quieres en dbt y guarda.

AmoxSQL escribe `models/sources/amoxsql.yml` con una source `amoxsql` y una tabla por fuente. En un modelo:

```sql
select * from {{ source('amoxsql', 'metas') }}
```

**Cómo funciona.** El YAML no lleva rutas. Cuando dbt corre **desde AmoxSQL** (DBT Studio, la barra de un modelo, una programación o `AmoxSQL.exe dbt`), AmoxSQL le pasa la lectura de cada fuente tal como la hace AmoxSQL, en esta computadora. La frescura (`dbt source freshness`) sale de la fecha del archivo.

**Fuera de AmoxSQL**, el resto del proyecto corre igual; sólo los modelos que leen una fuente de AmoxSQL fallan, y dicen por qué («only available when dbt runs from AmoxSQL»).

Las fuentes de *buckets* y de lagos no pasan por aquí: su credencial va en `profiles.yml`. Lo que añadas a mano en esa source se respeta.

### Una consulta a modelo

Encima de un `.sql` suelto del proyecto, **Promote to dbt model**; en un cuaderno dentro de un proyecto dbt, el botón **dbt** de cada celda. Eliges capa y nombre:

- las tablas que son modelos pasan a `{{ ref('…') }}`;
- `fuentes."metas"` pasa a `{{ source('amoxsql', 'metas') }}`, y la fuente se añade al YAML si no estaba;
- las CTE y las funciones de lectura se quedan; lo desconocido queda marcado con un comentario;
- el modelo nuevo se abre en el editor, y **la consulta original no se toca**.

```sql
-- antes, en AmoxSQL
select m.store, sum(m.revenue) as revenue, g.goal
from fct_revenue_monthly m join fuentes."metas" g on g.store = m.store
group by all

-- después, models/marts/revenue_vs_goal.sql
select m.store, sum(m.revenue) as revenue, g.goal
from {{ ref('fct_revenue_monthly') }} m join {{ source('amoxsql', 'metas') }} g on g.store = m.store
group by all
```

## Tips y gemas

- **El nombre en dbt** es el de la fuente en *snake_case* («ventas-semanales» → `ventas_semanales`); el original queda en `meta.amoxsql_fuente`.
- **El proyecto viaja limpio:** otra persona con la misma fuente ubicada en su máquina corre el mismo proyecto sin tocar nada.

## Relacionado

- [Fuentes con nombre](../data/sources.md) · [DBT Studio](dbt-studio.md) · [Modelos en el editor](models-in-the-editor.md)
