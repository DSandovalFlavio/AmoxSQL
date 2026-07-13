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

<!-- Las secciones F2–F7 se agregan a medida que se escriben esas fases. -->
