# Proyectos y conexiones

**🌐 [English](../../en/user-guide/projects-and-connections.md) · Español**

> AmoxSQL organiza tu trabajo por **proyectos** (carpetas) y se conecta a bases DuckDB en tres modos. Aquí verás cómo abrir, cambiar y conectar.

## Proyectos (carpetas de trabajo)

Un **proyecto** es simplemente una carpeta en tu disco. Todo lo que creas —queries `.sql`, notebooks, gráficos `.amoxvis`, decks, chains, contexto de IA— vive dentro de esa carpeta. Al abrir un proyecto, el [explorador de archivos](../data/file-explorer.md) muestra su contenido.

- **Abrir:** en la pantalla de bienvenida, ingresa la ruta absoluta; o usa un **reciente**.
- **Cambiar de proyecto:** desde el widget de workspace en la barra de título.
- **Cerrar workspace:** vuelve a la pantalla de bienvenida.

AmoxSQL reconoce carpetas canónicas por su nombre (queries, notebooks, charts, chains, data, exports, context, agent) y les pone iconos especiales, pero no te obliga a usarlas.

## Conexiones a base de datos

DuckDB puede trabajar de dos maneras: **en memoria** (efímero) o **adjuntando** un archivo de base de datos (`.duckdb`/`.db`).

### Modos de conexión

| Modo | Qué significa |
|---|---|
| **In-Memory** | No hay archivo de base. Las tablas viven en RAM durante la sesión. Perfecto para explorar archivos (CSV/Parquet/Excel) con `SELECT * FROM 'archivo'`. |
| **Read-Only** | Adjunta una base existente sin poder modificarla. Seguro para inspeccionar producción. |
| **Read/Write** | Adjunta una base y persiste cambios (crear tablas, insertar, etc.). |

Al abrir un proyecto con archivos `.db`, un modal te deja elegir cuál adjuntar y en qué modo. Si no hay ninguno, arrancas en memoria.

### Cambiar de base
Puedes conectar, desconectar o cambiar de base durante la sesión. AmoxSQL usa una estrategia de **"hard reset"** para cambios limpios: al desconectar, vuelve a un estado en memoria fresco, evitando estados corruptos entre proyectos (importante en Windows por los locks de archivo).

Aun con una base adjunta, siempre puedes consultar archivos sueltos del disco directamente — DuckDB los lee sin importarlos.

## Consultar archivos vs importar
- **Consultar directo:** `SELECT * FROM 'data/x.parquet'` — sin importar, ideal para exploración.
- **Importar:** carga el archivo como una tabla en la base (persistente en modo R/W). Ver [Importar datos](../data/importing-data.md).

## Relacionado
- [Primeros pasos](first-steps.md) · [Explorador de archivos](../data/file-explorer.md)
- [Explorador de base de datos](../data/database-explorer.md) · [Importar datos](../data/importing-data.md)
- [Arquitectura](../concepts/architecture.md)
