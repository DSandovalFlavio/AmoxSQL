# Plan — Búsqueda de documentación de DuckDB para la IA

> **Estado**: ✅ IMPLEMENTADO (D1–D4) en la rama `claude/ai-local-performance`. Se eligió **bundle completo offline** (126 archivos) con 3 modos de actualización.
> **Fecha**: 2026-07-22
> **Objetivo**: dar a los modelos locales (sobre todo los pequeños) una herramienta para consultar la documentación oficial de DuckDB y así dejar de fallar en sintaxis específica (EXCLUDE, QUALIFY, COLUMNS, PIVOT, list comprehensions, etc.).
>
> **Implementado**:
> - **D1** — `server/ai/duckdbDocs.js` (bundle vs snapshot de usuario, manifest con fecha, lookup con gotcha-map + sección relevante) + `scripts/gen_duckdb_docs.js` + snapshot de 126 archivos en `server/ai/data/duckdb-docs/`.
> - **D2** — tool `lookup_duckdb_docs` (universal, tier medium+) + mención en el system prompt.
> - **D3** — config `duckdbDocsUpdate` (off/manual/auto, default auto) + `duckdbDocsIntervalDays`; endpoints `GET /api/ai/duckdb-docs/status` y `POST /api/ai/duckdb-docs/refresh`; auto-update al iniciar (`maybeAutoUpdateDocs`).
> - **D4** — UI en Ajustes (fecha, conteo, selector de modo, botón "Actualizar ahora"); bundling vía `extraResources`; docs de usuario ES/EN.
>
> Nota: se implementó el **bundle completo** (opción elegida por el usuario), no el híbrido índice+fetch del plan original.

## 1. La pregunta clave: ¿navegador headless o algo más simple?

**Mucho más simple: NO se necesita navegador headless.** La documentación de DuckDB son archivos **markdown planos** en un repo público de GitHub (`duckdb/duckdb-web/docs/current/sql/`). Se traen con un simple `fetch` HTTPS al raw:

```
https://raw.githubusercontent.com/duckdb/duckdb-web/main/docs/current/sql/expressions/star.md
```

Verificado en la investigación:
- **126 archivos** `.md` bajo `docs/current/sql/`, organizados en subcarpetas claras: `statements/` (37), `functions/` (26), `data_types/` (22), `query_syntax/` (17), `expressions/` (10), `dialect/` (7), etc. El árbol completo cabe sin truncar.
- Cada archivo trae **front-matter** con `title:` (ej. `title: Star Expression`) — perfecto para indexar.
- El contenido es markdown limpio con secciones por función (ej. `star.md` tiene `### EXCLUDE Clause` con ejemplos).
- Existe `https://duckdb.org/llms.txt` (200) pero es solo un overview de alto nivel, no un índice por función — no sirve para lookup fino.

Un navegador headless (Puppeteer/Playwright) sería un martillo para un clavo: pesado (Chromium ~150 MB), lento, frágil (scraping de HTML), y con dependencia nativa. El markdown ya es texto limpio y estructurado. Ganador claro: **fetch de raw markdown + índice + cache en disco.**

## 2. Arquitectura propuesta

### 2.1 Índice de documentación (`server/ai/duckdbDocs.js`)
- **Índice estático empaquetado** (`server/ai/data/duckdb-docs-index.json`): lista de las 126 rutas + su `title` + alias de keywords. Se genera con un script (`scripts/gen_duckdb_index.mjs`) que baja el árbol del repo y el front-matter. Se commitea al repo → funciona **offline desde la primera vez**.
- **Refresco opcional**: si hay internet, refrescar el índice desde el árbol de GitHub cada N días (cache en `~/.amoxsql/duckdb-docs-index.json`). El índice cambia poco.

### 2.2 Herramienta de IA `lookup_duckdb_docs` (`server/ai/tools.js`)
- Firma: `lookup_duckdb_docs({ topic: string })` → `{ path, url, title, content }`.
- Ranking del `topic` contra el índice:
  1. **Mapa curado de "gotchas"** (lo que los modelos chicos fallan más): `exclude|replace|columns → expressions/star.md`, `qualify → query_syntax/qualify.md`, `pivot|unpivot → statements/pivot.md|unpivot.md`, `list comprehension|lambda → functions/lambda.md`, `struct|map|list → data_types/*`, `sample → samples.md`, `asof join → query_syntax/from.md`, etc.
  2. **Match difuso** por segmentos de ruta + `title`.
- Trae el raw markdown (cache en disco con TTL), y **extrae solo la sección relevante** (desde el heading que hace match hasta el siguiente `##`/`###`) para no inflar el contexto — crítico para modelos chicos (lección de F3: prompt corto = rápido).
- Devuelve el markdown recortado + la URL de la fuente (para citar).

### 2.3 Cache en disco
- `~/.amoxsql/duckdb-docs-cache/<path>.md` con TTL (ej. 7 días). Primer lookup online; luego instantáneo y offline.

### 2.4 Integración con el prompt / tiers
- **Modelos con tool-calling** (medium+): la tool se registra y el system prompt menciona: *"Si dudas de la sintaxis exacta de DuckDB, llama a `lookup_duckdb_docs` antes de escribir el SQL."*
- **Modelos low (prompt-only)**: no llaman tools. Opción: detectar keywords de DuckDB en la pregunta e **inyectar** el doc relevante en el contexto automáticamente (retrieval sin tool). Fase 2.

## 3. Fases

- **F0** — `scripts/gen_duckdb_index.mjs` + índice estático empaquetado + `duckdbDocs.js` (buildIndex, refresh, fetchDoc con cache, extractSection).
- **F1** — Mapa curado de gotchas + ranking + `lookup_duckdb_docs` tool (tools.js). Registro en el tool set y mención en el system prompt. Gating por tier.
- **F2** — Retrieval automático para prompt-only (inyección de doc por keyword).
- **F3** — Config toggle ("Consultar documentación de DuckDB": on/off) + doc de usuario. Empaquetar el índice en `build.files`/`extraResources`.
- **F4** — (Opcional) extender a extensiones core (`core_extensions/`) y funciones de fecha/lista más allá de `sql/`.

## 4. Decisiones abiertas
- **¿Empaquetar TODO el markdown (126 archivos, ~pocos MB) para retrieval 100% offline, o solo el índice + fetch on-demand?** Recomendación: índice empaquetado + fetch on-demand con cache (equilibrio tamaño/offline). Todo-empaquetado es Fase futura si se quiere cero-red.
- **¿Solo `docs/current/sql/` o también `core_extensions`, `guides`?** Empezar por `sql/` (el 90% de los fallos), extender después.
- **Versión de docs**: usar `current` (última). Alternativa: fijar a la versión de DuckDB que embarca AmoxSQL para evitar desajustes de sintaxis nueva.
