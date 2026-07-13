# Manifiesto de capturas para la documentación

Lista viva de imágenes y videos que la documentación de usuario necesita. Se
llena a medida que se escriben las páginas (F1–F7). El autor (Flavio) produce
las capturas nuevas; las existentes en `images/` se reutilizan.

## Convenciones
- **Imágenes nuevas:** guardar en `docs/images/<area>/<nombre>.png` (compartidas ES/EN).
- **Marcador en la página** (mientras no exista la imagen): un comentario HTML
  `<!-- 📷 CAPTURE: docs/images/<area>/<nombre>.png — <qué mostrar> -->`.
  Al tener la imagen, reemplazar por:
  `<img src="../../images/<area>/<nombre>.png" alt="<descripción>" width="100%" />`
  (ajustar la profundidad relativa: desde `docs/es/<area>/` son `../../images/...`).
- **Videos:** subir a YouTube (canal del autor) y embeber como enlace-miniatura;
  ideales para flujos (Deep Dive, Data Flow, Story Flow).

## Existentes reutilizables (`images/`)
| Archivo | Usar en |
|---|---|
| 01_welcome_screen.png | user-guide/first-steps, introduction |
| 02_main_ide.png | user-guide/interface, introduction |
| 03_database_explorer.png | data/database-explorer |
| 04_sql_editor.png | editor/sql-editor |
| 05_sql_notebook.png | notebooks/notebooks |
| 06_data_visualizer.png | visualization/story-flow |
| 07_ai_sidebar.png | ai/editor-assistant, ai/introduction |
| 08_dbt_studio.png | dbt/dbt-studio |
| 09_settings_modal.png | user-guide/themes-and-appearance, reference/configuration |
| 10_er_diagram.png | data/er-diagram |
| 11_query_plan.png | results/execution-plan |
| 12_data_profiler.png | results/data-profiler |

## Capturas NUEVAS necesarias

### F1 — Primeros pasos y plataforma
- [ ] `docs/images/user-guide/db-selection-modal.png` — modal de selección de BD (In-Memory / Read-Only / Read-Write) tras abrir un proyecto.
- [ ] `docs/images/user-guide/activity-bar.png` — la activity bar lateral con sus iconos (Explorer, Schema, Extensions, DBT, Snippets, History, Vault, Git, Deep Dive) resaltada.
- [ ] `docs/images/user-guide/split-view.png` — vista dividida en dos paneles (una query a la izquierda, resultados/otra a la derecha).
- [ ] `docs/images/user-guide/theme-gallery.png` — Ajustes → Appearance con la galería de temas y acentos.
- [ ] `docs/images/user-guide/command-palette.png` — la command palette abierta (Ctrl+Shift+P) con acciones.
- [ ] `docs/images/user-guide/title-bar-workspace.png` — la barra de título con el widget de workspace (nombre · MEM/RO/RW · db) desplegado.

### Videos sugeridos (opcionales, alto valor)
- [ ] **Tour de 2 min de la interfaz** — abrir proyecto → ejecutar query → ver resultados → cambiar a Chart. (para user-guide/interface)

### F2 — Editor, notebooks y resultados
- [ ] `docs/images/editor/autocomplete-dot-access.png` — popup de columnas tras teclear un alias seguido de punto.
- [ ] `docs/images/editor/autocomplete-hover-doc.png` — tarjeta hover con la firma y descripción de una función.
- [ ] `docs/images/editor/cte-debug-glyph.png` — glifo ▶ en el margen junto a una definición de CTE.
- [ ] `docs/images/editor/cte-debug-modal.png` — ventana con el resultado intermedio de una CTE.
- [ ] `docs/images/editor/variables-bar.png` — panel de variables expandido bajo la barra de acciones.
- [ ] `docs/images/editor/snippets-panel.png` — panel de snippets con categorías expandidas.
- [ ] `docs/images/editor/history-modal.png` — historial con las pestañas History y Bookmarked.
- [ ] `docs/images/editor/bookmarks-tab.png` — pestaña Bookmarked con queries marcadas.
- [ ] `docs/images/editor/command-palette.png` — paleta de comandos abierta con acciones por categoría.
- [ ] `docs/images/editor/tab-bar.png` — barra de pestañas con el botón + y el menú de nuevo archivo.
- [ ] `docs/images/editor/drag-drop-zones.png` — overlay de drop al arrastrar una pestaña entre paneles.
- [ ] `docs/images/results/results-table.png` — panel de resultados en modo Table (switcher, search, filtros, paginación).
- [ ] `docs/images/results/compare-results.png` — modal Compare (selector de clave + pestañas Added/Removed/Unchanged).

### F3 — Datos
- [ ] `docs/images/data/file-explorer.png` — explorador: header de acciones, búsqueda, breadcrumb, lista con iconos por tipo y badges de git.
- [ ] `docs/images/data/import-modal.png` — diálogo "Import to Database" (nombre de tabla, schema opcional, limpiar columnas).
- [ ] `docs/images/data/export-modal.png` — diálogo "Export Data" (Local/Cloud, formatos, filename).
- [ ] `docs/images/data/gsheets-section.png` — sección Google Sheets con una hoja expandida mostrando tabs como tablas.
- [ ] `docs/images/data/extensions-panel.png` — panel de extensiones (chips de filtro, búsqueda, cards con Install/Load).

### F4 — Visualización, reportes y Data Flow
- [ ] `docs/images/visualization/chart-type-selector.png` — etapa Type con las 5 categorías de intención y sus iconos.
- [ ] `docs/images/visualization/story-stage.png` — pestaña Story junto a un gráfico con título, takeaway y goal line.
- [ ] `docs/images/visualization/format-style-tabs.png` — pestañas Format y Style lado a lado.
- [ ] `docs/images/visualization/export-stage.png` — pestaña Export (portapapeles, presets de tamaño, configuración).
- [ ] `docs/images/reports/report-flow-studio.png` — Report Flow Studio en vista Design (toolbar, panel Slides/Layouts/Charts, slide activa).
- [ ] `docs/images/reports/export-to-office-menu.png` — dropdown de export PowerPoint (Native vs Image, Image en gris fuera de Present).
- [ ] `docs/images/data-flow/data-flow-editor.png` — editor Data Flow: paleta izquierda, DAG multi-nodo, panel de config derecha.
- [ ] `docs/images/data-flow/node-palette.png` — paleta de nodos expandida con los 9 grupos por intención.
- [ ] `docs/images/data-flow/running-status.png` — chain a mitad de ejecución: badges de estado por nodo, barra de progreso, panel de logs.

### F5 — IA
- [ ] `docs/images/ai/deep-dive-overview.png` — las tres regiones de Deep Dive (chat · inspector · Session Inventory/Plan).
- [ ] `docs/images/ai/settings-ai-providers.png` — Ajustes → AI (selector de proveedor, API key, modelo por defecto).
- [ ] `docs/images/ai/agent-tools-inspector.png` — inspector con una tool call execute_sql (SQL + tabla + tiempo).
- [ ] `docs/images/ai/prompt-only-badge.png` — selector de modelo en un modelo low-tier (modo prompt-only).
- [ ] `docs/images/ai/skills-panel.png` — panel de Skills con las built-in (nombre/descripción/keywords), una expandida.
- [ ] `docs/images/ai/context-folder.png` — Ajustes → AI context con el estado de la carpeta `context/`.
- [ ] `docs/images/ai/memories-panel.png` — panel de Memorias con badges Rule/Fact y editar/borrar.
- [ ] `docs/images/ai/analysis-vault.png` — panel Analysis Vault con entradas (título, preview SQL, tags, acciones).
- [ ] `docs/images/ai/metadata-for-ai.png` — modal "Metadata for AI" (slider de filas, toggle de perfil, aviso de tamaño, preview).
- [ ] `docs/images/ai/guardrails-caveat.png` — respuesta de IA con caveat de cifra no verificada y aviso de join fan-out.

## Cómo colocar una imagen (recordatorio de rutas)
1. Guarda el PNG en `docs/images/<area>/<nombre>.png`.
2. En la página, reemplaza el comentario `<!-- 📷 CAPTURE ... -->` por:
   `<img src="../../images/<area>/<nombre>.png" alt="<descripción>" width="100%" />`
   (desde `docs/es/<area>/` o `docs/en/<area>/`, la ruta a `docs/images/` es `../../images/`).
   Las capturas existentes de `/images/` en la raíz usan `../../../images/NN_nombre.png`.
3. Hazlo en la versión ES **y** EN de la página (comparten la misma imagen).
