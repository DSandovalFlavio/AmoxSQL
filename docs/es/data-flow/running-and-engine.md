# Ejecutar y motor

**🌐 [English](../../en/data-flow/running-and-engine.md) · Español**

> Cómo se ejecuta un pipeline de [Data Flow](data-flow.md): ejecución total o parcial, estado en vivo por nodo, logs, historial y las opciones de exportar/compilar — más las ideas del motor que hacen posible reanudar y correr por partes.

<!-- 📷 CAPTURE: docs/images/data-flow/running-status.png — Un chain ejecutándose: nodos con insignias de estado (success en verde, running en azul, pending atenuado), la barra de progreso inferior y el panel de logs abierto con las líneas de ejecución. -->

## Qué es

Cuando ejecutas un chain, AmoxSQL ordena los nodos por dependencias (orden topológico) y los corre paso a paso, materializando cada resultado intermedio. Mientras corre, cada nodo muestra su **estado en vivo** y el panel de logs registra lo que ocurre. Al terminar (o fallar, o pausar en un checkpoint), el resultado queda en el **historial**, desde donde puedes reanudar.

Además de ejecutar, puedes **exportar** el chain a YAML, **compilarlo** a un script SQL ejecutable, o **crear un archivo `.sql`** en el proyecto — útil para revisar, versionar o llevar el pipeline fuera de la app.

## Cuándo usarlo

- Para correr un pipeline completo y obtener sus tablas/archivos de salida.
- Para **iterar rápido**: re-ejecutar solo desde el nodo que cambiaste, sin repetir todo lo anterior.
- Para **entregas por etapas**: pausar en un checkpoint, que otra persona revise, y reanudar.
- Para **auditar o exportar** la lógica: compilar a SQL, o guardar el chain como YAML.

## Cómo usarlo

### Ejecutar total o parcial
1. **Run All** ejecuta todo el pipeline en orden. Está deshabilitado mientras haya errores de validación.
2. Selecciona un nodo para habilitar:
   - **From Here** — corre desde ese nodo hacia adelante (usa los resultados ya materializados de los nodos anteriores).
   - **To Here** — corre solo hasta ese nodo, incluido.
3. **Cancel** detiene una ejecución en curso. **Clear** limpia los resultados de la última corrida del lienzo.

### Seguir el progreso
- Cada nodo muestra una insignia de estado: **pending** (pendiente), **running** (en curso), **success** (éxito), **failed** (falló) o **skipped** (omitido).
- La **barra de progreso** inferior y la barra de estado muestran cuántos nodos van (p. ej. "3 / 7 nodos, 43%").
- El panel **Logs** transmite los eventos de ejecución en vivo (vía SSE); ábrelo con el botón **Logs**. Puedes limpiarlo cuando quieras.

### Historial y reanudar
- **History** abre el panel de ejecuciones anteriores de este chain.
- Desde una ejecución que **falló** o quedó **pausada en un checkpoint**, puedes **reanudar**: el chain continúa desde el nodo que falló o desde el checkpoint, reutilizando los resultados intermedios que ya estaban materializados — no re-ejecuta todo.

### Exportar, compilar y crear SQL
| Acción | Qué produce |
|---|---|
| **Export** (YAML) | Descarga el chain como archivo YAML, para revisarlo o compartirlo |
| **Import** (YAML) | Reconstruye el lienzo desde un YAML (reemplaza lo actual, con confirmación) |
| **SQL** (compilar) | Genera un script SQL de DuckDB que reproduce el orden del chain; los pasos que solo se resuelven en tiempo de ejecución (limpieza, rename, aserciones, notificaciones, IA) aparecen como comentarios |
| Crear archivo SQL | Crea un `.sql` nuevo en la raíz del proyecto y lo abre en el editor |

## Referencia de estados y controles

| Estado de nodo | Significado |
|---|---|
| **pending** | Aún no ejecutado |
| **running** | Ejecutándose ahora |
| **success** | Completado correctamente |
| **failed** | Falló — revisa los logs y el mensaje de error del nodo |
| **skipped** | Omitido en esta corrida (fuera del subgrafo, o tras un fallo) |

| Estado del chain | Significado |
|---|---|
| **Executing** | Corriendo, con contador de progreso |
| **Chain completed** | Terminó correctamente |
| **Chain failed** | Se detuvo por un error — revisa los logs |
| **Paused at checkpoint** | Pausado en un nodo Checkpoint; reanuda desde el historial |
| **Cancelled** | Detenido manualmente |

## Tips y gemas

- **La materialización determinista habilita las corridas parciales:** cada nodo intermedio se materializa con un nombre estable y propio del chain, así que **From Here**, **To Here** y reanudar-desde-checkpoint pueden encontrar los resultados que dejó una corrida anterior — sin repetir el trabajo.
- **Nombres de intermedios sin colisiones:** esos nombres van a un espacio interno propio del chain, así que dos chains que usen el mismo nombre por defecto (p. ej. `filtered_data`) nunca chocan ni ensucian tu esquema principal.
- **Vistas vs. tablas:** los pasos que son proyecciones/filtros puros (Filter, Select Columns, Add Column, Clean, Date/Time) se materializan como vistas ligeras cuando tienen una sola salida, de modo que un filtro posterior puede empujarse hasta el origen; si un nodo alimenta a varios, se materializa como tabla.
- **Re-ejecutar es idempotente:** los nodos de salida usan CREATE OR REPLACE, así que volver a correr reemplaza la tabla en vez de duplicarla.
- **Checkpoint para pausas planeadas:** coloca un Checkpoint donde necesites una aprobación o una revisión manual; los resultados de arriba se reutilizan al reanudar.
- **Compila a SQL para auditar:** el script compilado sigue el mismo orden topológico y los mismos nombres de intermedios, así que refleja lo que haría una corrida real.

## Atajos y formatos relacionados

| Atajo / formato | Detalle |
|---|---|
| **Ctrl+S** | Guardar el chain antes de ejecutar |
| `.sqlchain` | El pipeline (JSON) |
| YAML | Exportar/importar el chain |
| `.sql` | Compilar el chain a un script, o crear un archivo nuevo |

## Relacionado

- [Data Flow](data-flow.md) · [Referencia de nodos](node-reference.md)
- [Editor SQL](../editor/sql-editor.md) · [Exportar datos](../data/exporting-data.md)
