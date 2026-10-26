<img src="./assets/logo.svg" alt="AmoxSQL Logo" width="220" height="220" align="center"/>

# AmoxSQL

> **El Códice Moderno para el Análisis Local de Datos.**
>
> *Un IDE de datos local-first, de alto rendimiento, construido desde Latinoamérica para la comunidad global.*

**🌐 [English](./README.en.md) · Español**

[![Built for DuckDB](https://img.shields.io/badge/Built%20for-DuckDB-fff000?logo=duckdb&logoColor=black)](https://duckdb.org/)
[![Latest release](https://img.shields.io/github/v/release/dsandovalflavio/amoxsql)](https://github.com/dsandovalflavio/amoxsql/releases/latest)
[![License: Source Available](https://img.shields.io/badge/License-Source%20Available-blue)](./LICENSE)
[![Maintainer](https://img.shields.io/badge/maintainer-@dsandovalflavio-blue)](https://github.com/dsandovalflavio)

**AmoxSQL** es un IDE de datos de escritorio construido para [DuckDB](https://duckdb.org/): una mesa de trabajo local donde entran archivos, se analizan y se explican, y salen como un Excel, una presentación o un proceso que corre solo. Para analistas e ingenieros de datos que necesitan velocidad y privacidad: tus datos, el motor y hasta la IA viven en tu máquina.

<img src="./images/02_main_ide.png" alt="AmoxSQL: un Canvas con la fuente de ventas, dos ramas con sus gráficos, una cifra y una nota" width="100%" />

---

## ✨ Capacidades

| | Qué hace | Guía |
|---|---|---|
| **Editor SQL** | Monaco con autocompletado que conoce tu esquema real (las columnas de cada alias, las CTE, tus métricas como funciones), depuración de CTE, variables, historial y snippets. | [→](./docs/es/editor/sql-editor.md) |
| **Cuadernos** | `.sqlnb` en markdown: cada celda deja una vista con su nombre, la siguiente la lee y **Refresh** las corre en orden de dependencias. Parámetros, borradores, exporta a Word y HTML. | [→](./docs/es/notebooks/notebooks.md) |
| **Canvas** | Un lienzo infinito para pensar un análisis: fuentes, consultas, gráficos, cifras y notas conectadas por lo que lee cada consulta. Se presenta por marcos y sale a un deck, un cuaderno o un proceso. | [→](./docs/es/notebooks/canvas.md) |
| **Story Flow** | Gráficos que dicen algo: 17 tipos en 6 etapas (tipo, datos, formato, estilo, historia, exportar), con conclusión, anotaciones y líneas de meta. | [→](./docs/es/visualization/story-flow.md) |
| **Report Flow** | Presentaciones `.amoxdeck` con gráficos que se refrescan contra los datos; exporta a PowerPoint editable y Word. | [→](./docs/es/reports/report-flow.md) |
| **Los datos donde están** | **Fuentes con nombre** sobre un archivo, una carpeta de archivos mensuales, un bucket o un lago, con un **contrato** que detiene un proceso si el cliente cambia una columna. | [→](./docs/es/data/sources.md) |
| **Data Flow** | Procesos visuales (37 tipos de paso): de la fuente a un Excel con formato, a la plantilla del cliente o a un Parquet publicado. Parámetros con tipo, formularios y lotes. | [→](./docs/es/data-flow/data-flow.md) |
| **Que corra solo** | **Programación** (días hábiles, el N-ésimo hábil, al llegar un archivo), avisos, ficha de cada ejecución y el panel de **Operations**. | [→](./docs/es/data-flow/scheduling.md) |
| **Workspaces** | Agrupa proyectos por cliente, equipo o marca: contexto, métricas y snippets compartidos, política de IA por cliente y lo que necesita atención. | [→](./docs/es/user-guide/workspaces.md) |
| **dbt y DuckLake** | dbt dentro del editor (barra del modelo, vista previa, completado, linaje con resultados) y lagos DuckLake con versiones y «como estaba». | [→](./docs/es/dbt/dbt-studio.md) |
| **IA agéntica** | Asistente en el editor y **Deep Dive**, con tu contexto (métricas, uniones, glosario). 100 % local con Ollama o en la nube. | [→](./docs/es/ai/introduction.md) |
| **Perfil y plan** | Perfilado con hallazgos (duplicados, atípicos, huecos) y el plan de ejecución real con pistas. | [→](./docs/es/results/data-profiler.md) |

---

## 🧭 Un caso real: el cierre de ventas

El [**proyecto de ejemplo**](./docs/es/user-guide/example-project.md) recorre un caso completo con datos reales: una tienda en línea manda un CSV de ventas cada mes y Finanzas sus metas en Excel. En un solo proyecto: una fuente con nombre y su contrato, una base modelada, ocho consultas, un cuaderno, gráficos, un Canvas, la presentación del comité y un cierre en Data Flow programado para el tercer día hábil que entrega un Excel de dos hojas.

<table>
  <tr>
    <td><img src="./docs/images/notebooks/notebook.png" alt="Cuaderno con celdas con nombre y parámetros" /></td>
    <td><img src="./docs/images/visualization/story-stage.png" alt="Story Flow con la conclusión resaltada" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Cuaderno: cada celda es una vista que lee la siguiente</sub></td>
    <td align="center"><sub>Story Flow: el gráfico y lo que significa</sub></td>
  </tr>
  <tr>
    <td><img src="./docs/images/data-flow/running-status.png" alt="Proceso de Data Flow después de correr" /></td>
    <td><img src="./docs/images/reports/report-flow-studio.png" alt="Presentación en Report Flow Studio" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Data Flow: de la carpeta de archivos al Excel de Dirección</sub></td>
    <td align="center"><sub>Report Flow: la presentación del comité, refrescable</sub></td>
  </tr>
  <tr>
    <td><img src="./docs/images/data-flow/schedule-dialog.png" alt="Programar un proceso" /></td>
    <td><img src="./docs/images/user-guide/workspaces.png" alt="Vista de Workspaces" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Programación: el 3er día hábil de cada mes</sub></td>
    <td align="center"><sub>Workspaces: cada cliente, sus proyectos y ejecuciones</sub></td>
  </tr>
</table>

---

## 📚 Documentación

La guía completa (bilingüe ES/EN) vive en **[`docs/`](./docs/README.md)**:

- **Empezar:** [Introducción](./docs/es/user-guide/introduction.md) · [Instalación](./docs/es/user-guide/installation.md) · [Primeros pasos](./docs/es/user-guide/first-steps.md) · [Proyecto de ejemplo](./docs/es/user-guide/example-project.md) · [La interfaz](./docs/es/user-guide/interface.md) · [Workspaces](./docs/es/user-guide/workspaces.md)
- **Editor y datos:** [Editor SQL](./docs/es/editor/sql-editor.md) · [Fuentes con nombre](./docs/es/data/sources.md) · [Contratos](./docs/es/data/source-contracts.md) · [Importar](./docs/es/data/importing-data.md) · [Exportar](./docs/es/data/exporting-data.md)
- **Análisis:** [Cuadernos](./docs/es/notebooks/notebooks.md) · [Canvas](./docs/es/notebooks/canvas.md) · [Tabla de resultados](./docs/es/results/results-table.md) · [Data Profiler](./docs/es/results/data-profiler.md) · [Plan de ejecución](./docs/es/results/execution-plan.md)
- **Studios:** [Story Flow](./docs/es/visualization/story-flow.md) · [Report Flow](./docs/es/reports/report-flow.md) · [Data Flow](./docs/es/data-flow/data-flow.md) · [Programar procesos](./docs/es/data-flow/scheduling.md) · [dbt](./docs/es/dbt/dbt-studio.md)
- **IA:** [Introducción](./docs/es/ai/introduction.md) · [Deep Dive](./docs/es/ai/deep-dive.md) · [Proveedores y modelos](./docs/es/ai/providers-and-models.md) · [Contexto como código](./docs/es/ai/context-as-code.md)
- **Referencia:** [Formatos de archivo](./docs/es/reference/file-formats.md) · [Configuración](./docs/es/reference/configuration.md) · [Atajos](./docs/es/reference/keyboard-shortcuts.md) · [Glosario](./docs/es/reference/glossary.md)

---

## ⬇️ Instalación

**Descargar:** los instaladores están en **[GitHub Releases](https://github.com/dsandovalflavio/amoxsql/releases/latest)**.
- **Windows** — `AmoxSQL Setup <versión>.exe` (NSIS, sin firmar: Windows puede pedirte confirmación).
- **macOS (Apple Silicon · M1–M4)** — `AmoxSQL-<versión>-arm64.dmg`. ⚠️ **Beta sin verificar en hardware Mac real** — pruébalo y [danos feedback](https://github.com/dsandovalflavio/amoxsql/issues). Primer arranque: `xattr -cr /Applications/AmoxSQL.app` (ver [guía](./docs/es/user-guide/installation.md)).

**Compilar desde fuente** (siempre gratis): requiere Node.js 22.13+, pnpm 11+ y herramientas de C++.
```bash
git clone https://github.com/dsandovalflavio/amoxsql.git && cd amoxsql
pnpm install && pnpm --dir client install
pnpm start
```
Guía completa: [Instalación](./docs/es/user-guide/installation.md).

---

## 🆕 Novedades

La versión actual es **v5.15.0 — El Canvas**: un lienzo infinito para pensar un análisis, con tarjetas conectadas por lo que lee cada consulta, una foto que abre sin ejecutar nada y salida a un deck, un cuaderno o un proceso. Reúne además todo lo hecho desde la 5.10: los datos donde están (fuentes con nombre, carpetas, buckets, lagos), procesos que corren solos (programación, Excel y plantillas, parámetros, Operations), dbt y DuckLake dentro del editor, flujos fiables (contratos de fuente, «Needs attention», métricas como funciones) y el día a día (donde lo dejaste, proyectos en un archivo, comparar entregas).

> Historial completo en **[CHANGELOG.md](./CHANGELOG.md)**.

---

## 📜 El nombre

**"Amox"** viene del náhuatl ***Amoxtli*** ("libro" o "códice"). En Mesoamérica, los códices registraban conocimiento — historia, cálculos, saber. AmoxSQL es un códice digital moderno para la era de los datos: transforma datos crudos y opacos en visualizaciones claras y luminosas. El glifo luminoso fusiona estructura antigua y energía moderna.

---

## 🛠️ Tech Stack

Escritorio (Electron) · Frontend [React](https://reactjs.org/) + [Vite](https://vitejs.dev/) + [Monaco](https://microsoft.github.io/monaco-editor/) + [Recharts](https://recharts.org/) · Backend [Node.js](https://nodejs.org/) + [Express](https://expressjs.com/) · Motor [DuckDB](https://duckdb.org/) · IA [Ollama](https://ollama.ai/) (local) + nube (Google Gemini, Anthropic, OpenAI, Google Vertex) vía [Vercel AI SDK](https://sdk.vercel.ai/).

Más en [Arquitectura](./docs/es/concepts/architecture.md).

---

## ❤️ Sponsor

AmoxSQL lo construye y mantiene un desarrollador solo desde Latinoamérica. Si te resulta útil, considera patrocinarlo. Los sponsors obtienen instaladores pre-construidos, acceso anticipado, prioridad en features y canal directo.

👉 **[Conviértete en Sponsor](https://github.com/sponsors/dsandovalflavio)**

---

## ⚖️ Licencia

Source-available bajo la **AmoxSQL Community License**. Puedes ver, modificar y compilar el código para uso personal o educativo. **La redistribución comercial y el uso SaaS están prohibidos.** Ver [LICENSE](./LICENSE).

"AmoxSQL" y su logo son marcas de Flavio Sandoval.

---

## 🤝 Contribuir

¡Bienvenidas las contribuciones! Ver [CONTRIBUTING.md](./CONTRIBUTING.md). Al contribuir, aceptas licenciar tu aporte bajo la AmoxSQL Community License.

---

<p align="center">
  <a href="https://dsandovalflavio.github.io/amoxsql-landing-page/">🌐 Website</a> ·
  <a href="./docs/README.md">📚 Docs</a> ·
  <a href="https://github.com/sponsors/dsandovalflavio">💖 Sponsor</a>
  <br><br>
  Creado con 💙 desde Latinoamérica para el Mundo.
</p>
