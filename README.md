<img src="./assets/logo.svg" alt="AmoxSQL Logo" width="300" height="300" align="center"/> 

# AmoxSQL (v2.1.2)

> **El Códice Moderno para el Análisis Local de Datos.**
>
> *Un IDE de alto rendimiento, local-first, construido desde Latinoamérica para la comunidad global de desarrolladores.*


[![Built for DuckDB](https://img.shields.io/badge/Built%20for-DuckDB-fff000?logo=duckdb&logoColor=black)](https://duckdb.org/)
[![License: Source Available](https://img.shields.io/badge/License-Source%20Available-blue)](./LICENSE)
[![Maintainer](https://img.shields.io/badge/maintainer-@dsandovalflavio-blue)](https://github.com/dsandovalflavio)

**AmoxSQL** es un IDE de datos local profesional y de alto rendimiento construido específicamente para [DuckDB](https://duckdb.org/). Diseñado para analistas de datos e ingenieros que necesitan velocidad, privacidad y herramientas avanzadas sin la sobrecarga del cloud.

---

## 📜 La Historia Detrás del Nombre

Los datos son la forma moderna del conocimiento registrado. La identidad de nuestro proyecto está enraizada en este concepto atemporal de la antigua Mesoamérica.

El nombre **"Amox"** deriva de la palabra náhuatl ***Amoxtli***, que significa "libro" o "códice". Estos repositorios sagrados eran usados por los escribas para registrar historia, cálculos astronómicos y conocimiento.

**AmoxSQL** es el sucesor espiritual de aquellas herramientas antiguas — un códice digital moderno diseñado para la era de los datos.

### El Emblema

El glifo luminoso que representa a AmoxSQL simboliza la fusión de estructura antigua y energía moderna.

* **La Estructura:** La 'A' estilizada evoca la precisión arquitectónica de un glifo antiguo o un esquema de datos estructurado.
* **La Luz:** El resplandor cian eléctrico corta a través del entorno oscuro del IDE, representando la promesa central de la herramienta: **transformar datos crudos y opacos en visualizaciones luminosas y claras.**

---

<img src="./images/01_welcome_screen.png" alt="Welcome Screen" width="100%" />

## 🚀 Características Principales

AmoxSQL está diseñado para velocidad, privacidad y una experiencia de desarrollador superior.

<img src="./images/02_main_ide.png" alt="Main IDE" width="100%" />

### 🎨 Sistema de Diseño Linear UI
* **8 Temas de Color:** Obsidian, Onyx, Carbon, Graphite, Nord Dark (oscuros) + Ivory, Mist, Light (claros).
* **13 Colores de Acento:** 7 vibrantes (Cyan, Aqua, Sky, Azure, Blue, Cobalt, Linear Blue) + 6 sobrios (Sage, Amber, Rose, Lavender, Steel, Copper).
* **Layout Flexible:** Horizontal (default) o Vertical para monitores ultrawide.
* **Card-Based Layout:** Interfaz flotante con bordes sutiles y superficies elevadas.

<img src="./images/09_settings_modal.png" alt="Settings Modal" width="100%" />

### 🧠 Arquitectura Central y Flujo de Trabajo
* **Flujo Centrado en Proyectos**: Organiza tu trabajo en carpetas de proyecto. El IDE auto-detecta archivos `.duckdb` o `.db` al abrir un proyecto.
* **Arquitectura Multi-Tab**: Trabaja en múltiples queries y notebooks simultáneamente.
* **Split View**: Compara código lado a lado o visualiza resultados junto a tu editor.
* **Gestión Robusta de Conexiones**: Estrategia de "Hard Reset" para cambios limpios entre proyectos.
* **Resultados Emergentes (Popout)**: Desprende resultados a ventanas independientes para ambientes multi-monitor.

### 🤖 AmoxSQL AI (Inteligencia Agéntica Local y Cloud)
<img src="./images/07_ai_sidebar.png" alt="AI Sidebar" width="100%" />

*   **Sistema Agéntico con Tool-Calling**: El asistente de IA ejecuta herramientas autónomamente (SQL, listar tablas, describir esquemas, generar gráficos, sugerir pasos siguientes).
*   **Nueva Arquitectura de Paneles**: Separación clara entre *AI Assistant* (contexto de archivo activo) y *Data Diving* (exploración a pantalla completa de toda la BD). El agente de Data Diving fue ultra-optimizado previniendo cualquier congelación de interfaz (*UI Lag* / *Crashes*) durante el volcado de diccionarios masivos de respuesta.
*   **Gestión de Contexto Avanzada**: Compactación automática de mensajes, recorte astuto de resultados de herramientas para prevenir sobrecarga de tokens (AI SDK v6 support).
*   **100% Offline y Privado (Local)**: Potenciado por **Ollama** (Qwen 2.5, Llama 3.2, Gemma 2). Tus datos nunca salen de tu máquina.
*   **Cloud Power (Gemini Mode)**: Cambia sin fricciones a la API de Google Gemini con tracking de uso diario.
*   **Gestión Integrada de Modelos**: Descarga nuevos modelos de Ollama directamente desde el IDE con progreso en tiempo real.
*   **Conversaciones Persistentes**: Historial de chat guardado entre sesiones.
*   **Lenguaje Natural a SQL**: Haz preguntas como *"Muéstrame los 5 mejores productos por ventas en 2023"* y obtén SQL DuckDB preciso.

### 💾 Gestión e Inspección de Base de Datos
<img src="./images/03_database_explorer.png" alt="Database Explorer" width="100%" />

*   **Modos de Conexión Flexibles**: In-Memory, Read-Only, o Read/Write.
*   **Inspector de Tablas tipo Data Warehouse**: Schema, Data Profile, Preview (200 rows paginadas), DDL.
*   **Diagramas ER Interactivos**: Visualización SVG automática de tablas y relaciones con drag, zoom, y generación de DDL.

<img src="./images/10_er_diagram.png" alt="ER Diagram" width="100%" />

*   **Drag & Drop Intuitivo**: Arrastra tablas o columnas del sidebar directamente al editor SQL.
*   **Tabla de Resultados Mejorada**: Búsqueda global, ordenamiento por columnas, tipos de datos nativos, redimensionamiento libre.
*   **Guardar en Base de Datos**: Materializa resultados como `TABLE` o `VIEW` directamente.

### 🏗️ DBT Studio e Ingeniería de Datos
<img src="./images/08_dbt_studio.png" alt="DBT Studio" width="100%" />

*   **Integración dbt completa**: Desarrolla con **dbt + DuckDB** nativamente.
*   **Detección de Entorno**: Detecta automáticamente Python, dbt, Conda y Mamba.
*   **Auto-Generadores**: Editores visuales para modelos dbt, sources (`schema.yml`), y perfiles (`profiles.yml`).
*   **Grafo de Linaje (Data Lineage)**: Visualización DAG interactiva de dependencias entre modelos dbt.
*   **Constructor de Comandos**: Ejecuta `dbt run`, `dbt test`, `dbt compile` con salida en terminal en tiempo real.
*   **Cadenas de Ejecución (Visual DAG Builder)**: Construye canalizaciones ETL locales y workflows de datos complejas utilizando la nueva interfaz de grafo arrastrando y soltando (React Flow).
    *   **13 Tipos de Nodos**: Desde ejecución SQL y Notebooks hasta DDL tables, validaciones de calidad, visualizaciones y más.
    *   **Data Flow**: Propagación real de contexto de salida entre nodos dependientes (e.g. validación de calidad basada en subconsultas de nodos SQL anteriores).
    *   **Inspector y Debugger de Grafo**: Previsualización instantánea de código SQL generado y resultados por nodo con una nueva barra de utilidades de diseño reestructurado.

### 📝 Edición SQL y Notebooks
<img src="./images/04_sql_editor.png" alt="SQL Editor" width="100%" />

* **Editor SQL Potente**: Powered by **Monaco Editor** y Tree-sitter.
* **Autocompletado de Archivos Contextual**: Escaneo inteligente de estructura para predecir autocompletado restringido al ámbito de los archivos (`.csv`, `.parquet`, `.json`, `.xlsx`) referenciados EXCLUSIVAMENTE en las cláusulas `FROM/JOIN` de la declaración evaluada en el cursor.
* **SQL Notebooks (`.sqlnb`)**: Experiencia tipo Jupyter para SQL con celdas Markdown y SQL en diseño *card-based floating*.

<img src="./images/05_sql_notebook.png" alt="SQL Notebook" width="100%" />

* **🚀 NUEVO: Editor de Markdown Independiente (`.md`)**: Potente herramienta dedicada a escritores y analistas que desean generar documentación enriquecida, contando con soporte *Split View* (código e interfaz de lectura lado a lado), grid creadora de tablas automática, y soporte robusto para Github Flavored Markdown.
* **Modo Presentación**: Oculta código y muestra solo Markdown, gráficos y tablas.
* **Exportación PDF**: Exporta notebooks como reportes PDF profesionales.
* **Snippets y Variables**: Fragmentos DuckDB integrados e interpolación de parámetros (`${variable_name}`).
* **Historial de Consultas**: Timeline persistente de queries ejecutadas con bookmarks.
* **File Explorer Nutado**: El panel de archivos incorpora renderizado de tamaño en bytes (e.g. `24 KB`), agrupación ordenada flexible, utilidades context-menu anti-desborde responsivas y opciones para extraer metadatos estructurados (nombres de columnas/hojas) directamente al editor.
* **Personalización Premium**: 6 familias tipográficas, minimapa, word wrap, números de línea, tamaño de fuente ajustable.

### 📊 Visualización de Datos e IO
<img src="./images/06_data_visualizer.png" alt="Data Visualizer" width="100%" />

* **Motor Modular de Gráficos**: Arquitectura refactorizada con paneles de configuración dedicados.
    * Tipos: Line, Bar (H/V), Scatter, Donut, Area, **Combo (Bar+Line)**, **Funnel**, **Heatmap**.
* **Configuraciones Persistentes (`.amoxvis`)**: Guarda diseños de visualización como archivos en tu workspace.
* **Controles Avanzados**: Pivot & Agregación, escalas logarítmicas, líneas/áreas de referencia, headlines KPI.
* **Formato Numérico**: Compact (1.2K), Millions (1.2M), Currency, Porcentaje.
* **Exportación de Alta Calidad**: PNG hasta 4x de escala.

### 🐛 Herramientas Avanzadas de Depuración y Profiling
*   **CTE Debugger**: Step-through interactivo para Common Table Expressions.
*   **Plan de Ejecución**: Visualización en árbol jerárquico con detección de cuellos de botella.

<img src="./images/11_query_plan.png" alt="Query Plan" width="100%" />

*   **Data Profiler V2**: EDA automatizado con histogramas, distribuciones, alertas de calidad y heatmap de correlación.

<img src="./images/12_data_profiler.png" alt="Data Profiler" width="100%" />

*   **Importación/Exportación Multi-formato**: CSV, Parquet, JSON, Excel (XLSX).
*   **Cloud Storage**: Exportación directa a AWS S3 y Google Cloud Storage.

---

## 🛠️ Tech Stack

* **Frontend**: [React](https://reactjs.org/), [Vite](https://vitejs.dev/), [Monaco Editor](https://microsoft.github.io/monaco-editor/), [Recharts](https://recharts.org/).
* **Backend**: [Node.js](https://nodejs.org/), [Express](https://expressjs.com/).
* **Database Engine**: [DuckDB](https://duckdb.org/) (via high-performance Node.js bindings).
* **AI**: [Ollama](https://ollama.ai/) (local), [Google Gemini](https://ai.google.dev/) (cloud).

---

## ⬇️ Instalación y Descarga

### 🎉 v2.1.2 — Gallery Stabilization & Workflow Polish

Este software está disponible **libre y abierto** a toda la comunidad.
Descarga el instalador pre-construido para Windows directamente desde GitHub Releases:

👉 **[Descargar AmoxSQL v2.1.2](https://github.com/dsandovalflavio/amoxsql/releases/latest)**

> **Nota:** Los releases beta iniciales incluyen el instalador pre-construido gratis.
> En adelante, los instaladores continuos pre-construidos estarán disponibles exclusivamente para [GitHub Sponsors](https://github.com/sponsors/dsandovalflavio).

### 🛠️ Compilar desde Código Fuente (Siempre Gratis)

1. Clona el repositorio.
2. Asegúrate de tener **Node.js 20+** y herramientas de compilación C++ instaladas (para bindings de DuckDB).
3. Ejecuta `npm install` y asegúrate de instalar las dependencias de cliente y servidor.
4. Ejecuta `npm start` en la raíz.

> *Las versiones auto-compiladas no incluyen auto-updates ni binarios firmados.*

---

## ❤️ Sponsor & Support

AmoxSQL es construido y mantenido por un desarrollador solo desde Latinoamérica.
Si encuentras esta herramienta útil, considera patrocinar el proyecto para mantenerlo vivo y en crecimiento.

**Los Sponsors obtienen:**
- 🔓 Acceso a un **repositorio privado** con instaladores pre-construidos
- ⚡ **Acceso anticipado** a nuevas características
- 🗳️ **Prioridad** para feature requests y bug fixes
- 💬 Canal de comunicación directo con el desarrollador

👉 **[Conviértete en Sponsor en GitHub](https://github.com/sponsors/dsandovalflavio)**

---

## 🖥️ Guía de Uso

### Empezando
1.  **Welcome Screen**: Al iniciar, ingresa la **Ruta Absoluta** de tu carpeta de proyecto.
2.  **Selección de Base de Datos**: Si se detectan archivos `.db`, un modal te pedirá seleccionar uno para adjuntar (Read-Only/Read-Write) o iniciar una sesión en memoria.

### Operaciones Core
* **Ejecutar SQL**: En un archivo `.sql` o celda de notebook, escribe tu query y presiona `Ctrl/Cmd + Enter`.
* **Importar Datos**: Clic derecho sobre un archivo (CSV, Parquet) o carpeta en el File Explorer y selecciona "Import to DB".
* **Visualizar Resultados**: Después de ejecutar una query, cambia la pestaña del panel inferior de "Results" a "Chart".
* **Crear Notebook**: Clic derecho en el File Explorer y selecciona "New Notebook" para crear un archivo `.sqlnb`.
* **Abrir ER Diagram**: Navega al panel lateral y selecciona la vista de Diagrama ER.
* **Usar DBT Studio**: Abre el panel DBT Studio desde la barra lateral para gestionar tu proyecto dbt.

---

## ⚖️ Licencia

Este proyecto es source-available bajo la **AmoxSQL Community License**.

Puedes ver, modificar y compilar el código fuente para uso personal o educativo.
**La redistribución comercial y el uso SaaS están estrictamente prohibidos.**

Ver el archivo [LICENSE](./LICENSE) para los términos completos.

### ®️ Aviso de Marca Registrada
El nombre "AmoxSQL" y el logo de AmoxSQL son marcas registradas de Flavio Sandoval.

---

## ❤️ Agradecimientos y Créditos

* **[DuckDB](https://duckdb.org/)**: Por crear el increíble motor de base de datos SQL OLAP in-process.
* **[Monaco Editor](https://microsoft.github.io/monaco-editor/)**: Por proporcionar una experiencia de edición de clase mundial.
* **[Recharts](https://recharts.org/)**: Por su librería de gráficos componible y confiable.
* **[React](https://reactjs.org/) & [Vite](https://vitejs.dev/)**: Por la experiencia de desarrollo frontend rápida y moderna.
* **[Node.js](https://nodejs.org/) & [Express](https://expressjs.com/)**: Por la base robusta del backend.
* **[react-markdown](https://github.com/remarkjs/react-markdown)**: Por habilitar las capacidades de texto enriquecido en SQL Notebooks.

---

## 🤝 Contribuir

¡Damos la bienvenida a contribuciones de todos! AmoxSQL es un proyecto impulsado por la comunidad.

Ya sea reportando bugs, sugiriendo features, o enviando pull requests, tu ayuda es apreciada.

> **Nota:** Al contribuir a AmoxSQL, aceptas que tus contribuciones serán licenciadas bajo la [AmoxSQL Community License](./LICENSE).

---

<p align="center">
  <a href="https://dsandovalflavio.github.io/amoxsql-landing-page/">🌐 Official Website</a> · 
  <a href="https://github.com/sponsors/dsandovalflavio">💖 Sponsor</a> · 
  <a href="https://github.com/dsandovalflavio">👤 @dsandovalflavio</a>
  <br><br>
  Creado con 💙 desde Latinoamérica para el Mundo.
</p>