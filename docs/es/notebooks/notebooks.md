# Cuadernos (.sqlnb)

**🌐 [English](../../en/notebooks/notebooks.md) · Español**

> Celdas que dejan su consulta puesta en la sesión con un nombre, para que la siguiente la lea. Con índice, parámetros y un botón que actualiza solo lo que se quedó viejo.

## Qué es

Un **cuaderno** (`.sqlnb`) es un análisis partido en **celdas**. Cada celda de SQL, al ejecutarse, deja su consulta puesta en la sesión con el nombre de la celda; la de abajo ya puede escribir `FROM ese_nombre`. Entre medias, las celdas de texto cuentan el porqué.

Eso es lo diferencial y conviene decirlo claro: **nadie escribe `CREATE OR REPLACE TEMP VIEW`**. La sesión de AmoxSQL siempre fue una conexión viva donde una vista temporal sobrevive de una consulta a la siguiente; el cuaderno se limita a contarlo.

A diferencia del [Editor SQL](../editor/sql-editor.md) —una consulta enfocada— el cuaderno está pensado para un análisis de varios pasos que se lee de arriba abajo y del que alguien tiene que poder fiarse dentro de tres meses.

## Cuándo usarlo

- Un análisis de varios pasos donde cada paso se apoya en el anterior.
- Cuando haga falta documentar el contexto, la metodología y **lo que se descartó**, al lado del análisis y no en otro sitio.
- Cuando el mismo análisis se repita con otro periodo o umbral: eso son [parámetros](#parámetros).
- Si sólo necesitas una consulta suelta, usa el [Editor SQL](../editor/sql-editor.md). Para encadenar transformaciones visualmente, [Data Flow](../data-flow/data-flow.md).

## Cómo usarlo

### La cabecera del cuaderno

Arriba, el título y una descripción: los dos viven en la cabecera del archivo y viajan con él.
A su derecha, lo que se le hace al documento entero — **Actualizar**, guardar, y las dos
salidas ([Word y tablero](reports.md)).

### La celda

Editor a la izquierda, resultado a la derecha, y **520 px de alto, siempre los mismos** —unas veinticuatro líneas de SQL y diecinueve filas de resultado—. La altura fija no es un descuido: con celdas que crecen, un cuaderno de veinte deja de poder recorrerse. Para trabajar de cerca está la pantalla completa.

La cabecera de la celda sólo **identifica**: el nombre, la descripción y qué deja detrás.
Los mandos viven en el **canalón de la izquierda** y aparecen al pasar el ratón o al
seleccionar la celda; en reposo el canalón sólo lleva el punto de estado.

| En la cabecera | Qué dice |
|---|---|
| **Nombre** | El de la vista que la celda deja puesta. En blanco, se le pone `paso_N` al ejecutar |
| **Descripción** | El comentario de arriba de la consulta. No se escribe dos veces |
| **Distintivo de vista** | Apagado mientras esa vista no exista de verdad; encendido cuando el motor confirma que está viva |

| En el canalón | Qué hace |
|---|---|
| **Punto de estado** | Lo único visible en reposo. Cuatro estados; ver más abajo |
| **Ejecutar** | `Ctrl+Enter` |
| **Mando de tres posiciones** | Código y resultado · sólo el código · sólo el resultado. Se recuerda, y con él si estaba en tabla o en gráfico. El reparto parte de 40 % para el código y 60 % para el resultado, y el tirador del medio lo cambia |
| **Materializar** | Guarda el resultado en vez de recalcularlo cada vez que se lea |
| **Pantalla completa** | La celda ocupa la pestaña entera. `Esc` vuelve, y vuelve por donde estabas |
| **Subir · Bajar · Borrar** | |

## Lectura

Un análisis se escribe una vez y se lee muchas: uno mismo la semana que viene, o
alguien a quien se le enseña. **Lectura** quita del cuaderno todo lo que sirve
para hacerlo y deja lo que se quería contar.

Con el botón **Lectura** de la cabecera del documento:

- Las celdas de SQL **no enseñan la consulta**. La que estaba en tabla se ve como
  tabla; la que estaba en gráfico, como gráfico —y **sólo el gráfico**, sin el
  panel de construcción de Story Flow.
- Los mandos del canalón y las barras de la tabla desaparecen.
- **La celda pierde la caja**: ni borde, ni fondo, ni cabecera. Era una caja
  dentro de otra —el marco de la celda y, dentro, la tarjeta de la figura con su
  propio título—, y la de fuera repetía lo que la figura ya dice mejor. Es la
  misma decisión que ya tenía la celda de texto.
- El texto se lee; el doble clic para escribir no responde.
- Se sigue pudiendo pasar páginas en una tabla y desplazarse por el cuaderno.

**No es exportar.** Un documento de Word se va y deja de estar vivo; esto se
deshace de un clic con **Editar**, y «Actualizar» sigue a mano — un cuaderno
recién abierto no tiene nada que enseñar hasta que se ejecuta.

El modo va en el archivo de estado, no en el documento: es de quien mira. Al
volver a abrir el cuaderno, sigue como lo dejaste.

El **comentario de arriba** de la consulta se convierte en la descripción de la vista, y se guarda en el motor: la vista se explica sola desde cualquier sitio que lea el catálogo.

Una celda que no se puede envolver —varias sentencias, un `INSERT`, un `COPY`— lo dice con un «no deja vista», sin tratarlo como un fallo, porque no lo es. Si además escribe en el disco, lo avisa aparte: eso no se deshace al cerrar el proyecto.

### La celda de texto

**No tiene caja**: ni borde, ni cabecera, ni tope de altura, y ocupa el mismo ancho que las
demás. Es el documento. Doble clic para escribir, encima del propio texto; al salir, se
compone. Sus encabezados (`#`, `##`, `###`)
construyen solos el índice de la barra derecha.

Para ver la fuente y el texto compuesto a la vez, pantalla completa — en la lista no hay caja
donde partirlos en dos.

### La barra derecha

Tres secciones, y dicen tres cosas distintas:

- **Índice** — de los encabezados de las celdas de texto. Nadie sostiene un índice a mano.
- **Vistas** — lo único que no sale del documento: sale del motor. El documento dice qué celdas hay; el motor dice **qué se puede consultar**. Al reabrir el cuaderno al día siguiente la sesión está vacía, y la barra lo dice antes de que falle nada.
- **Parámetros** — ver abajo.

Las vistas creadas fuera del cuaderno —desde un `.sql`, desde otro cuaderno— también salen, en su propia sección: la sesión es una sola.

### Parámetros

Escribe `{{desde}}` en una celda y en la barra derecha podrás darle valor sin tocar la consulta. Los valores viven en la cabecera del archivo, así que viajan con él.

**Un texto entra entrecomillado y un número tal cual**, así que se escribe `f >= {{desde}}` y no `f >= '{{desde}}'`. Por eso un parámetro no sirve para nombrar una tabla.

> **`{{var}}` y `${var}` no son lo mismo.** Las llaves dobles son las del cuaderno y los tableros de [Report Flow](../reports/report-flow.md); `${...}` son las variables del editor de consultas, que tienen su propio panel (ver [Variables](../editor/variables.md)).

### Actualizar

El cuaderno sabe **qué celda lee a cuál**, esté donde esté en el documento: la dependencia sale de los nombres, no del orden de la pantalla. Si editas una celda de la que cuelgan tres, marca las tres, y **Actualizar** las ejecuta en el orden correcto —que casi nunca es el de arriba abajo— diciendo antes cuántas y en qué orden.

También entra lo que falta: al reabrir el cuaderno, «Actualizar» vuelve a poner las vistas que la sesión perdió, y **también las celdas que no enseñan nada**. Al cerrar la pestaña y volver a abrir el archivo, la sesión sigue entera —las vistas siguen vivas— pero los resultados no vuelven: viven en memoria a propósito, porque guardarlos haría que un cuaderno reabierto se diera por ejecutado sobre una sesión que podría estar vacía. Que la vista esté puesta no basta si la celda está en blanco.

Lo que escribe en el disco se **aparta** y se dice: repetir un `INSERT` duplica filas, y eso no se deshace cerrando el proyecto.

## Cómo saber que algo se quedó viejo

Una vista no guarda datos: leerla vuelve a ejecutar su cadena, así que si cambian los datos de origen ya da el resultado nuevo. Lo que sí envejece es **la definición puesta en la sesión** —si editas el SQL y no vuelves a ejecutar— y **el número que estás viendo**, que es del último `SELECT`.

El punto de la izquierda de cada celda lo distingue:

| Punto | Significa |
|---|---|
| Vacío | Sin ejecutar |
| Verde | Al día |
| Ámbar | Se editó después de ejecutarla, o algo de lo que depende cambió |
| Rojo | Falló |

Cambiar el valor de un parámetro también la pone en ámbar, aunque no hayas tocado una letra de la celda.

## Tips

- **Añadir una celda en medio:** el aire entre dos celdas enseña `+ SQL` y `+ Texto` al pasar
  el ratón, y la celda nace ahí. El hueco del final está siempre visible.
- **Convertir un `.sql` en cuaderno:** si un archivo tiene varias sentencias separadas por `;`, AmoxSQL ofrece convertirlo, una celda por sentencia.
- **Formatos antiguos:** los cuadernos en JSON v3.0, v2.0 y de marcadores (`-- !CELL:CODE!`) se leen igual y se guardan ya en el formato nuevo. Las celdas «Input» se convierten en parámetros de la cabecera.
- **El estado visual va aparte.** El modo de cada celda, el reparto y la configuración del gráfico se guardan en `.sqlnb.state.json`, nunca en el documento: son de quien mira, no del análisis.

## Atajos y formatos

- **Ctrl+Enter** ejecuta la celda activa · **Ctrl+S** guarda · **Esc** sale de la pantalla completa.
- Formatos: `.sqlnb` (markdown con cabecera) y su archivo de estado `.sqlnb.state.json`. Ver [Formatos de archivo](../reference/file-formats.md).

## Relacionado

- [Sacar el cuaderno de AmoxSQL](reports.md) · [Editor SQL](../editor/sql-editor.md) · [Variables](../editor/variables.md)
- [Tabla de resultados](../results/results-table.md) · [Perfil de datos](../results/data-profiler.md)
- [Formatos de archivo](../reference/file-formats.md)
