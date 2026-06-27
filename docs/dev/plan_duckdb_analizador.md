# Plan — DuckDB como analizador semántico del autocompletado

> Objetivo: resolver las **columnas reales de CTEs y subqueries** preguntándole al propio
> motor DuckDB, en vez de adivinarlas sintácticamente. Es el primer paso de la visión
> "DuckDB como analizador" (ver memoria `monaco-editor-initiative`). Aplica solo a SQL plano
> (no templated). Aditivo: si el motor no puede, se cae al heurístico tree-sitter actual.

## Por qué (el hueco que llena)
Hoy, en `SELECT | FROM (SELECT a+b AS total FROM t) x` o con CTEs, tree-sitter **no puede**
saber qué columnas produce la relación derivada (es sintáctico, no semántico). DuckDB sí:
`DESCRIBE <query>` hace *binding* (resuelve nombres/tipos) **sin ejecutar** el cuerpo. Eso da
las columnas exactas — incluidas derivadas (`a+b AS total`), expansión de `*`, resultados de
función — algo imposible de adivinar con el AST.

## Reglas de oro (no negociables)
1. **Fuera del hot-path por tecla.** El filtrado por tecla sigue 100% en cliente (Monaco sobre
   la lista cacheada). El motor solo se llama **on-demand** (al disparar el completado en un
   contexto con relaciones derivadas, o al teclear `.` sobre un alias derivado).
2. **Cacheado** por hash del *probe SQL*. Segunda referencia a la misma CTE → instantáneo.
3. **Timeout + fallback.** Si `DESCRIBE` falla (sentencia a medio escribir, inválida) o supera
   el timeout → se omiten esas columnas (= comportamiento actual). Nunca peor, nunca cuelga.
4. **Jinja jamás va a DuckDB.** Si el texto tiene `{{`/`{%`, no se llama al motor (daría error);
   se mantiene el completado dbt actual (manifest/snippets). Frontera ya existente.
5. **Solo lectura.** El endpoint solo acepta `SELECT`/`WITH…SELECT` y solo ejecuta `DESCRIBE`
   (bind-only). Rechaza DDL/DML, múltiples sentencias (`;`).

## Arquitectura / flujo de datos
```
SqlEditor.jsx (provider, async, ya hace fetches)
  1. worker.getCompletions(...)  ──>  worker (tree-sitter)
        · base: clause, alias/scope, columnas de tablas/archivos (como hoy)
        · NUEVO: derivedRelations = [{ name, probeSql }]  (CTEs y subqueries en scope)
  2. ¿hay relaciones derivadas relevantes (dot sobre derivada, o columnas en scope)?
        · sí → para cada una: cache.get(hash(probeSql))  ||  await POST /api/db/describe
        · merge de esas columnas en `suggestions` (mismo kind/sortText/filterText que columnas)
  3. return { suggestions }   (incomplete:false, como ahora)
```
El worker sigue siendo puro tree-sitter (rápido, sin IO). El **provider** orquesta la llamada
al motor y el merge — ya es asíncrono y ya hace fetches (file-schema, catálogo de funciones).

## El núcleo técnico: construir el *probe SQL*
Para obtener las columnas de una relación derivada `R`, se arma una **query-sonda válida** y se
le pide `DESCRIBE`. La sonda debe incluir el `WITH` completo de la sentencia (para resolver
dependencias entre CTEs):

- CTE `name`:  `DESCRIBE <WITH-clause-completo> SELECT * FROM name`
- Subquery `(<sql>) alias` en el FROM:  `DESCRIBE <WITH-clause-si-hay> SELECT * FROM (<sql>) AS alias`
- Regla general: `DESCRIBE <WITH-clause-si-hay> SELECT * FROM <referencia-a-R>`

El **worker** (tree-sitter) es quien extrae, de la sentencia actual: (a) el texto del `WITH`
completo si existe, (b) el nombre de cada CTE, (c) las subqueries-con-alias del FROM y su SQL
interno. Con eso compone cada `probeSql`. Si el `WITH` está a medio escribir, `DESCRIBE` fallará
→ fallback (regla 3).

## Componentes a construir

### A. Servidor — `POST /api/db/describe`  (`server/index.js`)
- Body: `{ sql }`. Valida: empieza por `SELECT`/`WITH` (tras quitar comentarios), sin `;` extra.
- Ejecuta `DatabaseManager.systemQuery('DESCRIBE ' + sql)` → ya **no se loggea** (línea 180) y es
  bind-only. Devuelve `[{ name: column_name, type: column_type }]`.
- Timeout server-side (p. ej. 1s) + try/catch → `{ columns: [], error }` en fallo (nunca 500 ruidoso).
- **v1 usa la conexión principal** (contexto de catálogo correcto: ya está en `USE user_db`).
  *Optimización futura (v1.1):* conexión de introspección dedicada (`instance.connect()` +
  replicar `USE user_db`) para no serializarse detrás de una query larga del usuario. No es
  bloqueante para v1 porque el completado ocurre mientras el usuario teclea, no mientras corre
  una query, y `DESCRIBE` es muy barato.

### B. Worker — extracción de relaciones derivadas  (`sqlLanguageWorker.js` + `treeSitterUtils.js`)
- Nueva util `extractDerivedRelations(statementNode, fullStatementText)`:
  - CTEs: recorrer el `with_clause`/`cte` → nombre + (para la sonda) el `WITH` completo.
  - Subqueries del FROM con alias: nodo `subquery`/`(SELECT …) alias` → alias + SQL interno.
  - Fallback regex si el AST viene con ERROR (consistente con lo ya hecho para file-refs).
- `getCompletions` añade `derivedRelations: [{ name, probeSql }]` a la respuesta.
- En modo DOT: si `dotAlias` resuelve a una relación derivada (no a tabla/archivo del schema),
  marcarlo para que el provider la resuelva por motor.

### C. Provider — orquestación + merge + caché  (`SqlEditor.jsx`)
- Caché module-level `Map<hash(probeSql), columns>`; se limpia en `updateSchema` (el esquema base
  puede cambiar las columnas de una CTE). Hash simple del `probeSql` normalizado.
- En `completionProviderRef`: tras obtener `derivedRelations`, resolver las relevantes (cache o
  `await describe` con `AbortController` + timeout ~250ms). Inyectar columnas con el mismo
  formato que las de tabla (kind Field, `filterText` limpio, bucket `0_used_`/`1_b_` según uso).
- Guard Jinja: si `fullText` tiene `{{`/`{%`, saltar todo el bloque de motor.

## Fases (incremental, verificable tras cada una)
- **Fase 1 — Endpoint.** `POST /api/db/describe` + validación + timeout. Probar con `curl`/UI sobre
  queries fijas (CTE, subquery, `*`, derivadas). Sin tocar el editor todavía.
- **Fase 2 — Dot sobre CTE/subquery.** `cte.` / `sub.` → columnas reales. El caso más visible.
- **Fase 3 — Columnas de relaciones derivadas en scope** (aparecen en `SELECT`/`WHERE` aunque no
  uses el punto).
- **Fase 4 — Endurecer:** caché + invalidación, timeout/abort, guard Jinja, fallback exhaustivo.
- **Fase 5 (opcional) — Conexión de introspección dedicada** (v1.1) si se observa serialización.

## Riesgos y mitigaciones
| Riesgo | Mitigación |
|---|---|
| Latencia en el camino de tecla | Motor solo on-demand + cacheado; filtrado por tecla intacto en cliente. |
| Sentencia inválida a medio escribir | `DESCRIBE` falla → fallback al heurístico actual. |
| `DESCRIBE` se serializa tras una query larga | v1: raro (se teclea, no se corre). v1.1: conexión dedicada. |
| Re-sniff de archivos (`read_csv`) en cada describe | Caché por hash del probe; el file-schema ya se cachea aparte. |
| Reconexión de DB invalida caché/conexión | Limpiar caché en `updateSchema`/reconexión. |
| Jinja crudo rompe DuckDB | Guard `{{`/`{%` → no llamar al motor. |

## Fuera de alcance (futuro, no en este plan)
Expansión de `*` en posiciones arbitrarias del SELECT del usuario; completado de **valores**
(`WHERE col = …` vía `SELECT DISTINCT`); ranking **por tipo**; análisis de modelos **dbt
compilados** (`target/compiled/…`); **diagnóstico en vivo** (prepare/EXPLAIN). Cada uno reusa la
misma infraestructura (endpoint + caché + reglas de oro).

## Criterios de verificación
- `WITH x AS (SELECT a+b AS total FROM t) SELECT | FROM x` → sugiere `total` (no existe en `t`).
- `SELECT | FROM (SELECT name, COUNT(*) AS n FROM t GROUP BY name) s` → sugiere `name`, `n`.
- `x.|` sobre una CTE → sus columnas reales.
- Mientras se teclea la CTE (inválida) → sin errores, sin cuelgue, cae al comportamiento actual.
- Archivo con `{{ ref() }}` → no se llama al motor; completado dbt como hoy.
- Tecleo sigue fluido (sin regresión de latencia) — el motor nunca corre por tecla.
