# Historial y marcadores

**🌐 [English](../../en/editor/history-and-bookmarks.md) · Español**

> Cada query que ejecutas queda registrada automáticamente. Búscala, recárgala con un clic y marca con estrella las que quieras conservar.

## Qué es

AmoxSQL lleva un **historial de consultas** persistente: cada query que ejecutas se guarda sin que hagas nada, junto con su fecha y hora. Cuando necesitas recuperar "aquella query de ayer", está ahí — no tienes que reescribirla.

El historial y los **marcadores** viven en una misma vista con dos pestañas: **History** (todo lo ejecutado, cronológico) y **Bookmarked** (solo lo que marcaste con estrella). Se abre con **Ctrl+Shift+H** o desde el botón **History** de la barra de acciones del editor.

El historial se poda solo para no crecer sin límite, y filtra el ruido (sentencias del sistema y DDL internas) para que solo veas tus consultas reales.

## Cuándo usarlo

- Cuando quieres volver a una query que ejecutaste antes y no la guardaste en un archivo.
- Para comparar dos versiones de una query que fuiste iterando.
- Cuando tienes un puñado de consultas "de referencia" que usas a menudo: márcalas y tenlas siempre a mano.

## Cómo usarlo

### Abrir el historial
Pulsa **Ctrl+Shift+H**, o el botón **History** en la barra de acciones del editor. Se abre con la pestaña **History** activa.

<!-- 📷 CAPTURE: docs/images/editor/history-modal.png — vista de historial con las pestañas History y Bookmarked -->

### Buscar y recargar una query
1. (Opcional) Escribe en el buscador para filtrar por el texto de la query.
2. Recorre la lista: cada entrada muestra su fecha/hora y el SQL.
3. **Haz clic en una entrada** para cargarla en el editor.
4. El icono de **copiar** de cada fila la lleva al portapapeles sin cargarla.

### Marcar (bookmark) una query
1. En la pestaña **History**, pulsa la **estrella** de la query que quieras conservar.
2. Cambia a la pestaña **Bookmarked** para ver solo tus marcadas.
3. Desde **Bookmarked**, la estrella (ya rellena) quita el marcador.

Los marcadores no dependen de la poda del historial: aunque la query original desaparezca del historial por antigüedad, tu marcador sigue.

<!-- 📷 CAPTURE: docs/images/editor/bookmarks-tab.png — pestaña Bookmarked con queries marcadas -->

## Referencia

| Aspecto | Comportamiento |
|---|---|
| Registro | Automático en cada ejecución de query |
| Capacidad | Últimas ~1000 consultas |
| Poda | Se descartan los registros de más de 30 días |
| Filtrado | Se excluyen sentencias del sistema y DDL internas (solo se ven tus queries) |
| Pestañas | **History** (cronológico) · **Bookmarked** (marcadas) |
| Acciones por fila | Cargar (clic) · Marcar/desmarcar (estrella) · Copiar |
| Persistencia | El historial requiere modo lectura-escritura sobre la base de datos |

## Tips y gemas

- **El historial es tu red de seguridad:** si ejecutaste una query y cerraste la pestaña sin guardar, sigue en el historial.
- **Marca antes de que se pode:** si una query te sirve a largo plazo, dale estrella; los marcadores sobreviven a la poda de 30 días.
- **Busca por fragmento:** el buscador filtra por el texto del SQL, así que basta recordar un nombre de tabla o función para reencontrarla.
- **Cargar no ejecuta:** al hacer clic, la query entra en el editor pero no se corre; revísala y ejecútala tú.

## Atajos / formatos

| Atajo | Acción |
|---|---|
| Ctrl+Shift+H | Abrir historial de consultas |

## Relacionado

- [Editor SQL](sql-editor.md) · [Snippets](snippets.md) · [Paleta de comandos](command-palette.md)
- [Tabla de resultados](../results/results-table.md) · [Guardar resultados](../results/saving-results.md)
