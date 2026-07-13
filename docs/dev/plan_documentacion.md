# Plan de implementación: documentación nueva de AmoxSQL

**Fecha:** 2026-07-13 · **Versión objetivo:** v3.8.3+
**Objetivo:** rediseñar y crear una documentación completa, detallada y actual de **todas** las capacidades de AmoxSQL, sin dejar nada sin documentar. El README dejará de ser un documento monolítico desactualizado (su "Lo Nuevo" se quedó en v3.3) y pasará a ser una landing page que enlaza a una guía estructurada.

Este plan se basa en un inventario exhaustivo de capacidades (4 barridos en paralelo del código real) + auditoría de la documentación existente.

---

## 1. Diagnóstico

### Qué hay hoy
- **README.md** (ES): monolítico, mezcla marketing + referencia; sección "Lo Nuevo" congelada en **v3.3** (no cubre v3.4–v3.8.3: Report Flow, auditoría de temas, rediseño de Deep Dive, MiniMax, fixes de Excel/export, perf de metadata, auditoría de botones).
- **CLAUDE.md** (EN): el doc más autoritativo y actual, pero es guía para el asistente, no para usuarios.
- **CHANGELOG.md** (ES): la única fuente al día (hasta 3.8.3).
- **docs/dev/** (ES, ~35 archivos): interno de desarrollo. Mezcla docs vivos (arquitectura, patrones_react, guia_estilos, guia_graficos_storytelling) con **muchos** `plan_*`/`auditoria_*`/`deep_dive_*` que son históricos/status.
- **contexto_caracteristicas/** (ES, 8 archivos): deep-dives por feature, varios con encabezados obsoletos (v2.1.3).
- **No existe documentación de usuario final** más allá del README.

### Problemas concretos a corregir de paso
- `client/README.md` = boilerplate de Vite (retirar/reemplazar).
- `SECURITY.md` = tabla de versiones soportadas en **1.0.x/1.1.x** (app en 3.8.3).
- `CONTRIBUTING.md` y `docs/dev/README.md` dicen `npm` (el proyecto exige **pnpm**).
- Conflicto de versión de `.sqlnb`: CLAUDE.md dice v2.0, el parser real es **v3.0** (con compat v2.0 + legacy markers).
- Lista de claves `localStorage` en CLAUDE.md incompleta.
- `pendiente_rendimiento_multiples_graficos.md` auto-declarado superado.
- Drift de docstring: `contextLoader.js` dice `.amoxsql/context/` pero lee `<project>/context/`.

---

## 2. Decisiones de diseño

- **Idioma: BILINGÜE (Español + Inglés).** Árboles paralelos `docs/es/` y `docs/en/`. Cada página existe en ambos idiomas con un conmutador de idioma en el encabezado (`🌐 English · Español`). El español es la fuente primaria (se escribe primero) y el inglés es la traducción fiel. *(Duplica el número de archivos — ~100 docs — sancionado explícitamente.)*
- **Audiencias separadas:**
  - **`docs/`** → NUEVA guía de usuario final (el grueso de este plan).
  - **`docs/dev/`** → se mantiene como interno de desarrollo (solo refresh de encabezados + archivar históricos).
- **README** → landing page: hero, qué es, capacidades clave (actuales), capturas, quickstart de instalación, y enlaces a `docs/`. Se saca el catálogo exhaustivo de features al guide.
- **Convención "sin referencias a tecnologías ajenas"** (regla del proyecto) aplica también a los docs: solo el stack real, proveedores LLM, DuckDB y AmoxSQL.
- **Plantilla por página de feature** (consistencia): `Qué es` → `Cuándo usarlo` → `Cómo usarlo` (paso a paso) → `Referencia de opciones` → `Tips / gemas` → `Relacionado` (cross-links). Capturas desde `images/`. Callouts para las "gemas" poco conocidas.
- **Un índice maestro** (`docs/README.md`) como mapa navegable.

---

## 3. Arquitectura de la nueva documentación (`docs/`)

**Estructura bilingüe:** el árbol de abajo se replica bajo `docs/es/` y `docs/en/` (mismos nombres de archivo en ambos; los nombres de archivo se mantienen en español o se traducen — decisión: **mismos slugs en inglés bajo `docs/en/`**, p. ej. `docs/en/editor/sql-editor.md`). `docs/README.md` es el índice maestro bilingüe que enruta a `docs/es/` y `docs/en/`.

Árbol lógico (por idioma):

```
docs/
  README.md                              # Índice maestro bilingüe (mapa + selector de idioma)
  es/  ·  en/                            # Árboles paralelos, misma taxonomía:
  guia-de-usuario/
    01-introduccion.md                   # Qué es AmoxSQL, filosofía local-first, el nombre/emblema, para quién
    02-instalacion.md                    # Descargar instalador · compilar desde fuente · requisitos (Node 20+, pnpm 11+, C++)
    03-primeros-pasos.md                 # Welcome → ruta de proyecto → selección de BD (memoria/RO/RW) → primera query
    04-interfaz-general.md               # Activity bar, sidebar, tabs, split, title bar, command palette, tour de la UI
    05-proyectos-y-conexiones.md         # Flujo por proyectos, workspace wizard, recientes, modos de conexión, hard reset
    06-temas-y-apariencia.md             # 10 temas (Amox Dark/Light, Ayu…), 13 acentos, modo claro/oscuro, Monaco sync, zoom, fuentes UI
  editor/
    editor-sql.md                        # Monaco, tokenizer DuckDB+Jinja, opciones, error markers, view-state por tab
    autocompletado.md                    # 3 capas (worker tree-sitter + schema + backend), clause-aware, columnas de CTE vía DESCRIBE, hover docs
    depurar-cte.md                       # Glifo ▶ en CTEs, step-through, DebugResultModal
    variables.md                         # ${var} de sesión (VariablesBar) vs {{var}} de notebook — syntaxis, tipos, resolución
    snippets.md                          # Librería integrada (window/agg/date/quality/duckdb/dbt) + snippets propios
    historial-y-bookmarks.md             # Historial de queries persistente, bookmarks, panel + modal
    command-palette.md                   # Ctrl+Shift+P, categorías, acciones, atajos anunciados
    layout-tabs-y-paneles.md             # Split panes, tabs por panel, drag/drop entre paneles, popout, drafts de recuperación
  notebooks/
    notebooks.md                         # .sqlnb: celdas (SQL/Markdown/Input), ejecución (Run All / Above / Below), DAG reactivo de inputs
    reportes-desde-notebook.md           # Modo Report/Present, Show/Hide code, export HTML / Word / PDF / Print
  resultados/
    tabla-de-resultados.md               # Table/Chart/Profile, search/filter/sort/resize/paginación, formato de valores, truncation
    comparar-resultados.md               # Store A + Compare (added/removed/unchanged por clave)
    guardar-resultados.md                # Download (filas en memoria) vs Export (re-corre query) vs Save as table vs Save to Vault
    data-profiler.md                     # EDA con storytelling: veredicto, findings rankeados, tipos semánticos, Plot, narración IA, export
    plan-de-ejecucion.md                 # EXPLAIN vs ANALYZE, árbol legible, fases, Cost/Graph, pistas + Optimize with AI
  datos/
    explorador-de-archivos.md            # Navegación, orden/agrupado, CRUD, multi-select, menú por tipo, git badges, iconos de carpetas
    explorador-de-base-de-datos.md       # Árbol schema→tabla→columna, búsqueda, drag al editor, detalles de tabla, quality check, drop
    diagrama-er.md                       # ER interactivo SVG, PK/FK, drag, hover-highlight, generar DDL
    importar-datos.md                    # CSV/Parquet/JSON (ImportModal), Excel multi-hoja (MERGE/INDIVIDUAL), carpetas glob, direct query, quick preview
    exportar-datos.md                    # Local COPY TO (CSV/Parquet/Excel real) + nube S3/GCS; límites (1M filas xlsx); dónde vive cada botón
    google-sheets.md                     # Conectar sheets, read_gsheet, tabs como tablas, setup del service account
    extensiones-duckdb.md                # ExtensionExplorer: featured/core/community, install/load, httpfs/excel/spatial
  visualizacion/
    story-flow.md                        # La sección de viz: flujo de 6 etapas (Type→Data→Format→Style→Story→Export), guía + tour
    tipos-de-grafico.md                  # Los 17 tipos por intención (Compare/Trend/Composition/Relationship/Flow) + cuándo usar cada uno
    storytelling-y-overlays.md           # Título/subtítulo/takeaway/footnote, headline KPI, anotaciones, highlight, goal/ref/trend line, Auto Story
    formato-y-estilo.md                  # Ejes, formato numérico, paletas/fuentes, log scale, eje secundario, bar color modes, donut center KPI
    exportar-graficos.md                 # PNG (presets), copiar, guardar/cargar .amoxvis, pegar JSON de la IA
  reportes/
    report-flow.md                       # Decks .amoxdeck: front-matter, slides, 5 layouts, estudio (Design/Present/Source), charts refrescables, {{vars}}
    exportar-a-office.md                 # PowerPoint (nativo editable vs imagen) + Word (¡scope = notebook!); limitación de overlays en nativo
  data-flow/
    data-flow.md                         # Chains .sqlchain: editor visual, drag, validación/ciclos, autocompletado de columnas, preview por nodo, templates, AI generate
    referencia-de-nodos.md               # Los 33 nodos por grupo (Sources/SQL/Filter/Columns/Clean/Reshape/Combine/Output/Quality)
    ejecutar-y-motor.md                  # Run All/From/To Here, SSE, logs/history, checkpoint/resume, materialización view-vs-table, export YAML/SQL
  dbt/
    dbt-studio.md                        # Setup (detección de entorno/conda), Config (profiles/project), Models, Sources, Commands (SSE), Lineage DAG
  ia/
    01-introduccion.md                   # Local-first + cloud, las dos superficies (Asistente vs Deep Dive), la tercera vía (external-AI)
    02-asistente-de-editor.md            # Modo assistant: compañero del archivo activo, proponer edits, aplicar gráficos, citar números
    03-deep-dive.md                      # Modo diving agéntico: ventana 3 regiones, plan+inspector+inventory, continuación, narrativa, Ask-about-this, @/#
    04-proveedores-y-modelos.md          # Ollama + Gemini/Anthropic/OpenAI/Vertex/MiniMax(M-series reasoning), tiers, descarga de modelos, config
    05-herramientas-del-agente.md        # execute_sql, list/describe, attach_file, profile_data, display_chart, build_notebook, validate_sql, final_answer…
    06-skills.md                         # Auto-activación por intención, set integrado (14), scope analysis/engineering, skills propias, next-chaining
    07-contexto-como-codigo.md           # metrics.yml/joins.yml/glossary.md/examples + RULES.md (la capa semántica que la IA lee)
    08-memoria.md                        # Memoria entre conversaciones (global_rules/personal_facts), panel, edición
    09-analysis-vault.md                 # Guardar análisis (query+snapshot+chart+tags), reusar, save_to_vault del agente
    10-metadata-para-ia.md               # Export "Metadata for AI" + skills descargables (basic/advanced auto-derivada) + flujo sin IA local
    11-precision-y-guardrails.md         # Linters de display_chart, join fan-out, verificación de findings, self-correction, watchdog, prompt caching
    12-modo-prompt-only.md               # Modelos <3B: mapeo de tablas virtuales, 2 pasadas, cómo habilita análisis en 1–2B
  referencia/
    formatos-de-archivo.md               # .sql .sqlnb (v3.0 + compat) .sqlnb.state.json .amoxvis .amoxdeck .sqlchain RULES.md SKILL.md context/*
    configuracion.md                     # Todas las pestañas de Settings + config.json + claves localStorage/sessionStorage
    atajos-de-teclado.md                 # Set completo (General/Query/Navegación/Editor/View) — fuente: KEYBOARD_SHORTCUTS
    glosario.md                          # Términos: lane, Story/Report/Data Flow, Deep Dive, tier, skill, .amoxvis, semantic layer, etc.
  conceptos/
    arquitectura.md                      # Topología de 3 procesos, puerto dinámico, 3 lanes de DuckDB, HTTP no IPC (versión usuario-técnico)
    local-first.md                       # Por qué local-first: privacidad, velocidad, sin latencia de red, DuckDB in-process
```

**Total: ~50 documentos por idioma → ~100 docs** (ES+EN) + índice maestro. Cobertura 1:1 con el inventario (ver matriz de completitud, §7).

---

## 4. Rediseño del README (landing page)

`README.md` = landing en español + `README.en.md` = landing en inglés, con selector de idioma arriba (`🌐 English · Español`). Ambos enlazan a `docs/es/` y `docs/en/` respectivamente. Nueva estructura (concisa, actual, enlaza a `docs/`):
1. **Hero**: logo, tagline, badges (DuckDB, License, versión).
2. **Qué es AmoxSQL** (2–3 párrafos): IDE de datos local-first para DuckDB; analistas/ingenieros; privacidad + velocidad + IA local.
3. **Capacidades en un vistazo** (grid corto, ACTUAL): Editor SQL inteligente · Notebooks · Story Flow (viz) · Report Flow (decks) · Data Flow (pipelines) · DBT Studio · IA agéntica (Asistente + Deep Dive) · Perfilado + Plan de ejecución. Cada una con una línea y **link a su doc**.
4. **Capturas** (las de `images/`).
5. **Instalación rápida** (descargar / compilar) → link a `docs/guia-de-usuario/02-instalacion.md`.
6. **Documentación** → tabla de enlaces a las secciones de `docs/`.
7. **Novedades**: reemplazar el bloque congelado en v3.3 por un resumen de los últimos 2–3 releases + link al CHANGELOG (fuente de verdad).
8. **El nombre / emblema** (se conserva, más breve).
9. **Sponsor · Licencia · Créditos · Contribuir · Footer**.

El catálogo exhaustivo de features actual sale del README y vive en `docs/`.

---

## 5. Disposición de la documentación existente

| Acción | Archivos |
|---|---|
| **Conservar (interno dev), refrescar encabezado** | CLAUDE.md (fix `.sqlnb` v3.0 + localStorage), docs/dev/{arquitectura, decisiones_tecnicas, patrones_react, guia_estilos, guia_graficos_storytelling, mapa_aplicacion}.md |
| **Migrar contenido → nuevos docs de usuario, luego marcar como interno** | contexto_caracteristicas/* (su contenido alimenta `docs/`; se dejan como referencia dev con nota "ver docs/ para la guía de usuario") |
| **Archivar (históricos/status)** | mover `plan_*`, `auditoria_*`, `deep_dive_*` a `docs/dev/archivo/` con un índice; no son docs vivos |
| **Arreglar** | SECURITY.md (versiones → 3.x), CONTRIBUTING.md (`npm`→`pnpm`), docs/dev/README.md (versión + `npm`) |
| **Retirar** | client/README.md (boilerplate Vite), pendiente_rendimiento_multiples_graficos.md (superado) |

---

## 6. Fases de ejecución

Cada fase = un commit (o varios). Ninguna toca código de la app salvo, opcionalmente, correcciones de docstrings (§1).

- **F0 — Andamiaje y correcciones base**
  - Crear árbol `docs/` + `docs/README.md` (índice) + una plantilla de página de feature.
  - Arreglar SECURITY.md, CONTRIBUTING.md, docs/dev/README.md, client/README.md, retirar el pendiente superado, reconciliar `.sqlnb` v3.0 + localStorage en CLAUDE.md.
- **F1 — Primeros pasos y plataforma** (`guia-de-usuario/`, `conceptos/`): 8 docs.
- **F2 — Editor, SQL, notebooks, resultados** (`editor/`, `notebooks/`, `resultados/`): ~15 docs.
- **F3 — Datos: explorar, importar, exportar** (`datos/`): 7 docs.
- **F4 — Studios de viz/reportes/transformación/dbt** (`visualizacion/`, `reportes/`, `data-flow/`, `dbt/`): ~11 docs.
- **F5 — Sistema de IA** (`ia/`): 12 docs (la fase más grande).
- **F6 — Referencia** (`referencia/`): 4 docs + **rediseño del README**.
- **F7 — Cierre**: cross-linking, insertar capturas, y una **pasada de completitud** contra la matriz (§7) para garantizar que nada quedó sin documentar. Actualizar la sección "Further Reading" de CLAUDE.md para apuntar a `docs/`.

---

## 7. Matriz de completitud (garantía de "nada sin documentar")

Cada capacidad del inventario mapea a ≥1 doc. Resumen de cobertura:

- **IDE core:** editor SQL, autocompletado (3 capas + DESCRIBE de CTEs), hover, CTE debug, formato, find/replace, error markers, variables `${}`, snippets, bookmarks, historial, command palette, layout/tabs/split/popout/drafts, multi-statement→notebook → `editor/`, `resultados/`, `guia-de-usuario/`.
- **Notebooks:** celdas SQL/MD/Input, ejecución batch, DAG reactivo, report/present, export HTML/Word/PDF, formato v3.0+legacy → `notebooks/`.
- **Resultados:** table/chart/profile, search/filter/sort/compare/popout, Download vs Export, Save as table, Save to Vault, Data Profiler, Plan de ejecución, Data Quality → `resultados/`.
- **Datos:** File Explorer (CRUD/menús/gsheets), DB Explorer, ER, import CSV/Excel/Parquet/JSON, export local+cloud, extensiones, 3 lanes → `datos/`, `conceptos/arquitectura`.
- **Story Flow:** 6 etapas, 17 tipos, storytelling/overlays, formato/estilo, export PNG/.amoxvis/paste → `visualizacion/`.
- **Report Flow:** .amoxdeck, layouts, estudio, charts refrescables, PPTX/Word → `reportes/`.
- **Data Flow:** .sqlchain, 33 nodos, editor, run/SSE/logs/history, motor (checkpoint/materialización), YAML/SQL, AI generate → `data-flow/`.
- **DBT:** setup/config/models/sources/commands/lineage → `dbt/`.
- **IA:** 2 modos + fallback, 6 proveedores + tiers, agentic loop, tools, skills (14), contexto-como-código, memoria, vault, metadata-para- IA + skills descargables, prompt-only, guardrails (linters/join/findings/watchdog/self-correct), prompt caching, uiTheme → `ia/`.
- **Plataforma/referencia:** arquitectura 3 procesos, settings (10 pestañas), config.json, formatos de archivo (8), atajos, temas, proyectos → `referencia/`, `conceptos/`, `guia-de-usuario/`.

"Gemas" poco conocidas a destacar explícitamente en sus docs: DESCRIBE-completion de CTEs, DAG reactivo de inputs, Store-A/Compare, glifo ▶ de CTE, xlsxMeta (lectura rápida de hojas), 3 lanes, prompt caching Anthropic, reasoning always-on de MiniMax, linters de gráficos, verificación de findings, contexto-como-código, finalize-now/continue.

---

## 8. Entregable de este plan

Aprobado el plan, la ejecución produce ~100 archivos (ES+EN) en `docs/`, README landing bilingüe (`README.md` + `README.en.md`), y las correcciones de F0. Commit por fase.

**Estrategia recomendada para un entregable de este tamaño:** empezar con **F0 (andamiaje + correcciones) + una página piloto completa en ES y EN** (p. ej. `editor/editor-sql.md`) para validar formato, tono, profundidad y el patrón bilingüe **antes** de producir en masa las ~100 páginas. Con el piloto aprobado, se ejecutan F1–F7 por fases. Cada página ES se escribe primero y su gemela EN se traduce en la misma fase.
