# Plan — "Experto DuckDB": que cualquier IA en AmoxSQL escriba SQL de DuckDB perfecto

> **Estado**: ✅ IMPLEMENTADO (E1–E4) en rama `claude/duckdb-expert`. E5 (suite de eval) queda como futuro.
> Validación: root causes verificados a nivel unitario (retrieval acierta los casos del transcript, tool de funciones corre en el motor real, prompt trae cheat sheet + reglas). El E2E con modelo real quedó pendiente de la máquina rápida — el dev (P600/CPU) hace timeout con el tool loop.
> **Fecha**: 2026-07-22
> **Objetivo**: que cualquier modelo (chico o grande) que use AmoxSQL sea experto completo en el dialecto de DuckDB — sin inventar sintaxis, verificando contra el motor real.
> **Caso disparador**: conversación real donde el modelo inventó `SELECT * EXCLUDE (like '%plan%')` (inválido) en vez de la sintaxis correcta `SELECT * NOT ILIKE '%plan%'` — y la repitió incluso tras el "no funcionó" del usuario.

---

## 1. Auditoría del fallo (con verificación real)

### 1.1 La cadena del error, paso a paso

1. Usuario: *"¿cómo excluyo las columnas que tengan 'plan' en el nombre?"*
2. El modelo había consultado antes `lookup_duckdb_docs("EXCLUDE clause in SELECT")` → recibió **solo** la sección `§ EXCLUDE Clause`. Nuestra tool recorta a UNA sección — el modelo nunca supo que dos secciones más abajo existía **`§ Column Filtering via Pattern Matching Operators`** con la respuesta exacta.
3. Sin esa pieza, el modelo **fusionó** lo que sabía (EXCLUDE) con lo que intuía (LIKE) → inventó `EXCLUDE (like '%plan%')`.
4. **Nunca llamó `validate_sql`** (la tool existe) — el parser de DuckDB habría rechazado el invento al instante.
5. Usuario: *"no funcionó"* → el modelo **repitió la misma sintaxis inválida** en vez de re-consultar con otros términos o validar.
6. Sus re-búsquedas fallaron en el ranking (ver 1.3).

### 1.2 Verificación empírica (DuckDB v1.5.0 embebido, el real de AmoxSQL)

| SQL | Resultado |
|---|---|
| `SELECT * EXCLUDE (like '%plan%') FROM t` (invento del modelo) | ❌ `Parser Error: syntax error at or near "like"` |
| `SELECT * NOT ILIKE '%plan%' FROM t` (correcto) | ✅ devuelve solo las columnas sin "plan" |
| `SELECT COLUMNS('^(?!.*plan).*$') FROM t` (regex con lookahead) | ❌ RE2 no soporta `(?!` — otro gotcha a documentar |

**El bundle SÍ contiene la respuesta**: `expressions/star.md` incluye `### Column Filtering via Pattern Matching Operators` (`SELECT * LIKE 'col%'`, `* GLOB`, `* SIMILAR TO` y variantes NOT/ILIKE).

### 1.3 Reproducción de las búsquedas del transcript (ranking actual)

| Query del modelo | Lo que devolvió la tool | ¿Correcto? |
|---|---|---|
| `EXCLUDE clause in SELECT` | star.md § EXCLUDE Clause (solo esa sección) | ⚠️ parcial — ocultó las secciones hermanas |
| `LIKE column` | **data_types/variant.md** § Storing Different Types… | ❌ absurdo |
| `LIKE pattern matching` | functions/pattern_matching.md § LIKE (sobre VALORES, no columnas) | ❌ tema equivocado |
| `excluir columnas con like` (español) | **constraints.md** (archivo completo) | ❌ absurdo |
| `select columns by pattern` | dialect/sql_quirks.md § Automatic Column Deduplication | ❌ el que salió en el transcript |

**Causas raíz identificadas**:
- **R1 — Recorte mono-sección**: devolver 1 sección esconde el resto del documento (el TOC del archivo es información crítica).
- **R2 — Ranking frágil**: scoring por tokens sueltos aterriza en archivos irrelevantes; los headings del manifest apenas pesan.
- **R3 — Español no mapea**: los docs son en inglés; "excluir columnas" no matchea nada útil.
- **R4 — El motor nunca participa**: tenemos DuckDB local, instantáneo y gratis — y ninguna regla obliga a validar el SQL propuesto contra él.
- **R5 — Sin protocolo de fallo**: tras un "no funcionó", nada impide repetir la misma respuesta.

### 1.4 El descubrimiento clave: DuckDB se puede auto-documentar

El motor embebido expone introspección completa:
- **`duckdb_functions()`** → **2,944 funciones** con firma exacta, tipos de parámetros y descripción — SIEMPRE de la versión exacta que embarca AmoxSQL (v1.5.0), sin desfase con docs de otra versión.
- `duckdb_keywords()`, `duckdb_types()`, `duckdb_settings()`, `PRAGMA version`.
- `validate_sql` ya usa el parser real → veredicto de sintaxis en milisegundos, offline, sin ejecutar nada.

**Respuesta a la pregunta del usuario ("¿podríamos utilizar el mismo DuckDB para mejorar esto?"): SÍ, y es la palanca más poderosa** — el motor es la única fuente de verdad que no puede alucinar.

---

## 2. Plan de implementación

### E1 — El motor como árbitro (la palanca grande)
1. **Regla dura en el system prompt**: *"Todo SQL que muestres al usuario DEBE pasar `validate_sql` primero. Si falla, NO lo muestres: consulta `lookup_duckdb_docs`, corrige y re-valida."* DuckDB es local — validar cuesta milisegundos (mentalidad desktop-native).
2. **Loop de auto-corrección por validación** (espejo del que ya existe para `execute_sql` en agenticLoop): si `validate_sql` falla N veces, inyectar directiva de re-consulta de docs con términos distintos.
3. **Nueva tool `lookup_duckdb_function({ name })`**: consulta `duckdb_functions()` del motor embebido → firma exacta, tipos, variantes de overload. Complementa los docs (prosa) con la referencia viva (firmas). Barata: es un SELECT local.

### E2 — Retrieval que no puede fallar
1. **Devolver sección + TOC completo del archivo**: `content` = sección matcheada, `sections` = lista de TODOS los headings del doc + hint *"call again with the section name for details"*. El caso EXCLUDE habría mostrado "Column Filtering via Pattern Matching Operators" como hermana visible.
2. **Parámetro `section` opcional** en la tool para pedir una sección específica del mismo doc.
3. **Ranking por headings con peso alto** (el manifest ya los tiene) + **top-3 candidatos** cuando el score no es concluyente (devolver alternativas: "¿quizás buscabas…?").
4. **Normalización ES→EN** de términos frecuentes en la tool (excluir→exclude, columnas→columns, patrón→pattern, fecha→date, ventana→window…) — los modelos preguntan en el idioma del usuario.
5. **Gotcha map ampliado** con el caso de este bug: `like|glob|similar` + `column|exclude|select` → star.md § Column Filtering.

### E3 — Cheat sheet de quirks en el prompt (para modelos que no llaman tools)
Añadir ~5 líneas de alto valor a las DuckDB SQL Rules del prompt estático (costo mínimo en tokens, F3-friendly):
- Filtrar columnas por patrón: `SELECT * NOT ILIKE '%x%'` (LIKE/GLOB/SIMILAR TO sobre `*` filtran POR NOMBRE DE COLUMNA).
- `EXCLUDE (col1, col2)` acepta SOLO nombres exactos, nunca patrones.
- `COLUMNS('regex')` usa RE2: sin lookahead `(?!...)`; para negar, usar `* NOT ILIKE`.

### E4 — Protocolo de "no funcionó"
Regla en el prompt: cuando el usuario reporta que un SQL falló, está PROHIBIDO repetir la misma sintaxis; obligatorio: (1) re-consultar docs con términos EN INGLÉS distintos, (2) validar con `validate_sql`, (3) solo entonces responder.

### E5 — (Futuro) Suite de evaluación de dialecto
Aprovechar `ai/testRunner.js`: batería de ~20 preguntas de sintaxis DuckDB (EXCLUDE por patrón, QUALIFY, PIVOT, lambdas, ASOF…) con respuesta validable contra el motor → medir "expertez" por modelo y detectar regresiones de prompt.

## 3. Resultado esperado en el caso disparador

Con E1+E2: el modelo consulta docs → ve el TOC con "Column Filtering…" → propone `* NOT ILIKE '%plan%'` → `validate_sql` lo confirma → respuesta correcta a la primera. Y si aún así inventara algo, el parser lo mata antes de llegar al usuario.
