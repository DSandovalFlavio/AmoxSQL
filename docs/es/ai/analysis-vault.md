# Analysis Vault

**🌐 [English](../../en/ai/analysis-vault.md) · Español**

> Una biblioteca de análisis guardados: consultas útiles, con su resultado y su gráfico, etiquetadas y buscables — que sobreviven aunque borres el archivo original.

<!-- 📷 CAPTURE: docs/images/ai/analysis-vault.png — Panel Analysis Vault con varias entradas: título, preview de SQL, etiquetas y botones "Open in Editor", editar y borrar -->

## Qué es

El **Analysis Vault** es un almacén persistente de análisis que quieres reutilizar. Cada entrada guarda la **consulta SQL**, una **instantánea del resultado**, la **configuración del gráfico** (si la hay), unas **etiquetas** y el **archivo de origen**. A diferencia de un archivo `.sql` suelto, una entrada del Vault vive en la base de datos del proyecto y **sobrevive al borrado del archivo** que la generó.

Se gestiona en el **panel Analysis Vault**: puedes buscar por texto, filtrar por etiqueta, renombrar y re-etiquetar en línea, abrir el SQL en el editor y borrar entradas. Es el lugar donde aterrizan los análisis que valió la pena conservar, ya vengan de tu propio trabajo o de la IA.

## Cuándo usarlo

- Cuando una query te costó armar y **la vas a necesitar de nuevo** (un informe recurrente, una definición fina).
- Cuando quieres una **colección curada** de análisis por tema, buscable por etiquetas, en vez de rebuscar en el historial.
- Para conservar un análisis **más allá de la vida del archivo** — si reorganizas el proyecto o borras el `.sql`, el Vault lo mantiene.
- Para snapshots efímeros de resultados que solo quieres consultar rápido, el [historial de consultas](../editor/history-and-bookmarks.md) puede bastar; el Vault es para lo que quieres curar y reutilizar.

## Cómo usarlo

### Guardar desde los resultados
1. Ejecuta una query y mira su [tabla de resultados](../results/results-table.md).
2. En la barra de la tabla, usa **Guardar en el Vault** (*Save to Vault*).
3. Ponle un **título** y, opcionalmente, **etiquetas** separadas por comas. Confirma. Se guarda la query junto con el snapshot del resultado. Ver [Guardar resultados](../results/saving-results.md).

### Guardado por el agente
Durante un [Deep Dive](deep-dive.md), la IA puede guardar un análisis en el Vault por su cuenta (con la herramienta `save_to_vault`) cuando produce algo que merece conservarse. Aparecerá en el panel como una entrada más, con su archivo de origen.

### Explorar y reutilizar
1. Abre el panel **Analysis Vault**.
2. Escribe en **Search** para filtrar por título/contenido, o en **Filter by tag** para acotar por etiqueta. También puedes hacer clic en un chip de etiqueta de cualquier entrada para filtrar por ella.
3. Pulsa **Open in Editor** para cargar el SQL de la entrada en un editor nuevo y volver a ejecutarlo.
4. **Load more** trae la siguiente página cuando hay muchas entradas.

### Editar o borrar
1. **Doble clic** en el título (o el icono de lápiz) para editar título y etiquetas en línea; **Enter** guarda, **Esc** cancela.
2. El icono de papelera pide confirmación antes de borrar.

## Referencia

### Qué guarda una entrada

| Campo | Contenido |
|---|---|
| Título | Nombre visible de la entrada (editable) |
| SQL | La consulta guardada (se muestra un preview de 2 líneas) |
| Instantánea del resultado | Muestra de las filas al momento de guardar |
| Configuración de gráfico | El gráfico asociado, si lo había |
| Etiquetas | Lista separada por comas, clicables para filtrar |
| Archivo de origen | De dónde salió el análisis |
| Fecha | Cuándo se guardó (mostrada como tiempo relativo) |

### Acciones del panel

| Acción | Qué hace |
|---|---|
| Search | Filtra por título/contenido |
| Filter by tag | Filtra por etiqueta (o clic en un chip) |
| Open in Editor | Carga el SQL en un editor nuevo |
| Editar (lápiz / doble clic) | Cambia título y etiquetas en línea |
| Borrar (papelera) | Elimina la entrada tras confirmar |
| Load more | Carga la siguiente página |

## Tips y gemas

- **Etiqueta con criterio.** Las etiquetas son la forma principal de reencontrar cosas; un chip se filtra con un clic. Piensa en temas ("finanzas", "cohortes", "mensual").
- **Sobrevive al archivo.** Guardar en el Vault es la manera de no perder una query buena cuando limpias o reorganizas el proyecto.
- **Es local.** Las entradas viven en la base DuckDB del proyecto (esquema `amoxsql_ai`), en tu máquina. Ver [Local-first](../concepts/local-first.md).
- **Del Vault al editor y de vuelta.** *Open in Editor* re-abre el SQL; ejecútalo, ajústalo y vuelve a guardar una versión nueva si evoluciona.

## Relacionado

- [Guardar resultados](../results/saving-results.md) · [Tabla de resultados](../results/results-table.md)
- [Deep Dive](deep-dive.md) · [Historial y marcadores](../editor/history-and-bookmarks.md)
