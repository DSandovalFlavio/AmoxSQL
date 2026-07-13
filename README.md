<img src="./assets/logo.svg" alt="AmoxSQL Logo" width="220" height="220" align="center"/>

# AmoxSQL

> **El Códice Moderno para el Análisis Local de Datos.**
>
> *Un IDE de datos local-first, de alto rendimiento, construido desde Latinoamérica para la comunidad global.*

**🌐 [English](./README.en.md) · Español**

[![Built for DuckDB](https://img.shields.io/badge/Built%20for-DuckDB-fff000?logo=duckdb&logoColor=black)](https://duckdb.org/)
[![License: Source Available](https://img.shields.io/badge/License-Source%20Available-blue)](./LICENSE)
[![Maintainer](https://img.shields.io/badge/maintainer-@dsandovalflavio-blue)](https://github.com/dsandovalflavio)

**AmoxSQL** es un IDE de datos de escritorio, profesional y de alto rendimiento, construido específicamente para [DuckDB](https://duckdb.org/). Para analistas e ingenieros que necesitan velocidad, privacidad y herramientas avanzadas — sin la sobrecarga de la nube. Tus datos, el motor y hasta la IA viven en tu máquina.

<img src="./images/02_main_ide.png" alt="AmoxSQL IDE" width="100%" />

---

## ✨ Capacidades

| | Qué hace | Guía |
|---|---|---|
| **Editor SQL** | Monaco con autocompletado que entiende tu esquema real (incluidas columnas de CTEs), depuración de CTEs, formato y ejecución en un atajo. | [→](./docs/es/editor/sql-editor.md) |
| **Notebooks** | Cuadernos `.sqlnb` tipo Jupyter para análisis narrados, con celdas de entrada reactivas y export a HTML/Word/PDF. | [→](./docs/es/notebooks/notebooks.md) |
| **Story Flow** | Visualización con storytelling: 17 tipos de gráfico en un flujo de 6 etapas, anotaciones, KPIs y narrativa. | [→](./docs/es/visualization/story-flow.md) |
| **Report Flow** | Presentaciones `.amoxdeck` con gráficos refrescables; export a PowerPoint (editable) y Word. | [→](./docs/es/reports/report-flow.md) |
| **Data Flow** | Constructor visual de canalizaciones (DAG) con 33 tipos de nodo, ejecución por pasos y enriquecimiento con IA. | [→](./docs/es/data-flow/data-flow.md) |
| **IA agéntica** | Asistente en el editor + **Deep Dive** que explora tu BD solo. Corre 100% local (Ollama) o en la nube. | [→](./docs/es/ai/introduction.md) |
| **DBT Studio** | Desarrolla con dbt + DuckDB: modelos, sources, comandos y grafo de linaje. | [→](./docs/es/dbt/dbt-studio.md) |
| **Perfilado & Plan** | EDA con storytelling y plan de ejecución real (`EXPLAIN ANALYZE`) con pistas de optimización. | [→](./docs/es/results/data-profiler.md) |

---

## 📚 Documentación

La guía completa (bilingüe ES/EN) vive en **[`docs/`](./docs/README.md)**:

- **Empezar:** [Introducción](./docs/es/user-guide/introduction.md) · [Instalación](./docs/es/user-guide/installation.md) · [Primeros pasos](./docs/es/user-guide/first-steps.md) · [La interfaz](./docs/es/user-guide/interface.md)
- **Editor y datos:** [Editor SQL](./docs/es/editor/sql-editor.md) · [Explorador de archivos](./docs/es/data/file-explorer.md) · [Importar](./docs/es/data/importing-data.md) · [Exportar](./docs/es/data/exporting-data.md)
- **Análisis:** [Tabla de resultados](./docs/es/results/results-table.md) · [Data Profiler](./docs/es/results/data-profiler.md) · [Plan de ejecución](./docs/es/results/execution-plan.md)
- **Studios:** [Story Flow](./docs/es/visualization/story-flow.md) · [Report Flow](./docs/es/reports/report-flow.md) · [Data Flow](./docs/es/data-flow/data-flow.md) · [DBT](./docs/es/dbt/dbt-studio.md)
- **IA:** [Introducción](./docs/es/ai/introduction.md) · [Deep Dive](./docs/es/ai/deep-dive.md) · [Proveedores y modelos](./docs/es/ai/providers-and-models.md) · [Skills](./docs/es/ai/skills.md)
- **Referencia:** [Formatos de archivo](./docs/es/reference/file-formats.md) · [Configuración](./docs/es/reference/configuration.md) · [Atajos](./docs/es/reference/keyboard-shortcuts.md) · [Glosario](./docs/es/reference/glossary.md)

---

## ⬇️ Instalación

**Descargar (Windows):** el instalador pre-construido está en **[GitHub Releases](https://github.com/dsandovalflavio/amoxsql/releases/latest)**.

**Compilar desde fuente** (siempre gratis): requiere Node.js 20+, pnpm 11+ y herramientas de C++.
```bash
git clone https://github.com/dsandovalflavio/amoxsql.git && cd amoxsql
pnpm install && pnpm --dir client install
pnpm start
```
Guía completa: [Instalación](./docs/es/user-guide/installation.md).

> Los instaladores pre-construidos continuos están disponibles para [GitHub Sponsors](https://github.com/sponsors/dsandovalflavio). Compilar desde fuente es siempre gratis.

---

## 🆕 Novedades

La versión actual es **v3.8.3**. Lo más reciente: el export ahora pertenece a la query (WYSIWYG), Excel exportado que abre de verdad, metadata de archivos casi instantánea, y una auditoría de ubicación de botones en toda la UI. Antes: Deep Dive reimaginado (narrativa, gráficos con teoría del color, razonamiento MiniMax), Report Flow y export a Office, y el rediseño del sistema de temas.

> Historial completo en **[CHANGELOG.md](./CHANGELOG.md)**.

---

## 📜 El nombre

**"Amox"** viene del náhuatl ***Amoxtli*** ("libro" o "códice"). En Mesoamérica, los códices registraban conocimiento — historia, cálculos, saber. AmoxSQL es un códice digital moderno para la era de los datos: transforma datos crudos y opacos en visualizaciones claras y luminosas. El glifo luminoso fusiona estructura antigua y energía moderna.

---

## 🛠️ Tech Stack

Escritorio (Electron) · Frontend [React](https://reactjs.org/) + [Vite](https://vitejs.dev/) + [Monaco](https://microsoft.github.io/monaco-editor/) + [Recharts](https://recharts.org/) · Backend [Node.js](https://nodejs.org/) + [Express](https://expressjs.com/) · Motor [DuckDB](https://duckdb.org/) · IA [Ollama](https://ollama.ai/) (local) + nube (Google Gemini, Anthropic, OpenAI, Google Vertex, MiniMax) vía [Vercel AI SDK](https://sdk.vercel.ai/).

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
