# Canvas (.amoxcanvas)

**🌐 [English](../../en/notebooks/canvas.md) · Español**

> Un lienzo infinito para pensar un análisis: fuentes, consultas, gráficos, cifras y notas en cajas, conectadas por lo que cada consulta lee. Cuando el análisis toma forma, sale a un deck, a un cuaderno o a un proceso que corre solo.

<img src="../../images/notebooks/canvas.png" alt="Un Canvas con una fuente, dos ramas en marcos, gráficos, una cifra y una nota" width="100%" />

## Qué es

Un **Canvas** (`.amoxcanvas`) es el sitio para **averiguar**, antes de entregar. Donde el [cuaderno](notebooks.md) se lee de arriba abajo, el Canvas deja tener dos ramas a la vez («por tienda» y «por día» desde la misma base), una nota al lado del número que la motiva y el camino entero a la vista.

Cada tarjeta de datos deja una **vista con su nombre** en la sesión, como una celda del cuaderno, y la de al lado la lee por ese nombre. **Las flechas no se dibujan: salen de lo que lee cada consulta**, así que nunca dicen algo distinto de lo que hace el SQL. La etiqueta de cada flecha también se deduce («by tienda», «where estado = 'ok'», «+ metas»).

## Cuándo usarlo

- Explorar un archivo nuevo del cliente y probar caminos antes de decidir cuál vale.
- Comparar ramas desde una misma base limpia.
- Preparar una reunión: los marcos se presentan como diapositivas.
- Pasar de «lo pensé» a «que corra solo»: una rama sale a Data Flow.

## Cómo usarlo

### Crear uno
**Canvas** en la pantalla vacía del editor, en el menú «+» de las pestañas, en el botón del explorador de archivos o en la paleta (*New Canvas*).

### Las tarjetas

| Tarjeta | Qué es | Deja vista |
|---|---|---|
| **Source** | Una fuente con nombre, una tabla de la base (también de otro proyecto que estés mirando) o un archivo de datos | Sí |
| **Query** | SQL; se ve el código, el resultado o los dos | Sí |
| **Chart** | Un gráfico de Story Flow sobre las filas de otra tarjeta | No |
| **Number** | Una cifra (suma, media, recuento, mínimo, máximo o la primera fila) y, si quieres, su variación frente a otra tarjeta | No |
| **Note** | Una nota adhesiva | — |
| **Text** | Un título o un párrafo en markdown | — |
| **Frame** | Un marco que agrupa; se mueve con lo de dentro y es una diapositiva al presentar | — |

La barra de la izquierda las crea. Una **Source** también se crea **soltando** sobre el lienzo una fuente o una tabla del explorador de base, o un archivo de datos del explorador de archivos. Una tabla o un archivo dan una tarjeta `<nombre>_src` (si la vista se llamara igual que la tabla, se leería a sí misma). Las tarjetas del lienzo **sólo leen**: lo que cambia datos va en un cuaderno o en un `.sql`.

### Conectar
- **Arrastra desde el borde derecho** de una Source o una Query **a un hueco**: sale **Filter… · Group by… · Join with… · Empty query · Chart · Number**, y la tarjeta nueva nace leyendo a la de origen, con su SQL escrito y editable.
- **Suelta la conexión sobre un Chart o un Number**: pasan a enseñar esa tarjeta.
- Para que una consulta lea otra tarjeta, escribe su nombre en el `FROM` o en un `JOIN`: la flecha aparece sola.
- **Doble clic en una flecha** escribe su etiqueta a mano; vacía, vuelve la deducida.

### Editar
- **Doble clic en el SQL** abre el editor (con el completado de siempre) sólo en esa tarjeta; **Ctrl+Enter** la ejecuta.
- **Doble clic en el nombre** la renombra: AmoxSQL te enseña qué tarjetas la leen y reescribe su SQL (nunca un texto, un comentario ni una columna que se llame igual).
- El lápiz de un **Chart** abre el editor completo de Story Flow encima del lienzo; el de un **Number**, su configuración dentro de la tarjeta.
- **Supr** borra lo seleccionado. **Ctrl+F** busca una tarjeta por su nombre, su SQL o su texto.

### Ejecutar, Refresh y la foto
- Cada tarjeta tiene su **punto de estado**, como las celdas del cuaderno: al día, desactualizada (la editaste o cambió algo que lee), sin ejecutar en esta sesión, o falló.
- **Refresh all** corre lo que no está al día **en orden de dependencias**, y los gráficos y las cifras detrás de lo que enseñan. Se para en el primer fallo y dice dónde. **Refresh from …** (en el menú «…») hace lo mismo sólo con una rama.
- Al ir bien, cada tarjeta guarda su **foto** en el archivo: las primeras 50 filas, los puntos del gráfico (hasta 2.000) o la cifra. Al volver a abrir el lienzo se ve esa foto, marcada **«Snapshot as of …»**, sin ejecutar nada. **Clear snapshots** la quita si no quieres datos en el archivo (por ejemplo, antes de un commit).

### Parámetros
Un `{{nombre}}` en el SQL de una tarjeta aparece en la barra de arriba con su valor. Cambiarlo deja desactualizado sólo lo que lo usa.

### Presentar
**Present** recorre los **marcos** en orden de lectura, uno por pantalla: flechas o espacio para avanzar, **Esc** para salir. El lienzo se queda quieto y las barras desaparecen.

### Sacarlo del lienzo
Desde **Export**:

| Opción | Qué hace |
|---|---|
| **To Report Flow** | Un deck con una lámina por marco: su título, sus textos y notas, la cifra de un Number y sus gráficos (escritos como `.amoxvis` en `charts/`). Los parámetros pasan a las variables del deck |
| **To a notebook** | Un `.sqlnb` con las consultas en orden de dependencias, cada una con su nombre, y las notas como texto |
| **Branch to Data Flow** | Un proceso con los pasos que llevan a la tarjeta seleccionada; cada paso deja una tabla con el nombre de la tarjeta. Añádele un Excel o un Export File y prográmalo |
| **Card as SQL** | La consulta de la tarjeta seleccionada en un `.sql` |

Lo que sale es **autónomo**: lleva dentro, como `WITH`, las tarjetas de las que depende, porque fuera del lienzo sus vistas no existen.

### Qué cambió
**What changed** (menú «…») y el panel de Git enseñan los cambios de un `.amoxcanvas` en tarjetas —añadidas, quitadas, el SQL que cambió—, no en JSON. Mover tarjetas, la foto y el modo de ver no cuentan.

## El archivo

Un `.amoxcanvas` es JSON con orden fijo y el SQL partido en líneas, para que un cambio de una línea sea un diff de una línea. Ver [Formatos de archivo](../reference/file-formats.md).

## Tips

- Pon un **marco** alrededor de cada idea: al presentar y al exportar, cada marco es una diapositiva.
- Usa una **nota** al lado de la cifra que la motiva: sale en el deck.
- Si una rama ya responde la pregunta, **Branch to Data Flow** y prográmala.

## Relacionado

- [Cuadernos](notebooks.md) · [Story Flow](../visualization/story-flow.md) · [Report Flow](../reports/report-flow.md)
- [Data Flow](../data-flow/data-flow.md) · [Programar procesos](../data-flow/scheduling.md) · [Fuentes con nombre](../data/sources.md)
