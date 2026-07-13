# Primeros pasos

**🌐 [English](../../en/user-guide/first-steps.md) · Español**

> De cero a tu primera query en un minuto: abre un proyecto, conecta (o no) una base, y ejecuta SQL.

<img src="../../../images/01_welcome_screen.png" alt="Pantalla de bienvenida" width="100%" />

## 1. Abrir un proyecto

Al iniciar, AmoxSQL muestra la **pantalla de bienvenida**. Ingresa la **ruta absoluta** de la carpeta de tu proyecto (donde viven tus `.sql`, datos, etc.). AmoxSQL trabaja centrado en proyectos: esa carpeta es tu espacio de trabajo.

Si ya abriste proyectos antes, aparecerán como **recientes** para volver a ellos con un clic.

## 2. Elegir la base de datos

Si la carpeta contiene archivos `.duckdb` o `.db`, un modal te pedirá cómo conectar:

<!-- 📷 CAPTURE: docs/images/user-guide/db-selection-modal.png — modal de selección de BD (In-Memory / Read-Only / Read-Write) -->

| Modo | Cuándo usarlo |
|---|---|
| **In-Memory** | Sesión efímera. Ideal para explorar archivos (CSV/Parquet/Excel) sin una base persistente. |
| **Read-Only** | Abrir una base existente sin riesgo de modificarla. |
| **Read/Write** | Trabajar y persistir cambios en la base. |

Si no hay bases en la carpeta, arrancas en modo **In-Memory** automáticamente. Puedes conectar o cambiar de base después. Ver [Proyectos y conexiones](projects-and-connections.md).

## 3. Ejecutar tu primera query

1. Crea un archivo SQL: botón **+** en el explorador (o Ctrl+N).
2. Escribe una consulta. Por ejemplo, sobre un CSV en tu carpeta:
   ```sql
   SELECT * FROM 'data/ventas.csv' LIMIT 100;
   ```
3. Presiona **Ctrl+Enter**. Los resultados aparecen abajo.

DuckDB lee CSV, Parquet, JSON y Excel directamente desde archivos — no necesitas importar nada para consultar. Para cargarlos como tablas, ver [Importar datos](../data/importing-data.md).

## 4. Explorar un poco más

- Cambia el panel de resultados de **Results** a **Chart** para graficar (ver [Story Flow](../visualization/story-flow.md)).
- Clic derecho sobre un archivo de datos en el explorador → **Direct Query** para generar una consulta lista.
- Abre el **Asistente de IA** y pídele en lenguaje natural: *"muéstrame las ventas por mes"* (ver [Introducción a la IA](../ai/introduction.md)).

## Relacionado
- [La interfaz](interface.md) · [Proyectos y conexiones](projects-and-connections.md)
- [Editor SQL](../editor/sql-editor.md) · [Importar datos](../data/importing-data.md)
