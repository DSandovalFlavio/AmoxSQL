# Data Flow

**🌐 [English](../../en/data-flow/data-flow.md) · Español**

> El estudio visual de pipelines de AmoxSQL: construye una transformación de datos como un diagrama de nodos conectados, sin escribir SQL para cada paso — y ejecútala de principio a fin.

<!-- 📷 CAPTURE: docs/images/data-flow/data-flow-editor.png — El editor de Data Flow con la paleta de nodos a la izquierda, un DAG de varios nodos en el lienzo (Import File → Filter → Group & Aggregate → Export File) y el panel de configuración del nodo seleccionado a la derecha. -->

## Qué es

**Data Flow** es el estudio visual donde diseñas pipelines de datos como un grafo dirigido (DAG): cada **nodo** es un paso (importar, filtrar, agrupar, unir, exportar…) y cada **conexión** define de dónde toma sus datos el siguiente paso. En lugar de encadenar SQL a mano, arrastras nodos, los conectas y AmoxSQL genera y ejecuta el SQL de DuckDB por ti.

Cada pipeline se guarda como un archivo `.sqlchain` (JSON). Abres uno desde el explorador de archivos, o creas uno nuevo con el botón **New Execution Chain** de la barra lateral (o **New Chain** en la paleta de comandos). El documento se abre en su propia pestaña, igual que un `.sql` o un notebook.

El lienzo tiene tres zonas: la **paleta de nodos** a la izquierda (agrupada por intención), el **lienzo** en el centro con los nodos y sus conexiones, y el **panel de configuración** a la derecha cuando seleccionas un nodo. Arriba, la barra de herramientas reúne los controles de ejecución y las acciones del archivo.

Data Flow valida el pipeline en vivo mientras lo construyes: los nodos con problemas se marcan y la ejecución se bloquea si hay errores, así que corriges antes de correr, no después.

## Cuándo usarlo

- Cuando una transformación tiene **varios pasos** y quieres verlos y reordenarlos visualmente (limpieza → tipado → agregación → exportación).
- Para **procesos repetibles**: un pipeline que corres cada mes sobre nuevos archivos, con puntos de control de calidad de datos.
- Cuando combinas **varias fuentes** (archivos locales, carpetas, tablas existentes, URLs, buckets S3/GCS, Google Sheets) en un solo flujo.
- Para una sola consulta enfocada, usa el [Editor SQL](../editor/sql-editor.md). Para un análisis narrado con texto y gráficos, usa un [Notebook](../notebooks/notebooks.md). Data Flow es para el *proceso* que produce los datos.

## Cómo usarlo

### Empezar un pipeline
1. Crea o abre un `.sqlchain`. Si está vacío, aparece la **galería de plantillas** con puntos de partida listos para usar (ver más abajo). Elige una o ciérrala para empezar en blanco.
2. Añade nodos de dos formas:
   - **Arrastra desde la paleta:** toma un tipo de nodo de la paleta izquierda y suéltalo en el lienzo.
   - **Arrastra desde los exploradores:** arrastra una **tabla** del Explorador de base de datos, o un **archivo/carpeta** del Explorador de archivos, directamente al lienzo — se crea automáticamente el nodo de origen adecuado (Table Source, Import File o Import Folder) ya configurado.
3. **Conecta** los nodos: arrastra desde el conector de salida de un nodo al de entrada del siguiente. Data Flow **bloquea los ciclos**: si una conexión crearía un bucle, la rechaza.

### Configurar un nodo
1. Haz clic en un nodo para abrir el **panel de configuración** a la derecha.
2. El panel tiene pestañas: **basic** (los campos del nodo), **schema** (las columnas que llegan desde arriba), **preview** (una vista previa de los datos que produce el nodo), **validation** (errores y advertencias) e **info** (la documentación del nodo dentro de la app).
3. En los campos que piden columnas, el **autocompletado de columnas** sugiere las columnas reales que llegan de los nodos anteriores.

### Ejecutar
1. Pulsa **Run All** en la barra de herramientas para correr todo el pipeline (o **Ctrl+S** primero para guardar).
2. Selecciona un nodo para habilitar **From Here** (desde ese nodo hacia adelante) y **To Here** (hasta ese nodo).
3. Los detalles de ejecución — estado por nodo, logs, historial, cancelar, exportar/compilar — están en [Ejecutar y motor](running-and-engine.md).

### Auto-organizar y variables
- **Layout** reorganiza automáticamente los nodos en un diseño limpio de izquierda a derecha.
- **Variables** abre un panel para definir valores reutilizables. Referéncialos en cualquier campo con `${nombre}` (por ejemplo, una ruta base o un año) y cámbialos en un solo lugar.

### Galería de plantillas
Al abrir un chain vacío aparece la galería con plantillas de arranque:

| Plantilla | Qué monta |
|---|---|
| **CSV Cleanup** | Importar un CSV, limpiar/normalizar columnas y exportar el resultado |
| **Data Quality Check** | Cargar datos y validarlos con nodos de aserción antes de continuar |
| **Excel → Parquet** | Convertir un Excel a Parquet |
| **Multi-Source Merge** | Combinar varias fuentes en una sola tabla |

### Generar con IA
El panel de IA del lienzo convierte una descripción en lenguaje natural en un pipeline. Escribe lo que quieres ("importa ventas.csv, filtra 2025, agrupa por región y exporta a Parquet") y Data Flow propone el flujo. Antes de aplicarlo, muestra una **vista previa** de los nodos para que confirmes. Si el lienzo ya tiene nodos, la IA **extiende/edita** el pipeline existente (reemplazando el lienzo tras tu confirmación).

## Referencia de la barra de herramientas

| Control | Qué hace |
|---|---|
| **Save** | Guarda el `.sqlchain` (**Ctrl+S**). Data Flow también auto-guarda con retardo mientras editas |
| **Run All** | Ejecuta todo el pipeline. Deshabilitado si hay errores de validación |
| **From Here / To Here** | Con un nodo seleccionado: corre desde ese nodo hacia adelante, o hasta ese nodo |
| **Cancel** | Detiene una ejecución en curso |
| **Clear** | Limpia los resultados de la última ejecución del lienzo |
| **Layout** | Reorganiza automáticamente los nodos |
| **Variables** | Abre el panel de variables `${...}` |
| **Export** | Exporta el chain como archivo YAML |
| **SQL** | Compila el chain a un script SQL ejecutable |
| **Import** | Importa un chain desde un archivo YAML (reemplaza el lienzo, con confirmación) |
| **Logs** | Muestra/oculta el panel de logs de ejecución |
| **History** | Abre el historial de ejecuciones |
| Insignia de validación | Muestra el número de errores/advertencias; pasa el cursor para el detalle |

## Tips y gemas

- **Arrastra datos, no configures orígenes a mano:** soltar una tabla o un archivo desde los exploradores crea el nodo de origen ya rellenado — la forma más rápida de empezar.
- **La validación bloquea, las advertencias no:** los errores (rojo) impiden ejecutar; las advertencias (amarillo) son informativas. Corrige los errores y el botón **Run All** se habilita solo.
- **Los ciclos son imposibles:** el editor rechaza cualquier conexión que cerraría un bucle, así que el grafo siempre es un DAG válido.
- **La pestaña `info` es documentación viva:** cada tipo de nodo trae su propia explicación, opciones y ejemplos dentro de la app — sin salir del editor.
- **`${variables}` para pipelines parametrizados:** define una vez la ruta base o el año y úsalo en todos los nodos; cambiar el valor re-apunta todo el flujo.
- **YAML para versionar o compartir:** exporta a YAML para revisarlo en control de versiones o pasárselo a un colega; impórtalo para reconstruir el lienzo.

## Atajos y formatos relacionados

| Atajo / formato | Detalle |
|---|---|
| **Ctrl+S** | Guardar el chain |
| `.sqlchain` | El pipeline, como JSON (auto-guardado con retardo) |
| YAML | Formato de intercambio para exportar/importar chains |

## Relacionado

- [Referencia de nodos](node-reference.md) · [Ejecutar y motor](running-and-engine.md)
- [Editor SQL](../editor/sql-editor.md) · [Notebooks](../notebooks/notebooks.md)
- [Explorador de archivos](../data/file-explorer.md) · [Explorador de base de datos](../data/database-explorer.md)
