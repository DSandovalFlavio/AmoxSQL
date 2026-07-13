# La interfaz

**🌐 [English](../../en/user-guide/interface.md) · Español**

> Un recorrido por las zonas de AmoxSQL: la barra de actividad, el panel lateral, el área de editor con pestañas y paneles divididos, y la paleta de comandos.

<img src="../../../images/02_main_ide.png" alt="IDE principal de AmoxSQL" width="100%" />

## Zonas principales

### Barra de título (arriba)
Muestra el **workspace activo** (nombre · modo de conexión MEM/RO/RW · base) y controles de ventana. El widget de workspace despliega proyectos recientes y la opción de cerrar el workspace.

<!-- 📷 CAPTURE: docs/images/user-guide/title-bar-workspace.png — barra de título con el widget de workspace desplegado -->

### Barra de actividad (extremo izquierdo)
Iconos que cambian el contenido del panel lateral:

<!-- 📷 CAPTURE: docs/images/user-guide/activity-bar.png — la activity bar con sus iconos resaltados -->

| Icono | Panel |
|---|---|
| Explorer | [Explorador de archivos](../data/file-explorer.md) del proyecto |
| Database Schema | [Explorador de base de datos](../data/database-explorer.md) (esquemas, tablas, ER) |
| Extensions | [Extensiones de DuckDB](../data/duckdb-extensions.md) |
| DBT Studio | [Integración DBT](../dbt/dbt-studio.md) |
| Snippets | [Fragmentos SQL](../editor/snippets.md) |
| Query History | [Historial y bookmarks](../editor/history-and-bookmarks.md) |
| Analysis Vault | [Análisis guardados](../ai/analysis-vault.md) |
| Source Control | Estado de Git del proyecto |
| Deep Dive | [Análisis agéntico profundo](../ai/deep-dive.md) |

Abajo: **Chart Gallery**, **New Execution Chain** ([Data Flow](../data-flow/data-flow.md)), colapsar sidebar y **Ajustes**.

### Área de editor (centro)
Aquí viven las **pestañas**. Cada pestaña es un archivo (`.sql`, `.sqlnb`, `.sqlchain`, `.md`, `.amoxdeck`, `.amoxvis`) o una vista especial (Deep Dive, diagrama ER, linaje DBT). Puedes:

- **Dividir en dos paneles** y arrastrar pestañas entre ellos (ver [Layout, pestañas y paneles](../editor/layout-tabs-and-panes.md)).
- Editar SQL con resultados debajo (ver [Editor SQL](../editor/sql-editor.md)).

<!-- 📷 CAPTURE: docs/images/user-guide/split-view.png — vista dividida en dos paneles -->

### Panel de resultados (debajo del editor)
Aparece al ejecutar una query. Alterna entre **Table**, **Chart** y **Profile**. Ver [Tabla de resultados](../results/results-table.md).

## Paleta de comandos

**Ctrl+Shift+P** abre la paleta: busca y ejecuta cualquier acción (correr query, guardar, cambiar tema, abrir paneles, zoom, tours…). Es la forma más rápida de llegar a cualquier función sin recordar dónde está. Ver [Paleta de comandos](../editor/command-palette.md).

<!-- 📷 CAPTURE: docs/images/user-guide/command-palette.png — paleta de comandos abierta -->

## Apariencia

El tema (claro/oscuro, 10 temas), el color de acento, la tipografía y el zoom se ajustan en **Ajustes → Appearance**. Ver [Temas y apariencia](themes-and-appearance.md).

## Relacionado
- [Primeros pasos](first-steps.md) · [Proyectos y conexiones](projects-and-connections.md)
- [Layout, pestañas y paneles](../editor/layout-tabs-and-panes.md) · [Paleta de comandos](../editor/command-palette.md)
- [Atajos de teclado](../reference/keyboard-shortcuts.md)
