# Paleta de comandos

**🌐 [English](../../en/editor/command-palette.md) · Español**

> Una sola tecla para llegar a cualquier acción de AmoxSQL: escribe, filtra y ejecuta sin buscar el botón con el mouse.

## Qué es

La paleta de comandos es un menú de acceso rápido que aparece en el centro de la pantalla con **Ctrl+Shift+P**. Escribes unas letras, la lista se filtra al instante y pulsas Enter sobre la acción que quieras. Es la forma más rápida de hacer cualquier cosa en la app sin recordar dónde vive cada botón.

Las acciones vienen **agrupadas por categoría** (Análisis con IA, Query, Archivo, Navegación, Ajustes, Vista, DBT, Ayuda y tours) y, cuando existe, cada una muestra su **atajo de teclado** a la derecha — así vas aprendiendo los atajos mientras la usas.

## Cuándo usarlo

- Cuando sabes qué quieres hacer pero no dónde está el botón.
- Para acciones sin atajo propio (crear un nuevo Data Flow, abrir el DBT Studio, relanzar un tour).
- Cuando prefieres el teclado al mouse y quieres moverte rápido entre acciones.

## Cómo usarlo

1. Pulsa **Ctrl+Shift+P** en cualquier momento.
2. Empieza a escribir: el filtro busca por **nombre de la acción** y por **categoría** (por ejemplo, escribe "query" y verás todo lo del grupo Query).
3. Navega con las flechas **↑ / ↓** (también puedes mover el cursor con el mouse).
4. Pulsa **Enter** para ejecutar la acción resaltada, o haz clic sobre ella.
5. **Esc** cierra la paleta sin hacer nada.

<!-- 📷 CAPTURE: docs/images/editor/command-palette.png — paleta de comandos abierta con acciones agrupadas por categoría -->

## Referencia de categorías

| Categoría | Ejemplos de acciones |
|---|---|
| **AI Analysis** | Analizar la tabla actual (EDA), Verificar calidad de datos, Investigar métricas, Generar historia de un gráfico |
| **Query** | Ejecutar query (Ctrl+Enter / F5), Analizar plan (Ctrl+Shift+A) |
| **File** | Guardar (Ctrl+S), Guardar como (Ctrl+Shift+S), Nueva query SQL (Ctrl+N), Nuevo Notebook (Ctrl+Shift+N), Nuevo Chain, Cerrar pestaña (Ctrl+W) |
| **Navigation** | Explorador de archivos (Ctrl+Shift+E), Esquema de la base (Ctrl+Shift+D), Extensiones, Abrir/cerrar Assist (Ctrl+L), Pestaña siguiente/anterior |
| **Settings** | Abrir ajustes (Ctrl+,), Cambiar tema, Ver atajos de teclado |
| **View** | Zoom + / − / reset de la interfaz, Alternar minimapa, Alternar word wrap |
| **DBT** | Abrir DBT Studio |
| **Help & Tours** | Relanzar cualquier tour de onboarding desde donde estés |

> Las acciones de **AI Analysis** aparecen cuando hay un contexto de IA disponible; lanzan skills del asistente sobre la tabla o el análisis actual (ver [Skills](../ai/skills.md)).

## Tips y gemas

- **Aprende atajos gratis:** cada acción muestra su atajo a la derecha; si la usas seguido, memoriza el atajo y sáltate la paleta.
- **Filtra por categoría:** escribir el nombre de un grupo ("view", "file") es una forma rápida de acotar la lista.
- **Relanza cualquier tour:** el grupo Ayuda y tours te deja repetir los recorridos de onboarding en cualquier momento.
- **Todo con teclado:** abrir (Ctrl+Shift+P), filtrar, mover con flechas y Enter — sin tocar el mouse.

## Atajos / formatos

| Atajo | Acción |
|---|---|
| Ctrl+Shift+P | Abrir/cerrar la paleta de comandos |
| ↑ / ↓ | Mover la selección |
| Enter | Ejecutar la acción resaltada |
| Esc | Cerrar |

## Relacionado

- [Editor SQL](sql-editor.md) · [Historial y marcadores](history-and-bookmarks.md) · [Layout, pestañas y paneles](layout-tabs-and-panes.md)
- [Atajos de teclado](../reference/keyboard-shortcuts.md) · [Skills](../ai/skills.md)
