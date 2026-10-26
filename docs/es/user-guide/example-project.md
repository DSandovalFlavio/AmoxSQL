# Proyecto de ejemplo: el cierre de ventas

**🌐 [English](../../en/user-guide/example-project.md) · Español**

> Un caso real simulado, de principio a fin: una tienda en línea manda un CSV de ventas cada mes, Finanzas manda sus metas en Excel, y el analista tiene que contar cómo va el año, entregar un Excel a Dirección y dejar el cierre corriendo solo. Todas las imágenes de esta guía salen de este proyecto.

<img src="../../images/notebooks/canvas.png" alt="El Canvas del proyecto de ejemplo: de la tabla de ventas a dos ramas, por categoría y por mes" width="100%" />

## El escenario

**Electrónica Global** vende electrónica en línea en diez ciudades. Su analista recibe:

| Qué | Cómo llega | Dónde vive en el proyecto |
|---|---|---|
| Las ventas del mes, una fila por línea vendida | Un CSV por mes (`Sales_2024_9.csv`), el día 5 del mes siguiente | `datos/ventas-mensuales/` |
| Las metas de venta por mes y categoría | Un Excel de Finanzas | `datos/metas_2024.xlsx` |

Y tiene que entregar, cada mes, **un Excel para Dirección** y, antes del comité, **una presentación** que diga cómo va el año.

La agencia que lleva sus campañas, **Agencia Digital MX**, es otro cliente del mismo analista, con su propio proyecto. Los dos clientes se ven juntos en [Workspaces](workspaces.md).

## Los proyectos

| Proyecto | Cliente | Qué enseña |
|---|---|---|
| `tienda-electronica` | Electrónica Global | Todo el flujo: fuentes, base, consultas, cuaderno, gráficos, Canvas, deck, Data Flow programado, diagrama, contexto para la IA, Git |
| `marketing-campanas` | Agencia Digital MX | Un segundo cliente: plan de medios por estado, un cuaderno con parámetros |
| `almacen-dbt` | Electrónica Global | Un proyecto de dbt con una capa por modelo |

```
tienda-electronica/
├── datos/
│   ├── ventas-mensuales/      22 CSV mensuales (ene 2023 – oct 2024, 310,956 líneas)
│   └── metas_2024.xlsx        las metas de Finanzas
├── queries/                   8 consultas, de la revisión rápida al análisis
├── notebooks/analisis_2024.sqlnb
├── charts/                    3 gráficos de Story Flow (.amoxvis)
├── canvas/exploracion_2024.amoxcanvas
├── reportes/resumen_2024.amoxdeck
├── flujos/                    cierre_mensual.sqlchain · publicar_ventas.sqlchain
├── diagramas/arquitectura.amoxdiagram
├── context/                   metrics.yml · joins.yml · glossary.md · examples/
├── RULES.md                   reglas para el asistente
├── entregas/                  lo que deja el cierre (Excel por mes)
├── publicado/                 el Parquet que leen otros proyectos
└── tienda.duckdb
```

## 1. Leer los archivos donde llegan

La carpeta de CSV es una **[fuente con nombre](../data/sources.md)**: `ventas-mensuales`. Se consulta como `fuentes."ventas-mensuales"` y siempre trae todos los meses, sin copiar nada. Tiene un **[contrato](../data/source-contracts.md)**: sus columnas con su tipo, que `Quantity Ordered` nunca venga vacía y que haya al menos mil filas. Si el mes llega roto, el cierre se para y dice por qué.

Las metas son otra fuente, `metas`, sobre el Excel. Al importarlo, AmoxSQL enseña la hoja tal cual y cómo la va a leer:

<img src="../../images/data/import-modal.png" alt="El diálogo de importar el Excel de metas: la hoja, el rango y cómo se leerán las columnas" width="100%" />

## 2. La base del proyecto

`tienda.duckdb` tiene un modelo pequeño y limpio: `ventas` (cada línea con su importe), `productos`, `categorias`, `metas_2024` y la vista `v_venta_mensual`, con llaves primarias y foráneas y una descripción por tabla. El explorador dice de qué archivos salió cada tabla, y el [diagrama ER](../data/er-diagram.md) dibuja las relaciones:

<img src="../../images/data/er-diagram.png" alt="El diagrama ER del proyecto: ventas → productos → categorías, y las metas" width="100%" />

## 3. Explorar con consultas

`queries/` va de lo general a lo particular: el panorama mensual con su crecimiento (`01`), la mezcla por categoría (`02`), los productos líderes (`03`), meta contra real (`04`), ciudades (`05`), estacionalidad (`06`), una revisión de calidad antes de entregar (`07`) y un ejemplo de [variables](../editor/variables.md) (`08`).

<img src="../../images/editor/cte-debug-modal.png" alt="Depurar una CTE del panorama mensual: su resultado intermedio en una ventana" width="100%" />

En `01_panorama_mensual.sql`, el ▶ junto a cada CTE enseña su resultado intermedio. El [autocompletado](../editor/autocomplete.md) conoce las columnas de cada alias y las métricas del contexto (`venta_total`, `ticket_promedio`). Sobre cualquier resultado, **Profile** hace el perfil y encuentra, por ejemplo, que hay líneas duplicadas en los CSV originales:

<img src="../../images/results/data-profiler.png" alt="El perfil del detalle de ventas: filas, completitud, duplicados y hallazgos" width="100%" />

## 4. Contarlo: cuaderno, gráficos y Canvas

- **[El cuaderno](../notebooks/notebooks.md)** `analisis_2024.sqlnb` cuenta la historia en orden, con el parámetro `anio`: venta del año contra el anterior, mezcla por categoría y cumplimiento de meta. La última celda es un **borrador**: corre pero no sale en Word.
- **[Story Flow](../visualization/story-flow.md)**: los gráficos de `charts/` llevan su consulta dentro, su título y su conclusión.
- **[El Canvas](../notebooks/canvas.md)** `exploracion_2024.amoxcanvas` es la mesa de trabajo: de la tabla de ventas salen dos ramas —por categoría y por mes— con sus gráficos, una cifra y una nota.

<img src="../../images/visualization/story-stage.png" alt="Story Flow: los diez productos que más venden, con la conclusión resaltada" width="100%" />

## 5. Presentarlo

`reportes/resumen_2024.amoxdeck` es la presentación del comité en [Report Flow](../reports/report-flow.md): portada, resumen con cifras, dos hallazgos con su gráfico, el ranking de productos y las acciones propuestas. **Refresh all** vuelve a correr cada gráfico, y **Export PowerPoint** la deja editable.

<img src="../../images/reports/report-flow-studio.png" alt="El deck del comité en Report Flow Studio: la lámina «El año va parejo con 2023»" width="100%" />

## 6. Que corra solo

`flujos/cierre_mensual.sqlchain` es el cierre en [Data Flow](../data-flow/data-flow.md): lee la fuente, calcula el importe, filtra desde el parámetro `desde`, agrupa por mes y categoría y por producto, y escribe **un Excel con dos hojas** en el destino `entregas-direccion` (`entregas/<año>/cierre_<año-mes>.xlsx`).

<img src="../../images/data-flow/running-status.png" alt="El cierre mensual en Data Flow después de correr: cada paso con sus filas y el log" width="100%" />

Está [programado](../data-flow/scheduling.md) **el tercer día hábil de cada mes a las 7:00**, y `publicar_ventas.sqlchain` corre **cuando llega un archivo** nuevo a la carpeta y deja `publicado/ventas-limpias.parquet` para que otros proyectos lo lean por su nombre. **Operations** enseña todo lo programado y lo que ya corrió:

<img src="../../images/data-flow/schedule-dialog.png" alt="Programar el cierre: cada mes, el tercer día hábil, a las 7:00, con las próximas fechas" width="100%" />

## 7. Para el asistente y para el equipo

- `context/` le da a la IA las métricas (`venta_total`, `ticket_promedio`, `unidades`), cómo se unen las tablas y un glosario; `RULES.md`, cómo debe contestar. Ver [Contexto como código](../ai/context-as-code.md).
- `diagramas/arquitectura.amoxdiagram` dibuja el flujo de punta a punta en [AmoxDiagram](../editor/amoxdiagram.md).
- El proyecto es un repositorio de Git: el panel de Git y **What changed** enseñan los cambios de un proceso en pasos, no en JSON.

<img src="../../images/data-flow/what-changed.png" alt="Los cambios de un proceso en el panel de Git, en pasos" width="100%" />

## Crear la carpeta de ejemplos

Desde el repositorio de AmoxSQL:

```bash
node scripts/ejemplos/crearEjemplos.mjs --datos <carpeta con los CSV de ventas>
```

Crea **Ejemplos AmoxSQL** en el escritorio, construye las bases, registra los clientes, las fuentes, los destinos y las programaciones en una casa de AmoxSQL **temporal** (nunca la tuya) y corre los procesos una vez. Lo que es de cada proyecto (consultas, cuaderno, gráficos, procesos, Canvas, deck, diagrama y contexto) vive en `scripts/ejemplos/proyectos/`.

> Los clientes, las programaciones y el historial de ejecuciones son de la casa temporal del script. Al abrir los proyectos en tu AmoxSQL, los enlazas a tus propios clientes desde [Workspaces](workspaces.md).

## Relacionado

- [Primeros pasos](first-steps.md) · [Workspaces](workspaces.md) · [Proyectos y conexiones](projects-and-connections.md)
- [Fuentes con nombre](../data/sources.md) · [Data Flow](../data-flow/data-flow.md) · [Canvas](../notebooks/canvas.md)
