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

## Cómo se sacan (2026-10-25)

Las capturas salen del **proyecto de ejemplo** (`scripts/ejemplos/`, ver
`docs/es/user-guide/example-project.md`), con datos reales y siempre en una casa
temporal de AmoxSQL:

1. `node scripts/ejemplos/crearEjemplos.mjs` — crea «Ejemplos AmoxSQL» en el escritorio.
2. `node scripts/ejemplos/servirEjemplos.mjs` y `pnpm client:dev` — la interfaz en
   `http://localhost:5173/?apiPort=3911`.
3. `pnpm exec electron scripts/ejemplos/capturador.cjs` — una ventana de 1440×900 a
   escala 1.5 que se maneja por HTTP (puerto 3999: `/js`, `/raton`, `/tecla`, `/foto`).
   Las fotos salen a 1600 px de ancho.

Hechas: 44 en `docs/images/` y las 9 de `images/` que usa el README, rehechas con el
ejemplo (02 es ahora el Canvas).

## Pendientes

Necesitan un modelo de IA conectado o un servicio externo:

- [ ] `docs/images/ai/deep-dive-overview.png` — las tres regiones de Deep Dive.
- [ ] `docs/images/ai/agent-tools-inspector.png` — una tool call execute_sql en el inspector.
- [ ] `docs/images/ai/guardrails-caveat.png` — una respuesta con aviso de cifra no verificada.
- [ ] `docs/images/ai/memories-panel.png` — memorias con badges Rule/Fact.
- [ ] `docs/images/ai/analysis-vault.png` — el Vault con entradas.
- [ ] `docs/images/ai/metadata-for-ai.png` — el modal Metadata for AI.
- [ ] `docs/images/ai/prompt-only-badge.png` — un modelo low-tier en modo prompt-only.
- [ ] `docs/images/data/gsheets-section.png` — una hoja de Google Sheets conectada.
- [ ] `docs/images/data/export-modal.png` — el diálogo de exportar.
- [ ] `docs/images/editor/drag-drop-zones.png` — arrastrar una pestaña entre paneles.
- [ ] `docs/images/user-guide/split-view.png` — la vista dividida.
- [ ] `images/07_ai_sidebar.png` — es de una versión anterior; rehacer con el ejemplo y un modelo.

## Cómo colocar una imagen (recordatorio de rutas)
1. Guarda el PNG en `docs/images/<area>/<nombre>.png`.
2. En la página, reemplaza el comentario `<!-- 📷 CAPTURE ... -->` por:
   `<img src="../../images/<area>/<nombre>.png" alt="<descripción>" width="100%" />`
   (desde `docs/es/<area>/` o `docs/en/<area>/`, la ruta a `docs/images/` es `../../images/`).
   Las capturas existentes de `/images/` en la raíz usan `../../../images/NN_nombre.png`.
3. Hazlo en la versión ES **y** EN de la página (comparten la misma imagen).
