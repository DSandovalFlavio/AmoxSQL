# Tabla de resultados

**🌐 [English](../../en/results/results-table.md) · Español**

> El panel donde aterrizan tus resultados: tabla explorable, gráfico o perfil, con búsqueda, filtros, orden y formato inteligente.

<!-- 📷 CAPTURE: docs/images/results/results-table.png — Panel de resultados en modo Tabla mostrando el conmutador de vista, la búsqueda, la fila de filtros y la paginación. -->

## Qué es

Cuando ejecutas una query —en el [Editor SQL](../editor/sql-editor.md) o en una celda de [notebook](../notebooks/notebooks.md)— los resultados aparecen en este panel. Tiene tres modos de vista:

- **Table** — una cuadrícula paginada con búsqueda, filtros, orden y redimensionado de columnas.
- **Chart** — el constructor de gráficos [Story Flow](../visualization/story-flow.md).
- **Profile** — el [perfil de datos](data-profiler.md), un análisis exploratorio automático.

Esta página cubre el **modo Tabla**. El conmutador de vista está arriba a la izquierda del panel; junto a él, un contador muestra cuántas filas hay y en cuántos milisegundos se ejecutó la consulta.

## Cuándo usarlo

- Para inspeccionar filas concretas, buscar valores o comprobar tipos de columna.
- Como punto de partida antes de graficar (Chart) o de diagnosticar la calidad de los datos (Profile).
- Cuando necesitas copiar o descargar rápidamente las filas que estás viendo (ver [Guardar resultados](saving-results.md)).

## Cómo usarlo

### Buscar y filtrar
1. **Búsqueda global:** escribe en el cuadro **Search** (arriba a la derecha) para filtrar filas en todas las columnas a la vez.
2. **Filtros por columna:** pulsa **Filters** para mostrar una fila de filtros bajo los encabezados; escribe en cada uno para filtrar esa columna. El contador indica "Filtrado desde N" cuando hay filtros activos.

### Ordenar
Haz clic en el encabezado de una columna para ordenar ascendente; vuelve a hacer clic para descendente. Los valores nulos se colocan al final. También puedes ordenar desde el menú contextual de la columna.

### Redimensionar columnas
Arrastra el borde derecho del encabezado de una columna para ajustar su ancho (mínimo 50 px). Los anchos se conservan mientras exploras.

### Menú contextual de columna
Haz **clic derecho** sobre el encabezado de una columna para:

- **Copy Column Name** — copia el nombre de esa columna.
- **Copy All Column Names** — copia todos los nombres, separados por comas.
- **Sort Ascending / Sort Descending** — ordena por esa columna.

### Paginar
En la parte inferior, navega entre páginas con **‹ ›** y elige cuántas filas mostrar por página: **50 / 100 / 500 / 1000**.

### Sacar a una ventana aparte
El botón **Pop-out** (cuando está disponible) envía los resultados a una ventana independiente, útil para verlos en un segundo monitor mientras sigues editando.

## Referencia de formato de valores

La tabla formatea cada valor según su tipo para que se lea mejor; pasa el cursor por una celda para ver el valor completo.

| Tipo de valor | Cómo se muestra |
|---|---|
| Entero | Con separadores de miles (localizado) |
| Decimal | Hasta 4 decimales; el valor exacto en el tooltip |
| Fecha ISO (`...T00:00:00Z`) | Solo la parte de fecha (`AAAA-MM-DD`) |
| Fecha y hora ISO | Fecha y hora con espacio, sin la `Z` |
| `NULL` | Insignia atenuada **NULL** |
| Objeto / JSON | Serializado con `JSON.stringify` |

## Referencia de la barra de herramientas

| Control | Qué hace |
|---|---|
| **Table / Chart / Profile** | Cambia el modo de vista |
| **Filters** | Muestra/oculta la fila de filtros por columna (solo en Table) |
| **Search** | Búsqueda global sobre todas las columnas |
| **Store A / Compare** | Guarda y compara conjuntos de resultados (ver [Comparar resultados](compare-results.md)) |
| **Save as table…** | Materializa la query completa como tabla o vista (ver [Guardar resultados](saving-results.md)) |
| **Vault** | Guarda el análisis en el Baúl (ver [Baúl de análisis](../ai/analysis-vault.md)) |
| **Download ▾** | Descarga las filas mostradas (CSV/JSON/portapapeles) |
| **Pop-out** | Abre los resultados en una ventana aparte |

## Tips y gemas

- **Aviso de truncado:** si tu query devuelve más filas que el límite de "Max Rows" (Ajustes → Editor), verás "⚠ primeras N filas". Para el conjunto completo, usa **Export** en el editor o añade tu propio `LIMIT` (ver [Guardar resultados](saving-results.md)).
- **Buscar no re-ejecuta:** la búsqueda, los filtros y el orden operan **en memoria** sobre las filas ya cargadas —son instantáneos y no vuelven a consultar el motor—.
- **Descargar ≠ Exportar:** **Download** baja solo las filas cargadas en la tabla (ya filtradas y ordenadas); el **Export** del editor re-ejecuta la query completa. La distinción se explica en [Guardar resultados](saving-results.md).

## Relacionado

- [Comparar resultados](compare-results.md) · [Guardar resultados](saving-results.md)
- [Perfil de datos](data-profiler.md) · [Plan de ejecución](execution-plan.md)
- [Story Flow](../visualization/story-flow.md) · [Editor SQL](../editor/sql-editor.md)
